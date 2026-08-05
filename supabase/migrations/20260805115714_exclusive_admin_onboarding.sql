-- A guided first-run setup is deliberately reserved for the single bootstrap
-- administrator. The profile flag, the server-controlled Auth email and the
-- settings permission must all agree before any onboarding mutation is made.

alter table public.profiles
  add column if not exists onboarding_required boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_onboarding_target_check;
alter table public.profiles
  add constraint profiles_onboarding_target_check
  check (
    not onboarding_required
    or lower(trim(email))='info@alberring.de'
  );

create index if not exists profiles_pending_onboarding_idx
  on public.profiles(auth_user_id)
  where onboarding_required and onboarding_completed_at is null;

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
    ) as required,
    p.onboarding_completed_at,
    (
      p.onboarding_required
      and lower(trim(p.email))='info@alberring.de'
      and lower(trim(u.email))='info@alberring.de'
    ) as eligible
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
  limit 1
$$;

create or replace function public.get_admin_onboarding_defaults()
returns table(
  organization_name text,
  display_name text,
  first_name text,
  last_name text,
  work_phone text,
  job_title text,
  timezone text,
  location_name text,
  department_name text,
  team_name text,
  leave_approval_steps smallint,
  mileage_reminder_days smallint[],
  mileage_overdue_day smallint,
  birthday_reminder_days smallint[],
  message_edit_window_minutes smallint,
  email_notifications boolean,
  push_notifications boolean
)
language plpgsql
stable
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
  limit 1;

  if target_profile.id is null
    or not private.has_permission('settings.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;

  return query
  select
    o.name,
    target_profile.display_name,
    coalesce(ep.first_name,''),
    coalesce(ep.last_name,''),
    coalesce(ep.work_phone,''),
    coalesce(ep.job_title,''),
    settings.timezone,
    coalesce(location.name,''),
    coalesce(department.name,''),
    coalesce(team.name,''),
    settings.leave_approval_steps,
    settings.mileage_reminder_days,
    settings.mileage_overdue_day,
    settings.birthday_reminder_days,
    settings.message_edit_window_minutes,
    coalesce(preferences.email_enabled,false),
    coalesce(preferences.push_enabled,false)
  from public.organizations o
  join public.organization_settings settings
    on settings.organization_id=o.id
  left join public.employee_profiles ep
    on ep.profile_id=target_profile.id
    and ep.organization_id=target_profile.organization_id
  left join public.locations location on location.id=ep.location_id
  left join public.departments department on department.id=ep.department_id
  left join lateral (
    select t.name
    from public.team_memberships membership
    join public.teams t
      on t.id=membership.team_id
      and t.organization_id=membership.organization_id
    where membership.profile_id=target_profile.id
      and membership.organization_id=target_profile.organization_id
      and membership.valid_from<=current_date
      and (
        membership.valid_until is null
        or membership.valid_until>=current_date
      )
    order by membership.valid_from desc,t.name
    limit 1
  ) team on true
  left join lateral (
    select
      bool_or(np.email_enabled) as email_enabled,
      bool_or(np.push_enabled) as push_enabled
    from public.notification_preferences np
    where np.profile_id=target_profile.id
      and np.organization_id=target_profile.organization_id
  ) preferences on true
  where o.id=target_profile.organization_id;
end;
$$;

create or replace function public.complete_admin_onboarding(
  p_organization_name text,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_work_phone text,
  p_job_title text,
  p_timezone text,
  p_location_name text,
  p_department_name text,
  p_team_name text,
  p_leave_approval_steps smallint,
  p_mileage_reminder_days smallint[],
  p_mileage_overdue_day smallint,
  p_birthday_reminder_days smallint[],
  p_message_edit_window_minutes smallint,
  p_email_notifications boolean,
  p_push_notifications boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
  normalized_location text:=nullif(trim(p_location_name),'');
  normalized_department text:=nullif(trim(p_department_name),'');
  normalized_team text:=nullif(trim(p_team_name),'');
  target_location_id uuid;
  target_department_id uuid;
  target_team_id uuid;
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
    or not private.has_permission('settings.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;
  if target_profile.onboarding_completed_at is not null then
    raise exception 'onboarding_already_completed' using errcode='22023';
  end if;

  if length(trim(coalesce(p_organization_name,''))) not between 2 and 160
    or length(trim(coalesce(p_display_name,''))) not between 2 and 120
    or length(trim(coalesce(p_first_name,''))) not between 1 and 80
    or length(trim(coalesce(p_last_name,''))) not between 1 and 80 then
    raise exception 'invalid_onboarding_identity' using errcode='22023';
  end if;
  if length(coalesce(p_work_phone,''))>40
    or length(coalesce(p_job_title,''))>120 then
    raise exception 'invalid_onboarding_profile' using errcode='22023';
  end if;
  if normalized_location is not null
    and length(normalized_location) not between 2 and 120 then
    raise exception 'invalid_onboarding_location' using errcode='22023';
  end if;
  if normalized_department is not null
    and length(normalized_department) not between 2 and 120 then
    raise exception 'invalid_onboarding_department' using errcode='22023';
  end if;
  if normalized_team is not null
    and length(normalized_team) not between 2 and 120 then
    raise exception 'invalid_onboarding_team' using errcode='22023';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_timezone_names
    where name=trim(p_timezone)
  ) then
    raise exception 'invalid_onboarding_timezone' using errcode='22023';
  end if;
  if p_leave_approval_steps not between 1 and 2
    or p_mileage_overdue_day not between 1 and 28
    or p_message_edit_window_minutes not between 1 and 1440
    or p_email_notifications is null
    or p_push_notifications is null then
    raise exception 'invalid_onboarding_settings' using errcode='22023';
  end if;
  if coalesce(cardinality(p_mileage_reminder_days),0) not between 1 and 10
    or exists(
      select 1 from unnest(p_mileage_reminder_days) reminder_day
      where reminder_day not between 1 and 31
    ) then
    raise exception 'invalid_mileage_reminder_days' using errcode='22023';
  end if;
  if coalesce(cardinality(p_birthday_reminder_days),0) not between 1 and 10
    or exists(
      select 1 from unnest(p_birthday_reminder_days) reminder_day
      where reminder_day not between 0 and 365
    ) then
    raise exception 'invalid_birthday_reminder_days' using errcode='22023';
  end if;

  update public.organizations
  set name=trim(p_organization_name),updated_at=now()
  where id=target_profile.organization_id;

  update public.organization_settings
  set
    timezone=trim(p_timezone),
    leave_approval_steps=p_leave_approval_steps,
    mileage_reminder_days=array(
      select distinct reminder_day
      from unnest(p_mileage_reminder_days) reminder_day
      order by reminder_day
    ),
    mileage_overdue_day=p_mileage_overdue_day,
    birthday_reminder_days=array(
      select distinct reminder_day
      from unnest(p_birthday_reminder_days) reminder_day
      order by reminder_day desc
    ),
    message_edit_window_minutes=p_message_edit_window_minutes,
    updated_at=now()
  where organization_id=target_profile.organization_id;

  update public.profiles
  set display_name=trim(p_display_name),updated_at=now()
  where id=target_profile.id;

  insert into public.employee_profiles(
    profile_id,organization_id,first_name,last_name,work_phone,job_title
  ) values(
    target_profile.id,target_profile.organization_id,
    trim(p_first_name),trim(p_last_name),
    nullif(trim(p_work_phone),''),nullif(trim(p_job_title),'')
  )
  on conflict(profile_id) do update set
    first_name=excluded.first_name,
    last_name=excluded.last_name,
    work_phone=excluded.work_phone,
    job_title=excluded.job_title,
    updated_at=now();

  if normalized_location is not null then
    insert into public.locations(organization_id,name,timezone,active)
    values(
      target_profile.organization_id,normalized_location,
      trim(p_timezone),true
    )
    on conflict(organization_id,name) do update set
      timezone=excluded.timezone,active=true,updated_at=now()
    returning id into target_location_id;
  end if;

  if normalized_department is not null then
    insert into public.departments(organization_id,name,active)
    values(target_profile.organization_id,normalized_department,true)
    on conflict(organization_id,name) do update set
      active=true,updated_at=now()
    returning id into target_department_id;
  end if;

  update public.employee_profiles
  set
    location_id=target_location_id,
    department_id=target_department_id,
    updated_at=now()
  where profile_id=target_profile.id;

  if normalized_team is not null then
    insert into public.teams(
      organization_id,name,location_id,department_id,lead_profile_id,active
    ) values(
      target_profile.organization_id,normalized_team,target_location_id,
      target_department_id,target_profile.id,true
    )
    on conflict(organization_id,name) do update set
      location_id=excluded.location_id,
      department_id=excluded.department_id,
      lead_profile_id=excluded.lead_profile_id,
      active=true,
      updated_at=now()
    returning id into target_team_id;

    delete from public.team_memberships
    where profile_id=target_profile.id
      and organization_id=target_profile.organization_id
      and team_id<>target_team_id
      and valid_from=current_date;
    update public.team_memberships
    set valid_until=current_date-1
    where profile_id=target_profile.id
      and organization_id=target_profile.organization_id
      and team_id<>target_team_id
      and valid_from<current_date
      and (valid_until is null or valid_until>=current_date);
    insert into public.team_memberships(
      team_id,profile_id,organization_id,valid_from,valid_until
    ) values(
      target_team_id,target_profile.id,target_profile.organization_id,
      current_date,null
    )
    on conflict(team_id,profile_id,valid_from) do update
      set valid_until=null;
  end if;

  insert into public.notification_preferences(
    organization_id,profile_id,category,email_enabled,push_enabled
  )
  select
    target_profile.organization_id,target_profile.id,category,
    p_email_notifications,p_push_notifications
  from unnest(array[
    'messages','news','schedule','leave','sick_leave','documents',
    'fleet','materials','birthdays','system'
  ]) category
  on conflict(profile_id,category) do update set
    email_enabled=excluded.email_enabled,
    push_enabled=excluded.push_enabled,
    updated_at=now();

  update public.profiles
  set onboarding_completed_at=now(),updated_at=now()
  where id=target_profile.id;

  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    target_profile.organization_id,target_profile.id,
    'admin.onboarding_completed','profile',target_profile.id,
    jsonb_build_object(
      'location_configured',normalized_location is not null,
      'department_configured',normalized_department is not null,
      'team_configured',normalized_team is not null,
      'email_notifications',p_email_notifications,
      'push_notifications',p_push_notifications
    )
  );
end;
$$;

revoke all on function public.get_my_onboarding_state()
  from public,anon,authenticated;
revoke all on function public.get_admin_onboarding_defaults()
  from public,anon,authenticated;
revoke all on function public.complete_admin_onboarding(
  text,text,text,text,text,text,text,text,text,text,
  smallint,smallint[],smallint,smallint[],smallint,boolean,boolean
) from public,anon,authenticated;

grant execute on function public.get_my_onboarding_state()
  to authenticated;
grant execute on function public.get_admin_onboarding_defaults()
  to authenticated;
grant execute on function public.complete_admin_onboarding(
  text,text,text,text,text,text,text,text,text,text,
  smallint,smallint[],smallint,smallint[],smallint,boolean,boolean
) to authenticated;

notify pgrst, 'reload schema';
