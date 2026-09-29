-- Employee details and login email have separate explicit save actions.
-- Auth email changes use the supported Admin API, bracketed by audited,
-- tenant-scoped reservations; application fields never update Auth directly.
create or replace function private.update_employee(p_profile_id uuid,p_fields jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.profiles%rowtype;
  first_name text:=trim(p_fields->>'firstName'); last_name text:=trim(p_fields->>'lastName');
  desired_display_name text:=trim(p_fields->>'displayName');
  employee_number text:=nullif(trim(p_fields->>'employeeNumber'),'');
  work_phone text:=nullif(trim(p_fields->>'workPhone'),'');
  job_title text:=nullif(trim(p_fields->>'jobTitle'),'');
  employment_status text:=p_fields->>'employmentStatus';
  start_date date:=nullif(p_fields->>'startDate','')::date;
  end_date date:=nullif(p_fields->>'endDate','')::date;
  birth_date date:=nullif(p_fields->>'birthDate','')::date;
  weekly_hours numeric:=nullif(p_fields->>'weeklyHours','')::numeric;
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if first_name is null or length(first_name) not between 1 and 80
    or last_name is null or length(last_name) not between 1 and 80
    or desired_display_name is null or length(desired_display_name) not between 2 and 120
    or length(employee_number)>80 or length(work_phone)>40 or length(job_title)>120
    or employment_status is null or employment_status not in ('active','leave','inactive','terminated')
    or weekly_hours<0 or weekly_hours>80 or (end_date is not null and start_date is not null and end_date<start_date)
    or birth_date>current_date then
    raise exception 'invalid_employee_fields' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select p.* into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.auth_user_id is null or to_jsonb(target)->>'deleted_at' is not null then
    raise exception 'profile_not_found' using errcode='P0002';
  end if;
  update public.profiles p set display_name=desired_display_name where p.id=target.id;
  insert into public.employee_profiles(profile_id,organization_id,first_name,last_name,employee_number,work_phone,
    job_title,employment_status,start_date,end_date,birth_date,weekly_hours)
  values(target.id,org,first_name,last_name,employee_number,work_phone,job_title,employment_status,start_date,end_date,birth_date,weekly_hours)
  on conflict(profile_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,
    employee_number=excluded.employee_number,work_phone=excluded.work_phone,job_title=excluded.job_title,
    employment_status=excluded.employment_status,start_date=excluded.start_date,end_date=excluded.end_date,
    birth_date=excluded.birth_date,weekly_hours=excluded.weekly_hours;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  values(org,me,'user.employee_data_updated','profile',target.id,coalesce(p_request_id,gen_random_uuid()),
    jsonb_build_object('fields',array['first_name','last_name','display_name','employee_number','work_phone','job_title',
      'employment_status','start_date','end_date','birth_date','weekly_hours']));
  return target.id;
end;
$$;

create or replace function private.begin_employee_email_change(p_profile_id uuid,p_email text,p_request_id uuid)
returns table(auth_user_id uuid,email text,status text)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.profiles%rowtype;
  new_email text:=lower(trim(p_email));
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_request_id is null or new_email is null or length(new_email)>254
    or new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select p.* into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.auth_user_id is null or to_jsonb(target)->>'deleted_at' is not null then
    raise exception 'profile_not_found' using errcode='P0002';
  end if;
  if exists(select 1 from public.audit_logs started where started.organization_id=org and started.entity_id=target.id
    and started.created_at>now()-interval '10 minutes'
    and ((started.action='user.email_change_started' and not exists(select 1 from public.audit_logs done
      where done.organization_id=org and done.entity_id=target.id and done.request_id=started.request_id
        and done.action in ('user.email_changed','user.email_change_failed')))
      or (started.action='user.invite_resend_started' and not exists(select 1 from public.audit_logs done
        where done.organization_id=org and done.entity_id=target.id and done.request_id=started.request_id
          and done.action='user.invite_resent')))) then
    raise exception 'account_operation_in_progress' using errcode='55000';
  end if;
  if exists(select 1 from auth.users u where lower(u.email)=new_email and u.id<>target.auth_user_id)
    or exists(select 1 from public.profiles p where p.organization_id=org and lower(p.email)=new_email and p.id<>target.id) then
    raise exception 'email_not_available' using errcode='23505';
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'user.email_change_started','profile',target.id,p_request_id,
      jsonb_build_object('new_email',new_email,'previous_email',target.email));
  return query select target.auth_user_id,target.email,target.status;
end;
$$;

create or replace function private.complete_employee_email_change(p_profile_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.profiles%rowtype;
  operation public.audit_logs%rowtype; actual_email text;
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select p.* into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.auth_user_id is null or to_jsonb(target)->>'deleted_at' is not null then
    raise exception 'profile_not_found' using errcode='P0002';
  end if;
  select a.* into operation from public.audit_logs a where a.request_id=p_request_id
    and a.organization_id=org and a.entity_id=target.id and a.actor_id=me and a.action='user.email_change_started'
    and a.created_at>now()-interval '10 minutes' for update;
  if operation.id is null or exists(select 1 from public.audit_logs a where a.request_id=p_request_id
    and a.organization_id=org and a.entity_id=target.id and a.action in ('user.email_changed','user.email_change_failed')) then
    raise exception 'email_change_not_pending' using errcode='22023';
  end if;
  select lower(u.email) into actual_email from auth.users u where u.id=target.auth_user_id for update;
  if actual_email is distinct from operation.metadata->>'new_email' then
    raise exception 'auth_email_not_updated' using errcode='55000';
  end if;
  update public.profiles set email=actual_email where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  values(org,me,'user.email_changed','profile',target.id,p_request_id,
    jsonb_build_object('previous_email',target.email,'new_email',actual_email));
  return target.id;
end;
$$;

create or replace function private.cancel_employee_email_change(p_profile_id uuid,p_request_id uuid,p_auth_restored boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  perform 1 from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if not exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=p_profile_id
    and a.actor_id=me and a.request_id=p_request_id and a.action='user.email_change_started') then
    raise exception 'email_change_not_pending' using errcode='22023';
  end if;
  if not exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=p_profile_id
    and a.request_id=p_request_id and a.action in ('user.email_changed','user.email_change_failed')) then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'user.email_change_failed','profile',p_profile_id,p_request_id,
      jsonb_build_object('auth_restored',p_auth_restored));
  end if;
end;
$$;

create or replace function private.employee_email_change_state(p_profile_id uuid,p_request_id uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null or me is null or not private.has_permission('users.manage')
    or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if not exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=p_profile_id
    and a.actor_id=me and a.request_id=p_request_id and a.action='user.email_change_started') then
    raise exception 'email_change_not_pending' using errcode='22023';
  end if;
  if exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=p_profile_id
    and a.request_id=p_request_id and a.action='user.email_changed') then return 'completed'; end if;
  if exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=p_profile_id
    and a.request_id=p_request_id and a.action='user.email_change_failed') then return 'failed'; end if;
  return 'pending';
end;
$$;

revoke all on function private.update_employee(uuid,jsonb,uuid),private.begin_employee_email_change(uuid,text,uuid),
  private.complete_employee_email_change(uuid,uuid),private.cancel_employee_email_change(uuid,uuid,boolean),private.employee_email_change_state(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.update_employee(uuid,jsonb,uuid),private.begin_employee_email_change(uuid,text,uuid),
  private.complete_employee_email_change(uuid,uuid),private.cancel_employee_email_change(uuid,uuid,boolean),private.employee_email_change_state(uuid,uuid) to authenticated;

create or replace function public.admin_update_employee(p_profile_id uuid,p_fields jsonb,p_request_id uuid)
returns uuid language sql security invoker begin atomic
  select private.update_employee(p_profile_id,p_fields,p_request_id);
end;
create or replace function public.admin_begin_employee_email_change(p_profile_id uuid,p_email text,p_request_id uuid)
returns table(auth_user_id uuid,email text,status text) language sql security invoker begin atomic
  select * from private.begin_employee_email_change(p_profile_id,p_email,p_request_id);
end;
create or replace function public.admin_complete_employee_email_change(p_profile_id uuid,p_request_id uuid)
returns uuid language sql security invoker begin atomic
  select private.complete_employee_email_change(p_profile_id,p_request_id);
end;
create or replace function public.admin_cancel_employee_email_change(p_profile_id uuid,p_request_id uuid,p_auth_restored boolean)
returns void language sql security invoker begin atomic
  select private.cancel_employee_email_change(p_profile_id,p_request_id,p_auth_restored);
end;
create or replace function public.admin_employee_email_change_state(p_profile_id uuid,p_request_id uuid)
returns text language sql security invoker begin atomic
  select private.employee_email_change_state(p_profile_id,p_request_id);
end;
alter function public.admin_update_employee(uuid,jsonb,uuid) set search_path=pg_catalog;
alter function public.admin_begin_employee_email_change(uuid,text,uuid) set search_path=pg_catalog;
alter function public.admin_complete_employee_email_change(uuid,uuid) set search_path=pg_catalog;
alter function public.admin_cancel_employee_email_change(uuid,uuid,boolean) set search_path=pg_catalog;
alter function public.admin_employee_email_change_state(uuid,uuid) set search_path=pg_catalog;
revoke all on function public.admin_update_employee(uuid,jsonb,uuid),public.admin_begin_employee_email_change(uuid,text,uuid),
  public.admin_complete_employee_email_change(uuid,uuid),public.admin_cancel_employee_email_change(uuid,uuid,boolean),public.admin_employee_email_change_state(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_update_employee(uuid,jsonb,uuid),public.admin_begin_employee_email_change(uuid,text,uuid),
  public.admin_complete_employee_email_change(uuid,uuid),public.admin_cancel_employee_email_change(uuid,uuid,boolean),public.admin_employee_email_change_state(uuid,uuid) to authenticated;

-- Invitation delivery must not race with a correction of its recipient.
create or replace function public.admin_begin_invite_resend(p_profile_id uuid,p_request_id uuid)
returns table(auth_user_id uuid,email text,status text)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.profiles%rowtype;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invite-resend:'||p_profile_id::text,0));
  select * into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.auth_user_id is null or to_jsonb(target)->>'deleted_at' is not null or target.status<>'invited' then
    raise exception 'invite_not_available' using errcode='22023';
  end if;
  if exists(select 1 from public.audit_logs started where started.organization_id=org and started.entity_id=target.id
    and started.action='user.email_change_started' and started.created_at>now()-interval '10 minutes'
    and not exists(select 1 from public.audit_logs done where done.organization_id=org and done.entity_id=target.id
      and done.request_id=started.request_id and done.action in ('user.email_changed','user.email_change_failed'))) then
    raise exception 'account_operation_in_progress' using errcode='55000';
  end if;
  if exists(select 1 from public.audit_logs a where a.organization_id=org and a.entity_id=target.id
    and a.action='user.invite_resend_started' and a.created_at>now()-interval '60 seconds') then
    raise exception 'invite_cooldown' using errcode='P0001';
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'user.invite_resend_started','profile',target.id,p_request_id,'{}');
  return query select target.auth_user_id,target.email,target.status;
end;
$$;
