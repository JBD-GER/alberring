-- Only mistaken, unused invitations may be removed. Profiles and Auth users
-- are deleted in one transaction; failures retain both and all audit history.
create or replace function private.delete_unused_invited_user(p_profile_id uuid, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  target public.profiles%rowtype;
  auth_target auth.users%rowtype;
  reference record;
  has_history boolean;
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_profile_id=me then
    raise exception 'cannot_delete_own_account' using errcode='42501';
  end if;
  -- Use the same organization lock as role and status changes.
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select p.* into target from public.profiles p
    where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if target.status<>'invited' then
    raise exception 'only_unused_invitation_can_be_deleted' using errcode='22023';
  end if;
  -- Resend releases its profile lock before contacting Auth. Avoid deleting
  -- during that delivery: inviteUserByEmail could recreate an orphaned account.
  -- Ten minutes exceeds the hosted Edge Function maximum request lifetime.
  if exists(select 1 from public.audit_logs started
    where started.entity_id=target.id and started.organization_id=org
      and started.action='user.invite_resend_started'
      and started.created_at>now()-interval '10 minutes'
      and not exists(select 1 from public.audit_logs sent
        where sent.request_id=started.request_id and sent.action='user.invite_resent'
          and sent.organization_id=org and sent.entity_id=target.id)) then
    raise exception 'invitation_delivery_in_progress' using errcode='55000';
  end if;
  -- An active last administrator is excluded by the invited-only condition.
  if exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.profile_id=target.id and r.system_key='super_admin')
    and not private.has_system_role(array['super_admin']) then
    raise exception 'super_admin_deletion_requires_super_admin' using errcode='42501';
  end if;
  -- Serialize with Auth confirmation/sign-in. A profile that has not finished
  -- activation may still belong to a confirmed or signed-in Auth account.
  select u.* into auth_target from auth.users u where u.id=target.auth_user_id for update;
  if auth_target.id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if auth_target.email_confirmed_at is not null or auth_target.phone_confirmed_at is not null
    or auth_target.last_sign_in_at is not null
    or exists(select 1 from auth.sessions s where s.user_id=auth_target.id) then
    raise exception 'only_unused_invitation_can_be_deleted' using errcode='22023';
  end if;
  if target.avatar_url is not null or exists(
    select 1 from storage.objects o where o.owner_id=auth_target.id::text
      or o.owner=auth_target.id
      or (o.bucket_id='avatars' and split_part(o.name,'/',1)=org::text
        and split_part(o.name,'/',2)=target.id::text)
  ) then
    raise exception 'invitation_has_history' using errcode='23503';
  end if;

  -- Check every foreign key, including CASCADE / SET NULL relationships.
  -- Only the initial employee data, role/team assignments and preferences are
  -- removable setup data. Future domain tables fail closed automatically.
  for reference in
    select distinct ns.nspname as schema_name, rel.relname as table_name, local_col.attname as column_name
    from pg_constraint c
    join pg_class rel on rel.oid=c.conrelid
    join pg_namespace ns on ns.oid=rel.relnamespace
    cross join lateral unnest(c.conkey,c.confkey) as keys(local_attnum,foreign_attnum)
    join pg_attribute local_col on local_col.attrelid=c.conrelid and local_col.attnum=keys.local_attnum
    join pg_attribute foreign_col on foreign_col.attrelid=c.confrelid and foreign_col.attnum=keys.foreign_attnum
    where c.contype='f' and c.confrelid='public.profiles'::regclass and foreign_col.attname='id'
      and not (ns.nspname='public' and local_col.attname='profile_id'
        and rel.relname in ('employee_profiles','user_roles','team_memberships','notification_preferences'))
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',
      reference.schema_name,reference.table_name,reference.column_name)
      into has_history using target.id;
    if has_history then raise exception 'invitation_has_history' using errcode='23503'; end if;
  end loop;

  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'user.unused_invitation_deleted','profile',target.id,coalesce(p_request_id,gen_random_uuid()),
      jsonb_build_object('previous_status',target.status));
  delete from public.profiles where id=target.id;
  delete from auth.users where id=auth_target.id;
  return target.id;
end;
$$;
revoke all on function private.delete_unused_invited_user(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.delete_unused_invited_user(uuid,uuid) to authenticated;

-- Bind the private function at creation time so the invoker wrapper does not
-- require general USAGE access to the private schema.
create or replace function public.admin_delete_unused_invited_user(p_profile_id uuid, p_request_id uuid)
returns uuid language sql security invoker
begin atomic
  select private.delete_unused_invited_user(p_profile_id,p_request_id);
end;
revoke all on function public.admin_delete_unused_invited_user(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_delete_unused_invited_user(uuid,uuid) to authenticated;
