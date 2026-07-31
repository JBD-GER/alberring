-- Alberring Connect: transactional business workflows and safe read RPCs.

-- Integrity triggers ----------------------------------------------------------

create or replace function private.prepare_user_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_org uuid;
  role_org uuid;
begin
  select organization_id into profile_org from public.profiles where id=new.profile_id;
  select organization_id into role_org from public.roles where id=new.role_id and active;
  if profile_org is null or role_org is null or profile_org<>role_org then
    raise exception 'role_and_profile_must_share_organization' using errcode='23514';
  end if;
  new.organization_id := profile_org;
  if new.assigned_by is not null and not exists (
    select 1 from public.profiles p where p.id=new.assigned_by and p.organization_id=profile_org
  ) then
    raise exception 'assigner_must_share_organization' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists prepare_user_role on public.user_roles;
create trigger prepare_user_role before insert or update on public.user_roles
for each row execute function private.prepare_user_role();

create or replace function private.prepare_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  message_org uuid;
  message_conversation uuid;
begin
  if new.message_id is not null then
    select organization_id, conversation_id into message_org, message_conversation
    from public.messages where id=new.message_id;
    if message_org is null then raise exception 'message_not_found' using errcode='23503'; end if;
    if new.organization_id<>message_org then raise exception 'attachment_organization_mismatch' using errcode='23514'; end if;
    if new.conversation_id is not null and new.conversation_id<>message_conversation then
      raise exception 'attachment_conversation_mismatch' using errcode='23514';
    end if;
    new.conversation_id := message_conversation;
  end if;
  if new.conversation_id is null then raise exception 'conversation_required' using errcode='23502'; end if;
  return new;
end;
$$;
drop trigger if exists prepare_message_attachment on public.message_attachments;
create trigger prepare_message_attachment before insert or update on public.message_attachments
for each row execute function private.prepare_message_attachment();

create or replace function private.audit_message_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id<>old.id or new.organization_id<>old.organization_id
    or new.conversation_id<>old.conversation_id or new.sender_id<>old.sender_id
    or new.created_at<>old.created_at or new.reply_to_id is distinct from old.reply_to_id
    or new.client_nonce is distinct from old.client_nonce then
    raise exception 'immutable_message_fields_changed' using errcode='22023';
  end if;
  if new.body is distinct from old.body and not (old.retracted_at is null and new.retracted_at is not null) then
    insert into public.message_edits(organization_id,message_id,edited_by,previous_body,edited_at)
    values(old.organization_id,old.id,coalesce(private.current_profile_id(),old.sender_id),old.body,now());
    new.edited_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists audit_message_update on public.messages;
create trigger audit_message_update before update on public.messages
for each row execute function private.audit_message_update();

create or replace function private.guard_sick_leave_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.sick_workflow',true),'')<>'allowed' then
    if new.certificate_status is distinct from old.certificate_status
      and not private.has_permission('sick_leave.view_certificates') then
      if old.profile_id<>private.current_profile_id() then
        raise exception 'certificate_permission_required' using errcode='42501';
      end if;
      if new.certificate_status not in ('pending','received') then
        raise exception 'invalid_employee_certificate_status' using errcode='42501';
      end if;
    end if;
    if old.profile_id=private.current_profile_id()
      and not private.has_permission('sick_leave.manage')
      and (to_jsonb(new)-array['certificate_status','updated_at'])
          is distinct from (to_jsonb(old)-array['certificate_status','updated_at']) then
      raise exception 'only_certificate_status_may_be_updated' using errcode='42501';
    end if;
  end if;
  if new.certificate_status is distinct from old.certificate_status
    and auth.uid() is not null and private.has_permission('sick_leave.view_certificates') then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(old.organization_id,private.current_profile_id(),'sick_leave.certificate_status_changed','sick_leave',old.id,
      jsonb_build_object('from',old.certificate_status,'to',new.certificate_status));
  end if;
  if new.status is distinct from old.status and private.has_permission('sick_leave.manage') then
    new.processed_by:=private.current_profile_id();
    new.processed_at:=now();
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(old.organization_id,private.current_profile_id(),'sick_leave.status_changed','sick_leave',old.id,
      jsonb_build_object('from',old.status,'to',new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists guard_sick_leave_update on public.sick_leave_records;
create trigger guard_sick_leave_update before update on public.sick_leave_records
for each row execute function private.guard_sick_leave_update();

create or replace function private.prepare_sick_leave_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); owner_profile uuid;
begin
  if auth.uid() is null then return new; end if;
  select sl.profile_id into owner_profile from public.sick_leave_records sl
  where sl.id=new.sick_leave_id and sl.organization_id=org for update;
  if me is null or owner_profile is null then raise exception 'sick_leave_not_available' using errcode='23514'; end if;
  if owner_profile<>me and not private.has_permission('sick_leave.view_certificates') then
    raise exception 'certificate_permission_required' using errcode='42501';
  end if;
  if (storage.foldername(new.storage_path))[1] is distinct from org::text
    or (storage.foldername(new.storage_path))[2] is distinct from owner_profile::text
    or (storage.foldername(new.storage_path))[3] is distinct from new.sick_leave_id::text
    or not exists(select 1 from storage.objects so where so.bucket_id='sick-certificates' and so.name=new.storage_path) then
    raise exception 'certificate_file_missing_or_misplaced' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sick-document:'||new.sick_leave_id::text,0));
  new.organization_id:=org;
  new.uploaded_by:=me;
  select coalesce(max(sd.version),0)+1 into new.version from public.sick_leave_document_versions sd where sd.sick_leave_id=new.sick_leave_id;
  return new;
end;
$$;
drop trigger if exists prepare_sick_leave_document on public.sick_leave_document_versions;
create trigger prepare_sick_leave_document before insert on public.sick_leave_document_versions
for each row execute function private.prepare_sick_leave_document();

create or replace function private.audit_sick_leave_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare owner_profile uuid; actor uuid:=coalesce(private.current_profile_id(),new.uploaded_by);
begin
  select sl.profile_id into owner_profile from public.sick_leave_records sl where sl.id=new.sick_leave_id;
  update public.sick_leave_records set certificate_status='received'
  where id=new.sick_leave_id and certificate_status in ('required','pending','rejected');
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(new.organization_id,actor,'sick_leave.certificate_uploaded','sick_leave',new.sick_leave_id,
    jsonb_build_object('version',new.version));
  perform private.create_notification(new.organization_id,p.id,'sick_leave_certificate','Attest eingegangen',
    'Zu einer Abwesenheitsmeldung ist ein Attest eingegangen.','/app/sick-leave',
    'sick-certificate:'||new.id::text||':'||p.id::text)
  from public.profiles p
  where p.organization_id=new.organization_id and p.status='active' and p.id<>actor
    and private.profile_has_permission(p.id,new.organization_id,'sick_leave.view_certificates');
  return new;
end;
$$;
drop trigger if exists audit_sick_leave_document on public.sick_leave_document_versions;
create trigger audit_sick_leave_document after insert on public.sick_leave_document_versions
for each row execute function private.audit_sick_leave_document();

create or replace function private.guard_vehicle_maintenance_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'maintenance_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.created_by:=me;
  else
    new.organization_id:=old.organization_id;
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_maintenance_event on public.vehicle_maintenance_events;
create trigger guard_vehicle_maintenance_event before insert or update on public.vehicle_maintenance_events
for each row execute function private.guard_vehicle_maintenance_event();

create or replace function private.guard_vehicle_damage_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'damage_report_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.reported_by:=me;
    new.status:='reported';
    new.resolved_by:=null;
    new.resolved_at:=null;
  else
    new.organization_id:=old.organization_id;
    new.vehicle_id:=old.vehicle_id;
    new.reported_by:=old.reported_by;
    new.created_at:=old.created_at;
    if new.status='resolved' and old.status<>'resolved' then
      new.resolved_by:=me;
      new.resolved_at:=now();
    elsif new.status<>'resolved' then
      new.resolved_by:=null;
      new.resolved_at:=null;
    else
      new.resolved_by:=old.resolved_by;
      new.resolved_at:=old.resolved_at;
    end if;
    if new.status is distinct from old.status then
      insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
      values(org,me,'fleet.damage_status_changed','vehicle_damage_report',old.id,jsonb_build_object('from',old.status,'to',new.status));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_damage_report on public.vehicle_damage_reports;
create trigger guard_vehicle_damage_report before insert or update on public.vehicle_damage_reports
for each row execute function private.guard_vehicle_damage_report();

create or replace function private.guard_vehicle_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'vehicle_document_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.uploaded_by:=me;
    if (storage.foldername(new.storage_path))[1] is distinct from org::text
      or (storage.foldername(new.storage_path))[2] is distinct from new.vehicle_id::text
      or not exists(select 1 from storage.objects so where so.bucket_id='vehicle-files' and so.name=new.storage_path) then
      raise exception 'vehicle_document_file_missing_or_misplaced' using errcode='23514';
    end if;
  else
    new.organization_id:=old.organization_id;
    new.vehicle_id:=old.vehicle_id;
    new.storage_path:=old.storage_path;
    new.uploaded_by:=old.uploaded_by;
    new.created_at:=old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_document on public.vehicle_documents;
create trigger guard_vehicle_document before insert or update on public.vehicle_documents
for each row execute function private.guard_vehicle_document();

create or replace function private.guard_team_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op='UPDATE' then new.organization_id:=old.organization_id; end if;
  if auth.uid() is not null and new.organization_id<>private.current_organization_id() then
    raise exception 'team_organization_mismatch' using errcode='23514';
  end if;
  if new.lead_profile_id is not null and not exists(select 1 from public.profiles p where p.id=new.lead_profile_id and p.organization_id=new.organization_id and p.status<>'archived') then
    raise exception 'team_lead_organization_mismatch' using errcode='23514';
  end if;
  if new.department_id is not null and not exists(select 1 from public.departments d where d.id=new.department_id and d.organization_id=new.organization_id) then
    raise exception 'team_department_organization_mismatch' using errcode='23514';
  end if;
  if new.location_id is not null and not exists(select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then
    raise exception 'team_location_organization_mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_team_integrity on public.teams;
create trigger guard_team_integrity before insert or update on public.teams
for each row execute function private.guard_team_integrity();

create or replace function private.audit_organization_settings_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id(); changed jsonb;
begin
  if auth.uid() is null or actor is null then return new; end if;
  select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changed
  from jsonb_object_keys(to_jsonb(new)-'updated_at') k
  where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k);
  if changed<>'[]'::jsonb then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'settings.updated','organization_settings',new.organization_id,jsonb_build_object('changed_fields',changed));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_organization_settings_update on public.organization_settings;
create trigger audit_organization_settings_update after update on public.organization_settings
for each row execute function private.audit_organization_settings_update();

create or replace function private.audit_role_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id();
begin
  if auth.uid() is not null then
    if actor is null or new.organization_id<>private.current_organization_id() then raise exception 'role_organization_mismatch' using errcode='23514'; end if;
    new.system_key:=null;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_role_created on public.roles;
create trigger guard_role_created before insert on public.roles for each row execute function private.audit_role_created();

create or replace function private.audit_role_created_after()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id();
begin
  if auth.uid() is not null and actor is not null then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'role.created','role',new.id,jsonb_build_object('name',new.name));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_role_created_after on public.roles;
create trigger audit_role_created_after after insert on public.roles for each row execute function private.audit_role_created_after();

create or replace function private.audit_team_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id(); changed jsonb;
begin
  if auth.uid() is null or actor is null then return new; end if;
  if tg_op='INSERT' then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'team.created','team',new.id,jsonb_build_object('name',new.name));
  else
    select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changed
    from jsonb_object_keys(to_jsonb(new)-array['updated_at']) k
    where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k);
    if changed<>'[]'::jsonb then
      insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
      values(new.organization_id,actor,'team.updated','team',new.id,jsonb_build_object('changed_fields',changed));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists audit_team_change on public.teams;
create trigger audit_team_change after insert or update on public.teams for each row execute function private.audit_team_change();

create or replace function private.validate_audience_target()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.audience_type='team' and not exists (select 1 from public.teams t where t.id=new.team_id and t.organization_id=new.organization_id) then
    raise exception 'audience_team_organization_mismatch' using errcode='23514';
  elsif new.audience_type='location' and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then
    raise exception 'audience_location_organization_mismatch' using errcode='23514';
  elsif new.audience_type='role' and not exists (select 1 from public.roles r where r.id=new.role_id and r.organization_id=new.organization_id) then
    raise exception 'audience_role_organization_mismatch' using errcode='23514';
  elsif new.audience_type='profile' and not exists (select 1 from public.profiles p where p.id=new.profile_id and p.organization_id=new.organization_id) then
    raise exception 'audience_profile_organization_mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_news_audience_target on public.news_audiences;
create trigger validate_news_audience_target before insert or update on public.news_audiences
for each row execute function private.validate_audience_target();
drop trigger if exists validate_document_audience_target on public.document_audiences;
create trigger validate_document_audience_target before insert or update on public.document_audiences
for each row execute function private.validate_audience_target();

create or replace function private.guard_document_folder_tree()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parent_org uuid;
  folder_depth integer;
  max_depth integer;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id=new.id then raise exception 'folder_cycle' using errcode='23514'; end if;
  select organization_id into parent_org from public.document_folders where id=new.parent_id;
  if parent_org is null or parent_org<>new.organization_id then
    raise exception 'folder_parent_organization_mismatch' using errcode='23514';
  end if;
  if exists (
    with recursive descendants as (
      select id,parent_id from public.document_folders where id=new.id
      union all
      select f.id,f.parent_id from public.document_folders f join descendants d on f.parent_id=d.id
    ) select 1 from descendants where id=new.parent_id
  ) then raise exception 'folder_cycle' using errcode='23514'; end if;
  with recursive ancestors as (
    select id,parent_id,1 as depth from public.document_folders where id=new.parent_id
    union all
    select f.id,f.parent_id,a.depth+1 from public.document_folders f join ancestors a on f.id=a.parent_id
  ) select coalesce(max(depth),0)+1 into folder_depth from ancestors;
  select max_document_folder_depth into max_depth from public.organization_settings where organization_id=new.organization_id;
  if folder_depth>coalesce(max_depth,5) then raise exception 'folder_depth_exceeded' using errcode='23514'; end if;
  return new;
end;
$$;
drop trigger if exists guard_document_folder_tree on public.document_folders;
create trigger guard_document_folder_tree before insert or update of parent_id,organization_id on public.document_folders
for each row execute function private.guard_document_folder_tree();

alter table public.notifications drop constraint if exists notifications_target_path_check;
alter table public.notifications add constraint notifications_target_path_check
  check (target_path is null or target_path ~ '^/app(?:/|$)');

create or replace function private.create_notification(
  p_organization_id uuid,
  p_profile_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_target_path text,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare result uuid;
begin
  if not exists (select 1 from public.profiles p where p.id=p_profile_id and p.organization_id=p_organization_id and p.status='active') then
    return null;
  end if;
  insert into public.notifications(organization_id,profile_id,type,title,body,target_path,deduplication_key)
  values(p_organization_id,p_profile_id,p_type,left(p_title,200),left(p_body,500),p_target_path,p_deduplication_key)
  on conflict(profile_id,deduplication_key) do nothing
  returning id into result;
  return result;
end;
$$;

create or replace function private.queue_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare category_key text;
begin
  category_key := case
    when new.type like 'message%' then 'messages'
    when new.type like 'news%' then 'news'
    when new.type like 'shift%' or new.type='schedule' then 'schedule'
    when new.type like 'leave%' then 'leave'
    when new.type like 'sick%' then 'sick_leave'
    when new.type like 'document%' then 'documents'
    when new.type like 'mileage%' or new.type like 'vehicle%' then 'fleet'
    when new.type like 'material%' then 'materials'
    when new.type='birthday' then 'birthdays'
    else 'system' end;
  insert into public.notification_deliveries(organization_id,notification_id,channel,status)
  values(new.organization_id,new.id,'in_app','pending') on conflict do nothing;
  insert into public.notification_deliveries(organization_id,notification_id,channel,status)
  select new.organization_id,new.id,channel_name,'pending'
  from (
    select 'email'::text channel_name,np.email_enabled enabled from public.notification_preferences np
      where np.profile_id=new.profile_id and np.category=category_key
    union all
    select 'push'::text,np.push_enabled from public.notification_preferences np
      where np.profile_id=new.profile_id and np.category=category_key
  ) channels where enabled
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists queue_notification_deliveries on public.notifications;
create trigger queue_notification_deliveries after insert on public.notifications
for each row execute function private.queue_notification_deliveries();

-- Safe profile/directory APIs -------------------------------------------------

create or replace function public.get_my_profile()
returns table(
  id uuid,
  organization_id uuid,
  display_name text,
  email text,
  status text,
  avatar_url text,
  preferred_language text,
  first_name text,
  last_name text,
  work_phone text,
  job_title text,
  employee_number text,
  start_date date
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id,p.organization_id,p.display_name,p.email,p.status,p.avatar_url,p.preferred_language,
         ep.first_name,ep.last_name,ep.work_phone,ep.job_title,ep.employee_number,ep.start_date
  from public.profiles p
  left join public.employee_profiles ep on ep.profile_id=p.id and ep.organization_id=p.organization_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status in ('invited','active','suspended')
  limit 1
$$;

create or replace function public.list_directory_entries(p_search text default null)
returns table(
  id uuid,
  display_name text,
  email text,
  avatar_url text,
  work_phone text,
  job_title text,
  department_name text,
  location_name text,
  teams jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.has_permission('directory.view') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query
  select p.id,p.display_name,p.email,p.avatar_url,ep.work_phone,ep.job_title,d.name,l.name,
    coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'location_name',coalesce(tl.name,t.location_name)) order by t.name)
      from public.team_memberships tm
      join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id and t.active
      left join public.locations tl on tl.id=t.location_id
      where tm.profile_id=p.id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    ),'[]'::jsonb)
  from public.profiles p
  left join public.employee_profiles ep on ep.profile_id=p.id
  left join public.departments d on d.id=ep.department_id
  left join public.locations l on l.id=ep.location_id
  where p.organization_id=private.current_organization_id() and p.status='active'
    and (
      nullif(trim(p_search),'') is null
      or concat_ws(' ',p.display_name,p.email,ep.job_title,d.name,l.name) ilike '%'||trim(p_search)||'%'
      or exists (
        select 1 from public.team_memberships tm join public.teams t on t.id=tm.team_id
        where tm.profile_id=p.id and t.name ilike '%'||trim(p_search)||'%'
      )
    )
  order by p.display_name;
end;
$$;

create or replace function public.admin_list_users()
returns table(
  id uuid,
  display_name text,
  email text,
  status text,
  avatar_url text,
  first_name text,
  last_name text,
  employee_number text,
  work_phone text,
  job_title text,
  employment_status text,
  start_date date,
  end_date date,
  birth_date date,
  weekly_hours numeric,
  roles jsonb,
  teams jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (private.has_permission('users.view') or private.has_permission('users.manage')) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  select p.id,p.display_name,p.email,p.status,p.avatar_url,ep.first_name,ep.last_name,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employee_number end,
    ep.work_phone,ep.job_title,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employment_status end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.start_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.end_date end,
    case when private.has_permission('birthdays.view_admin_notifications') or private.has_permission('sick_leave.manage') then ep.birth_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.weekly_hours end,
    coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'system_key',r.system_key) order by r.name)
      from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.profile_id=p.id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
      from public.team_memberships tm join public.teams t on t.id=tm.team_id
      where tm.profile_id=p.id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)),'[]'::jsonb)
  from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id
  where p.organization_id=private.current_organization_id()
  order by p.display_name;
end;
$$;

create or replace function public.list_leave_requests()
returns table(
  id uuid, profile_id uuid, leave_type text, starts_on date, ends_on date,
  day_fraction numeric, workdays numeric, note text, status text,
  decided_by uuid, decided_at timestamptz, decision_note text, created_at timestamptz,
  profiles jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  return query
  select lr.id,lr.profile_id,lr.leave_type,lr.starts_on,lr.ends_on,lr.day_fraction,lr.workdays,
    case when lr.profile_id=me or private.has_permission('leave.manage')
      or (private.has_permission('leave.approve') and private.can_view_profile_team(lr.profile_id)) then lr.note end,
    lr.status,lr.decided_by,lr.decided_at,
    case when lr.profile_id=me or private.has_permission('leave.manage')
      or (private.has_permission('leave.approve') and private.can_view_profile_team(lr.profile_id)) then lr.decision_note end,
    lr.created_at,jsonb_build_object('id',p.id,'display_name',p.display_name)
  from public.leave_requests lr join public.profiles p on p.id=lr.profile_id
  where lr.organization_id=org and (
    lr.profile_id=me or private.has_permission('leave.manage')
    or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(lr.profile_id))
  ) order by lr.created_at desc;
end;
$$;

create or replace function public.list_sick_leave_records()
returns table(
  id uuid, profile_id uuid, starts_on date, expected_end_on date, end_unknown boolean,
  certificate_status text, status text, created_at timestamptz, profiles jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  return query
  select sl.id,sl.profile_id,sl.starts_on,sl.expected_end_on,sl.end_unknown,
    case when sl.profile_id=me or private.has_permission('sick_leave.view_certificates') then sl.certificate_status end,
    sl.status,sl.created_at,jsonb_build_object('id',p.id,'display_name',p.display_name)
  from public.sick_leave_records sl join public.profiles p on p.id=sl.profile_id
  where sl.organization_id=org and (
    sl.profile_id=me or private.can_view_sick_status(sl.profile_id)
  ) order by sl.starts_on desc;
end;
$$;

create or replace function public.update_own_profile(p_display_name text, p_work_phone text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := private.current_profile_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if length(trim(p_display_name)) not between 2 and 120 then raise exception 'invalid_display_name' using errcode='22023'; end if;
  if p_work_phone is not null and length(p_work_phone)>40 then raise exception 'invalid_work_phone' using errcode='22023'; end if;
  update public.profiles set display_name=trim(p_display_name) where id=me;
  update public.employee_profiles set work_phone=nullif(trim(p_work_phone),'') where profile_id=me;
end;
$$;

create or replace function public.activate_my_profile()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.profiles%rowtype;
begin
  select p.* into target from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() for update;
  if target.id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if target.status='active' then return; end if;
  if target.status<>'invited' then raise exception 'profile_cannot_be_activated' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'email_not_confirmed' using errcode='42501';
  end if;
  update public.profiles set status='active' where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,target.id,'user.invite_activated','profile',target.id,'{}');
end;
$$;

create or replace function public.admin_create_invited_profile(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role_id uuid,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
  existing_org uuid;
  existing_status text;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_first_name)) not between 1 and 80 or length(trim(p_last_name)) not between 1 and 80 then raise exception 'invalid_name' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=lower(trim(p_email))) then
    raise exception 'auth_user_not_found' using errcode='23503';
  end if;
  if not exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=org and r.active) then
    raise exception 'role_not_available' using errcode='22023';
  end if;
  if exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=org and r.system_key='super_admin')
    and not private.has_permission('roles.manage') then raise exception 'super_admin_assignment_requires_role_management' using errcode='42501'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  select p.id,p.organization_id,p.status into result,existing_org,existing_status
  from public.profiles p where p.auth_user_id=p_auth_user_id for update;
  if result is not null then
    if existing_org<>org then raise exception 'auth_user_belongs_to_other_organization' using errcode='23514'; end if;
    if existing_status<>'invited' then raise exception 'account_already_initialized' using errcode='23505'; end if;
    return result;
  end if;
  insert into public.profiles(auth_user_id,organization_id,display_name,email,status)
  values(p_auth_user_id,org,trim(p_first_name)||' '||trim(p_last_name),lower(trim(p_email)),'invited')
  returning id into result;
  insert into public.employee_profiles(profile_id,organization_id,first_name,last_name)
  values(result,org,trim(p_first_name),trim(p_last_name));
  insert into public.user_roles(profile_id,role_id,organization_id,assigned_by)
  values(result,p_role_id,org,me);
  if p_team_id is not null then
    insert into public.team_memberships(team_id,profile_id,organization_id) values(p_team_id,result,org);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'user.invited','profile',result,jsonb_build_object('email_domain',split_part(lower(trim(p_email)),'@',2)));
  return result;
end;
$$;

create or replace function public.bootstrap_first_admin(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org constant uuid:='00000000-0000-4000-8000-000000000001'::uuid;
  super_role uuid;
  result uuid;
  existing_org uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if length(trim(p_first_name)) not between 1 and 80 or length(trim(p_last_name)) not between 1 and 80 then raise exception 'invalid_name' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null) then
    raise exception 'confirmed_auth_user_not_found' using errcode='23503';
  end if;
  if not exists(select 1 from public.organizations o where o.id=org and o.active) then raise exception 'bootstrap_organization_not_found' using errcode='P0002'; end if;
  select r.id into super_role from public.roles r where r.organization_id=org and r.system_key='super_admin' and r.active limit 1;
  if super_role is null then raise exception 'super_admin_role_not_found' using errcode='P0002'; end if;
  select p.id,p.organization_id into result,existing_org from public.profiles p where p.auth_user_id=p_auth_user_id for update;
  if result is not null and existing_org<>org then raise exception 'auth_user_already_belongs_to_other_organization' using errcode='23514'; end if;
  if exists (
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id
    join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id
    where ur.organization_id=org and r.system_key='super_admin' and r.active and p.status='active'
      and p.auth_user_id<>p_auth_user_id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) then raise exception 'bootstrap_already_completed' using errcode='42501'; end if;
  if result is null then
    insert into public.profiles(auth_user_id,organization_id,display_name,email,status)
    values(p_auth_user_id,org,trim(p_first_name)||' '||trim(p_last_name),lower(trim(p_email)),'active') returning id into result;
  else
    update public.profiles set display_name=trim(p_first_name)||' '||trim(p_last_name),email=lower(trim(p_email)),status='active',archived_at=null where id=result;
  end if;
  insert into public.employee_profiles(profile_id,organization_id,first_name,last_name,employment_status)
  values(result,org,trim(p_first_name),trim(p_last_name),'active')
  on conflict(profile_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,employment_status='active';
  if not exists(select 1 from public.user_roles ur where ur.profile_id=result and ur.role_id=super_role and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) then
    insert into public.user_roles(profile_id,role_id,organization_id,assigned_by) values(result,super_role,org,result);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  select org,result,'system.first_admin_bootstrapped','profile',result,'{}'
  where not exists(select 1 from public.audit_logs al where al.organization_id=org and al.action='system.first_admin_bootstrapped' and al.entity_id=result);
  return result;
end;
$$;

create or replace function public.admin_set_profile_status(p_profile_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  auth_id uuid;
  old_status text;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('invited','active','suspended','archived') then raise exception 'invalid_status' using errcode='22023'; end if;
  if p_profile_id=me and p_status in ('suspended','archived') then raise exception 'cannot_disable_own_account' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select auth_user_id,status into auth_id,old_status from public.profiles
  where id=p_profile_id and organization_id=org for update;
  if auth_id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if old_status='invited' and p_status not in ('invited','archived') then raise exception 'invite_must_be_activated_by_user' using errcode='42501'; end if;
  if old_status<>'invited' and p_status='invited' then raise exception 'invalid_status_transition' using errcode='22023'; end if;
  if p_status='active' and not exists(select 1 from auth.users u where u.id=auth_id and u.email_confirmed_at is not null) then
    raise exception 'confirmed_auth_user_required' using errcode='42501';
  end if;
  if p_status in ('suspended','archived') and exists (
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id
    where ur.profile_id=p_profile_id and ur.organization_id=org and r.system_key='super_admin'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) and (
    select count(distinct ur.profile_id) from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
    join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id and p.status='active'
    where ur.organization_id=org and r.system_key='super_admin' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  )<=1 then raise exception 'last_super_admin_cannot_be_disabled' using errcode='42501'; end if;
  update public.profiles set status=p_status,archived_at=case when p_status='archived' then now() else null end where id=p_profile_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'user.status_changed','profile',p_profile_id,jsonb_build_object('from',old_status,'to',p_status));
  return auth_id;
end;
$$;

create or replace function public.admin_get_invite_target(p_profile_id uuid)
returns table(auth_user_id uuid, email text, status text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query select p.auth_user_id,p.email,p.status from public.profiles p
    where p.id=p_profile_id and p.organization_id=private.current_organization_id();
end;
$$;

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
  select u.id,u.email_confirmed_at,u.raw_user_meta_data into target_auth,confirmed_at,target_metadata
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

create or replace function public.admin_begin_invite_resend(p_profile_id uuid, p_request_id uuid)
returns table(auth_user_id uuid, email text, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.profiles%rowtype;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invite-resend:'||p_profile_id::text,0));
  select * into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.status<>'invited' then raise exception 'invite_not_available' using errcode='22023'; end if;
  if exists(select 1 from public.audit_logs al where al.organization_id=org and al.entity_id=target.id
    and al.action='user.invite_resend_started' and al.created_at>now()-interval '60 seconds') then
    raise exception 'invite_cooldown' using errcode='P0001';
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  values(org,me,'user.invite_resend_started','profile',target.id,p_request_id,'{}');
  return query select target.auth_user_id,target.email,target.status;
end;
$$;

create or replace function public.set_user_role(p_profile_id uuid, p_role_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); role_key text; active_count integer;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if p_profile_id=me then raise exception 'cannot_change_own_roles' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  select system_key into role_key from public.roles where id=p_role_id and organization_id=org and active;
  if not found then raise exception 'role_not_available' using errcode='22023'; end if;
  if role_key='super_admin' and not private.has_permission('roles.manage') then raise exception 'super_admin_assignment_requires_role_management' using errcode='42501'; end if;
  if not p_enabled and role_key='super_admin' then
    select count(distinct ur.profile_id) into active_count from public.user_roles ur
      join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
      join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id and p.status='active'
      where ur.organization_id=org and r.system_key='super_admin' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now());
    if active_count<=1 then raise exception 'last_super_admin_role_cannot_be_removed' using errcode='42501'; end if;
  end if;
  if p_enabled then
    if not exists(select 1 from public.user_roles ur where ur.profile_id=p_profile_id and ur.role_id=p_role_id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) then
      insert into public.user_roles(profile_id,role_id,organization_id,assigned_by) values(p_profile_id,p_role_id,org,me);
    end if;
  else
    update public.user_roles set valid_until=now() where profile_id=p_profile_id and role_id=p_role_id and valid_from<=now() and (valid_until is null or valid_until>now());
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when p_enabled then 'user.role_assigned' else 'user.role_revoked' end,'profile',p_profile_id,
    jsonb_build_object('role_id',p_role_id));
end;
$$;

create or replace function public.set_role_permission(p_role_id uuid, p_permission_key text, p_enabled boolean)
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
  if me is null or not private.has_permission('roles.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select r.system_key into role_key from public.roles r
  where r.id=p_role_id and r.organization_id=org and r.active for update;
  if not found then raise exception 'role_not_available' using errcode='22023'; end if;
  if not exists(select 1 from public.permissions p where p.key=p_permission_key) then
    raise exception 'permission_not_available' using errcode='22023';
  end if;
  if role_key='super_admin' and not p_enabled and p_permission_key in ('users.manage','roles.manage') then
    raise exception 'protected_super_admin_permission' using errcode='42501';
  end if;
  if p_enabled then
    insert into public.role_permissions(role_id,permission_key) values(p_role_id,p_permission_key)
    on conflict do nothing;
    get diagnostics changed=row_count;
  else
    delete from public.role_permissions where role_id=p_role_id and permission_key=p_permission_key;
    get diagnostics changed=row_count;
  end if;
  if changed>0 then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,case when p_enabled then 'role.permission_granted' else 'role.permission_revoked' end,
      'role',p_role_id,jsonb_build_object('permission_key',p_permission_key));
  end if;
end;
$$;

create or replace function public.set_user_team(p_profile_id uuid, p_team_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  if not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then raise exception 'team_not_available' using errcode='22023'; end if;
  if p_enabled then
    if not exists(select 1 from public.team_memberships tm where tm.profile_id=p_profile_id and tm.team_id=p_team_id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)) then
      insert into public.team_memberships(team_id,profile_id,organization_id,valid_from,valid_until)
      values(p_team_id,p_profile_id,org,current_date,null)
      on conflict(team_id,profile_id,valid_from) do update set valid_until=null;
    end if;
  else
    delete from public.team_memberships where team_id=p_team_id and profile_id=p_profile_id and valid_from=current_date;
    update public.team_memberships set valid_until=current_date-1 where team_id=p_team_id and profile_id=p_profile_id
      and valid_from<current_date and (valid_until is null or valid_until>=current_date);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when p_enabled then 'user.team_assigned' else 'user.team_revoked' end,'profile',p_profile_id,
    jsonb_build_object('team_id',p_team_id));
end;
$$;

-- Messaging APIs --------------------------------------------------------------

create or replace function public.get_or_create_direct_conversation(other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
  pair_key text;
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  if other_profile_id=me then raise exception 'self_conversation_not_allowed' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=other_profile_id and p.organization_id=org and p.status='active') then
    raise exception 'profile_not_available' using errcode='22023';
  end if;
  pair_key := least(me::text,other_profile_id::text)||':'||greatest(me::text,other_profile_id::text);
  perform pg_advisory_xact_lock(hashtextextended(org::text||pair_key,0));
  select c.id into result from public.conversations c
  where c.organization_id=org and c.type='direct' and c.direct_key=pair_key and c.archived_at is null limit 1;
  if result is null then
    select c.id into result from public.conversations c
    where c.organization_id=org and c.type='direct' and c.archived_at is null
      and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=me)
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=other_profile_id)
    order by c.created_at limit 1;
    if result is not null then update public.conversations set direct_key=pair_key where id=result and direct_key is null; end if;
  end if;
  if result is null then
    insert into public.conversations(organization_id,type,created_by,direct_key)
    values(org,'direct',me,pair_key) returning id into result;
    insert into public.conversation_members(conversation_id,profile_id,organization_id)
    values(result,me,org),(result,other_profile_id,org);
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'conversation.direct_created','conversation',result,'{}');
  end if;
  return result;
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
  if p_type not in ('group','team','announcement') then raise exception 'invalid_conversation_type' using errcode='22023'; end if;
  if length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name' using errcode='22023'; end if;
  if p_type='announcement' and not private.has_permission('news.publish') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_type='team' and (p_team_id is null or not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active)) then
    raise exception 'valid_team_required' using errcode='22023';
  end if;
  if p_type='team' and not (
    private.has_permission('teams.manage')
    or exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.lead_profile_id=me and t.active)
  ) then raise exception 'team_conversation_permission_required' using errcode='42501'; end if;
  if p_type<>'team' and p_team_id is not null then raise exception 'team_not_allowed' using errcode='22023'; end if;
  if exists (select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) as member_ids(mid) where not private.is_same_org_profile(mid)) then
    raise exception 'member_not_available' using errcode='22023';
  end if;
  if p_type='team' and exists (
    select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) member_ids(mid)
    where not exists(select 1 from public.team_memberships tm join public.profiles p on p.id=tm.profile_id and p.status='active'
      where tm.team_id=p_team_id and tm.profile_id=mid and tm.organization_id=org
        and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date))
  ) then raise exception 'team_member_required' using errcode='22023'; end if;
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
  muted_until timestamptz
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
    self_member.muted_until
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

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_client_nonce uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.can_post_conversation(p_conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_body)) not between 1 and 10000 then raise exception 'invalid_message' using errcode='22023'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id=p_reply_to_id and m.conversation_id=p_conversation_id) then
    raise exception 'invalid_reply_target' using errcode='22023';
  end if;
  if p_client_nonce is not null then
    select id into result from public.messages where sender_id=me and client_nonce=p_client_nonce;
    if result is not null then return result; end if;
  end if;
  insert into public.messages(organization_id,conversation_id,sender_id,reply_to_id,body,client_nonce)
  values(org,p_conversation_id,me,p_reply_to_id,trim(p_body),p_client_nonce) returning id into result;
  update public.conversations set updated_at=now() where id=p_conversation_id;
  perform private.create_notification(org,cm.profile_id,'message','Neue interne Nachricht','Sie haben eine neue interne Nachricht erhalten.',
    '/app/messages/'||p_conversation_id::text,'message:'||result::text||':'||cm.profile_id::text)
  from public.conversation_members cm
  join public.profiles p on p.id=cm.profile_id and p.status='active'
  where cm.conversation_id=p_conversation_id and cm.profile_id<>me and (cm.muted_until is null or cm.muted_until<=now())
    and private.profile_has_permission(cm.profile_id,org,'messages.use');
  return result;
end;
$$;

create or replace function public.edit_message(p_message_id uuid, p_new_body text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.messages%rowtype; window_minutes integer;
begin
  select * into target from public.messages where id=p_message_id for update;
  if target.id is null or target.sender_id<>private.current_profile_id() or not private.is_conversation_member(target.conversation_id) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  select message_edit_window_minutes into window_minutes from public.organization_settings where organization_id=target.organization_id;
  if target.retracted_at is not null or target.created_at<=now()-make_interval(mins=>coalesce(window_minutes,15)) then
    raise exception 'edit_window_expired' using errcode='22023';
  end if;
  if length(trim(p_new_body)) not between 1 and 10000 then raise exception 'invalid_message' using errcode='22023'; end if;
  update public.messages set body=trim(p_new_body) where id=p_message_id;
end;
$$;

create or replace function public.retract_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.messages%rowtype; window_minutes integer; me uuid:=private.current_profile_id();
begin
  select * into target from public.messages where id=p_message_id for update;
  if target.id is null or me is null or not private.is_conversation_member(target.conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  select message_edit_window_minutes into window_minutes from public.organization_settings where organization_id=target.organization_id;
  if target.sender_id<>me and not private.has_permission('messages.moderate') then raise exception 'permission_denied' using errcode='42501'; end if;
  if target.sender_id=me and target.created_at<=now()-make_interval(mins=>coalesce(window_minutes,15)) then raise exception 'retract_window_expired' using errcode='22023'; end if;
  update public.messages set body='Nachricht wurde zurückgezogen.',retracted_at=coalesce(retracted_at,now()),retracted_by=me where id=p_message_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,me,'message.retracted','message',target.id,jsonb_build_object('reason_provided',nullif(trim(p_reason),'') is not null));
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and profile_id=private.current_profile_id() and organization_id=private.current_organization_id()
$$;
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare affected integer; begin
  update public.notifications set read_at=now() where profile_id=private.current_profile_id() and organization_id=private.current_organization_id() and read_at is null;
  get diagnostics affected=row_count; return affected;
end $$;

create or replace function public.save_news_post(
  p_title text,
  p_summary text,
  p_body text,
  p_priority text,
  p_ack_required boolean,
  p_action text,
  p_team_id uuid default null,
  p_news_id uuid default null,
  p_scheduled_for timestamptz default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; final_status text; target public.news_posts%rowtype; is_new boolean:=p_news_id is null;
begin
  if me is null or (is_new and not private.has_permission('news.create')) then raise exception 'permission_denied' using errcode='42501'; end if;
  final_status := case
    when p_action in ('publish','published') then 'published'
    when p_action in ('schedule','scheduled') then 'scheduled'
    when p_action in ('archive','archived') then 'archived'
    when p_action='draft' then 'draft' else null end;
  if final_status is null or p_priority not in ('normal','important','critical')
    or length(trim(p_title)) not between 3 and 180 or length(trim(p_summary)) not between 3 and 500
    or length(trim(p_body)) not between 3 and 20000 then raise exception 'invalid_news_post' using errcode='22023'; end if;
  if final_status in ('published','scheduled') and not private.has_permission('news.publish')
    and not (
      not is_new and final_status='published' and private.has_permission('news.manage')
      and exists(select 1 from public.news_posts existing where existing.id=p_news_id and existing.organization_id=org and existing.status='published')
    ) then raise exception 'publish_permission_required' using errcode='42501'; end if;
  if final_status='archived' and not private.has_permission('news.manage') then raise exception 'manage_permission_required' using errcode='42501'; end if;
  if is_new and final_status='archived' then raise exception 'new_news_cannot_be_archived' using errcode='22023'; end if;
  if final_status='scheduled' and (p_scheduled_for is null or p_scheduled_for<=now()) then raise exception 'future_schedule_required' using errcode='22023'; end if;
  if final_status<>'archived' and p_expires_at is not null and p_expires_at<=now() then raise exception 'expiry_must_be_future' using errcode='22023'; end if;
  if final_status='scheduled' and p_expires_at is not null and p_expires_at<=p_scheduled_for then raise exception 'expiry_must_follow_schedule' using errcode='22023'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  if is_new then
    insert into public.news_posts(organization_id,title,summary,body,status,priority,author_id,published_by,published_at,scheduled_for,expires_at,archived_at,acknowledgement_required)
    values(org,trim(p_title),trim(p_summary),trim(p_body),final_status,p_priority,me,
      case when final_status='published' then me end,case when final_status='published' then now() end,
      case when final_status='scheduled' then p_scheduled_for end,p_expires_at,case when final_status='archived' then now() end,p_ack_required)
    returning id into result;
  else
    select * into target from public.news_posts where id=p_news_id and organization_id=org for update;
    if target.id is null or not (private.has_permission('news.manage') or (target.author_id=me and private.has_permission('news.create'))) then raise exception 'news_not_editable' using errcode='42501'; end if;
    if target.status='published' and final_status in ('draft','scheduled') then raise exception 'published_news_cannot_be_unpublished' using errcode='22023'; end if;
    if target.status='archived' then raise exception 'archived_news_is_immutable' using errcode='22023'; end if;
    update public.news_posts set title=trim(p_title),summary=trim(p_summary),body=trim(p_body),priority=p_priority,
      acknowledgement_required=p_ack_required,status=final_status,
      scheduled_for=case when final_status='scheduled' then p_scheduled_for end,
      expires_at=p_expires_at,published_by=case when final_status='published' then me else published_by end,
      published_at=case when final_status='published' then coalesce(published_at,now()) else published_at end,
      archived_at=case when final_status='archived' then coalesce(archived_at,now()) else null end
    where id=target.id returning id into result;
    delete from public.news_audiences where news_id=result;
  end if;
  insert into public.news_audiences(organization_id,news_id,audience_type,team_id)
  values(org,result,case when p_team_id is null then 'organization' else 'team' end,p_team_id);
  if final_status='published' then
    perform private.create_notification(org,p.id,case when p_ack_required then 'news_ack_required' else 'news' end,
      case when p_priority='critical' then 'Kritische interne Mitteilung' else 'Neue interne Mitteilung' end,
      case when p_ack_required then 'Eine neue Mitteilung erfordert Ihre Lesebestätigung.' else 'Eine neue interne Mitteilung wurde veröffentlicht.' end,
      '/app/news/'||result::text,'news-published:'||result::text||':'||p.id::text)
    from public.profiles p
    where p.organization_id=org and p.status='active'
      and (p_team_id is null or private.is_team_member(p_team_id,p.id))
      and private.profile_has_permission(p.id,org,'news.view');
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when is_new then 'news.created' else 'news.updated' end,'news_post',result,
    jsonb_build_object('status',final_status,'audience',case when p_team_id is null then 'organization' else 'team' end));
  return result;
end;
$$;

create or replace function public.publish_scheduled_news(p_news_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.news_posts%rowtype; inserted_count integer:=0;
begin
  select * into target from public.news_posts where id=p_news_id for update;
  if target.id is null then raise exception 'news_not_found' using errcode='P0002'; end if;
  if target.status<>'scheduled' or target.scheduled_for is null then raise exception 'news_not_scheduled' using errcode='22023'; end if;
  if target.scheduled_for>now() then raise exception 'news_not_due' using errcode='22023'; end if;
  if target.expires_at is not null and target.expires_at<=now() then
    update public.news_posts set status='archived',archived_at=now(),scheduled_for=null where id=target.id;
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(target.organization_id,null,'news.scheduled_expired','news_post',target.id,'{}');
    return 0;
  end if;
  update public.news_posts set status='published',published_at=coalesce(published_at,now()),scheduled_for=null where id=target.id;
  with recipient_ids as (
    select p.id
    from public.profiles p
    where p.organization_id=target.organization_id and p.status='active'
      and (
        not exists(select 1 from public.news_audiences na where na.news_id=target.id)
        or exists(select 1 from public.news_audiences na where na.news_id=target.id and na.audience_type='organization')
      )
    union
    select na.profile_id from public.news_audiences na join public.profiles p on p.id=na.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='profile'
    union
    select tm.profile_id from public.news_audiences na join public.team_memberships tm on tm.team_id=na.team_id and tm.organization_id=na.organization_id
      join public.profiles p on p.id=tm.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='team' and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    union
    select ep.profile_id from public.news_audiences na join public.employee_profiles ep on ep.location_id=na.location_id and ep.organization_id=na.organization_id
      join public.profiles p on p.id=ep.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='location'
    union
    select ur.profile_id from public.news_audiences na join public.user_roles ur on ur.role_id=na.role_id and ur.organization_id=na.organization_id
      join public.profiles p on p.id=ur.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='role' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  )
  insert into public.notifications(organization_id,profile_id,type,title,body,target_path,deduplication_key)
  select target.organization_id,r.id,case when target.acknowledgement_required then 'news_ack_required' else 'news' end,
    case when target.priority='critical' then 'Kritische interne Mitteilung' else 'Neue interne Mitteilung' end,
    case when target.acknowledgement_required then 'Eine neue Mitteilung erfordert Ihre Lesebestätigung.' else 'Eine neue interne Mitteilung wurde veröffentlicht.' end,
    '/app/news/'||target.id::text,'news-published:'||target.id::text||':'||r.id::text
  from recipient_ids r
  where private.profile_has_permission(r.id,target.organization_id,'news.view')
  on conflict(profile_id,deduplication_key) do nothing;
  get diagnostics inserted_count=row_count;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,null,'news.scheduled_published','news_post',target.id,jsonb_build_object('recipient_count',inserted_count));
  return inserted_count;
end;
$$;

create or replace function private.can_consume_news(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.news_posts n
    where n.id=p_news_id and n.organization_id=private.current_organization_id()
      and n.status='published' and coalesce(n.published_at,n.created_at)<=now()
      and (n.expires_at is null or n.expires_at>now())
      and private.has_permission('news.view') and private.is_news_audience(n.id)
  )
$$;

create or replace function public.mark_news_opened(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id();
begin
  if me is null or not private.can_consume_news(p_news_id) then raise exception 'news_not_available' using errcode='42501'; end if;
  insert into public.news_reads(news_id,profile_id,opened_at)
  values(p_news_id,me,now()) on conflict(news_id,profile_id) do nothing;
end;
$$;

create or replace function public.acknowledge_news(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); already_acknowledged boolean;
begin
  if me is null or not private.can_consume_news(p_news_id) then raise exception 'news_not_available' using errcode='42501'; end if;
  if not exists(select 1 from public.news_posts n where n.id=p_news_id and n.acknowledgement_required) then
    raise exception 'acknowledgement_not_required' using errcode='22023';
  end if;
  select nr.acknowledged_at is not null into already_acknowledged
  from public.news_reads nr where nr.news_id=p_news_id and nr.profile_id=me for update;
  insert into public.news_reads(news_id,profile_id,opened_at,acknowledged_at)
  values(p_news_id,me,now(),now())
  on conflict(news_id,profile_id) do update set acknowledged_at=coalesce(public.news_reads.acknowledged_at,excluded.acknowledged_at);
  if not coalesce(already_acknowledged,false) then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'news.acknowledged','news_post',p_news_id,'{}');
  end if;
end;
$$;

create or replace function public.news_read_stats(p_news_id uuid)
returns table(target_count bigint, opened_count bigint, acknowledged_count bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare org uuid:=private.current_organization_id();
begin
  if not private.has_permission('news.manage') or not exists(select 1 from public.news_posts n where n.id=p_news_id and n.organization_id=org) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  with audience_recipients as (
    select p.id from public.profiles p where p.organization_id=org and p.status='active' and (
      not exists(select 1 from public.news_audiences na where na.news_id=p_news_id)
      or exists(select 1 from public.news_audiences na where na.news_id=p_news_id and na.audience_type='organization'))
    union select na.profile_id from public.news_audiences na join public.profiles p on p.id=na.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='profile'
    union select tm.profile_id from public.news_audiences na join public.team_memberships tm on tm.team_id=na.team_id and tm.organization_id=na.organization_id
      join public.profiles p on p.id=tm.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='team'
      and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    union select ep.profile_id from public.news_audiences na join public.employee_profiles ep on ep.location_id=na.location_id and ep.organization_id=na.organization_id
      join public.profiles p on p.id=ep.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='location'
    union select ur.profile_id from public.news_audiences na join public.user_roles ur on ur.role_id=na.role_id and ur.organization_id=na.organization_id
      join public.profiles p on p.id=ur.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='role'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ), recipients as (
    select ar.id from audience_recipients ar where private.profile_has_permission(ar.id,org,'news.view')
  )
  select (select count(*) from recipients),
    (select count(*) from public.news_reads nr join recipients r on r.id=nr.profile_id where nr.news_id=p_news_id),
    (select count(*) from public.news_reads nr join recipients r on r.id=nr.profile_id where nr.news_id=p_news_id and nr.acknowledged_at is not null);
end;
$$;

create or replace function private.can_manage_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.documents d
    where d.id=p_document_id and d.organization_id=private.current_organization_id()
      and (
        (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
        or private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.visibility='personal' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      )
  )
$$;

drop function if exists public.create_document_upload(text,text,uuid);
create or replace function public.create_employee_document_upload(
  p_profile_id uuid,
  p_title text,
  p_folder_id uuid default null,
  p_category_id uuid default null,
  p_ack_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.manage_employee_files') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  if length(trim(p_title)) not between 2 and 180 then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_folder_id is not null and not exists(select 1 from public.document_folders f where f.id=p_folder_id and f.organization_id=org) then raise exception 'folder_not_available' using errcode='22023'; end if;
  if p_category_id is not null and not exists(select 1 from public.document_categories dc where dc.id=p_category_id and dc.organization_id=org and dc.active) then raise exception 'category_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required,sensitivity)
  values(org,trim(p_title),'personal',p_profile_id,me,'draft',p_folder_id,p_category_id,p_ack_required,'employee_file') returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,profile_id)
  values(org,result,'profile',p_profile_id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'employee_document.draft_created','document',result,jsonb_build_object('owner_profile_id',p_profile_id));
  return result;
end;
$$;

create or replace function public.create_document_upload(
  p_title text,
  p_visibility text,
  p_team_id uuid default null,
  p_folder_id uuid default null,
  p_category_id uuid default null,
  p_ack_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_title)) not between 2 and 180 or p_visibility not in ('organization','team','personal') then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_visibility='personal' and not private.has_permission('documents.view_own') then raise exception 'personal_document_permission_required' using errcode='42501'; end if;
  if p_visibility='team' and (p_team_id is null or not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active)) then
    raise exception 'valid_team_required' using errcode='22023';
  end if;
  if p_visibility<>'team' and p_team_id is not null then raise exception 'team_not_allowed' using errcode='22023'; end if;
  if p_folder_id is not null and not exists(select 1 from public.document_folders f where f.id=p_folder_id and f.organization_id=org) then raise exception 'folder_not_available' using errcode='22023'; end if;
  if p_category_id is not null and not exists(select 1 from public.document_categories dc where dc.id=p_category_id and dc.organization_id=org and dc.active) then raise exception 'category_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required)
  values(org,trim(p_title),p_visibility,case when p_visibility='personal' then me end,me,'draft',p_folder_id,p_category_id,p_ack_required) returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,team_id,profile_id)
  values(org,result,case p_visibility when 'organization' then 'organization' when 'team' then 'team' else 'profile' end,
    case when p_visibility='team' then p_team_id end,case when p_visibility='personal' then me end);
  return result;
end;
$$;

create or replace function public.finalize_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.documents%rowtype; version_path text; expected_bucket text;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) or target.status<>'draft' then raise exception 'document_not_finalizable' using errcode='22023'; end if;
  select dv.storage_path into version_path from public.document_versions dv
  where dv.document_id=target.id and dv.organization_id=org and dv.is_current and dv.deleted_at is null order by dv.version desc limit 1;
  expected_bucket:=case when target.sensitivity='employee_file' then 'employee-documents' else 'documents' end;
  if version_path is null or not exists(select 1 from storage.objects so where so.bucket_id=expected_bucket and so.name=version_path) then
    raise exception 'document_file_missing' using errcode='23514';
  end if;
  update public.documents set status='published' where id=target.id;
  perform private.create_notification(org,p.id,'document','Neues Dokument','Ein neues internes Dokument wurde bereitgestellt.',
    '/app/documents/'||target.id::text,'document-published:'||target.id::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active'
    and private.profile_can_access_document(p.id,target.id,org);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.published','document',target.id,jsonb_build_object('visibility',target.visibility));
end;
$$;

create or replace function public.add_document_version(
  p_document_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.documents%rowtype; result uuid; next_version integer; reset_count integer:=0; expected_bucket text;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) or target.status='archived' then raise exception 'document_not_versionable' using errcode='42501'; end if;
  if length(trim(p_original_name)) not between 1 and 255
    or p_mime_type not in ('image/jpeg','image/png','application/pdf')
    or p_size_bytes not between 1 and 20971520
    or length(coalesce(p_change_note,''))>500 then raise exception 'invalid_document_version' using errcode='22023'; end if;
  expected_bucket:=case when target.sensitivity='employee_file' then 'employee-documents' else 'documents' end;
  if (storage.foldername(p_storage_path))[1] is distinct from org::text
    or (target.sensitivity='employee_file' and (
      (storage.foldername(p_storage_path))[2] is distinct from target.owner_profile_id::text
      or (storage.foldername(p_storage_path))[3] is distinct from target.id::text
    ))
    or (target.sensitivity<>'employee_file' and (storage.foldername(p_storage_path))[2] is distinct from target.id::text)
    or not exists(select 1 from storage.objects so where so.bucket_id=expected_bucket and so.name=p_storage_path) then
    raise exception 'document_file_missing_or_misplaced' using errcode='23514';
  end if;
  select coalesce(max(dv.version),0)+1 into next_version from public.document_versions dv where dv.document_id=target.id;
  update public.document_versions set is_current=false where document_id=target.id and is_current and deleted_at is null;
  insert into public.document_versions(organization_id,document_id,version,storage_path,mime_type,size_bytes,uploaded_by,original_name,change_note,is_current)
  values(org,target.id,next_version,p_storage_path,p_mime_type,p_size_bytes,me,trim(p_original_name),nullif(trim(p_change_note),''),true)
  returning id into result;
  delete from public.document_acknowledgements where document_id=target.id;
  get diagnostics reset_count=row_count;
  update public.documents set updated_at=now() where id=target.id;
  if target.status='published' then
    perform private.create_notification(org,p.id,case when target.acknowledgement_required then 'document_ack_required' else 'document' end,
      'Neue Dokumentversion','Ein internes Dokument wurde aktualisiert.',
      '/app/documents/'||target.id::text,'document-version:'||result::text||':'||p.id::text)
    from public.profiles p where p.organization_id=org and p.status='active'
      and private.profile_can_access_document(p.id,target.id,org);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.version_added','document',target.id,
    jsonb_build_object('version',next_version,'acknowledgements_reset',reset_count));
  return result;
end;
$$;

create or replace function public.archive_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.documents%rowtype;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) then raise exception 'document_not_manageable' using errcode='42501'; end if;
  if target.status='archived' then return; end if;
  update public.documents set status='archived',archived_at=now() where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.archived','document',target.id,jsonb_build_object('previous_status',target.status));
end;
$$;

-- Scheduling -----------------------------------------------------------------

create or replace function public.save_shift(
  p_shift_id uuid,
  p_team_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_assignee_ids uuid[],
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
  assignee uuid; old_row public.shifts%rowtype; conflict_label text;
begin
  if me is null or not private.has_permission('schedule.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('draft','published','changed','cancelled') then raise exception 'invalid_shift_status' using errcode='22023'; end if;
  if p_status='cancelled' and p_shift_id is null then raise exception 'new_shift_cannot_be_cancelled' using errcode='22023'; end if;
  if p_status in ('published','changed') and not private.has_permission('schedule.publish') then raise exception 'publish_permission_required' using errcode='42501'; end if;
  if p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '24 hours' then raise exception 'invalid_shift_period' using errcode='22023'; end if;
  if length(trim(p_title)) not between 1 and 160 then raise exception 'invalid_title' using errcode='22023'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  if p_status='cancelled' and exists (
    select 1 from unnest(coalesce(p_assignee_ids,'{}'::uuid[])) as cancelled_assignees(aid)
    where not exists(select 1 from public.profiles p where p.id=aid and p.organization_id=org)
  ) then raise exception 'assignee_organization_mismatch' using errcode='23514'; end if;
  if p_status<>'cancelled' and exists (
    select 1 from unnest(coalesce(p_assignee_ids,'{}'::uuid[])) as assignee_ids(aid)
    where not exists (
      select 1 from public.profiles p join public.employee_profiles ep on ep.profile_id=p.id
      where p.id=aid and p.organization_id=org and p.status='active' and ep.employment_status='active'
        and (ep.start_date is null or ep.start_date<=p_starts_at::date)
        and (ep.end_date is null or ep.end_date>=p_ends_at::date)
    )
  ) then raise exception 'inactive_assignee' using errcode='23514'; end if;

  for assignee in select distinct aid from unnest(case when p_status='cancelled' then '{}'::uuid[] else coalesce(p_assignee_ids,'{}'::uuid[]) end) as assignee_ids(aid) order by aid
  loop
    perform pg_advisory_xact_lock(hashtextextended(org::text||assignee::text,0));
    if exists (
      select 1 from public.shift_assignments sa join public.shifts s on s.id=sa.shift_id
      where sa.profile_id=assignee and s.organization_id=org and s.status<>'cancelled'
        and (p_shift_id is null or s.id<>p_shift_id)
        and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
    ) then conflict_label:='overlapping_shift';
    elsif exists (
      select 1 from public.leave_requests lr where lr.profile_id=assignee and lr.organization_id=org and lr.status='approved'
        and daterange(lr.starts_on,lr.ends_on,'[]') && daterange(p_starts_at::date,p_ends_at::date,'[]')
    ) then conflict_label:='approved_leave';
    elsif exists (
      select 1 from public.sick_leave_records sl where sl.profile_id=assignee and sl.organization_id=org and sl.status not in ('closed','cancelled')
        and daterange(sl.starts_on,coalesce(sl.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_at::date,p_ends_at::date,'[]')
    ) then conflict_label:='sick_leave';
    else conflict_label:=null;
    end if;
    if conflict_label is not null then raise exception 'shift_conflict:%',conflict_label using errcode='23P01'; end if;
  end loop;

  if p_shift_id is null then
    insert into public.shifts(organization_id,team_id,title,starts_at,ends_at,status,created_by,published_at)
    values(org,p_team_id,trim(p_title),p_starts_at,p_ends_at,p_status,me,case when p_status in ('published','changed') then now() end)
    returning id into result;
    insert into public.schedule_change_log(organization_id,shift_id,actor_id,change_type,after_data)
    values(org,result,me,'created',jsonb_build_object('status',p_status,'starts_at',p_starts_at,'ends_at',p_ends_at));
  else
    select * into old_row from public.shifts where id=p_shift_id and organization_id=org for update;
    if old_row.id is null then raise exception 'shift_not_found' using errcode='P0002'; end if;
    update public.shifts set team_id=p_team_id,title=trim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,status=p_status,
      published_at=case when p_status in ('published','changed') then coalesce(published_at,now()) else published_at end
    where id=p_shift_id returning id into result;
    insert into public.schedule_change_log(organization_id,shift_id,actor_id,change_type,before_data,after_data)
    values(org,result,me,case when p_status='cancelled' then 'cancelled' else 'updated' end,
      jsonb_build_object('status',old_row.status,'starts_at',old_row.starts_at,'ends_at',old_row.ends_at),
      jsonb_build_object('status',p_status,'starts_at',p_starts_at,'ends_at',p_ends_at));
    delete from public.shift_assignments where shift_id=result;
  end if;
  insert into public.shift_assignments(shift_id,profile_id,organization_id)
  select result,aid,org from (select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])) aid) assignees;
  if p_status in ('published','changed','cancelled') then
    perform private.create_notification(org,aid,'schedule',case when p_status='cancelled' then 'Schicht abgesagt' else 'Dienstplan aktualisiert' end,
      case when p_status='cancelled' then 'Eine zugewiesene Schicht wurde abgesagt.' else 'Eine Schicht wurde veröffentlicht oder geändert.' end,
      '/app/schedule','shift:'||result::text||':'||p_status||':'||extract(epoch from date_trunc('minute',now()))::bigint::text)
    from (select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])) aid) assignees;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'shift.saved','shift',result,jsonb_build_object('status',p_status,'assignee_count',coalesce(cardinality(p_assignee_ids),0)));
  return result;
end;
$$;

create or replace function public.acknowledge_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not exists (
    select 1 from public.shift_assignments sa join public.shifts s on s.id=sa.shift_id
    where sa.shift_id=p_shift_id and sa.profile_id=me and sa.organization_id=org and s.status in ('published','changed')
  ) then raise exception 'shift_not_available' using errcode='42501'; end if;
  insert into public.shift_acknowledgements(shift_id,profile_id,organization_id)
  values(p_shift_id,me,org) on conflict(shift_id,profile_id) do update set acknowledged_at=excluded.acknowledged_at;
  update public.shift_assignments set acknowledged_at=now() where shift_id=p_shift_id and profile_id=me;
end;
$$;

-- Leave ----------------------------------------------------------------------

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
  if p_ends_on<p_starts_on or p_starts_on<current_date then raise exception 'invalid_leave_period' using errcode='22023'; end if;
  if p_day_fraction not in (0.5,1) or (p_day_fraction=0.5 and p_starts_on<>p_ends_on) then raise exception 'invalid_day_fraction' using errcode='22023'; end if;
  select p.organization_id,ep.location_id into org,location from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id where p.id=p_profile_id;
  select count(*)::numeric * p_day_fraction into result
  from generate_series(p_starts_on,p_ends_on,interval '1 day') day_value
  where extract(isodow from day_value)<6
    and not exists (
      select 1 from public.public_holidays h
      where h.organization_id=org and h.holiday_on=day_value::date and (h.location_id is null or h.location_id=location)
    );
  return coalesce(result,0);
end;
$$;

create or replace function public.submit_leave_request(
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
  if me is null or not private.has_permission('leave.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'note_too_long' using errcode='22023'; end if;
  select id,requires_note into type_id,note_required from public.leave_types where organization_id=org and active and (code=p_leave_type or name=p_leave_type) limit 1;
  if type_id is null then raise exception 'leave_type_not_available' using errcode='22023'; end if;
  if note_required and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'note_required' using errcode='22023'; end if;
  days:=private.calculate_leave_workdays(me,p_starts_on,p_ends_on,p_day_fraction);
  if days<=0 then raise exception 'no_workdays_in_period' using errcode='22023'; end if;
  if exists (select 1 from public.leave_requests lr where lr.profile_id=me and lr.status in ('submitted','review','approved')
    and daterange(lr.starts_on,lr.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')) then
    raise exception 'overlapping_leave_request' using errcode='23P01';
  end if;
  insert into public.leave_requests(organization_id,profile_id,leave_type,leave_type_id,starts_on,ends_on,day_fraction,workdays,note,status)
  values(org,me,p_leave_type,type_id,p_starts_on,p_ends_on,p_day_fraction,days,nullif(trim(p_note),''),'submitted') returning id into result;
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
          where subject_tm.profile_id=me and subject_tm.organization_id=org
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
  values(org,me,'leave.submitted','leave_request',result,jsonb_build_object('workdays',days));
  return result;
end;
$$;

create or replace function public.withdraw_leave_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); old_status text;
begin
  select status into old_status from public.leave_requests where id=p_request_id and profile_id=me and organization_id=org for update;
  if old_status is null or old_status not in ('submitted','review') then raise exception 'request_cannot_be_withdrawn' using errcode='22023'; end if;
  update public.leave_requests set status='withdrawn' where id=p_request_id;
  update public.leave_approval_steps set status='skipped',decided_by=me,decided_at=now(),comment='Vom Antragsteller zurückgezogen'
    where leave_request_id=p_request_id and status='pending';
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.withdrawn','leave_request',p_request_id,jsonb_build_object('from',old_status));
end $$;

create or replace function public.decide_leave_request(p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.leave_requests%rowtype; step_id uuid; pending_count integer;
begin
  if me is null or not (private.has_permission('leave.approve') or private.has_permission('leave.manage')) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('review','approved','rejected') then raise exception 'invalid_decision' using errcode='22023'; end if;
  if p_status='rejected' and nullif(trim(p_note),'') is null then raise exception 'rejection_reason_required' using errcode='22023'; end if;
  select * into target from public.leave_requests where id=p_request_id and organization_id=org for update;
  if target.id is null or target.status not in ('submitted','review') then raise exception 'request_not_decidable' using errcode='22023'; end if;
  if not private.has_permission('leave.manage') and not private.can_view_profile_team(target.profile_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status='review' then
    update public.leave_requests set status='review',decided_by=me,decided_at=now(),decision_note=nullif(trim(p_note),'') where id=p_request_id;
  else
    select id into step_id from public.leave_approval_steps where leave_request_id=p_request_id and status='pending' order by step_number limit 1 for update;
    if p_status='approved' and exists(
      select 1 from public.leave_approval_steps las
      where las.leave_request_id=p_request_id and las.status='approved' and las.decided_by=me
    ) then raise exception 'second_approver_required' using errcode='42501'; end if;
    if step_id is not null then update public.leave_approval_steps set status=p_status,decided_by=me,decided_at=now(),comment=nullif(trim(p_note),'') where id=step_id; end if;
    if p_status='rejected' then
      update public.leave_requests set status='rejected',decided_by=me,decided_at=now(),decision_note=trim(p_note) where id=p_request_id;
      update public.leave_approval_steps set status='skipped',decided_by=me,decided_at=now(),comment='Nach Ablehnung übersprungen' where leave_request_id=p_request_id and status='pending';
    else
      select count(*) into pending_count from public.leave_approval_steps where leave_request_id=p_request_id and status='pending';
      update public.leave_requests set status=case when pending_count=0 then 'approved' else 'review' end,
        decided_by=case when pending_count=0 then me else decided_by end,
        decided_at=case when pending_count=0 then now() else decided_at end,
        decision_note=case when pending_count=0 then nullif(trim(p_note),'') else decision_note end
      where id=p_request_id;
    end if;
  end if;
  perform private.create_notification(org,target.profile_id,'leave_status','Urlaubsantrag aktualisiert','Der Status Ihres Urlaubsantrags wurde geändert.',
    '/app/leave','leave-status:'||p_request_id::text||':'||p_status||':'||extract(epoch from now())::bigint::text);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.decided','leave_request',p_request_id,jsonb_build_object('decision',p_status));
end;
$$;

-- Sick leave -----------------------------------------------------------------

create or replace function public.report_sick_leave(
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
  if me is null or not private.has_permission('sick_leave.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_starts_on<current_date-interval '14 days' or p_starts_on>current_date+interval '1 day' then raise exception 'invalid_start_date' using errcode='22023'; end if;
  if p_certificate_status not in ('not_required','required','pending') then raise exception 'invalid_certificate_status' using errcode='22023'; end if;
  if (p_end_unknown and p_expected_end_on is not null) or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<p_starts_on)) then
    raise exception 'invalid_end_date' using errcode='22023';
  end if;
  if exists(select 1 from public.sick_leave_records sl where sl.profile_id=me and sl.status not in ('closed','cancelled')
    and daterange(sl.starts_on,coalesce(sl.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_on,coalesce(p_expected_end_on,'infinity'::date),'[]')) then
    raise exception 'overlapping_sick_leave' using errcode='23P01';
  end if;
  insert into public.sick_leave_records(organization_id,profile_id,starts_on,expected_end_on,end_unknown,certificate_status,certificate_required,employee_confirmation,status)
  values(org,me,p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status,p_certificate_status in ('required','pending'),true,'reported') returning id into result;
  perform private.create_notification(org,p.id,'sick_leave','Neue Abwesenheitsmeldung','Eine neue Abwesenheitsmeldung ist eingegangen.',
    '/app/sick-leave','sick-task:'||result::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
    and private.profile_can_view_sick_status(p.id,me,org);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'sick_leave.reported','sick_leave',result,jsonb_build_object('certificate_expected',p_certificate_status<>'not_required'));
  return result;
end;
$$;

create or replace function public.extend_sick_leave(p_record_id uuid, p_expected_end_on date, p_end_unknown boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); start_date date;
begin
  select starts_on into start_date from public.sick_leave_records where id=p_record_id and profile_id=me and organization_id=org and status not in ('closed','cancelled') for update;
  if start_date is null then raise exception 'record_not_extendable' using errcode='22023'; end if;
  if (p_end_unknown and p_expected_end_on is not null) or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<start_date)) then raise exception 'invalid_end_date' using errcode='22023'; end if;
  perform set_config('app.sick_workflow','allowed',true);
  update public.sick_leave_records set expected_end_on=p_expected_end_on,end_unknown=p_end_unknown,status='extended' where id=p_record_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'sick_leave.extended','sick_leave',p_record_id,'{}');
end;
$$;

create or replace function public.set_sick_leave_status(p_record_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); owner_id uuid;
begin
  if me is null or not private.has_permission('sick_leave.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('reported','confirmed','closed','cancelled') then raise exception 'invalid_status' using errcode='22023'; end if;
  select profile_id into owner_id from public.sick_leave_records where id=p_record_id and organization_id=org for update;
  if owner_id is null then raise exception 'record_not_found' using errcode='P0002'; end if;
  update public.sick_leave_records set status=p_status where id=p_record_id;
  perform private.create_notification(org,owner_id,'sick_leave_status','Krankmeldung aktualisiert',
    'Der Bearbeitungsstatus Ihrer Meldung wurde aktualisiert.','/app/sick-leave','sick-status:'||p_record_id::text||':'||p_status);
end;
$$;

-- Fleet ----------------------------------------------------------------------

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
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; old_mileage integer;
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
    if p_current_mileage<old_mileage then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
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
  values(org,me,'vehicle.saved','vehicle',result,jsonb_build_object('status',p_status,'assigned',p_assignee_id is not null));
  return result;
end;
$$;

create or replace function public.submit_mileage(
  p_vehicle_id uuid,
  p_mileage integer,
  p_read_on date,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; previous integer; result_status text:='submitted'; rejected_id uuid;
begin
  if me is null or not private.has_permission('mileage.submit_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_mileage<0 or p_read_on>current_date or p_read_on<current_date-interval '62 days' then raise exception 'invalid_mileage_submission' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||p_vehicle_id::text,0));
  if not exists (
    select 1 from public.vehicle_assignments va where va.vehicle_id=p_vehicle_id and va.profile_id=me and va.organization_id=org
      and va.valid_from<=p_read_on and (va.valid_until is null or va.valid_until>=p_read_on)
  ) then raise exception 'vehicle_not_assigned' using errcode='42501'; end if;
  if exists(select 1 from public.mileage_submissions ms where ms.vehicle_id=p_vehicle_id and ms.reporting_month=date_trunc('month',p_read_on)::date and ms.status<>'rejected') then
    raise exception 'monthly_submission_exists' using errcode='23505';
  end if;
  select id into rejected_id from public.mileage_submissions ms where ms.vehicle_id=p_vehicle_id and ms.profile_id=me
    and ms.reporting_month=date_trunc('month',p_read_on)::date and ms.status='rejected' for update;
  select ms.mileage into previous from public.mileage_submissions ms
    where ms.vehicle_id=p_vehicle_id and ms.status not in ('rejected') and ms.read_on<=p_read_on
    order by ms.read_on desc,ms.created_at desc limit 1;
  if previous is null then select current_mileage into previous from public.vehicles where id=p_vehicle_id and organization_id=org; end if;
  if previous is null then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
  if p_mileage<previous then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
  if p_mileage-previous>5000 then result_status:='flagged'; end if;
  if p_photo_path is not null and p_photo_path not like org::text||'/'||p_vehicle_id::text||'/%' then raise exception 'invalid_photo_path' using errcode='22023'; end if;
  if rejected_id is null then
    insert into public.mileage_submissions(organization_id,vehicle_id,profile_id,mileage,read_on,status,photo_path,previous_mileage,flagged_extreme_jump)
    values(org,p_vehicle_id,me,p_mileage,p_read_on,result_status,p_photo_path,previous,result_status='flagged') returning id into result;
  else
    update public.mileage_submissions set mileage=p_mileage,read_on=p_read_on,status=result_status,photo_path=p_photo_path,
      previous_mileage=previous,flagged_extreme_jump=result_status='flagged',reviewed_by=null,reviewed_at=null,review_note=null
    where id=rejected_id returning id into result;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'mileage.submitted','mileage_submission',result,jsonb_build_object('flagged',result_status='flagged'));
  return result;
end;
$$;

create or replace function public.review_mileage_submission(p_submission_id uuid, p_status text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.mileage_submissions%rowtype; prior integer;
begin
  if me is null or not private.has_permission('mileage.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('verified','rejected') then raise exception 'invalid_review_status' using errcode='22023'; end if;
  if p_status='rejected' and nullif(trim(p_comment),'') is null then raise exception 'rejection_reason_required' using errcode='22023'; end if;
  select * into target from public.mileage_submissions where id=p_submission_id and organization_id=org for update;
  if target.id is null or target.status not in ('submitted','flagged') then raise exception 'submission_not_reviewable' using errcode='22023'; end if;
  if p_status='verified' then
    select max(mileage) into prior from public.mileage_submissions where vehicle_id=target.vehicle_id and status='verified' and read_on<=target.read_on and id<>target.id;
    if prior is not null and target.mileage<prior then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
  end if;
  update public.mileage_submissions set status=p_status,reviewed_by=me,reviewed_at=now(),review_note=nullif(trim(p_comment),'') where id=target.id;
  if p_status='verified' then update public.vehicles set current_mileage=greatest(current_mileage,target.mileage) where id=target.vehicle_id; end if;
  perform private.create_notification(org,target.profile_id,'mileage_status','Kilometerstand geprüft',
    case when p_status='verified' then 'Ihre Kilometerstandsmeldung wurde bestätigt.' else 'Ihre Kilometerstandsmeldung wurde abgelehnt.' end,
    '/app/fleet','mileage-review:'||target.id::text||':'||p_status);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'mileage.reviewed','mileage_submission',target.id,jsonb_build_object('status',p_status));
end;
$$;

-- Material requests -----------------------------------------------------------

create or replace function public.save_material_request(
  p_request_id uuid,
  p_category text,
  p_item text,
  p_quantity numeric,
  p_unit text,
  p_priority text,
  p_needed_on date,
  p_reason text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; old_status text; primary_team uuid;
begin
  if me is null or not private.has_permission('materials.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('draft','submitted') or length(trim(p_category)) not between 1 and 80
    or length(trim(p_item)) not between 1 and 180 or p_quantity<=0 or length(trim(p_unit)) not between 1 and 40
    or p_priority not in ('low','normal','high','urgent') or length(coalesce(p_reason,''))>1000 then
    raise exception 'invalid_material_request' using errcode='22023';
  end if;
  select tm.team_id into primary_team from public.team_memberships tm
    where tm.profile_id=me and tm.organization_id=org and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    order by tm.valid_from desc limit 1;
  if p_request_id is null then
    insert into public.material_requests(organization_id,requester_id,team_id,category,item,title,quantity,unit,priority,needed_on,reason,status,submitted_at)
    values(org,me,primary_team,trim(p_category),trim(p_item),trim(p_item),p_quantity,trim(p_unit),p_priority,p_needed_on,nullif(trim(p_reason),''),p_status,
      case when p_status='submitted' then now() end) returning id into result;
    insert into public.material_request_items(organization_id,request_id,item_name,quantity,unit)
    values(org,result,trim(p_item),p_quantity,trim(p_unit));
  else
    select status into old_status from public.material_requests where id=p_request_id and requester_id=me and organization_id=org for update;
    if old_status is null or old_status<>'draft' then raise exception 'request_not_editable' using errcode='22023'; end if;
    update public.material_requests set category=trim(p_category),item=trim(p_item),title=trim(p_item),quantity=p_quantity,unit=trim(p_unit),
      priority=p_priority,needed_on=p_needed_on,reason=nullif(trim(p_reason),''),status=p_status,
      submitted_at=case when p_status='submitted' then now() else submitted_at end
    where id=p_request_id returning id into result;
    update public.material_request_items set item_name=trim(p_item),quantity=p_quantity,unit=trim(p_unit)
      where id=(select id from public.material_request_items where request_id=result order by created_at limit 1);
    if old_status<>p_status then
      insert into public.material_request_status_history(organization_id,material_request_id,from_status,to_status,actor_id)
      values(org,result,old_status,p_status,me);
    end if;
  end if;
  if p_status='submitted' then
    perform private.create_notification(org,p.id,'materials','Neue Materialanforderung','Eine Materialanforderung wartet auf Bearbeitung.',
      '/app/material-requests','material-task:'||result::text||':'||p.id::text)
    from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
      and exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id
        where ur.profile_id=p.id and ur.organization_id=org and rp.permission_key in ('materials.manage','materials.approve')
          and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now()));
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'material.saved','material_request',result,jsonb_build_object('status',p_status));
  return result;
end;
$$;

create or replace function public.create_material_request(
  p_category text,
  p_item text,
  p_quantity numeric,
  p_unit text,
  p_priority text,
  p_needed_on date,
  p_reason text
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.save_material_request(null,p_category,p_item,p_quantity,p_unit,p_priority,p_needed_on,p_reason,'submitted')
$$;

create or replace function public.set_material_request_status(p_request_id uuid, p_status text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.material_requests%rowtype; allowed boolean:=false;
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into target from public.material_requests where id=p_request_id and organization_id=org for update;
  if target.id is null then raise exception 'request_not_found' using errcode='P0002'; end if;
  if target.requester_id=me then
    allowed := (p_status='cancelled' and target.status in ('draft','submitted','review')) or (p_status='completed' and target.status='delivered');
  elsif private.has_permission('materials.manage') or private.has_permission('materials.approve') then
    allowed := case target.status
      when 'submitted' then p_status in ('review','approved','rejected','cancelled')
      when 'review' then p_status in ('approved','rejected','cancelled')
      when 'approved' then p_status in ('ordered','cancelled')
      when 'ordered' then p_status in ('partially_delivered','delivered','cancelled')
      when 'partially_delivered' then p_status in ('delivered','cancelled')
      when 'delivered' then p_status in ('completed')
      else false end;
  end if;
  if not allowed then raise exception 'invalid_status_transition' using errcode='22023'; end if;
  if p_status in ('rejected','cancelled') and nullif(trim(p_comment),'') is null then raise exception 'comment_required' using errcode='22023'; end if;
  update public.material_requests set status=p_status,
    closed_at=case when p_status in ('completed','cancelled','rejected') then now() else null end
  where id=target.id;
  insert into public.material_request_status_history(organization_id,material_request_id,from_status,to_status,actor_id,comment)
  values(org,target.id,target.status,p_status,me,nullif(trim(p_comment),''));
  perform private.create_notification(org,target.requester_id,'material_status','Materialanforderung aktualisiert',
    'Der Status Ihrer Materialanforderung wurde geändert.','/app/material-requests','material-status:'||target.id::text||':'||p_status);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'material.status_changed','material_request',target.id,jsonb_build_object('from',target.status,'to',p_status));
end;
$$;

-- Audited authorization for Edge Function signed downloads -------------------

create or replace function public.authorize_secure_download(p_bucket text, p_storage_path text, p_request_id uuid default gen_random_uuid())
returns table(allowed boolean, organization_id uuid, entity_type text, entity_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); allowed_value boolean:=false; kind text; target_id uuid; doc_id uuid; version_id uuid;
begin
  if me is null or p_storage_path not like org::text||'/%' then
    return query select false,org,null::text,null::uuid; return;
  end if;
  if p_bucket='sick-certificates' then
    select sl.id into target_id from public.sick_leave_document_versions sd
      join public.sick_leave_records sl on sl.id=sd.sick_leave_id and sl.organization_id=sd.organization_id
      where sd.storage_path=p_storage_path and sd.deleted_at is null and sd.organization_id=org
        and (sl.profile_id=me or private.has_permission('sick_leave.view_certificates'));
    kind:='sick_leave'; allowed_value:=target_id is not null;
  elsif p_bucket in ('documents','employee-documents') then
    select dv.document_id,dv.id into doc_id,version_id from public.document_versions dv
      where dv.storage_path=p_storage_path and dv.deleted_at is null and dv.organization_id=org and private.can_access_document(dv.document_id);
    target_id:=doc_id; kind:='document'; allowed_value:=target_id is not null;
    if allowed_value then
      insert into public.document_access_log(organization_id,document_id,version_id,profile_id,action,request_id)
      values(org,doc_id,version_id,me,'signed_url_created',p_request_id);
    end if;
  elsif p_bucket='message-attachments' then
    select ma.id into target_id from public.message_attachments ma where ma.storage_path=p_storage_path and ma.organization_id=org and private.is_conversation_member(ma.conversation_id);
    kind:='message_attachment'; allowed_value:=target_id is not null;
  elsif p_bucket='vehicle-files' then
    select v.id into target_id from public.vehicles v where v.id=((storage.foldername(p_storage_path))[2])::uuid and v.organization_id=org and private.can_access_vehicle(v.id);
    kind:='vehicle'; allowed_value:=target_id is not null;
  elsif p_bucket='material-request-files' then
    select mr.id into target_id from public.material_requests mr where mr.id=((storage.foldername(p_storage_path))[2])::uuid and mr.organization_id=org and private.can_access_material_request(mr.id);
    kind:='material_request'; allowed_value:=target_id is not null;
  end if;
  if allowed_value then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'file.signed_url_created',kind,target_id,p_request_id,jsonb_build_object('bucket',p_bucket));
  end if;
  return query select allowed_value,org,kind,target_id;
end;
$$;

-- Function privileges and Realtime -------------------------------------------

do $$
declare f record;
begin
  for f in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'my_permissions','get_my_profile','list_directory_entries','admin_list_users','update_own_profile',
      'list_leave_requests','list_sick_leave_records',
      'activate_my_profile','admin_create_invited_profile','admin_set_profile_status','admin_get_invite_target',
      'admin_lookup_invite_email','admin_begin_invite_resend',
      'set_user_role','set_user_team','set_role_permission',
      'get_or_create_direct_conversation','create_group_conversation','list_conversations','send_message','edit_message','retract_message',
      'mark_notification_read','mark_all_notifications_read','save_shift','acknowledge_shift','submit_leave_request',
      'withdraw_leave_request','decide_leave_request','report_sick_leave','extend_sick_leave','save_vehicle',
      'submit_mileage','review_mileage_submission','save_material_request','create_material_request',
      'set_material_request_status','authorize_secure_download','save_news_post','mark_news_opened','acknowledge_news','news_read_stats','set_sick_leave_status',
      'create_document_upload','create_employee_document_upload','finalize_document_upload','add_document_version','archive_document'
    )
  loop
    execute format('revoke all on function %I.%I(%s) from public',f.nspname,f.proname,f.args);
    execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
  end loop;
end;
$$;

revoke all on function public.publish_scheduled_news(uuid) from public,anon,authenticated;
grant execute on function public.publish_scheduled_news(uuid) to service_role;
revoke all on function public.bootstrap_first_admin(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text,text) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['messages','message_reactions','message_read_receipts','conversation_members','conversations','notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then execute format('alter publication supabase_realtime add table public.%I',table_name); end if;
  end loop;
end;
$$;
