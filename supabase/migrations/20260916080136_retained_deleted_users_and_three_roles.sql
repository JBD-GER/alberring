-- Account removal preserves the application profile and every domain reference.
-- Only the Auth identity/access credentials are removed. Nothing is deployed
-- by this file alone; apply it as a reviewed migration.
alter table public.profiles alter column auth_user_id drop not null;
alter table public.profiles
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles;
alter table public.profiles add constraint profiles_deleted_identity_check check (
  (deleted_at is null and auth_user_id is not null)
  or (deleted_at is not null and auth_user_id is null and status='archived')
);

create or replace function private.guard_deleted_profile()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if old.deleted_at is not null and new is distinct from old then
    raise exception 'deleted_account_is_immutable' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_deleted_profile() from public,anon,authenticated,service_role;
create trigger guard_deleted_profile before update on public.profiles
for each row execute function private.guard_deleted_profile();

insert into public.permissions(key,description) values
  ('data.correct','Bestehende Fachdaten mit Änderungsgrund korrigieren (nur Super Admin)')
on conflict(key) do update set description=excluded.description;

-- Preserve role records for historic references, while removing unused roles
-- from the assignable catalogue. Do not silently promote or demote people.
do $$ begin
  if exists(select 1 from public.user_roles ur
    join public.roles r on r.id=ur.role_id
    join public.profiles p on p.id=ur.profile_id and p.status in ('active','invited','suspended')
    where coalesce(r.system_key,'') not in ('super_admin','employee','team_lead')
      and (ur.valid_until is null or ur.valid_until>now())) then
    raise exception 'unsupported_roles_still_assigned_review_required';
  end if;
end $$;
update public.roles set active=false
where coalesce(system_key,'') not in ('super_admin','employee','team_lead');
update public.roles set name=case system_key when 'super_admin' then 'Super Admin'
  when 'employee' then 'Mitarbeiter' else 'Teamleitung' end
where system_key in ('super_admin','employee','team_lead');

create or replace function public.create_role(p_name text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not private.has_system_role(array['super_admin']) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  raise exception 'fixed_role_catalog' using errcode='22023';
end $$;

create or replace function private.delete_user(p_profile_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  target public.profiles%rowtype;
  auth_id uuid;
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_profile_id=me then raise exception 'cannot_delete_own_account' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select * into target from public.profiles where id=p_profile_id and organization_id=org for update;
  if target.id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return target.id; end if;
  if exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.profile_id=target.id and r.system_key='super_admin' and r.active
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now()))
    and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
      join public.profiles p on p.id=ur.profile_id
      where p.organization_id=org and p.status='active' and p.deleted_at is null and p.id<>target.id
        and r.system_key='super_admin' and r.active
        and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) then
    raise exception 'last_super_admin_cannot_be_deleted' using errcode='42501';
  end if;
  -- Other account operations cross the Auth API transaction boundary. Their
  -- audited reservations prevent deletion while an email/send is in flight.
  if exists(select 1 from public.audit_logs started where started.organization_id=org
    and started.entity_id=target.id and started.created_at>now()-interval '10 minutes'
    and started.action in ('user.invite_resend_started','user.email_change_started')
    and not exists(select 1 from public.audit_logs finished
      where finished.organization_id=org and finished.entity_id=target.id
        and finished.request_id=started.request_id
        and ((started.action='user.invite_resend_started' and finished.action='user.invite_resent')
          or (started.action='user.email_change_started' and finished.action in ('user.email_changed','user.email_change_failed'))))) then
    raise exception 'account_operation_in_progress' using errcode='55000';
  end if;
  auth_id:=target.auth_user_id;
  perform 1 from auth.users where id=auth_id for update;
  if not found then raise exception 'auth_user_not_found' using errcode='P0002'; end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  values(org,me,'user.deleted_access_revoked','profile',target.id,coalesce(p_request_id,gen_random_uuid()),
    jsonb_build_object('previous_status',target.status,'previous_display_name',target.display_name,
      'previous_email',target.email,'data_retained',true));
  -- Update only ownership metadata, never delete Storage objects or files.
  -- Domain paths, references, RLS and private buckets continue protecting files.
  update storage.objects set owner=null,owner_id=null where owner=auth_id or owner_id=auth_id::text;
  update storage.buckets set owner=null,owner_id=null where owner=auth_id or owner_id=auth_id::text;
  update public.profiles set auth_user_id=null,status='archived',archived_at=now(),
    deleted_at=now(),deleted_by=me,display_name='Gelöschter Benutzer',avatar_url=null,
    email=target.id::text||'@deleted.invalid',updated_at=now()
  where id=target.id;
  -- Profile ID and domain/history rows (including memberships, messages and
  -- files) remain. Removing Auth cascades sessions, identities and OTPs.
  delete from auth.refresh_tokens where user_id=auth_id::text;
  delete from auth.users where id=auth_id;
  update public.user_devices set revoked_at=now(),push_token=null,push_token_hash=null
    where profile_id=target.id;
  return target.id;
end $$;
revoke all on function private.delete_user(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.delete_user(uuid,uuid) to authenticated;
create or replace function public.admin_delete_user(p_profile_id uuid,p_request_id uuid)
returns uuid language sql security invoker set search_path=pg_catalog
begin atomic
  select private.delete_user(p_profile_id,p_request_id);
end;
revoke all on function public.admin_delete_user(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_delete_user(uuid,uuid) to authenticated;

-- Compatibility: even older clients now preserve the application data when
-- removing an unused invitation. Their old endpoint cannot hard-delete it.
create or replace function private.delete_unused_invited_user(p_profile_id uuid,p_request_id uuid)
returns uuid language sql security definer set search_path=pg_catalog
as $$ select private.delete_user(p_profile_id,p_request_id) $$;

-- Tombstones are readable so existing messages keep a stable visible author.
-- Original employee details remain available only to user administrators.
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  organization_id=private.current_organization_id() and (
    id=private.current_profile_id()
    or (status='active' and private.has_permission('directory.view'))
    or (deleted_at is not null and private.has_permission('messages.use'))
    or private.has_permission('users.view')
  )
);
-- Policies execute with the caller's column privileges. Keep deleted_at
-- private while letting the policy resolve a same-organization tombstone.
create or replace function private.is_deleted_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles p where p.id=p_profile_id
    and p.organization_id=private.current_organization_id() and p.deleted_at is not null)
$$;
revoke all on function private.is_deleted_profile(uuid) from public,anon,authenticated,service_role;
grant execute on function private.is_deleted_profile(uuid) to authenticated;
drop policy employee_profiles_read on public.employee_profiles;
create policy employee_profiles_read on public.employee_profiles for select to authenticated using (
  organization_id=private.current_organization_id()
  and (profile_id=private.current_profile_id() or private.has_permission('directory.view') or private.has_permission('users.view'))
  and (private.has_permission('users.manage') or not private.is_deleted_profile(profile_id))
);

-- Effective corrections are reserved to real Super Admins.
create or replace function private.has_permission(permission_key text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.permissions p where p.key=$1) and (
    case when $1='data.correct' then private.has_system_role(array['super_admin'])
      when $1 in ('leave.create','sick_leave.create','leave.create_own','sick_leave.create_own')
      then private.has_system_role(array['admin','administration','super_admin'])
      else private.has_system_role(array['super_admin']) or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
        join public.role_permissions rp on rp.role_id=r.id
        where ur.profile_id=private.current_profile_id()
          and ur.organization_id=private.current_organization_id()
          and rp.permission_key=$1 and ur.valid_from<=now()
          and (ur.valid_until is null or ur.valid_until>now())
      ) end
  )
$$;

create or replace function private.profile_has_permission(p_profile_id uuid,p_organization_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.permissions permission where permission.key=p_permission_key)
    and exists (
      select 1 from public.profiles p
      join public.organizations o on o.id=p.organization_id and o.active
      join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
      join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
      where p.id=p_profile_id and p.organization_id=p_organization_id and p.status='active'
        and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
        and case when p_permission_key='data.correct' then r.system_key='super_admin'
          when p_permission_key in ('leave.create','sick_leave.create','leave.create_own','sick_leave.create_own')
          then r.system_key in ('admin','administration','super_admin')
          else r.system_key='super_admin' or exists(
            select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_key=p_permission_key
          ) end
    )
$$;

create or replace function private.can_delegate_role(p_role_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.roles r
    where r.id=p_role_id and r.organization_id=private.current_organization_id() and r.active
      and r.system_key in ('super_admin','employee','team_lead')
      and (r.system_key is distinct from 'super_admin' or private.has_system_role(array['super_admin']))
      and (coalesce(r.system_key,'') not in ('admin','administration') or private.has_system_role(array['admin','administration','super_admin']))
      and (private.has_permission('roles.manage') or not exists(
        select 1 from public.role_permissions rp where rp.role_id=r.id
          and not private.has_permission(rp.permission_key)
          and not(r.system_key is not distinct from 'employee' and rp.permission_key=any(array[
            'dashboard.view','directory.view','messages.use','news.view',
            'schedule.view_own','leave.view_own','sick_leave.view_own',
            'leave.create_own','sick_leave.create_own','documents.view_own','documents.view_shared',
            'documents.view_folders','fleet.view_own','mileage.submit_own','materials.create_own'
          ]))
      ))
  )
$$;

create or replace function public.set_role_permission(
  p_role_id uuid,
  p_permission_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  role_key text;
  changed integer:=0;
begin
  if p_enabled is null then
    raise exception 'invalid_boolean' using errcode='22023';
  end if;
  if me is null or not private.has_permission('roles.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('super-admin:'||org::text,0)
  );
  select r.system_key into role_key
  from public.roles r
  where r.id=p_role_id and r.organization_id=org and r.active
  for update;
  if not found then
    raise exception 'role_not_available' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.permissions p where p.key=p_permission_key
  ) then
    raise exception 'permission_not_available' using errcode='22023';
  end if;
  if p_permission_key in ('data.correct','leave.create','sick_leave.create','leave.create_own','sick_leave.create_own') then
    raise exception 'admin_only_permission' using errcode='42501';
  end if;
  if role_key='super_admin'
    and not p_enabled
    and p_permission_key in ('users.manage','roles.manage') then
    raise exception 'protected_super_admin_permission' using errcode='42501';
  end if;
  if p_enabled then
    insert into public.role_permissions(role_id,permission_key)
    values(p_role_id,p_permission_key)
    on conflict do nothing;
    get diagnostics changed=row_count;
  else
    delete from public.role_permissions
    where role_id=p_role_id and permission_key=p_permission_key;
    get diagnostics changed=row_count;
  end if;
  if changed>0 then
    insert into public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,metadata
    ) values(
      org,me,
      case
        when p_enabled then 'role.permission_granted'
        else 'role.permission_revoked'
      end,
      'role',p_role_id,
      jsonb_build_object('permission_key',p_permission_key)
    );
  end if;
end;
$$;

-- Retained tombstones are omitted from employee administration lists.
create or replace function public.admin_list_users()
returns table(
  id uuid,
  display_name text,
  email text,
  status text,
  avatar_url text,
  first_name text,
  last_name text,
  employee_number text,
  work_phone text,
  job_title text,
  employment_status text,
  start_date date,
  end_date date,
  birth_date date,
  weekly_hours numeric,
  roles jsonb,
  teams jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (private.has_permission('users.view') or private.has_permission('users.manage')) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  select p.id,p.display_name,p.email,p.status,p.avatar_url,ep.first_name,ep.last_name,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employee_number end,
    ep.work_phone,ep.job_title,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employment_status end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.start_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.end_date end,
    case when private.has_permission('birthdays.view_admin_notifications') or private.has_permission('sick_leave.manage') then ep.birth_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.weekly_hours end,
    coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'system_key',r.system_key) order by r.name)
      from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.profile_id=p.id and r.active and r.system_key in ('super_admin','employee','team_lead') and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
      from public.team_memberships tm join public.teams t on t.id=tm.team_id
      where tm.profile_id=p.id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)),'[]'::jsonb)
  from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id
  where p.organization_id=private.current_organization_id() and p.deleted_at is null
  order by p.display_name;
end;
$$;
