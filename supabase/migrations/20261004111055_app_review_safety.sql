-- Additive safety workflows. No existing accounts, messages or files are deleted.
create table public.message_blocks (
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);
create index message_blocks_blocked_idx on public.message_blocks(blocked_id);
create index message_blocks_org_idx on public.message_blocks(organization_id);
alter table public.message_blocks enable row level security;
revoke all on public.message_blocks from public,anon,authenticated;
grant select on public.message_blocks to authenticated;
create policy message_blocks_own on public.message_blocks for select to authenticated
using(blocker_id=private.current_profile_id() and organization_id=private.current_organization_id());

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reporter_id uuid not null references public.profiles(id),
  message_id uuid not null references public.messages(id),
  reported_profile_id uuid not null references public.profiles(id),
  reason text not null check(length(reason) between 3 and 2000),
  reported_text text not null,
  status text not null default 'open' check(status in ('open','removed','reviewed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution text,
  unique(reporter_id,message_id)
);
create index message_reports_org_status_idx on public.message_reports(organization_id,status);
create index message_reports_message_idx on public.message_reports(message_id);
create index message_reports_subject_idx on public.message_reports(reported_profile_id);
create index message_reports_resolver_idx on public.message_reports(resolved_by);
alter table public.message_reports enable row level security;
revoke all on public.message_reports from public,anon,authenticated;
grant select on public.message_reports to authenticated;
create policy message_reports_scoped on public.message_reports for select to authenticated using(
 organization_id=private.current_organization_id() and
 (reporter_id=private.current_profile_id() or private.has_system_role(array['super_admin']))
);

create or replace function public.set_message_block(p_profile_id uuid,p_blocked boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
 if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_profile_id=me or p_blocked is null or not exists(select 1 from public.profiles where id=p_profile_id and organization_id=org) then
  raise exception 'profile_not_available' using errcode='22023'; end if;
 if p_blocked then
  insert into public.message_blocks(blocker_id,blocked_id,organization_id) values(me,p_profile_id,org) on conflict do nothing;
 else
  delete from public.message_blocks where blocker_id=me and blocked_id=p_profile_id and organization_id=org;
 end if;
end $$;
revoke all on function public.set_message_block(uuid,boolean) from public,anon;
grant execute on function public.set_message_block(uuid,boolean) to authenticated;

create or replace function public.list_message_blocks()
returns table(profile_id uuid,display_name text) language sql stable security definer set search_path=pg_catalog,public as $$
 select b.blocked_id,p.display_name from public.message_blocks b join public.profiles p on p.id=b.blocked_id and p.organization_id=b.organization_id
 where b.blocker_id=private.current_profile_id() and b.organization_id=private.current_organization_id()
 order by p.display_name
$$;
revoke all on function public.list_message_blocks() from public,anon;
grant execute on function public.list_message_blocks() to authenticated;

-- Direct message writes were revoked in workflow_authorization_hardening.
-- Remove the obsolete self-referencing INSERT check (which otherwise recurses
-- when SELECT acquires an additional policy subquery); send_message owns writes.
alter policy messages_member_insert on public.messages with check (false);

create policy messages_blocked_sender_hidden on public.messages as restrictive for select to authenticated
using(not exists(select 1 from public.message_blocks b where b.blocker_id=private.current_profile_id() and b.blocked_id=sender_id));

create or replace function private.can_access_message_attachment(p_conversation_id uuid,p_message_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from public.messages m where m.id=p_message_id and m.conversation_id=p_conversation_id
  and m.organization_id=private.current_organization_id() and m.retracted_at is null
  and (
   (private.is_conversation_member(p_conversation_id) and not exists(select 1 from public.message_blocks b where b.blocker_id=private.current_profile_id() and b.blocked_id=m.sender_id))
   or (private.has_system_role(array['super_admin']) and exists(select 1 from public.message_reports r where r.message_id=m.id and r.organization_id=m.organization_id and r.status='open'))
  )
 )
$$;

-- The trigger also covers direct Data API inserts/edits and older clients.
create function private.enforce_message_safety()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.retracted_at is not null then return new; end if;
 if exists(select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id
   join public.message_blocks b on b.organization_id=c.organization_id and
    ((b.blocker_id=cm.profile_id and b.blocked_id=new.sender_id) or (b.blocked_id=cm.profile_id and b.blocker_id=new.sender_id))
   where c.id=new.conversation_id and c.type='direct' and cm.profile_id<>new.sender_id) then
  raise exception 'message_contact_blocked' using errcode='42501'; end if;
 -- Basic text filtering complements human reports; it does not classify images/audio.
 if lower(new.body) ~ '(heil[[:space:]]+hitler|kill[[:space:]]+yourself|bring[[:space:]]+dich[[:space:]]+um)' then
  raise exception 'message_content_not_allowed' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.enforce_message_safety() from public,anon,authenticated,service_role;
create trigger enforce_message_safety before insert or update of body on public.messages
for each row execute function private.enforce_message_safety();

create or replace function public.report_message(p_message_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); msg public.messages%rowtype; result uuid;
begin
 if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into msg from public.messages where id=p_message_id and organization_id=org;
 if msg.id is null or msg.sender_id=me or not private.is_conversation_member(msg.conversation_id) then
  raise exception 'permission_denied' using errcode='42501'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'invalid_reason' using errcode='22023'; end if;
 insert into public.message_reports(organization_id,reporter_id,message_id,reported_profile_id,reason,reported_text)
 values(org,me,msg.id,msg.sender_id,trim(p_reason),msg.body)
 on conflict(reporter_id,message_id) do nothing returning id into result;
 if result is null then select id into result from public.message_reports where reporter_id=me and message_id=msg.id; return result; end if;
 perform private.create_notification(org,p.id,'system','Neue Inhaltsmeldung','Eine Chatnachricht wurde zur Prüfung gemeldet.',
  '/app/settings','message-report:'||result::text||':'||p.id::text)
 from public.profiles p where p.organization_id=org and p.status='active' and private.profile_has_permission(p.id,org,'data.correct');
 return result;
end $$;
revoke all on function public.report_message(uuid,text) from public,anon;
grant execute on function public.report_message(uuid,text) to authenticated;

create or replace function public.resolve_message_report(p_report_id uuid,p_remove boolean,p_resolution text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); r public.message_reports%rowtype;
begin
 if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_remove is null or p_resolution is null or length(trim(p_resolution)) not between 3 and 2000 then raise exception 'invalid_reason' using errcode='22023'; end if;
 select * into r from public.message_reports where id=p_report_id and organization_id=org for update;
 if r.id is null then raise exception 'permission_denied' using errcode='42501'; end if;
 if r.status<>'open' then return; end if;
 if p_remove then
  update public.messages set body='Nachricht wurde durch die Moderation entfernt.',retracted_at=coalesce(retracted_at,now()),retracted_by=me
  where id=r.message_id and organization_id=org;
 end if;
 update public.message_reports set status=case when p_remove then 'removed' else 'reviewed' end,resolved_at=now(),resolved_by=me,resolution=trim(p_resolution)
 where id=r.id;
 perform private.create_notification(org,r.reporter_id,'system','Inhaltsmeldung bearbeitet','Die Administration hat Ihre Inhaltsmeldung bearbeitet.',
  '/app/settings','message-report-resolved:'||r.id::text);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(org,me,'message.report_resolved','message_report',r.id,jsonb_build_object('removed',p_remove));
end $$;
revoke all on function public.resolve_message_report(uuid,boolean,text) from public,anon;
grant execute on function public.resolve_message_report(uuid,boolean,text) to authenticated;

create or replace function public.list_conversations()
returns table(
  id uuid,
  type text,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  conversation_members jsonb,
  messages jsonb,
  last_message jsonb,
  unread_count bigint,
  muted_until timestamptz,
  avatar_path text,
  created_by uuid,
  team_id uuid,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query
  select c.id,c.type,c.name,c.created_at,c.updated_at,
    coalesce(member_rows.members,'[]'::jsonb),
    case when latest.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'id',latest.id,'body',latest.body,'created_at',latest.created_at,
      'sender_id',latest.sender_id,'retracted_at',latest.retracted_at
    )) end,
    case when latest.id is null then null else jsonb_build_object(
      'id',latest.id,'body',latest.body,'created_at',latest.created_at,
      'sender_id',latest.sender_id,'retracted_at',latest.retracted_at
    ) end,
    (select count(*)
      from public.messages unread
      where not exists(select 1 from public.message_blocks b where b.blocker_id=me and b.blocked_id=unread.sender_id) and unread.conversation_id=c.id and unread.sender_id<>me and unread.created_at>=self_member.joined_at
        and not exists(select 1 from public.message_read_receipts rr where rr.message_id=unread.id and rr.profile_id=me)
    )::bigint,
    self_member.muted_until,c.avatar_path,c.created_by,c.team_id,private.can_manage_conversation(c.id)
  from public.conversation_members self_member
  join public.conversations c on c.id=self_member.conversation_id and c.organization_id=self_member.organization_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'profile_id',cm.profile_id,
      'profiles',jsonb_build_object('display_name',p.display_name)
    ) order by p.display_name,cm.profile_id) members
    from public.conversation_members cm join public.profiles p on p.id=cm.profile_id and p.organization_id=cm.organization_id
    where cm.conversation_id=c.id and cm.organization_id=org
  ) member_rows on true
  left join lateral (
    select m.id,m.body,m.created_at,m.sender_id,m.retracted_at
    from public.messages m where m.conversation_id=c.id and not exists(select 1 from public.message_blocks b where b.blocker_id=me and b.blocked_id=m.sender_id)
    order by m.created_at desc,m.id desc limit 1
  ) latest on true
  where self_member.profile_id=me and self_member.organization_id=org and c.archived_at is null
  order by c.updated_at desc,c.created_at desc;
end;
$$;


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
  if me is null or not private.can_post_conversation(p_conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
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
  return result;
end;
$$;

-- A submitted request is not a completed erasure. Completion requires a deleted
-- login and an administrator's recorded data review / delivered confirmation.
create table public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 profile_id uuid not null references public.profiles(id),
 contact_email text not null,
 display_name text not null,
 requested_at timestamptz not null default now(),
 due_at timestamptz not null default (now()+interval '7 days'),
 status text not null default 'requested' check(status in ('requested','completed')),
 completed_at timestamptz,
 completed_by uuid references public.profiles(id),
 completion_note text,
 confirmation_sent_at timestamptz,
 unique(profile_id),
 check(status <> 'completed' or (completed_at is not null and completed_by is not null and confirmation_sent_at is not null and length(completion_note) between 10 and 2000))
);
create index account_deletion_org_status_idx on public.account_deletion_requests(organization_id,status,due_at);
create index account_deletion_admin_idx on public.account_deletion_requests(completed_by);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy account_deletion_read_scoped on public.account_deletion_requests for select to authenticated using (
 organization_id=private.current_organization_id() and
 (profile_id=private.current_profile_id() or private.has_system_role(array['super_admin']))
);
create function public.request_account_deletion()
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
 if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
 insert into public.account_deletion_requests(organization_id,profile_id,contact_email,display_name)
 select org,me,p.email,p.display_name from public.profiles p where p.id=me and p.organization_id=org
 on conflict(profile_id) do nothing returning id into result;
 if result is null then select id into result from public.account_deletion_requests where profile_id=me and organization_id=org; return result; end if;
 perform private.create_notification(org,p.id,'system','Neuer Kontolöschantrag','Bitte innerhalb von 7 Tagen bearbeiten und den Abschluss bestätigen.',
  '/app/settings','account-deletion:'||result::text||':'||p.id::text)
 from public.profiles p where p.organization_id=org and p.status='active' and private.profile_has_permission(p.id,org,'data.correct');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(org,me,'account.deletion_requested','account_deletion_request',result,'{}'::jsonb);
 return result;
end $$;
revoke all on function public.request_account_deletion() from public,anon;
grant execute on function public.request_account_deletion() to authenticated;

create function public.complete_account_deletion_request(p_request_id uuid,p_completion_note text,p_confirmation_sent boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); r public.account_deletion_requests%rowtype;
begin
 if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into r from public.account_deletion_requests where id=p_request_id and organization_id=org for update;
 if r.id is null then raise exception 'permission_denied' using errcode='42501'; end if;
 if r.status='completed' then return; end if;
 if not exists(select 1 from public.profiles where id=r.profile_id and organization_id=org and deleted_at is not null and auth_user_id is null) then
  raise exception 'account_not_deleted' using errcode='22023'; end if;
 if p_confirmation_sent is distinct from true or p_completion_note is null or length(trim(p_completion_note)) not between 10 and 2000 then
  raise exception 'completion_evidence_required' using errcode='22023'; end if;
 update public.account_deletion_requests set status='completed',completed_at=now(),completed_by=me,
  completion_note=trim(p_completion_note),confirmation_sent_at=now() where id=r.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(org,me,'account.deletion_completed','account_deletion_request',r.id,'{}'::jsonb);
end $$;
revoke all on function public.complete_account_deletion_request(uuid,text,boolean) from public,anon;
grant execute on function public.complete_account_deletion_request(uuid,text,boolean) to authenticated;

-- Server maintenance retains the same privileges as existing application tables.
grant all on public.message_blocks,public.message_reports,public.account_deletion_requests to service_role;
