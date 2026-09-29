-- Corrections use separate audited endpoints. Workflow status, authorship,
-- recipients and file access boundaries are never changed as a side effect.
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
  where extract(isodow from day_value)<6 and not exists(
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

create or replace function private.correct_sick_leave_record(
  p_record_id uuid,p_starts_on date,p_expected_end_on date,p_end_unknown boolean,
  p_certificate_status text,p_correction_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.sick_leave_records%rowtype; after_row public.sick_leave_records%rowtype;
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_correction_reason,''))) not between 3 and 500 then raise exception 'correction_reason_required' using errcode='22023'; end if;
  select * into target from public.sick_leave_records where id=p_record_id and organization_id=org;
  if target.id is null then raise exception 'record_not_found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sick:'||target.profile_id::text,0));
  select * into target from public.sick_leave_records where id=p_record_id and organization_id=org for update;
  if p_starts_on is null or p_end_unknown is null or (p_end_unknown and p_expected_end_on is not null)
    or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<p_starts_on))
    or p_certificate_status is null or p_certificate_status not in ('not_required','required','pending','received','verified','rejected') then
    raise exception 'invalid_sick_leave_correction' using errcode='22023'; end if;
  if p_certificate_status in ('received','verified') and not exists(
    select 1 from public.sick_leave_document_versions d where d.sick_leave_id=target.id and d.organization_id=org and d.deleted_at is null
  ) then raise exception 'certificate_file_required' using errcode='22023'; end if;
  if target.status not in ('closed','cancelled') and exists(
    select 1 from public.sick_leave_records r where r.id<>target.id and r.profile_id=target.profile_id
      and r.status not in ('closed','cancelled')
      and daterange(r.starts_on,coalesce(r.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_on,coalesce(p_expected_end_on,'infinity'::date),'[]')
  ) then raise exception 'overlapping_sick_leave' using errcode='23P01'; end if;
  update public.sick_leave_records set starts_on=p_starts_on,expected_end_on=p_expected_end_on,
    end_unknown=p_end_unknown,certificate_status=p_certificate_status,
    certificate_required=p_certificate_status in ('required','pending','received','verified','rejected')
    where id=target.id returning * into after_row;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'sick_leave.corrected','sick_leave',target.id,jsonb_build_object(
      'reason',trim(p_correction_reason),'before',to_jsonb(target),'after',to_jsonb(after_row)));
  return target.id;
end $$;

create or replace function private.correct_material_request(
  p_request_id uuid,p_category text,p_item text,p_quantity numeric,p_unit text,
  p_priority text,p_needed_on date,p_reason text,p_correction_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.material_requests%rowtype; after_row public.material_requests%rowtype; item_id uuid;
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_correction_reason,''))) not between 3 and 500 then raise exception 'correction_reason_required' using errcode='22023'; end if;
  select * into target from public.material_requests where id=p_request_id and organization_id=org for update;
  if target.id is null then raise exception 'request_not_found' using errcode='P0002'; end if;
  if length(trim(coalesce(p_category,''))) not between 1 and 80 or length(trim(coalesce(p_item,''))) not between 1 and 180
    or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<=0
    or length(trim(coalesce(p_unit,''))) not between 1 and 40
    or p_priority is null or p_priority not in ('low','normal','high','urgent')
    or length(coalesce(p_reason,''))>1000 then raise exception 'invalid_material_request' using errcode='22023'; end if;
  -- The current editor describes one position. Never rewrite a multi-item order.
  if (select count(*) from public.material_request_items where request_id=target.id)>1 then raise exception 'multi_item_request_requires_item_editor' using errcode='22023'; end if;
  update public.material_requests set category=trim(p_category),item=trim(p_item),title=trim(p_item),
    quantity=p_quantity,unit=trim(p_unit),priority=p_priority,needed_on=p_needed_on,reason=nullif(trim(p_reason),'')
    where id=target.id returning * into after_row;
  select id into item_id from public.material_request_items where request_id=target.id limit 1 for update;
  if item_id is null then
    insert into public.material_request_items(organization_id,request_id,item_name,quantity,unit)
      values(org,target.id,trim(p_item),p_quantity,trim(p_unit));
  else
    update public.material_request_items set item_name=trim(p_item),quantity=p_quantity,unit=trim(p_unit) where id=item_id;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'material.corrected','material_request',target.id,jsonb_build_object(
      'reason',trim(p_correction_reason),'before',to_jsonb(target),'after',to_jsonb(after_row)));
  return target.id;
end $$;

create or replace function private.correct_document_metadata(
  p_document_id uuid,p_title text,p_acknowledgement_required boolean,p_valid_from timestamptz,
  p_valid_until timestamptz,p_correction_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.documents%rowtype; after_row public.documents%rowtype;
begin
  if me is null or not private.has_system_role(array['super_admin']) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_correction_reason,''))) not between 3 and 500 then raise exception 'correction_reason_required' using errcode='22023'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) then raise exception 'document_not_available' using errcode='42501'; end if;
  if length(trim(coalesce(p_title,''))) not between 2 and 180 or p_acknowledgement_required is null
    or (p_valid_from is not null and p_valid_until is not null and p_valid_until<=p_valid_from) then
    raise exception 'invalid_document_metadata' using errcode='22023'; end if;
  update public.documents set title=trim(p_title),acknowledgement_required=p_acknowledgement_required,
    valid_from=p_valid_from,valid_until=p_valid_until where id=target.id returning * into after_row;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'document.metadata_corrected','document',target.id,jsonb_build_object(
      'reason',trim(p_correction_reason),'before',to_jsonb(target),'after',to_jsonb(after_row)));
  return target.id;
end $$;

-- Prebound wrappers expose only the checked operations, without schema USAGE.
create or replace function public.correct_leave_request(p_request_id uuid,p_leave_type text,p_starts_on date,p_ends_on date,p_day_fraction numeric,p_note text,p_correction_reason text)
returns uuid language sql security invoker set search_path=pg_catalog,public begin atomic
 select private.correct_leave_request(p_request_id,p_leave_type,p_starts_on,p_ends_on,p_day_fraction,p_note,p_correction_reason); end;
create or replace function public.correct_sick_leave_record(p_record_id uuid,p_starts_on date,p_expected_end_on date,p_end_unknown boolean,p_certificate_status text,p_correction_reason text)
returns uuid language sql security invoker set search_path=pg_catalog,public begin atomic
 select private.correct_sick_leave_record(p_record_id,p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status,p_correction_reason); end;
create or replace function public.correct_material_request(p_request_id uuid,p_category text,p_item text,p_quantity numeric,p_unit text,p_priority text,p_needed_on date,p_reason text,p_correction_reason text)
returns uuid language sql security invoker set search_path=pg_catalog,public begin atomic
 select private.correct_material_request(p_request_id,p_category,p_item,p_quantity,p_unit,p_priority,p_needed_on,p_reason,p_correction_reason); end;
create or replace function public.correct_document_metadata(p_document_id uuid,p_title text,p_acknowledgement_required boolean,p_valid_from timestamptz,p_valid_until timestamptz,p_correction_reason text)
returns uuid language sql security invoker set search_path=pg_catalog,public begin atomic
 select private.correct_document_metadata(p_document_id,p_title,p_acknowledgement_required,p_valid_from,p_valid_until,p_correction_reason); end;
revoke all on function private.correct_leave_request(uuid,text,date,date,numeric,text,text),public.correct_leave_request(uuid,text,date,date,numeric,text,text),
 private.correct_sick_leave_record(uuid,date,date,boolean,text,text),public.correct_sick_leave_record(uuid,date,date,boolean,text,text),
 private.correct_material_request(uuid,text,text,numeric,text,text,date,text,text),public.correct_material_request(uuid,text,text,numeric,text,text,date,text,text),
 private.correct_document_metadata(uuid,text,boolean,timestamptz,timestamptz,text),public.correct_document_metadata(uuid,text,boolean,timestamptz,timestamptz,text)
 from public,anon,authenticated,service_role;
grant execute on function private.correct_leave_request(uuid,text,date,date,numeric,text,text),public.correct_leave_request(uuid,text,date,date,numeric,text,text),
 private.correct_sick_leave_record(uuid,date,date,boolean,text,text),public.correct_sick_leave_record(uuid,date,date,boolean,text,text),
 private.correct_material_request(uuid,text,text,numeric,text,text,date,text,text),public.correct_material_request(uuid,text,text,numeric,text,text,date,text,text),
 private.correct_document_metadata(uuid,text,boolean,timestamptz,timestamptz,text),public.correct_document_metadata(uuid,text,boolean,timestamptz,timestamptz,text)
 to authenticated;
notify pgrst,'reload schema';
-- Correct folder labels without changing access, ownership or content.
create or replace function private.rename_document_folder(
  p_folder_id uuid,p_name text,p_correction_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.document_folders%rowtype;
begin
  if me is null or not private.has_system_role(array['super_admin']) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if length(trim(coalesce(p_correction_reason,''))) not between 3 and 500 then
    raise exception 'correction_reason_required' using errcode='22023';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then
    raise exception 'invalid_folder_name' using errcode='22023';
  end if;
  select * into target from public.document_folders
    where id=p_folder_id and organization_id=org and archived_at is null for update;
  if target.id is null or not private.can_access_document_folder(target.id)
    or (target.scope='personal' and target.owner_profile_id is distinct from me) then
    raise exception 'folder_not_available' using errcode='42501';
  end if;
  update public.document_folders set name=trim(p_name) where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'document.folder_renamed','document_folder',target.id,
      jsonb_build_object('reason',trim(p_correction_reason),
        'before',jsonb_build_object('name',target.name),'after',jsonb_build_object('name',trim(p_name))));
  return target.id;
end $$;
create or replace function public.rename_document_folder(p_folder_id uuid,p_name text,p_correction_reason text)
returns uuid language sql security invoker set search_path=pg_catalog,public begin atomic
  select private.rename_document_folder(p_folder_id,p_name,p_correction_reason);
end;
revoke all on function private.rename_document_folder(uuid,text,text),public.rename_document_folder(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.rename_document_folder(uuid,text,text),public.rename_document_folder(uuid,text,text)
  to authenticated;
notify pgrst,'reload schema';
