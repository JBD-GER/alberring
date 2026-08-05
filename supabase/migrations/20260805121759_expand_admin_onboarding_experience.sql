-- Expand the one-off bootstrap experience without weakening its original
-- identity boundary. Setup and product discovery remain reserved for the
-- exact, server-controlled info@alberring.de Auth identity.

alter table public.profiles
  add column if not exists onboarding_prepared_at timestamptz,
  add column if not exists product_tour_required boolean not null default false,
  add column if not exists product_tour_completed_at timestamptz,
  add column if not exists product_tour_version smallint not null default 0,
  add column if not exists product_tour_step smallint not null default 0,
  add column if not exists product_tour_deferred_until timestamptz;

alter table public.profiles
  drop constraint if exists profiles_product_tour_target_check;
alter table public.profiles
  add constraint profiles_product_tour_target_check
  check (
    (
      onboarding_prepared_at is null
      and
      not product_tour_required
      and product_tour_completed_at is null
      and product_tour_version=0
      and product_tour_step=0
      and product_tour_deferred_until is null
    )
    or lower(trim(email))='info@alberring.de'
  );

alter table public.profiles
  drop constraint if exists profiles_product_tour_progress_check;
alter table public.profiles
  add constraint profiles_product_tour_progress_check
  check (
    product_tour_version between 0 and 100
    and product_tour_step between 0 and 20
  );

create index if not exists profiles_pending_product_tour_idx
  on public.profiles(auth_user_id)
  where product_tour_required and product_tour_completed_at is null;

create or replace function public.get_my_onboarding_state()
returns table(
  required boolean,
  completed_at timestamptz,
  eligible boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      p.onboarding_required
      and p.onboarding_completed_at is null
      and lower(trim(p.email))='info@alberring.de'
      and lower(trim(u.email))='info@alberring.de'
      and private.has_permission('settings.manage')
      and private.has_permission('users.manage')
      and private.has_permission('teams.manage')
    ) as required,
    p.onboarding_completed_at,
    (
      p.onboarding_required
      and lower(trim(p.email))='info@alberring.de'
      and lower(trim(u.email))='info@alberring.de'
      and private.has_permission('settings.manage')
      and private.has_permission('users.manage')
      and private.has_permission('teams.manage')
    ) as eligible
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
  limit 1
$$;

create or replace function public.get_my_product_tour_state()
returns table(
  required boolean,
  completed_at timestamptz,
  eligible boolean,
  current_step smallint,
  version smallint,
  deferred_until timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      p.product_tour_required
      and p.product_tour_completed_at is null
      and (
        p.product_tour_deferred_until is null
        or p.product_tour_deferred_until<=now()
      )
      and p.onboarding_completed_at is not null
      and lower(trim(p.email))='info@alberring.de'
      and lower(trim(u.email))='info@alberring.de'
      and private.has_permission('settings.manage')
      and private.has_permission('users.manage')
      and private.has_permission('teams.manage')
      and private.has_permission('dashboard.view')
      and private.has_permission('messages.use')
      and (
        private.has_permission('schedule.view_own')
        or private.has_permission('schedule.view_team')
        or private.has_permission('schedule.manage')
      )
      and (
        private.has_permission('documents.view_own')
        or private.has_permission('documents.view_shared')
        or private.has_permission('documents.manage')
      )
    ) as required,
    p.product_tour_completed_at,
    (
      p.onboarding_completed_at is not null
      and lower(trim(p.email))='info@alberring.de'
      and lower(trim(u.email))='info@alberring.de'
      and private.has_permission('settings.manage')
      and private.has_permission('users.manage')
      and private.has_permission('teams.manage')
      and private.has_permission('dashboard.view')
      and private.has_permission('messages.use')
      and (
        private.has_permission('schedule.view_own')
        or private.has_permission('schedule.view_team')
        or private.has_permission('schedule.manage')
      )
      and (
        private.has_permission('documents.view_own')
        or private.has_permission('documents.view_shared')
        or private.has_permission('documents.manage')
      )
    ) as eligible,
    p.product_tour_step,
    p.product_tour_version,
    p.product_tour_deferred_until
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
  limit 1
$$;

create or replace function public.get_admin_onboarding_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
  primary_team_id uuid;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_required
    and p.onboarding_completed_at is null
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  limit 1;

  if target_profile.id is null
    or not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;

  select membership.team_id into primary_team_id
  from public.team_memberships membership
  join public.teams team
    on team.id=membership.team_id
    and team.organization_id=membership.organization_id
    and team.active
  where membership.profile_id=target_profile.id
    and membership.organization_id=target_profile.organization_id
    and membership.valid_from<=current_date
    and (
      membership.valid_until is null
      or membership.valid_until>=current_date
    )
  order by membership.valid_from desc,team.name
  limit 1;

  return jsonb_build_object(
    'roles',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',role.id,
          'name',role.name,
          'systemKey',role.system_key
        ) order by
          case when role.system_key='employee' then 0 else 1 end,
          role.name
      )
      from public.roles role
      where role.organization_id=target_profile.organization_id
        and role.active
        and (
          role.system_key is null
          or role.system_key not in ('super_admin','auditor')
        )
        and private.can_delegate_role(role.id)
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(
        jsonb_build_object('id',team.id,'name',team.name)
        order by team.sort_rank,team.name
      )
      from (
        select
          existing.id,
          existing.name,
          case when existing.id=primary_team_id then 0 else 1 end sort_rank
        from public.teams existing
        where existing.organization_id=target_profile.organization_id
          and existing.active
        order by sort_rank,existing.name
        limit 8
      ) team
    ),'[]'::jsonb),
    'pendingInvites',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',invitee.id,
          'firstName',employee.first_name,
          'lastName',employee.last_name,
          'email',invitee.email,
          'roleId',invite_role.id,
          'teamName',coalesce(invite_team.name,'')
        ) order by invitee.created_at
      )
      from public.profiles invitee
      join public.employee_profiles employee
        on employee.profile_id=invitee.id
        and employee.organization_id=invitee.organization_id
      join lateral (
        select role.id
        from public.user_roles assignment
        join public.roles role
          on role.id=assignment.role_id
          and role.organization_id=assignment.organization_id
          and role.active
        where assignment.profile_id=invitee.id
          and assignment.organization_id=invitee.organization_id
          and assignment.valid_from<=now()
          and (
            assignment.valid_until is null
            or assignment.valid_until>now()
          )
        order by assignment.valid_from desc
        limit 1
      ) invite_role on true
      left join lateral (
        select team.name
        from public.team_memberships membership
        join public.teams team
          on team.id=membership.team_id
          and team.organization_id=membership.organization_id
        where membership.profile_id=invitee.id
          and membership.organization_id=invitee.organization_id
          and membership.valid_from<=current_date
          and (
            membership.valid_until is null
            or membership.valid_until>=current_date
          )
        order by membership.valid_from desc,team.name
        limit 1
      ) invite_team on true
      where invitee.organization_id=target_profile.organization_id
        and invitee.status='invited'
        and target_profile.onboarding_prepared_at is not null
        and exists(
          select 1 from public.audit_logs audit
          where audit.organization_id=target_profile.organization_id
            and audit.actor_id=target_profile.id
            and audit.entity_id=invitee.id
            and audit.action='user.invited'
            and audit.created_at>=target_profile.onboarding_prepared_at
        )
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.prepare_admin_onboarding_v2(
  p_organization_name text,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_work_phone text,
  p_job_title text,
  p_timezone text,
  p_location_name text,
  p_department_name text,
  p_team_names text[],
  p_leave_approval_steps smallint,
  p_mileage_reminder_days smallint[],
  p_mileage_overdue_day smallint,
  p_birthday_reminder_days smallint[],
  p_message_edit_window_minutes smallint,
  p_email_notifications boolean,
  p_push_notifications boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
  normalized_team_names text[];
  primary_team_name text;
  team_name text;
  target_team_id uuid;
  target_location_id uuid;
  target_department_id uuid;
  existing_team_ids uuid[]:='{}'::uuid[];
  primary_existing public.teams%rowtype;
  result_teams jsonb:='[]'::jsonb;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_required
    and p.onboarding_completed_at is null
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  for update of p;

  if target_profile.id is null
    or not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;

  select array_agg(trim(candidate) order by ordinal)
  into normalized_team_names
  from unnest(p_team_names) with ordinality as input(candidate,ordinal);

  if coalesce(cardinality(normalized_team_names),0) not between 1 and 8
    or exists(
      select 1 from unnest(normalized_team_names) candidate
      where candidate is null or length(candidate) not between 2 and 120
    )
    or (
      select count(*) from (
        select lower(candidate)
        from unnest(normalized_team_names) candidate
        group by lower(candidate)
      ) unique_names
    )<>cardinality(normalized_team_names) then
    raise exception 'invalid_onboarding_teams' using errcode='22023';
  end if;

  select coalesce(array_agg(existing.id),'{}'::uuid[])
  into existing_team_ids
  from public.teams existing
  where existing.organization_id=target_profile.organization_id
    and exists(
      select 1 from unnest(normalized_team_names) candidate
      where lower(candidate)=lower(trim(existing.name))
    );

  select existing.* into primary_existing
  from public.teams existing
  where existing.organization_id=target_profile.organization_id
    and lower(trim(existing.name))=lower(normalized_team_names[1])
  order by existing.created_at
  limit 1;
  primary_team_name:=coalesce(primary_existing.name,normalized_team_names[1]);

  perform public.complete_admin_onboarding(
    p_organization_name,p_display_name,p_first_name,p_last_name,
    p_work_phone,p_job_title,p_timezone,p_location_name,p_department_name,
    primary_team_name,p_leave_approval_steps,p_mileage_reminder_days,
    p_mileage_overdue_day,p_birthday_reminder_days,
    p_message_edit_window_minutes,p_email_notifications,p_push_notifications
  );

  -- The legacy validator/upsert assigns the primary membership, but existing
  -- team metadata belongs to the operating organization and must not be
  -- rewritten by the one-off setup wizard.
  if primary_existing.id is not null then
    update public.teams
    set
      location_name=primary_existing.location_name,
      location_id=primary_existing.location_id,
      department_id=primary_existing.department_id,
      lead_profile_id=primary_existing.lead_profile_id,
      active=primary_existing.active,
      updated_at=primary_existing.updated_at
    where id=primary_existing.id;
  end if;

  select employee.location_id,employee.department_id
  into target_location_id,target_department_id
  from public.employee_profiles employee
  where employee.profile_id=target_profile.id;

  foreach team_name in array normalized_team_names loop
    select existing.id into target_team_id
    from public.teams existing
    where existing.organization_id=target_profile.organization_id
      and lower(trim(existing.name))=lower(team_name)
    order by existing.created_at
    limit 1
    for update;

    if target_team_id is null then
      insert into public.teams(
        organization_id,name,location_name,location_id,department_id,
        lead_profile_id,active
      ) values(
        target_profile.organization_id,team_name,
        nullif(trim(p_location_name),''),target_location_id,target_department_id,
        case
          when lower(team_name)=lower(normalized_team_names[1])
            then target_profile.id
          else null
        end,
        true
      ) returning id into target_team_id;
    elsif not (target_team_id=any(existing_team_ids)) then
      update public.teams
      set
        location_name=nullif(trim(p_location_name),''),
        location_id=target_location_id,
        department_id=target_department_id,
        lead_profile_id=case
          when lower(team_name)=lower(normalized_team_names[1])
            then coalesce(lead_profile_id,target_profile.id)
          else lead_profile_id
        end,
        active=true,
        updated_at=now()
      where id=target_team_id;
    end if;

    result_teams:=result_teams||jsonb_build_array(
      jsonb_build_object('id',target_team_id,'name',team_name)
    );
    target_team_id:=null;
  end loop;

  update public.profiles
  set
    onboarding_prepared_at=coalesce(onboarding_prepared_at,now()),
    onboarding_completed_at=null,
    product_tour_required=false,
    product_tour_completed_at=null,
    product_tour_version=0,
    product_tour_step=0,
    product_tour_deferred_until=null,
    updated_at=now()
  where id=target_profile.id;

  update public.audit_logs
  set
    action='admin.onboarding_setup_saved',
    metadata=metadata||jsonb_build_object(
      'team_count',cardinality(normalized_team_names)
    )
  where id=(
    select audit.id
    from public.audit_logs audit
    where audit.organization_id=target_profile.organization_id
      and audit.actor_id=target_profile.id
      and audit.action='admin.onboarding_completed'
    order by audit.created_at desc,audit.id desc
    limit 1
  );

  return jsonb_build_object('teams',result_teams);
end;
$$;

create or replace function public.finalize_admin_onboarding()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_required
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  for update of p;

  if target_profile.id is null
    or not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;
  if target_profile.onboarding_completed_at is not null then
    if target_profile.product_tour_version=1 then
      return;
    end if;
    raise exception 'onboarding_already_completed' using errcode='22023';
  end if;
  if target_profile.onboarding_prepared_at is null then
    raise exception 'onboarding_setup_required' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.teams team
    where team.organization_id=target_profile.organization_id
      and team.active
  ) then
    raise exception 'onboarding_team_required' using errcode='22023';
  end if;

  update public.profiles
  set
    onboarding_completed_at=now(),
    product_tour_required=true,
    product_tour_completed_at=null,
    product_tour_version=1,
    product_tour_step=0,
    product_tour_deferred_until=null,
    updated_at=now()
  where id=target_profile.id;

  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    target_profile.organization_id,target_profile.id,
    'admin.onboarding_completed','profile',target_profile.id,
    jsonb_build_object(
      'team_count',(
        select count(*) from public.teams team
        where team.organization_id=target_profile.organization_id
          and team.active
      ),
      'tour_queued',true
    )
  );
end;
$$;

create or replace function public.save_product_tour_progress(
  p_step smallint,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_completed_at is not null
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  for update of p;

  if target_profile.id is null then
    raise exception 'product_tour_not_available' using errcode='42501';
  end if;
  if not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage')
    or not private.has_permission('dashboard.view')
    or not private.has_permission('messages.use')
    or not (
      private.has_permission('schedule.view_own')
      or private.has_permission('schedule.view_team')
      or private.has_permission('schedule.manage')
    )
    or not (
      private.has_permission('documents.view_own')
      or private.has_permission('documents.view_shared')
      or private.has_permission('documents.manage')
    ) then
    raise exception 'product_tour_not_available' using errcode='42501';
  end if;
  if p_step is null
    or p_action is null
    or p_step not between 0 and 6
    or p_action not in ('progress','deferred','completed') then
    raise exception 'invalid_product_tour_progress' using errcode='22023';
  end if;
  if target_profile.product_tour_completed_at is not null
    and p_action<>'completed' then
    raise exception 'product_tour_already_completed' using errcode='22023';
  end if;

  update public.profiles
  set
    product_tour_required=p_action<>'completed',
    product_tour_completed_at=case
      when p_action='completed' then coalesce(product_tour_completed_at,now())
      else null
    end,
    product_tour_version=1,
    product_tour_step=p_step,
    product_tour_deferred_until=case
      when p_action='deferred' then now()+interval '1 day'
      else null
    end,
    updated_at=now()
  where id=target_profile.id;

  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  )
  select
    target_profile.organization_id,target_profile.id,
    case p_action
      when 'completed' then 'admin.product_tour_completed'
      when 'deferred' then 'admin.product_tour_deferred'
      else 'admin.product_tour_progressed'
    end,
    'profile',target_profile.id,
    jsonb_build_object('step',p_step,'version',1)
  where (p_action<>'progress' or p_step in (1,3,6))
    and not (
      p_action='completed'
      and exists(
        select 1 from public.audit_logs audit
        where audit.organization_id=target_profile.organization_id
          and audit.actor_id=target_profile.id
          and audit.action='admin.product_tour_completed'
      )
    );
end;
$$;

revoke all on function public.get_my_onboarding_state()
  from public,anon,authenticated;
revoke all on function public.get_my_product_tour_state()
  from public,anon,authenticated;
revoke all on function public.get_admin_onboarding_catalog()
  from public,anon,authenticated;
revoke all on function public.prepare_admin_onboarding_v2(
  text,text,text,text,text,text,text,text,text,text[],smallint,smallint[],
  smallint,smallint[],smallint,boolean,boolean
) from public,anon,authenticated;
revoke all on function public.finalize_admin_onboarding()
  from public,anon,authenticated;
revoke all on function public.save_product_tour_progress(smallint,text)
  from public,anon,authenticated;

revoke all on function public.complete_admin_onboarding(
  text,text,text,text,text,text,text,text,text,text,
  smallint,smallint[],smallint,smallint[],smallint,boolean,boolean
) from public,anon,authenticated;

grant execute on function public.get_my_onboarding_state()
  to authenticated;
grant execute on function public.get_my_product_tour_state()
  to authenticated;
grant execute on function public.get_admin_onboarding_catalog()
  to authenticated;
grant execute on function public.prepare_admin_onboarding_v2(
  text,text,text,text,text,text,text,text,text,text[],smallint,smallint[],
  smallint,smallint[],smallint,boolean,boolean
) to authenticated;
grant execute on function public.finalize_admin_onboarding()
  to authenticated;
grant execute on function public.save_product_tour_progress(smallint,text)
  to authenticated;

revoke select(
  onboarding_prepared_at,product_tour_required,product_tour_completed_at,
  product_tour_version,product_tour_step,product_tour_deferred_until
)
  on public.profiles from anon,authenticated;
revoke update(
  onboarding_prepared_at,product_tour_required,product_tour_completed_at,
  product_tour_version,product_tour_step,product_tour_deferred_until
)
  on public.profiles from anon,authenticated;

notify pgrst, 'reload schema';
