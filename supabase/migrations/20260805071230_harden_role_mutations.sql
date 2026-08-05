-- Keep role and permission mutations behind the audited, authorization-aware
-- RPC surface. The client only needs a dedicated entry point for creating a
-- custom (non-system) role.
create or replace function public.create_role(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
begin
  if me is null or not private.has_permission('roles.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 100 then
    raise exception 'invalid_role_name' using errcode='22023';
  end if;

  insert into public.roles(organization_id,name,system_key,active)
  values(org,trim(p_name),null,true)
  returning id into result;

  return result;
end;
$$;

revoke all on function public.create_role(text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_role(text)
  to authenticated;

-- The existing set_user_role() and set_role_permission() functions enforce
-- protected-super-admin and last-admin invariants. Do not leave a direct table
-- mutation path that could bypass those checks.
revoke insert, update, delete on table public.roles
  from authenticated;
revoke insert, update, delete on table public.user_roles
  from authenticated;
revoke insert, update, delete on table public.role_permissions
  from authenticated;

-- Supabase may install this event-trigger helper in public. It is invoked by
-- PostgreSQL as an event trigger and never needs Data API execute privileges.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end
$$;
