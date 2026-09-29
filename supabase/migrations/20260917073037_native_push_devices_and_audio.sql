-- Only explicitly granted private functions are callable; private is not an
-- exposed PostgREST schema. Wrappers below remain SECURITY INVOKER.
grant usage on schema private to authenticated,service_role;

-- Native registration extends the existing device registry. Raw provider tokens
-- remain server-only; an authenticated RPC binds every token to a live session.
alter table public.user_devices
  add column installation_id uuid,
  add column auth_session_id uuid,
  add column push_environment text not null default 'production'
    check (push_environment in ('development','production')),
  add column app_version text check (length(app_version)<=32);
alter table public.user_devices
  drop constraint user_devices_profile_id_push_token_hash_key;
-- Legacy native registrations have no verified session binding. They must opt
-- in again; web registrations are left intact.
update public.user_devices set revoked_at=coalesce(revoked_at,now()),push_token=null
  where platform in ('ios','android');
create unique index user_devices_installation_idx on public.user_devices(installation_id)
  where installation_id is not null;
create unique index user_devices_active_token_idx
  on public.user_devices(platform,push_environment,push_token_hash)
  where revoked_at is null and platform in ('ios','android') and push_token_hash is not null;
create index user_devices_session_idx on public.user_devices(auth_session_id)
  where revoked_at is null;

revoke all on public.user_devices from anon,authenticated;
grant select(id,organization_id,profile_id,platform,device_label,last_seen_at,
  revoked_at,created_at,updated_at,installation_id,push_environment,app_version)
  on public.user_devices to authenticated;
grant select,insert,update,delete on public.user_devices to service_role;
drop policy user_devices_own on public.user_devices;
create policy user_devices_own_read on public.user_devices for select to authenticated
  using (organization_id=(select private.current_organization_id())
    and profile_id=(select private.current_profile_id()));

create function private.register_push_device(
  p_installation_id uuid,p_platform text,p_push_token text,
  p_push_environment text,p_app_version text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  session_id uuid;
  token_hash text;
  result uuid;
begin
  if auth.uid() is null or me is null or org is null then
    raise exception 'active_account_required' using errcode='42501';
  end if;
  begin session_id:=nullif(auth.jwt()->>'session_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'valid_session_required' using errcode='42501';
  end;
  if session_id is null or not exists(select 1 from auth.sessions s
    where s.id=session_id and s.user_id=auth.uid()
      and (s.not_after is null or s.not_after>now())) then
    raise exception 'valid_session_required' using errcode='42501';
  end if;
  if p_installation_id is null or p_platform is null or p_platform not in ('ios','android')
    or p_push_environment is null or p_push_environment not in ('development','production')
    or p_push_token is null or length(p_push_token) not between 32 and 4096
    or p_push_token !~ '^[A-Za-z0-9_:-]+$'
    or (p_platform='ios' and (length(p_push_token) not between 64 and 256 or p_push_token !~ '^[a-fA-F0-9]+$'))
    or length(coalesce(p_app_version,''))>32 then
    raise exception 'invalid_push_registration' using errcode='22023';
  end if;
  if p_platform='ios' then p_push_token:=lower(p_push_token); end if;
  token_hash:=encode(sha256(convert_to(p_push_token,'UTF8')),'hex');
  -- Serializes concurrent rotation/reassignment; no token can have two owners.
  perform pg_advisory_xact_lock(hashtextextended('native_push_registration',0));
  update public.user_devices set revoked_at=now(),push_token=null,updated_at=now()
    where platform=p_platform and push_environment=p_push_environment
      and push_token_hash=token_hash and installation_id is distinct from p_installation_id
      and revoked_at is null;
  if (select count(*) from public.user_devices where profile_id=me and revoked_at is null
    and platform in ('ios','android') and installation_id is distinct from p_installation_id)>=10 then
    raise exception 'device_limit_reached' using errcode='22023';
  end if;
  insert into public.user_devices(organization_id,profile_id,platform,push_token,
    push_token_hash,installation_id,auth_session_id,push_environment,app_version)
  values(org,me,p_platform,p_push_token,token_hash,p_installation_id,session_id,
    p_push_environment,p_app_version)
  on conflict(installation_id) where installation_id is not null do update set
    organization_id=excluded.organization_id,profile_id=excluded.profile_id,
    platform=excluded.platform,push_token=excluded.push_token,push_token_hash=excluded.push_token_hash,
    auth_session_id=excluded.auth_session_id,push_environment=excluded.push_environment,
    app_version=excluded.app_version,revoked_at=null,last_seen_at=now(),updated_at=now()
  returning id into result;
  return result;
end;
$$;
create function public.register_push_device(
  p_installation_id uuid,p_platform text,p_push_token text,
  p_push_environment text default 'production',p_app_version text default null
) returns uuid language sql security invoker set search_path=pg_catalog as $$
  select private.register_push_device($1,$2,$3,$4,$5)
$$;

create function private.revoke_push_device(p_installation_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  -- Allow a now-suspended account to remove its own device too.
  update public.user_devices d set revoked_at=now(),push_token=null,updated_at=now()
  from public.profiles p where p.id=d.profile_id and p.auth_user_id=auth.uid()
    and d.installation_id=p_installation_id;
end;
$$;
create function public.revoke_push_device(p_installation_id uuid)
returns void language sql security invoker set search_path=pg_catalog as $$
  select private.revoke_push_device($1)
$$;
revoke all on function private.register_push_device(uuid,text,text,text,text),
  public.register_push_device(uuid,text,text,text,text),private.revoke_push_device(uuid),
  public.revoke_push_device(uuid) from public,anon,authenticated,service_role;
grant execute on function private.register_push_device(uuid,text,text,text,text),
  public.register_push_device(uuid,text,text,text,text),private.revoke_push_device(uuid),
  public.revoke_push_device(uuid) to authenticated;

-- Per-device receipts avoid re-sending successfully accepted pushes when a
-- second device fails transiently. Never exposed to any client role.
create table public.push_delivery_receipts (
  delivery_id uuid not null references public.notification_deliveries on delete cascade,
  device_id uuid not null references public.user_devices on delete cascade,
  sent_at timestamptz not null default now(),
  provider_message_id text,
  primary key(delivery_id,device_id)
);
alter table public.push_delivery_receipts enable row level security;
revoke all on public.push_delivery_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.push_delivery_receipts to service_role;

create function private.active_push_devices(p_profile_id uuid)
returns table(id uuid,platform text,push_token text,push_environment text)
language sql stable security definer set search_path=pg_catalog,public as $$
  select d.id,d.platform,d.push_token,d.push_environment from public.user_devices d
  join public.profiles p on p.id=d.profile_id and p.status='active'
    and p.organization_id=d.organization_id
  join public.organizations o on o.id=d.organization_id and o.active
  join auth.sessions s on s.id=d.auth_session_id and s.user_id=p.auth_user_id
  where d.profile_id=$1 and d.revoked_at is null and d.push_token is not null
    and d.platform in ('ios','android') and d.last_seen_at>now()-interval '60 days'
    and (s.not_after is null or s.not_after>now())
$$;
create function public.active_push_devices(p_profile_id uuid)
returns table(id uuid,platform text,push_token text,push_environment text)
language sql stable security invoker set search_path=pg_catalog as $$
  select * from private.active_push_devices($1)
$$;
revoke all on function private.active_push_devices(uuid),public.active_push_devices(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.active_push_devices(uuid),public.active_push_devices(uuid)
  to service_role;

create function public.claim_notification_batch(p_limit integer default 100)
returns table(id uuid,channel text,attempt_count smallint,notification_id uuid,
  profile_id uuid,organization_id uuid,target_path text)
language sql security invoker set search_path=pg_catalog,public as $$
  with candidates as (
    select d.id from public.notification_deliveries d where d.status='pending'
      and (d.next_attempt_at is null or d.next_attempt_at<=now())
    order by d.created_at for update skip locked limit greatest(1,least(p_limit,10))
  ), claimed as (
    update public.notification_deliveries d
    set attempt_count=d.attempt_count+1,next_attempt_at=now()+interval '5 minutes'
    from candidates c where d.id=c.id
    returning d.id,d.channel,d.attempt_count,d.notification_id,d.organization_id
  ) select c.id,c.channel,c.attempt_count,c.notification_id,n.profile_id,
      c.organization_id,n.target_path
    from claimed c join public.notifications n on n.id=c.notification_id
$$;
revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- Chat audio stays under the existing membership, private storage, 10 MiB and
-- metadata-reference controls; medical/employee document buckets are unchanged.
alter table public.message_attachments drop constraint message_attachments_mime_type_check;
alter table public.message_attachments add constraint message_attachments_mime_type_check
  check (mime_type in ('image/jpeg','image/png','application/pdf',
    'audio/mp4','audio/webm','audio/aac','audio/ogg'));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png',
  'application/pdf','audio/mp4','audio/webm','audio/aac','audio/ogg'],
  file_size_limit=10485760,public=false where id='message-attachments';
notify pgrst,'reload schema';
