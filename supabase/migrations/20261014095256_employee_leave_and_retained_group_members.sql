-- Employee vacation requests, Monday-Saturday workdays and retained group history.
-- Existing approved requests are not recalculated; corrections remain audited.
insert into public.role_permissions(role_id,permission_key)
select r.id,'leave.create_own' from public.roles r
where r.system_key in ('employee','team_lead','admin','administration','super_admin')
  or exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_key='leave.view_own')
on conflict do nothing;


create or replace function private.has_permission(permission_key text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.permissions p where p.key=$1) and (
    case when $1='data.correct' then private.has_system_role(array['super_admin'])
      when $1 in ('leave.create','sick_leave.create','sick_leave.create_own')
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
          when p_permission_key in ('leave.create','sick_leave.create','sick_leave.create_own')
          then r.system_key in ('admin','administration','super_admin')
          else r.system_key='super_admin' or exists(
            select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_key=p_permission_key
          ) end
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
  if p_permission_key in ('data.correct','leave.create','sick_leave.create','sick_leave.create_own') then
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
  if me is null or not (private.has_permission('leave.create')
    or (p_profile_id=me and private.has_permission('leave.create_own'))) then raise exception 'permission_denied' using errcode='42501'; end if;
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

create or replace function public.create_leave_request_for_user(
  p_profile_id uuid,
  p_leave_type text,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric,
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not private.has_permission('leave.create') then raise exception 'permission_denied' using errcode='42501'; end if;
  return private.create_leave_request_for_user(p_profile_id,p_leave_type,p_starts_on,p_ends_on,p_day_fraction,p_note);
end;
$$;

create or replace function public.submit_leave_request(
  p_leave_type text,p_starts_on date,p_ends_on date,p_day_fraction numeric,p_note text default null
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select private.create_leave_request_for_user(private.current_profile_id(),p_leave_type,p_starts_on,p_ends_on,p_day_fraction,p_note)
$$;

create or replace function private.calculate_leave_workdays(
  p_profile_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare org uuid; location uuid; result numeric;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_starts_on<current_date or p_ends_on-p_starts_on>3660 then raise exception 'invalid_leave_period' using errcode='22023'; end if;
  if p_day_fraction is null or p_day_fraction not in (0.5,1) or (p_day_fraction=0.5 and p_starts_on<>p_ends_on) then raise exception 'invalid_day_fraction' using errcode='22023'; end if;
  select p.organization_id,ep.location_id into org,location from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id where p.id=p_profile_id;
  select count(*)::numeric * p_day_fraction into result
  from generate_series(p_starts_on,p_ends_on,interval '1 day') day_value
  where extract(isodow from day_value)<7
    and not exists (
      select 1 from public.public_holidays h
      where h.organization_id=org and h.holiday_on=day_value::date and (h.location_id is null or h.location_id=location)
    );
  return coalesce(result,0);
end;
$$;

create or replace function private.correct_leave_request(
  p_request_id uuid,p_leave_type text,p_starts_on date,p_ends_on date,
  p_day_fraction numeric,p_note text,p_correction_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.leave_requests%rowtype; after_row public.leave_requests%rowtype;
  type_id uuid; note_required boolean; days numeric;
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_correction_reason,''))) not between 3 and 500 then raise exception 'correction_reason_required' using errcode='22023'; end if;
  select * into target from public.leave_requests where id=p_request_id and organization_id=org;
  if target.id is null then raise exception 'request_not_found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('leave:'||target.profile_id::text,0));
  select * into target from public.leave_requests where id=p_request_id and organization_id=org for update;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_day_fraction is null or p_day_fraction not in (0.5,1) or (p_day_fraction=0.5 and p_starts_on<>p_ends_on) or p_ends_on-p_starts_on>3660 or length(coalesce(p_note,''))>500 then raise exception 'invalid_leave_request' using errcode='22023'; end if;
  select id,requires_note into type_id,note_required from public.leave_types where organization_id=org and (active or id=target.leave_type_id) and (code=p_leave_type or name=p_leave_type);
  if type_id is null then raise exception 'leave_type_not_available' using errcode='22023'; end if;
  if note_required and nullif(trim(p_note),'') is null then raise exception 'note_required' using errcode='22023'; end if;
  -- Corrections may concern historical leave; new-request date restrictions do not apply.
  select count(*)::numeric*p_day_fraction into days
  from generate_series(p_starts_on,p_ends_on,interval '1 day') day_value
  where extract(isodow from day_value)<7 and not exists(
    select 1 from public.public_holidays holiday
    where holiday.organization_id=org and holiday.holiday_on=day_value::date
      and (holiday.location_id is null or holiday.location_id=(select location_id from public.employee_profiles where profile_id=target.profile_id))
  );
  if days<=0 then raise exception 'no_workdays_in_period' using errcode='22023'; end if;
  if target.status in ('submitted','review','approved') and exists(
    select 1 from public.leave_requests r where r.id<>target.id and r.profile_id=target.profile_id
      and r.status in ('submitted','review','approved')
      and daterange(r.starts_on,r.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')
  ) then raise exception 'overlapping_leave_request' using errcode='23P01'; end if;
  update public.leave_requests set leave_type=p_leave_type,leave_type_id=type_id,starts_on=p_starts_on,
    ends_on=p_ends_on,day_fraction=p_day_fraction,workdays=days,note=nullif(trim(p_note),'')
    where id=target.id returning * into after_row;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'leave.corrected','leave_request',target.id,jsonb_build_object(
      'reason',trim(p_correction_reason),'before',to_jsonb(target),'after',to_jsonb(after_row)));
  return target.id;
end $$;

-- Retained deleted profiles may remain in existing groups for history.
-- They cannot be added to new groups or authenticate; their active replacements
-- are selected independently. No old account or access is restored.

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
      p.status='active' or (p.status in ('invited','suspended','archived') and exists(
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
      p.status in ('active','invited') or (p.status in ('suspended','archived') and private.is_team_member(p_team_id,p.id))
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
