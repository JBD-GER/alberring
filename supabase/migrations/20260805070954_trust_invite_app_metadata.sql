-- Never use user-editable metadata to decide whether an orphaned Auth invite
-- belongs to the caller's organization. Edge Functions write the organization
-- to app_metadata before creating the matching profile.
create or replace function public.admin_lookup_invite_email(p_email text)
returns table(auth_user_id uuid, profile_id uuid, profile_status text, reusable_unconfirmed_auth boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  org uuid:=private.current_organization_id();
  target_auth uuid;
  confirmed_at timestamptz;
  target_metadata jsonb;
  target_profile uuid;
  target_profile_org uuid;
  target_status text;
begin
  if not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  select u.id,u.email_confirmed_at,u.raw_app_meta_data into target_auth,confirmed_at,target_metadata
  from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
  if target_auth is null then return; end if;
  select p.id,p.organization_id,p.status into target_profile,target_profile_org,target_status
  from public.profiles p where p.auth_user_id=target_auth;
  if target_profile is not null then
    if target_profile_org<>org then raise exception 'email_not_available' using errcode='23505'; end if;
    return query select target_auth,target_profile,target_status,false;
    return;
  end if;
  if confirmed_at is not null then raise exception 'email_not_available' using errcode='23505'; end if;
  if coalesce(target_metadata->>'organization_id','')<>org::text then
    raise exception 'email_not_available' using errcode='23505';
  end if;
  return query select target_auth,null::uuid,null::text,true;
end;
$$;
