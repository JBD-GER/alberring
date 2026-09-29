-- Super Admin can correct existing fleet data while preserving original actors
-- and an audit trail. Existing operational creation/completion remains available.
alter table public.vehicle_maintenance_events add column if not exists provider text;

create or replace function public.save_vehicle_maintenance_event(
  p_event_id uuid, p_vehicle_id uuid, p_event_type text, p_title text,
  p_due_on date, p_due_mileage integer, p_status text, p_provider text,
  p_notes text, p_completed_on date, p_completed_mileage integer
)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('fleet.manage') or
    (p_event_id is not null and not private.has_system_role(array['super_admin'])) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.vehicles where id=p_vehicle_id and organization_id=org) then
    raise exception 'vehicle_not_found' using errcode='P0002';
  end if;
  if p_event_id is null then
    insert into public.vehicle_maintenance_events(organization_id,vehicle_id,event_type,title,due_on,due_mileage,status,provider,notes,completed_on,completed_mileage,created_by)
    values(org,p_vehicle_id,p_event_type,trim(p_title),p_due_on,p_due_mileage,p_status,nullif(trim(p_provider),''),nullif(trim(p_notes),''),p_completed_on,p_completed_mileage,me)
    returning id into result;
  else
    perform 1 from public.vehicle_maintenance_events where id=p_event_id and organization_id=org for update;
    if not found then raise exception 'maintenance_not_found' using errcode='P0002'; end if;
    update public.vehicle_maintenance_events set vehicle_id=p_vehicle_id,event_type=p_event_type,title=trim(p_title),
      due_on=p_due_on,due_mileage=p_due_mileage,status=p_status,provider=nullif(trim(p_provider),''),notes=nullif(trim(p_notes),''),
      completed_on=p_completed_on,completed_mileage=p_completed_mileage
    where id=p_event_id and organization_id=org returning id into result;
  end if;
  return result;
end;
$$;

create or replace function private.guard_vehicle_maintenance_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'maintenance_organization_mismatch' using errcode='23514'; end if;
  if not private.has_permission('fleet.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.created_by:=me;
  else
    new.organization_id:=old.organization_id;
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
    -- Ordinary managers retain completion of open events, but not corrections.
    if not private.has_system_role(array['super_admin']) and not (
      old.status in ('planned','due') and new.status='completed'
      and (to_jsonb(new)-array['status','completed_on','completed_mileage','updated_at'])
        =(to_jsonb(old)-array['status','completed_on','completed_mileage','updated_at'])
    ) then raise exception 'permission_denied' using errcode='42501'; end if;
  end if;
  if new.event_type is null or new.event_type not in ('service','inspection','repair','tyres','other')
    or new.status is null or new.status not in ('planned','due','completed','cancelled')
    or new.title is null or length(trim(new.title)) not between 2 and 160
    or coalesce(new.due_mileage,0) not between 0 and 9999999
    or coalesce(new.completed_mileage,0) not between 0 and 9999999
    or length(coalesce(new.provider,''))>160 or length(coalesce(new.notes,''))>2000
    or (new.status in ('planned','due') and new.due_on is null and new.due_mileage is null)
    or (new.status='completed' and (new.completed_on is null or new.completed_on>current_date))
  then raise exception 'invalid_maintenance_data' using errcode='22023'; end if;
  if new.status<>'completed' then new.completed_on:=null; new.completed_mileage:=null; end if;
  return new;
end;
$$;
create or replace function private.audit_vehicle_maintenance_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if private.current_profile_id() is not null then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,private.current_profile_id(),'fleet.maintenance_saved','vehicle_maintenance_event',new.id,
      jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
  end if;
  return new;
end;
$$;
create trigger audit_vehicle_maintenance_event after insert or update on public.vehicle_maintenance_events
for each row execute function private.audit_vehicle_maintenance_event();

create or replace function public.correct_vehicle_damage_report(
  p_report_id uuid,p_vehicle_id uuid,p_occurred_on date,p_description text,p_status text
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_description is null or length(trim(p_description)) not between 10 and 4000
    or p_occurred_on>current_date or p_status is null or p_status not in ('reported','reviewing','repair_planned','resolved','rejected')
  then raise exception 'invalid_damage_data' using errcode='22023'; end if;
  if not exists(select 1 from public.vehicles where id=p_vehicle_id and organization_id=org) then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
  perform 1 from public.vehicle_damage_reports where id=p_report_id and organization_id=org for update;
  if not found then raise exception 'damage_report_not_found' using errcode='P0002'; end if;
  update public.vehicle_damage_reports set vehicle_id=p_vehicle_id,occurred_on=p_occurred_on,description=trim(p_description),status=p_status
  where id=p_report_id and organization_id=org;
end;
$$;

create or replace function private.guard_vehicle_damage_report()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'damage_report_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.reported_by:=me; new.status:='reported'; new.resolved_by:=null; new.resolved_at:=null;
  else
    new.organization_id:=old.organization_id; new.reported_by:=old.reported_by; new.created_at:=old.created_at;
    if (new.vehicle_id,new.occurred_on,new.description) is distinct from (old.vehicle_id,old.occurred_on,old.description)
      and not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
    if new.status='resolved' and old.status<>'resolved' then new.resolved_by:=me; new.resolved_at:=now();
    elsif new.status<>'resolved' then new.resolved_by:=null; new.resolved_at:=null;
    else new.resolved_by:=old.resolved_by; new.resolved_at:=old.resolved_at; end if;
    if new is distinct from old then
      insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
      values(org,me,'fleet.damage_updated','vehicle_damage_report',old.id,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.correct_mileage_submission(
  p_submission_id uuid,p_mileage integer,p_read_on date,p_status text,p_comment text
)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.mileage_submissions%rowtype;
  saved public.mileage_submissions%rowtype; vehicle_mileage integer; prior integer; following integer; verified_max integer;
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_mileage is null or p_mileage not between 0 and 9999999 or p_read_on is null or p_read_on>current_date
    or p_status is null or p_status not in ('verified','rejected')
    or p_comment is null or length(trim(p_comment)) not between 6 and 1000
  then raise exception 'invalid_mileage_correction' using errcode='22023'; end if;
  select * into target from public.mileage_submissions where id=p_submission_id and organization_id=org;
  if target.id is null then raise exception 'mileage_submission_not_found' using errcode='P0002'; end if;
  -- Same lock as submission creation prevents races with a second monthly entry.
  perform pg_advisory_xact_lock(hashtextextended(org::text||target.vehicle_id::text,0));
  select * into target from public.mileage_submissions where id=p_submission_id and organization_id=org for update;
  select current_mileage into vehicle_mileage from public.vehicles where id=target.vehicle_id and organization_id=org for update;
  if not found then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
  if exists(select 1 from public.mileage_submissions where vehicle_id=target.vehicle_id and id<>target.id
    and reporting_month=date_trunc('month',p_read_on)::date
    and (profile_id=target.profile_id or (status<>'rejected' and p_status<>'rejected')))
  then raise exception 'monthly_submission_exists' using errcode='23505'; end if;
  select max(mileage) into prior from public.mileage_submissions where vehicle_id=target.vehicle_id and id<>target.id
    and status not in ('rejected','corrected') and read_on<=p_read_on;
  select min(mileage) into following from public.mileage_submissions where vehicle_id=target.vehicle_id and id<>target.id
    and status not in ('rejected','corrected') and read_on>=p_read_on;
  if p_status='verified' and ((prior is not null and p_mileage<prior) or (following is not null and p_mileage>following)) then
    raise exception 'mileage_conflicts_with_history' using errcode='22023'; end if;
  update public.mileage_submissions set mileage=p_mileage,read_on=p_read_on,status=p_status,
    previous_mileage=prior,flagged_extreme_jump=coalesce(p_mileage-prior>5000,false),
    reviewed_by=me,reviewed_at=now(),review_note=trim(p_comment)
  where id=target.id returning * into saved;
  select max(mileage) into verified_max from public.mileage_submissions where vehicle_id=target.vehicle_id and status='verified';
  if vehicle_mileage=target.mileage and target.status='verified' then
    update public.vehicles set current_mileage=greatest(coalesce(verified_max,0),coalesce(prior,target.previous_mileage,0)) where id=target.vehicle_id;
  elsif p_status='verified' then
    update public.vehicles set current_mileage=greatest(current_mileage,p_mileage) where id=target.vehicle_id;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'mileage.corrected','mileage_submission',target.id,
    jsonb_build_object('before',to_jsonb(target),'after',to_jsonb(saved),'reason',trim(p_comment),'previous_vehicle_mileage',vehicle_mileage));
end;
$$;

revoke all on function public.save_vehicle_maintenance_event(uuid,uuid,text,text,date,integer,text,text,text,date,integer) from public,anon;
revoke all on function public.correct_vehicle_damage_report(uuid,uuid,date,text,text) from public,anon;
revoke all on function public.correct_mileage_submission(uuid,integer,date,text,text) from public,anon;
grant execute on function public.save_vehicle_maintenance_event(uuid,uuid,text,text,date,integer,text,text,text,date,integer) to authenticated;
grant execute on function public.correct_vehicle_damage_report(uuid,uuid,date,text,text) to authenticated;
grant execute on function public.correct_mileage_submission(uuid,integer,date,text,text) to authenticated;
revoke all on function private.guard_vehicle_maintenance_event() from public,anon,authenticated,service_role;
revoke all on function private.audit_vehicle_maintenance_event() from public,anon,authenticated,service_role;
revoke all on function private.guard_vehicle_damage_report() from public,anon,authenticated,service_role;

-- Correcting a manually entered vehicle reading may lower it, but may not
-- invalidate verified readings. Before/after snapshots preserve assignments too.
create or replace function public.save_vehicle(
  p_vehicle_id uuid,
  p_internal_name text,
  p_license_plate text,
  p_make text,
  p_model text,
  p_status text,
  p_current_mileage integer,
  p_next_service_on date,
  p_assignee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; old_mileage integer; old_vehicle jsonb; old_assignments jsonb;
begin
  if me is null or not private.has_permission('fleet.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_internal_name)) not between 1 and 120 or length(trim(p_license_plate)) not between 2 and 20 then raise exception 'invalid_vehicle_data' using errcode='22023'; end if;
  if p_status not in ('active','workshop','out_of_service','sold') or p_current_mileage<0 then raise exception 'invalid_vehicle_data' using errcode='22023'; end if;
  if p_assignee_id is not null and not exists(select 1 from public.profiles p where p.id=p_assignee_id and p.organization_id=org and p.status='active') then
    raise exception 'assignee_not_available' using errcode='22023';
  end if;
  if p_status<>'active' then p_assignee_id:=null; end if;
  if p_vehicle_id is null then
    insert into public.vehicles(organization_id,internal_name,license_plate,make,model,status,current_mileage,next_service_on)
    values(org,trim(p_internal_name),upper(trim(p_license_plate)),nullif(trim(p_make),''),nullif(trim(p_model),''),p_status,p_current_mileage,p_next_service_on)
    returning id into result;
  else
    select current_mileage into old_mileage from public.vehicles where id=p_vehicle_id and organization_id=org for update;
    if old_mileage is null then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
    select to_jsonb(v) into old_vehicle from public.vehicles v where v.id=p_vehicle_id;
    select coalesce(jsonb_agg(to_jsonb(va)),'[]'::jsonb) into old_assignments from public.vehicle_assignments va where va.vehicle_id=p_vehicle_id;
    if p_current_mileage<old_mileage then
      if not private.has_system_role(array['super_admin']) then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
      if exists(select 1 from public.mileage_submissions where vehicle_id=p_vehicle_id and status='verified' and mileage>p_current_mileage) then
        raise exception 'mileage_conflicts_with_history' using errcode='22023'; end if;
    end if;
    update public.vehicles set internal_name=trim(p_internal_name),license_plate=upper(trim(p_license_plate)),
      make=nullif(trim(p_make),''),model=nullif(trim(p_model),''),status=p_status,current_mileage=p_current_mileage,next_service_on=p_next_service_on
    where id=p_vehicle_id returning id into result;
  end if;
  delete from public.vehicle_assignments where vehicle_id=result and valid_until is null and valid_from=current_date;
  update public.vehicle_assignments set valid_until=current_date-1 where vehicle_id=result and valid_until is null and valid_from<current_date;
  if p_assignee_id is not null then
    delete from public.vehicle_assignments where profile_id=p_assignee_id and primary_assignment and valid_until is null and valid_from=current_date;
    update public.vehicle_assignments set valid_until=current_date-1 where profile_id=p_assignee_id and primary_assignment and valid_until is null and valid_from<current_date;
    insert into public.vehicle_assignments(organization_id,vehicle_id,profile_id,valid_from,primary_assignment)
    values(org,result,p_assignee_id,current_date,true);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'vehicle.saved','vehicle',result,jsonb_build_object('status',p_status,'assigned',p_assignee_id is not null,'before',old_vehicle,'before_assignments',old_assignments,'after',(select to_jsonb(v) from public.vehicles v where v.id=result),'after_assignments',(select coalesce(jsonb_agg(to_jsonb(va)),'[]'::jsonb) from public.vehicle_assignments va where va.vehicle_id=result)));
  return result;
end;
$$;
