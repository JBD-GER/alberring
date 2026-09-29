-- Administration records absences for employees. Super Admin always receives
-- every effective permission, including permissions introduced in the future.
insert into public.permissions(key,description) values
  ('leave.create','Urlaubsanträge für Mitarbeiter anlegen (nur Admin)'),
  ('leave.view_own','Eigene Urlaubsanträge anzeigen'),
  ('sick_leave.create','Krankmeldungen für Mitarbeiter anlegen (nur Admin)'),
  ('sick_leave.view_own','Eigene Krankmeldungen anzeigen')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_key)
select role_id,case permission_key when 'leave.create_own' then 'leave.view_own' else 'sick_leave.view_own' end
from public.role_permissions where permission_key in ('leave.create_own','sick_leave.create_own')
on conflict do nothing;
delete from public.role_permissions where permission_key in ('leave.create_own','sick_leave.create_own');
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'leave.create','leave.view_own','leave.view_team','leave.manage',
  'sick_leave.create','sick_leave.view_own','sick_leave.view_status','sick_leave.manage'
]) where r.system_key in ('admin','administration','super_admin') on conflict do nothing;

create or replace function private.has_system_role(p_system_keys text[])
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
    where ur.profile_id=private.current_profile_id()
      and ur.organization_id=private.current_organization_id()
      and r.system_key=any(p_system_keys) and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now())
  )
$$;
revoke all on function private.has_system_role(text[]) from public,anon,authenticated,service_role;

create or replace function private.has_permission(permission_key text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.permissions p where p.key=$1) and (
    case when $1 in ('leave.create','sick_leave.create','leave.create_own','sick_leave.create_own')
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
create or replace function public.my_permissions()
returns table(permission_key text) language sql stable security definer set search_path=pg_catalog,public as $$
  select p.key from public.permissions p where private.has_permission(p.key)
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
        and case when p_permission_key in ('leave.create','sick_leave.create','leave.create_own','sick_leave.create_own')
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

create or replace function private.create_leave_request_for_user(
  p_profile_id uuid,
  p_leave_type text,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; days numeric; type_id uuid; steps integer; note_required boolean;
begin
  if me is null or not private.has_permission('leave.create') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_profile_id and p.organization_id=org and p.status='active') then raise exception 'profile_not_available' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:'||p_profile_id::text,0));
  if length(coalesce(p_note,''))>500 then raise exception 'note_too_long' using errcode='22023'; end if;
  select id,requires_note into type_id,note_required from public.leave_types where organization_id=org and active and (code=p_leave_type or name=p_leave_type) limit 1;
  if type_id is null then raise exception 'leave_type_not_available' using errcode='22023'; end if;
  if note_required and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'note_required' using errcode='22023'; end if;
  days:=private.calculate_leave_workdays(p_profile_id,p_starts_on,p_ends_on,p_day_fraction);
  if days<=0 then raise exception 'no_workdays_in_period' using errcode='22023'; end if;
  if exists (select 1 from public.leave_requests lr where lr.profile_id=p_profile_id and lr.status in ('submitted','review','approved')
    and daterange(lr.starts_on,lr.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')) then
    raise exception 'overlapping_leave_request' using errcode='23P01';
  end if;
  insert into public.leave_requests(organization_id,profile_id,leave_type,leave_type_id,starts_on,ends_on,day_fraction,workdays,note,status)
  values(org,p_profile_id,p_leave_type,type_id,p_starts_on,p_ends_on,p_day_fraction,days,nullif(trim(p_note),''),'submitted') returning id into result;
  select leave_approval_steps into steps from public.organization_settings where organization_id=org;
  insert into public.leave_approval_steps(organization_id,leave_request_id,step_number)
  select org,result,n from generate_series(1,coalesce(steps,1)) n;
  perform private.create_notification(org,p.id,'leave_approval','Neuer Urlaubsantrag','Ein Urlaubsantrag wartet auf Bearbeitung.',
    '/app/leave','leave-task:'||result::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
    and (
      private.profile_has_permission(p.id,org,'leave.manage')
      or (
        private.profile_has_permission(p.id,org,'leave.approve')
        and exists (
          select 1 from public.team_memberships subject_tm
          join public.teams t on t.id=subject_tm.team_id and t.organization_id=subject_tm.organization_id and t.active
          where subject_tm.profile_id=p_profile_id and subject_tm.organization_id=org
            and subject_tm.valid_from<=current_date and (subject_tm.valid_until is null or subject_tm.valid_until>=current_date)
            and (
              t.lead_profile_id=p.id
              or exists(select 1 from public.team_memberships viewer_tm where viewer_tm.team_id=subject_tm.team_id
                and viewer_tm.profile_id=p.id and viewer_tm.organization_id=org
                and viewer_tm.valid_from<=current_date and (viewer_tm.valid_until is null or viewer_tm.valid_until>=current_date))
            )
        )
      )
    );
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.submitted','leave_request',result,jsonb_build_object('workdays',days,'profile_id',p_profile_id));
  return result;
end;
$$;
revoke all on function private.create_leave_request_for_user(uuid,text,date,date,numeric,text) from public,anon,authenticated,service_role;
create or replace function public.create_leave_request_for_user(
  p_profile_id uuid,
  p_leave_type text,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric,
  p_note text default null
)
returns uuid
language sql security definer set search_path=pg_catalog,public as $$
  select private.create_leave_request_for_user(p_profile_id,p_leave_type,p_starts_on,p_ends_on,p_day_fraction,p_note)
$$;


create or replace function private.report_sick_leave_for_user(
  p_profile_id uuid,
  p_starts_on date,
  p_expected_end_on date,
  p_end_unknown boolean,
  p_certificate_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('sick_leave.create') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_profile_id and p.organization_id=org and p.status='active') then raise exception 'profile_not_available' using errcode='22023'; end if;
  if p_starts_on is null or p_end_unknown is null or p_certificate_status is null then raise exception 'invalid_input' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sick:'||p_profile_id::text,0));
  if p_starts_on<current_date-interval '14 days' or p_starts_on>current_date+interval '1 day' then raise exception 'invalid_start_date' using errcode='22023'; end if;
  if p_certificate_status not in ('not_required','required','pending') then raise exception 'invalid_certificate_status' using errcode='22023'; end if;
  if (p_end_unknown and p_expected_end_on is not null) or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<p_starts_on)) then
    raise exception 'invalid_end_date' using errcode='22023';
  end if;
  if exists(select 1 from public.sick_leave_records sl where sl.profile_id=p_profile_id and sl.status not in ('closed','cancelled')
    and daterange(sl.starts_on,coalesce(sl.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_on,coalesce(p_expected_end_on,'infinity'::date),'[]')) then
    raise exception 'overlapping_sick_leave' using errcode='23P01';
  end if;
  insert into public.sick_leave_records(organization_id,profile_id,starts_on,expected_end_on,end_unknown,certificate_status,certificate_required,employee_confirmation,status)
  values(org,p_profile_id,p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status,p_certificate_status in ('required','pending'),p_profile_id=me,'reported') returning id into result;
  perform private.create_notification(org,p.id,'sick_leave','Neue Abwesenheitsmeldung','Eine neue Abwesenheitsmeldung ist eingegangen.',
    '/app/sick-leave','sick-task:'||result::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
    and private.profile_can_view_sick_status(p.id,p_profile_id,org);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'sick_leave.reported','sick_leave',result,jsonb_build_object('certificate_expected',p_certificate_status<>'not_required','profile_id',p_profile_id));
  return result;
end;
$$;
revoke all on function private.report_sick_leave_for_user(uuid,date,date,boolean,text) from public,anon,authenticated,service_role;
create or replace function public.report_sick_leave_for_user(
  p_profile_id uuid,
  p_starts_on date,
  p_expected_end_on date,
  p_end_unknown boolean,
  p_certificate_status text
)
returns uuid
language sql security definer set search_path=pg_catalog,public as $$
  select private.report_sick_leave_for_user(p_profile_id,p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status)
$$;


-- Keep the original clients compatible, with the same administrator-only guard.
create or replace function public.submit_leave_request(
  p_leave_type text,p_starts_on date,p_ends_on date,p_day_fraction numeric,p_note text default null
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select public.create_leave_request_for_user(private.current_profile_id(),p_leave_type,p_starts_on,p_ends_on,p_day_fraction,p_note)
$$;
create or replace function public.report_sick_leave(
  p_starts_on date,p_expected_end_on date,p_end_unknown boolean,p_certificate_status text
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select public.report_sick_leave_for_user(private.current_profile_id(),p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status)
$$;

-- Save the complete role selection in one transaction so intermediate changes
-- never strand an account without the roles the administrator selected.
create or replace function private.set_user_roles(p_profile_id uuid,p_role_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  selected_ids uuid[]; removed_super boolean; target_super boolean;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if p_profile_id=me and not private.has_system_role(array['super_admin']) then raise exception 'cannot_change_own_roles' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  if p_role_ids is null or array_position(p_role_ids,null) is not null then raise exception 'invalid_role_selection' using errcode='22023'; end if;
  select coalesce(array_agg(distinct id),'{}'::uuid[]) into selected_ids from unnest(p_role_ids) ids(id);
  if exists(select 1 from unnest(selected_ids) ids(id) where not exists(
    select 1 from public.roles r where r.id=ids.id and r.organization_id=org and r.active
  )) then raise exception 'role_not_available' using errcode='22023'; end if;
  if exists(select 1 from unnest(selected_ids) ids(id) where not private.can_delegate_role(ids.id)) then raise exception 'role_delegation_not_allowed' using errcode='42501'; end if;
  select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id
    where ur.profile_id=p_profile_id and ur.organization_id=org and r.active and r.system_key='super_admin'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) into target_super;
  removed_super:=target_super and not exists(select 1 from public.roles r where r.id=any(selected_ids) and r.system_key='super_admin');
  if (removed_super or exists(select 1 from public.roles r where r.id=any(selected_ids) and r.system_key='super_admin'))
    and not private.has_system_role(array['super_admin']) then
    raise exception 'super_admin_assignment_requires_role_management' using errcode='42501';
  end if;
  if removed_super and not exists(
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
    join public.profiles p on p.id=ur.profile_id and p.organization_id=org and p.status='active'
    where ur.organization_id=org and ur.profile_id<>p_profile_id and r.system_key='super_admin'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) then raise exception 'last_super_admin_role_cannot_be_removed' using errcode='42501'; end if;
  -- Apply additions first so the actor retains authority while updating self.
  insert into public.user_roles(profile_id,role_id,organization_id,assigned_by)
  select p_profile_id,id,org,me from unnest(selected_ids) ids(id) where not exists(
    select 1 from public.user_roles ur where ur.profile_id=p_profile_id and ur.role_id=ids.id
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) on conflict(profile_id,role_id,valid_from) do update set valid_until=null,assigned_by=excluded.assigned_by;
  -- Rows created and removed within this transaction never formed a historical assignment.
  delete from public.user_roles where profile_id=p_profile_id and organization_id=org
    and not(role_id=any(selected_ids)) and valid_from=now();
  update public.user_roles set valid_until=now()
  where profile_id=p_profile_id and organization_id=org and not(role_id=any(selected_ids))
    and valid_from<=now() and (valid_until is null or valid_until>now());
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'user.roles_updated','profile',p_profile_id,jsonb_build_object('role_ids',selected_ids));
end $$;
revoke all on function private.set_user_roles(uuid,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.set_user_roles(p_profile_id uuid,p_role_ids uuid[])
returns void language sql security definer set search_path=pg_catalog,public as $$
  select private.set_user_roles(p_profile_id,p_role_ids)
$$;


create or replace function public.set_user_role(p_profile_id uuid,p_role_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare org uuid:=private.current_organization_id(); selected_ids uuid[];
begin
  if private.current_profile_id() is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'invalid_boolean' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if not exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=org and r.active) then raise exception 'role_not_available' using errcode='22023'; end if;
  select coalesce(array_agg(ur.role_id),'{}'::uuid[]) into selected_ids from public.user_roles ur
  join public.roles r on r.id=ur.role_id and r.organization_id=org and r.active
  where ur.profile_id=p_profile_id and ur.organization_id=org and ur.valid_from<=now()
    and (ur.valid_until is null or ur.valid_until>now()) and ur.role_id<>p_role_id;
  perform public.set_user_roles(p_profile_id,case when p_enabled then array_append(selected_ids,p_role_id) else selected_ids end);
end $$;

-- Team selections include invited colleagues and retain existing suspended
-- members until an administrator explicitly removes them.
create or replace function private.admin_list_team_members()
returns table(id uuid,display_name text,email text,status text,team_ids uuid[])
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare org uuid:=private.current_organization_id();
begin
  if private.current_profile_id() is null or not(private.has_permission('teams.manage') or private.has_permission('users.manage')) then raise exception 'permission_denied' using errcode='42501'; end if;
  return query select p.id,p.display_name,p.email,p.status,array(
    select distinct tm.team_id from public.team_memberships tm join public.teams t on t.id=tm.team_id and t.organization_id=org
    where tm.profile_id=p.id and tm.organization_id=org and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
  ) from public.profiles p where p.organization_id=org and p.status<>'archived' order by p.display_name,p.id;
end $$;
revoke all on function private.admin_list_team_members() from public,anon,authenticated,service_role;
create or replace function public.admin_list_team_members()
returns table(id uuid,display_name text,email text,status text,team_ids uuid[])
language sql security definer set search_path=pg_catalog,public as $$
  select * from private.admin_list_team_members()
$$;


create or replace function private.set_team_members(p_team_id uuid,p_member_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); selected_ids uuid[];
begin
  if me is null or not(private.has_permission('teams.manage') or private.has_permission('users.manage')) then raise exception 'permission_denied' using errcode='42501'; end if;
  perform 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active for update;
  if not found then raise exception 'team_not_available' using errcode='22023'; end if;
  if p_member_ids is null or array_position(p_member_ids,null) is not null then raise exception 'invalid_member_selection' using errcode='22023'; end if;
  select coalesce(array_agg(distinct id),'{}'::uuid[]) into selected_ids from unnest(p_member_ids) ids(id);
  if exists(select 1 from unnest(selected_ids) ids(id) where not exists(
    select 1 from public.profiles p where p.id=ids.id and p.organization_id=org and (
      p.status in ('active','invited') or (p.status='suspended' and private.is_team_member(p_team_id,p.id))
    )
  )) then raise exception 'member_not_available' using errcode='22023'; end if;
  delete from public.team_memberships where team_id=p_team_id and organization_id=org
    and not(profile_id=any(selected_ids)) and valid_from>=current_date;
  update public.team_memberships set valid_until=current_date-1
  where team_id=p_team_id and organization_id=org and not(profile_id=any(selected_ids))
    and valid_from<current_date and (valid_until is null or valid_until>=current_date);
  insert into public.team_memberships(team_id,profile_id,organization_id,valid_from)
  select p_team_id,id,org,current_date from unnest(selected_ids) ids(id) where not private.is_team_member(p_team_id,id)
  on conflict(team_id,profile_id,valid_from) do update set valid_until=null;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'team.members_updated','team',p_team_id,jsonb_build_object('member_ids',selected_ids));
end $$;
revoke all on function private.set_team_members(uuid,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.set_team_members(p_team_id uuid,p_member_ids uuid[])
returns void language sql security definer set search_path=pg_catalog,public as $$
  select private.set_team_members(p_team_id,p_member_ids)
$$;


create or replace function private.create_team(p_name text,p_location_name text,p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('teams.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or length(coalesce(p_location_name,''))>100 then raise exception 'invalid_name' using errcode='22023'; end if;
  insert into public.teams(organization_id,name,location_name) values(org,trim(p_name),nullif(trim(p_location_name),'')) returning id into result;
  perform public.set_team_members(result,p_member_ids);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'team.created','team',result,'{}');
  return result;
end $$;
revoke all on function private.create_team(text,text,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.create_team(p_name text,p_location_name text,p_member_ids uuid[])
returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select private.create_team(p_name,p_location_name,p_member_ids)
$$;


-- Team membership and conversation membership remain independent so a team
-- conversation can also include substitutes or administrative colleagues.
alter table public.conversations add column if not exists avatar_path text;
create or replace function private.can_manage_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.conversations c
    where c.id=p_conversation_id and c.organization_id=private.current_organization_id()
      and c.type in ('group','team','announcement') and c.archived_at is null
      and private.has_permission('messages.use') and (
        private.has_system_role(array['super_admin']) or (
          private.is_conversation_member(c.id) and (
            c.created_by=private.current_profile_id()
            or private.has_permission('teams.manage') or private.has_permission('messages.moderate')
            or exists(select 1 from public.teams t where t.id=c.team_id and t.organization_id=c.organization_id and t.active and t.lead_profile_id=private.current_profile_id())
          )
        )
      )
  )
$$;
revoke all on function private.can_manage_conversation(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_manage_conversation(uuid) to authenticated;
create or replace function public.can_manage_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select private.can_manage_conversation(p_conversation_id)
$$;

create or replace function private.set_conversation_members(p_conversation_id uuid,p_member_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); selected_ids uuid[];
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  perform 1 from public.conversations c where c.id=p_conversation_id and c.organization_id=org for update;
  if not private.can_manage_conversation(p_conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_member_ids is null or array_position(p_member_ids,null) is not null then raise exception 'invalid_member_selection' using errcode='22023'; end if;
  select coalesce(array_agg(distinct id),'{}'::uuid[]) into selected_ids from unnest(p_member_ids) ids(id);
  if cardinality(selected_ids)=0 then raise exception 'conversation_requires_members' using errcode='22023'; end if;
  if not private.has_system_role(array['super_admin']) and not(me=any(selected_ids)) then
    raise exception 'conversation_manager_required' using errcode='22023';
  end if;
  if exists(select 1 from unnest(selected_ids) ids(id) where not exists(
    select 1 from public.profiles p where p.id=ids.id and p.organization_id=org and (
      p.status='active' or (p.status in ('invited','suspended') and exists(
        select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.profile_id=p.id and cm.organization_id=org
      ))
    )
  )) then raise exception 'member_not_available' using errcode='22023'; end if;
  delete from public.conversation_members where conversation_id=p_conversation_id and organization_id=org and not(profile_id=any(selected_ids));
  insert into public.conversation_members(conversation_id,profile_id,organization_id)
  select p_conversation_id,id,org from unnest(selected_ids) ids(id) on conflict(conversation_id,profile_id) do nothing;
  update public.conversations set updated_at=now() where id=p_conversation_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'conversation.members_updated','conversation',p_conversation_id,jsonb_build_object('member_ids',selected_ids));
end $$;
revoke all on function private.set_conversation_members(uuid,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.set_conversation_members(p_conversation_id uuid,p_member_ids uuid[])
returns void language sql security definer set search_path=pg_catalog,public as $$
  select private.set_conversation_members(p_conversation_id,p_member_ids)
$$;


insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('conversation-avatars','conversation-avatars',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.conversation_avatar_access(p_path text,p_manage boolean,p_unreferenced boolean default false)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.conversations c
    where c.organization_id=private.current_organization_id() and c.archived_at is null
      and array_length(storage.foldername(p_path),1)=2
      and (storage.foldername(p_path))[1]=c.organization_id::text
      and (storage.foldername(p_path))[2]=c.id::text
      and case when p_manage then private.can_manage_conversation(c.id)
        else private.is_conversation_member(c.id) or private.can_manage_conversation(c.id) end
      and (not p_unreferenced or c.avatar_path is distinct from p_path)
  )
$$;
revoke all on function private.conversation_avatar_access(text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.conversation_avatar_access(text,boolean,boolean) to authenticated;
create policy conversation_avatars_read on storage.objects for select to authenticated using(
  bucket_id='conversation-avatars' and private.conversation_avatar_access(name,false)
);
create policy conversation_avatars_insert on storage.objects for insert to authenticated with check(
  bucket_id='conversation-avatars' and private.conversation_avatar_access(name,true)
);
create policy conversation_avatars_delete on storage.objects for delete to authenticated using(
  bucket_id='conversation-avatars' and private.conversation_avatar_access(name,true,true)
);

create or replace function private.set_conversation_avatar(p_conversation_id uuid,p_storage_path text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  perform 1 from public.conversations c where c.id=p_conversation_id and c.organization_id=org for update;
  if not private.can_manage_conversation(p_conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_storage_path is not null and (
    array_length(storage.foldername(p_storage_path),1) is distinct from 2
    or (storage.foldername(p_storage_path))[1] is distinct from org::text
    or (storage.foldername(p_storage_path))[2] is distinct from p_conversation_id::text
    or not exists(select 1 from storage.objects o where o.bucket_id='conversation-avatars' and o.name=p_storage_path)
  ) then raise exception 'avatar_not_available' using errcode='22023'; end if;
  update public.conversations set avatar_path=p_storage_path,updated_at=now() where id=p_conversation_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'conversation.avatar_updated','conversation',p_conversation_id,jsonb_build_object('has_avatar',p_storage_path is not null));
end $$;
revoke all on function private.set_conversation_avatar(uuid,text) from public,anon,authenticated,service_role;
create or replace function public.set_conversation_avatar(p_conversation_id uuid,p_storage_path text)
returns void language sql security definer set search_path=pg_catalog,public as $$
  select private.set_conversation_avatar(p_conversation_id,p_storage_path)
$$;


-- Extend the list response for avatars and management controls.
drop function public.list_conversations();
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
      where unread.conversation_id=c.id and unread.sender_id<>me and unread.created_at>=self_member.joined_at
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
    from public.messages m where m.conversation_id=c.id
    order by m.created_at desc,m.id desc limit 1
  ) latest on true
  where self_member.profile_id=me and self_member.organization_id=org and c.archived_at is null
  order by c.updated_at desc,c.created_at desc;
end;
$$;

create or replace function public.create_group_conversation(
  p_name text,
  p_member_ids uuid[],
  p_type text default 'group',
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id(); org uuid := private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_type is null or p_type not in ('group','team','announcement') then raise exception 'invalid_conversation_type' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name' using errcode='22023'; end if;
  if p_type='announcement' and not private.has_permission('news.publish') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_type='team' and (p_team_id is null or not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active)) then
    raise exception 'valid_team_required' using errcode='22023';
  end if;
  if p_type='team' and not (
    private.has_permission('teams.manage')
    or exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.lead_profile_id=me and t.active)
  ) then raise exception 'team_conversation_permission_required' using errcode='42501'; end if;
  if p_type<>'team' and p_team_id is not null then raise exception 'team_not_allowed' using errcode='22023'; end if;
  if exists (select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) as member_ids(mid) where not exists(select 1 from public.profiles p where p.id=mid and p.organization_id=org and p.status='active')) then
    raise exception 'member_not_available' using errcode='22023';
  end if;
  insert into public.conversations(organization_id,type,name,team_id,created_by,posting_restricted)
  values(org,p_type,trim(p_name),p_team_id,me,p_type='announcement') returning id into result;
  insert into public.conversation_members(conversation_id,profile_id,organization_id)
  select result,member_id,org from (
    select distinct unnest(array_append(coalesce(p_member_ids,'{}'::uuid[]),me)) as member_id
  ) members;
  perform private.create_notification(org,cm.profile_id,'message','Neue interne Unterhaltung',
    'Sie wurden zu einer internen Unterhaltung hinzugefügt.','/app/messages/'||result::text,
    'conversation-created:'||result::text||':'||cm.profile_id::text)
  from public.conversation_members cm
  where cm.conversation_id=result and cm.profile_id<>me
    and private.profile_has_permission(cm.profile_id,org,'messages.use');
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'conversation.group_created','conversation',result,jsonb_build_object('type',p_type));
  return result;
end;
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
  if p_permission_key in ('leave.create','sick_leave.create','leave.create_own','sick_leave.create_own') then
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

-- All writes go through the authorized, audited workflows.
revoke insert,update,delete on public.conversations,public.conversation_members from authenticated;
revoke insert on public.teams from authenticated;

-- New RPCs are explicitly exposed only to signed-in users. Replaced RPCs keep
-- their previous grants unless they were recreated above.
revoke all on function public.create_leave_request_for_user(uuid,text,date,date,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.create_leave_request_for_user(uuid,text,date,date,numeric,text) to authenticated;
revoke all on function public.report_sick_leave_for_user(uuid,date,date,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.report_sick_leave_for_user(uuid,date,date,boolean,text) to authenticated;
revoke all on function public.set_user_roles(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.set_user_roles(uuid,uuid[]) to authenticated;
revoke all on function public.admin_list_team_members() from public,anon,authenticated,service_role;
grant execute on function public.admin_list_team_members() to authenticated;
revoke all on function public.set_team_members(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.set_team_members(uuid,uuid[]) to authenticated;
revoke all on function public.create_team(text,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.create_team(text,text,uuid[]) to authenticated;
revoke all on function public.can_manage_conversation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_manage_conversation(uuid) to authenticated;
revoke all on function public.set_conversation_members(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.set_conversation_members(uuid,uuid[]) to authenticated;
revoke all on function public.set_conversation_avatar(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.set_conversation_avatar(uuid,text) to authenticated;
revoke all on function public.list_conversations() from public,anon,authenticated,service_role;
grant execute on function public.list_conversations() to authenticated;
