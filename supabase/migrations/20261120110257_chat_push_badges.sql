-- A badge represents unread, still accessible notifications. A message already
-- read on another platform must not cause a delayed push or stale badge.
create function private.push_notification_current(n public.notifications)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select n.read_at is null and exists(select 1 from public.profiles p
    where p.id=n.profile_id and p.organization_id=n.organization_id and p.status='active')
  and (n.type not like 'message%' or exists(
    select 1 from public.messages m
    join public.conversations c on c.id=m.conversation_id and c.organization_id=n.organization_id
    join public.conversation_members cm on cm.conversation_id=c.id
      and cm.profile_id=n.profile_id and cm.organization_id=c.organization_id
    where n.deduplication_key='message:'||m.id::text||':'||n.profile_id::text
      and c.archived_at is null and m.retracted_at is null and m.sender_id<>n.profile_id
      and m.created_at>=cm.joined_at and (cm.muted_until is null or cm.muted_until<=now())
      and private.profile_has_permission(n.profile_id,n.organization_id,'messages.use')
      and not exists(select 1 from public.message_read_receipts r where r.message_id=m.id and r.profile_id=n.profile_id)
      and not exists(select 1 from public.message_blocks b where b.blocker_id=n.profile_id and b.blocked_id=m.sender_id)
  ));
$$;
revoke all on function private.push_notification_current(public.notifications) from public,anon,authenticated,service_role;

create function public.push_delivery_state(p_notification_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('eligible',private.push_notification_current(n),
    'badge_count',(select count(*) from public.notifications other
      where other.profile_id=n.profile_id and other.organization_id=n.organization_id
      and other.read_at is null and private.push_notification_current(other)))
  from public.notifications n where n.id=p_notification_id;
$$;
revoke all on function public.push_delivery_state(uuid) from public,anon,authenticated;
grant execute on function public.push_delivery_state(uuid) to service_role;

create function public.my_push_state(p_delivered_ids uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result jsonb;
begin
  if me is null then raise exception 'active_account_required' using errcode='42501'; end if;
  if cardinality(p_delivered_ids)>200 then raise exception 'too_many_notifications' using errcode='22023'; end if;
  select jsonb_build_object('badge_count',count(*)) into result
    from public.notifications n where n.profile_id=me and n.organization_id=org
      and n.read_at is null and private.push_notification_current(n);
  return result||jsonb_build_object('stale_ids',coalesce((
    select jsonb_agg(id) from unnest(p_delivered_ids) id where not exists(
      select 1 from public.notifications n where n.id=id and n.profile_id=me
        and n.organization_id=org and private.push_notification_current(n)
    )), '[]'::jsonb));
end;
$$;
revoke all on function public.my_push_state(uuid[]) from public,anon,service_role;
grant execute on function public.my_push_state(uuid[]) to authenticated;

-- One explicit user action enables chat push; all other category preferences,
-- quiet hours and email settings are preserved.
create function public.enable_chat_push()
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_permission('messages.use') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  insert into public.notification_preferences(organization_id,profile_id,category,push_enabled)
    values(org,me,'messages',true)
    on conflict(profile_id,category) do update set push_enabled=true,updated_at=now();
end;
$$;
revoke all on function public.enable_chat_push() from public,anon,service_role;
grant execute on function public.enable_chat_push() to authenticated;

create function private.mark_message_notification_read()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.notifications n set read_at=coalesce(n.read_at,new.read_at)
    where n.profile_id=new.profile_id
    and n.deduplication_key='message:'||new.message_id::text||':'||new.profile_id::text
    and n.read_at is null;
  return new;
end;
$$;
revoke all on function private.mark_message_notification_read() from public,anon,authenticated,service_role;
create trigger message_notification_read after insert on public.message_read_receipts
  for each row execute function private.mark_message_notification_read();
update public.notifications n set read_at=r.read_at
  from public.message_read_receipts r where n.profile_id=r.profile_id and n.read_at is null
    and n.deduplication_key='message:'||r.message_id::text||':'||r.profile_id::text;

-- Prioritize real pushes over housekeeping rows. The lease exceeds the bounded
-- provider timeout and SKIP LOCKED prevents concurrent workers claiming twice.
create or replace function public.claim_notification_batch(p_limit integer default 50)
returns table(id uuid,channel text,attempt_count smallint,notification_id uuid,
  profile_id uuid,organization_id uuid,target_path text)
language sql security invoker set search_path=pg_catalog,public as $$
  with candidates as (
    select d.id from public.notification_deliveries d where d.status='pending'
      and (d.next_attempt_at is null or d.next_attempt_at<=now())
    order by (d.channel='push') desc,d.created_at for update skip locked limit greatest(1,least(p_limit,50))
  ), claimed as (
    update public.notification_deliveries d
    set attempt_count=d.attempt_count+1,next_attempt_at=now()+interval '5 minutes'
    from candidates c where d.id=c.id
    returning d.id,d.channel,d.attempt_count,d.notification_id,d.organization_id
  ) select c.id,c.channel,c.attempt_count,c.notification_id,n.profile_id,
      c.organization_id,n.target_path
    from claimed c join public.notifications n on n.id=c.notification_id;
$$;

-- Fallback for transient provider outages and non-chat notifications.
do $scheduler$
begin
  -- Local environments without Vault credentials must not start network jobs.
  if exists(select 1 from cron.job where jobname='alberring-send-notification-batch') then
    perform cron.schedule('alberring-send-notification-batch','* * * * *',
      $command$select private.invoke_automation('send-notification-batch','{"limit":50}'::jsonb)$command$);
  end if;
end;
$scheduler$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_client_nonce uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.can_post_conversation(p_conversation_id) or not exists(select 1 from public.conversations c where c.id=p_conversation_id and c.organization_id=org and c.archived_at is null) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_body)) not between 1 and 10000 then raise exception 'invalid_message' using errcode='22023'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id=p_reply_to_id and m.conversation_id=p_conversation_id) then
    raise exception 'invalid_reply_target' using errcode='22023';
  end if;
  if p_client_nonce is not null then
    select id into result from public.messages where sender_id=me and client_nonce=p_client_nonce;
    if result is not null then return result; end if;
  end if;
  insert into public.messages(organization_id,conversation_id,sender_id,reply_to_id,body,client_nonce)
  values(org,p_conversation_id,me,p_reply_to_id,trim(p_body),p_client_nonce) returning id into result;
  update public.conversations set updated_at=now() where id=p_conversation_id;
  perform private.create_notification(org,cm.profile_id,'message','Neue interne Nachricht','Sie haben eine neue interne Nachricht erhalten.',
    '/app/messages/'||p_conversation_id::text,'message:'||result::text||':'||cm.profile_id::text)
  from public.conversation_members cm
  join public.profiles p on p.id=cm.profile_id and p.status='active'
  where cm.conversation_id=p_conversation_id and cm.profile_id<>me and (cm.muted_until is null or cm.muted_until<=now())
    and private.profile_has_permission(cm.profile_id,org,'messages.use')
    and not exists(select 1 from public.message_blocks b where b.blocker_id=cm.profile_id and b.blocked_id=me);
  -- pg_net sends after commit, so the worker sees the complete recipient batch.
  -- A provider/scheduler outage must never prevent saving a chat message.
  if exists(select 1 from public.notifications n join public.notification_deliveries d
    on d.notification_id=n.id and d.channel='push' and d.status='pending'
    where n.deduplication_key like 'message:'||result::text||':%') then
    begin
      perform private.invoke_automation('send-notification-batch','{"limit":50}'::jsonb);
    exception when others then
      raise warning 'push_dispatch_deferred_to_scheduler';
    end;
  end if;
  return result;
end;
$$;

