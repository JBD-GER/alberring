-- Remove obsolete memberships on demand, without deleting profiles or history.
create function public.admin_list_deleted_memberships()
returns table (id uuid, deleted_at timestamptz, chat_count bigint, team_count bigint)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not private.has_permission('users.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  select p.id,p.deleted_at,
    (select count(*) from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id
      where cm.profile_id=p.id and cm.organization_id=p.organization_id and c.type<>'direct'),
    (select count(*) from public.team_memberships tm where tm.profile_id=p.id and tm.organization_id=p.organization_id
      and (tm.valid_until is null or tm.valid_until>=current_date))
  from public.profiles p
  where p.organization_id=private.current_organization_id() and p.deleted_at is not null
    and (exists(select 1 from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id
      where cm.profile_id=p.id and cm.organization_id=p.organization_id and c.type<>'direct')
    or exists(select 1 from public.team_memberships tm where tm.profile_id=p.id and tm.organization_id=p.organization_id
      and (tm.valid_until is null or tm.valid_until>=current_date)))
  order by p.deleted_at,p.id;
end $$;

create function public.admin_remove_deleted_memberships(p_profile_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  org uuid:=private.current_organization_id();
  chat_rows integer; team_rows integer; future_rows integer;
begin
  if not private.has_permission('users.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  perform 1 from public.profiles p where p.id=p_profile_id and p.organization_id=org
    and p.deleted_at is not null and p.auth_user_id is null and p.status='archived' for update;
  if not found then raise exception 'deleted_profile_not_available' using errcode='22023'; end if;

  -- Direct conversations retain the other participant so their history stays discoverable.
  delete from public.conversation_members cm using public.conversations c
  where cm.conversation_id=c.id and cm.profile_id=p_profile_id and cm.organization_id=org
    and c.organization_id=org and c.type<>'direct';
  get diagnostics chat_rows=row_count;
  -- Past team membership periods are retained. Today's/future assignments have no past interval.
  delete from public.team_memberships where profile_id=p_profile_id and organization_id=org and valid_from>=current_date;
  get diagnostics future_rows=row_count;
  update public.team_memberships set valid_until=current_date-1
    where profile_id=p_profile_id and organization_id=org and valid_from<current_date
      and (valid_until is null or valid_until>=current_date);
  get diagnostics team_rows=row_count;
  if chat_rows+team_rows+future_rows>0 then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,private.current_profile_id(),'user.deleted_memberships_removed','profile',p_profile_id,
      jsonb_build_object('chat_count',chat_rows,'team_count',team_rows+future_rows,'history_retained',true));
  end if;
end $$;
revoke all on function public.admin_list_deleted_memberships() from public,anon,authenticated,service_role;
revoke all on function public.admin_remove_deleted_memberships(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_deleted_memberships() to authenticated;
grant execute on function public.admin_remove_deleted_memberships(uuid) to authenticated;

-- Register only the integration shell. No credentials, endpoints or sync jobs in database config.
alter table public.integration_connections drop constraint integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check check(provider in ('manual','careville','curasoft'));
alter table public.integration_providers drop constraint integration_providers_key_check;
alter table public.integration_providers add constraint integration_providers_key_check check(key in ('manual','careville','curasoft'));
insert into public.integration_providers(key,display_name,enabled,capabilities)
values('curasoft','CuraSoft',false,'{}') on conflict(key) do nothing;
insert into public.integration_connections(organization_id,provider,status)
select id,'curasoft','not_configured' from public.organizations on conflict(organization_id,provider) do nothing;
