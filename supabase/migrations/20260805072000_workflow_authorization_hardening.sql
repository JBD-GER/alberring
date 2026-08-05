-- Close authorization paths that could bypass the audited workflow RPCs.

-- The HR-specific permission applies only to explicit employee files. It must
-- not grant mutation access to ordinary organization, team or personal files.
create or replace function private.can_manage_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.documents d
    where d.id=p_document_id
      and d.organization_id=private.current_organization_id()
      and (
        (
          d.sensitivity<>'employee_file'
          and d.visibility<>'personal'
          and private.has_permission('documents.manage')
        )
        or (
          d.sensitivity='employee_file'
          and private.has_permission('documents.manage_employee_files')
        )
        or (
          d.sensitivity<>'employee_file'
          and d.visibility='personal'
          and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.view_own')
        )
      )
  )
$$;

-- An attachment is part of exactly one message from its uploader. Binding the
-- storage path to the same tenant/conversation/message also prevents a valid
-- metadata row from being used to sign an object from another conversation.
drop policy if exists message_attachments_member_read on public.message_attachments;
create policy message_attachments_member_read
on public.message_attachments
for select
to authenticated
using (
  message_attachments.organization_id=private.current_organization_id()
  and message_attachments.message_id is not null
  and message_attachments.storage_path like
    message_attachments.organization_id::text||'/'||
    message_attachments.conversation_id::text||'/'||
    message_attachments.message_id::text||'/%'
  and exists (
    select 1
    from public.messages attached_message
    where attached_message.id=message_attachments.message_id
      and attached_message.conversation_id=message_attachments.conversation_id
      and attached_message.organization_id=message_attachments.organization_id
      and attached_message.sender_id=message_attachments.uploaded_by
      and attached_message.retracted_at is null
  )
  and private.can_access_message_attachment(
    message_attachments.conversation_id,
    message_attachments.message_id
  )
);

drop policy if exists message_attachments_member_insert on public.message_attachments;
create policy message_attachments_member_insert
on public.message_attachments
for insert
to authenticated
with check (
  message_attachments.organization_id=private.current_organization_id()
  and message_attachments.uploaded_by=private.current_profile_id()
  and message_attachments.message_id is not null
  and message_attachments.storage_path like
    message_attachments.organization_id::text||'/'||
    message_attachments.conversation_id::text||'/'||
    message_attachments.message_id::text||'/%'
  and private.can_post_conversation(message_attachments.conversation_id)
  and exists (
    select 1
    from public.messages attached_message
    where attached_message.id=message_attachments.message_id
      and attached_message.conversation_id=message_attachments.conversation_id
      and attached_message.organization_id=message_attachments.organization_id
      and attached_message.sender_id=message_attachments.uploaded_by
      and attached_message.retracted_at is null
  )
);

create or replace function public.authorize_secure_download(
  p_bucket text,
  p_storage_path text,
  p_request_id uuid default gen_random_uuid()
)
returns table(allowed boolean, organization_id uuid, entity_type text, entity_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  allowed_value boolean:=false;
  kind text;
  target_id uuid;
  doc_id uuid;
  version_id uuid;
begin
  if me is null or p_storage_path not like org::text||'/%' then
    return query select false,org,null::text,null::uuid;
    return;
  end if;
  if p_bucket='sick-certificates' then
    select sl.id into target_id
    from public.sick_leave_document_versions sd
    join public.sick_leave_records sl
      on sl.id=sd.sick_leave_id and sl.organization_id=sd.organization_id
    where sd.storage_path=p_storage_path
      and sd.deleted_at is null
      and sd.organization_id=org
      and (
        sl.profile_id=me
        or private.has_permission('sick_leave.view_certificates')
      );
    kind:='sick_leave';
    allowed_value:=target_id is not null;
  elsif p_bucket in ('documents','employee-documents') then
    select dv.document_id,dv.id into doc_id,version_id
    from public.document_versions dv
    where dv.storage_path=p_storage_path
      and dv.deleted_at is null
      and dv.organization_id=org
      and private.can_access_document(dv.document_id);
    target_id:=doc_id;
    kind:='document';
    allowed_value:=target_id is not null;
    if allowed_value then
      insert into public.document_access_log(
        organization_id,document_id,version_id,profile_id,action,request_id
      ) values(org,doc_id,version_id,me,'signed_url_created',p_request_id);
    end if;
  elsif p_bucket='message-attachments' then
    select ma.id into target_id
    from public.message_attachments ma
    join public.messages attached_message
      on attached_message.id=ma.message_id
      and attached_message.conversation_id=ma.conversation_id
      and attached_message.organization_id=ma.organization_id
      and attached_message.sender_id=ma.uploaded_by
      and attached_message.retracted_at is null
    where ma.storage_path=p_storage_path
      and ma.organization_id=org
      and ma.message_id is not null
      and ma.storage_path like
        ma.organization_id::text||'/'||ma.conversation_id::text||'/'||
        ma.message_id::text||'/%'
      and private.can_access_message_attachment(
        ma.conversation_id,
        ma.message_id
      );
    kind:='message_attachment';
    allowed_value:=target_id is not null;
  elsif p_bucket='vehicle-files' then
    select v.id into target_id
    from public.vehicles v
    where v.id=((storage.foldername(p_storage_path))[2])::uuid
      and v.organization_id=org
      and private.can_access_vehicle(v.id);
    kind:='vehicle';
    allowed_value:=target_id is not null;
  elsif p_bucket='material-request-files' then
    select mr.id into target_id
    from public.material_requests mr
    where mr.id=((storage.foldername(p_storage_path))[2])::uuid
      and mr.organization_id=org
      and private.can_access_material_request(mr.id);
    kind:='material_request';
    allowed_value:=target_id is not null;
  end if;
  if allowed_value then
    insert into public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,request_id,metadata
    ) values(
      org,me,'file.signed_url_created',kind,target_id,p_request_id,
      jsonb_build_object('bucket',p_bucket)
    );
  end if;
  return query select allowed_value,org,kind,target_id;
end;
$$;

-- These core objects are mutated only by SECURITY DEFINER workflows in the
-- client. Direct DML would skip permission transitions, conflict validation,
-- notifications and audit logging.
revoke insert, update, delete on table public.shifts from authenticated;
revoke insert, update, delete on table public.shift_assignments from authenticated;
revoke update on table public.mileage_submissions from authenticated;
revoke insert, update, delete on table public.messages from authenticated;
revoke insert, update, delete on table public.vehicles from authenticated;
revoke insert, update, delete on table public.vehicle_assignments from authenticated;

-- A vehicle assignment must never pair a local tenant marker with a vehicle or
-- profile from another tenant.
alter table public.vehicle_assignments
  drop constraint if exists vehicle_assignments_vehicle_organization_fkey;
alter table public.vehicle_assignments
  drop constraint if exists vehicle_assignments_profile_organization_fkey;
alter table public.vehicles
  drop constraint if exists vehicles_id_organization_unique;
alter table public.vehicles
  add constraint vehicles_id_organization_unique unique(id,organization_id);
alter table public.vehicle_assignments
  add constraint vehicle_assignments_vehicle_organization_fkey
  foreign key(vehicle_id,organization_id)
  references public.vehicles(id,organization_id)
  not valid;
alter table public.vehicle_assignments
  validate constraint vehicle_assignments_vehicle_organization_fkey;
alter table public.vehicle_assignments
  add constraint vehicle_assignments_profile_organization_fkey
  foreign key(profile_id,organization_id)
  references public.profiles(id,organization_id)
  not valid;
alter table public.vehicle_assignments
  validate constraint vehicle_assignments_profile_organization_fkey;

-- Correlate every directory relation to the profile tenant even if privileged
-- maintenance code ever writes a malformed foreign identifier.
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
  if not private.has_permission('directory.view') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  select
    p.id,p.display_name,p.email,p.avatar_url,ep.work_phone,ep.job_title,
    d.name,l.name,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'name',t.name,
          'location_name',coalesce(tl.name,t.location_name)
        ) order by t.name
      )
      from public.team_memberships tm
      join public.teams t
        on t.id=tm.team_id
        and t.organization_id=tm.organization_id
        and t.organization_id=p.organization_id
        and t.active
      left join public.locations tl
        on tl.id=t.location_id
        and tl.organization_id=t.organization_id
      where tm.profile_id=p.id
        and tm.organization_id=p.organization_id
        and tm.valid_from<=current_date
        and (tm.valid_until is null or tm.valid_until>=current_date)
    ),'[]'::jsonb)
  from public.profiles p
  left join public.employee_profiles ep
    on ep.profile_id=p.id and ep.organization_id=p.organization_id
  left join public.departments d
    on d.id=ep.department_id and d.organization_id=p.organization_id
  left join public.locations l
    on l.id=ep.location_id and l.organization_id=p.organization_id
  where p.organization_id=private.current_organization_id()
    and p.status='active'
    and (
      nullif(trim(p_search),'') is null
      or concat_ws(' ',p.display_name,p.email,ep.job_title,d.name,l.name)
        ilike '%'||trim(p_search)||'%'
      or exists (
        select 1
        from public.team_memberships tm
        join public.teams t
          on t.id=tm.team_id
          and t.organization_id=tm.organization_id
        where tm.profile_id=p.id
          and tm.organization_id=p.organization_id
          and t.name ilike '%'||trim(p_search)||'%'
      )
    )
  order by p.display_name;
end;
$$;

notify pgrst, 'reload schema';
