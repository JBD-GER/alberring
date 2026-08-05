-- Bind every chat object to an active message from the uploader. Storage read
-- access additionally requires the corresponding, internally consistent
-- message_attachments row, so raw object paths cannot bypass message metadata.

create or replace function private.has_message_storage_reference(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.message_attachments attachment
    where attachment.storage_path=$1
  )
$$;

revoke all on function private.has_message_storage_reference(text)
  from public, anon, authenticated, service_role;
grant execute on function private.has_message_storage_reference(text)
  to authenticated;

create index if not exists
  sick_leave_documents_active_storage_path_idx
  on public.sick_leave_document_versions(storage_path)
  where deleted_at is null;
create index if not exists mileage_submissions_photo_path_idx
  on public.mileage_submissions(photo_path)
  where photo_path is not null;
create index if not exists material_requests_attachment_path_idx
  on public.material_requests(attachment_path)
  where attachment_path is not null;

create or replace function private.has_sick_certificate_storage_reference(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.sick_leave_document_versions document
    where document.storage_path=$1
      and document.deleted_at is null
  )
$$;

create or replace function private.has_vehicle_storage_reference(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.mileage_submissions submission
    where submission.photo_path=$1
  ) or exists (
    select 1
    from public.vehicle_documents document
    where document.storage_path=$1
      and document.archived_at is null
  )
$$;

create or replace function private.has_material_storage_reference(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.material_requests request
    where request.attachment_path=$1
  )
$$;

revoke all on function
  private.has_sick_certificate_storage_reference(text),
  private.has_vehicle_storage_reference(text),
  private.has_material_storage_reference(text)
  from public, anon, authenticated, service_role;
grant execute on function
  private.has_sick_certificate_storage_reference(text),
  private.has_vehicle_storage_reference(text),
  private.has_material_storage_reference(text)
  to authenticated;

drop policy if exists storage_message_read on storage.objects;
create policy storage_message_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id='message-attachments'
    and (storage.foldername(name))[1]=private.current_organization_id()::text
    and exists (
      select 1
      from public.message_attachments ma
      join public.messages attached_message
        on attached_message.id=ma.message_id
        and attached_message.conversation_id=ma.conversation_id
        and attached_message.organization_id=ma.organization_id
        and attached_message.sender_id=ma.uploaded_by
        and attached_message.retracted_at is null
      where ma.storage_path=storage.objects.name
        and ma.organization_id=private.current_organization_id()
        and ma.message_id is not null
        and ma.storage_path like
          ma.organization_id::text||'/'||ma.conversation_id::text||'/'||
          ma.message_id::text||'/%'
        and private.can_access_message_attachment(
          ma.conversation_id,
          ma.message_id
        )
    )
  );

drop policy if exists storage_message_upload on storage.objects;
create policy storage_message_upload
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id='message-attachments'
    and (storage.foldername(name))[1]=private.current_organization_id()::text
    and exists (
      select 1
      from public.messages target_message
      join public.organization_settings settings
        on settings.organization_id=target_message.organization_id
      where target_message.id=((storage.foldername(name))[3])::uuid
        and target_message.conversation_id=
          ((storage.foldername(name))[2])::uuid
        and target_message.organization_id=private.current_organization_id()
        and target_message.sender_id=private.current_profile_id()
        and target_message.retracted_at is null
        and target_message.created_at>
          now()-make_interval(mins=>settings.message_edit_window_minutes)
        and private.can_post_conversation(target_message.conversation_id)
    )
  );

drop policy if exists storage_message_cleanup on storage.objects;
create policy storage_message_cleanup
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='message-attachments'
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=private.current_organization_id()::text
    and not private.has_message_storage_reference(storage.objects.name)
  );

drop policy if exists storage_employee_documents_delete
  on storage.objects;
create policy storage_employee_documents_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='employee-documents'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and private.has_permission('documents.manage_employee_files')
    and not private.has_active_document_storage_reference(
      storage.objects.name
    )
  );

drop policy if exists storage_certificates_cleanup on storage.objects;
create policy storage_certificates_cleanup
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='sick-certificates'
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and not private.has_sick_certificate_storage_reference(
      storage.objects.name
    )
  );

drop policy if exists storage_vehicle_delete on storage.objects;
create policy storage_vehicle_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='vehicle-files'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and private.has_permission('fleet.manage')
    and not private.has_vehicle_storage_reference(storage.objects.name)
  );

drop policy if exists storage_vehicle_cleanup on storage.objects;
create policy storage_vehicle_cleanup
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='vehicle-files'
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and not private.has_vehicle_storage_reference(storage.objects.name)
  );

drop policy if exists storage_material_delete on storage.objects;
create policy storage_material_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='material-request-files'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and private.has_permission('materials.manage')
    and not private.has_material_storage_reference(storage.objects.name)
  );

drop policy if exists storage_material_cleanup on storage.objects;
create policy storage_material_cleanup
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='material-request-files'
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and not private.has_material_storage_reference(storage.objects.name)
  );

-- PostgreSQL also applies SELECT policies while locating DELETE targets.
-- Restrict this visibility to Storage's concrete delete operations; the
-- generic Storage transaction flag is also present during GET and LIST.
drop policy if exists storage_owner_cleanup_visibility on storage.objects;
create policy storage_owner_cleanup_visibility
  on storage.objects
  for select
  to authenticated
  using (
    storage.operation()=any(array[
      'storage.object.delete',
      'storage.object.delete_many',
      'storage.s3.object.delete',
      'storage.s3.object.delete_many'
    ])
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=
      private.current_organization_id()::text
    and (
      (
        bucket_id='message-attachments'
        and not private.has_message_storage_reference(name)
      )
      or (
        bucket_id='documents'
        and not private.has_active_document_storage_reference(name)
      )
      or (
        bucket_id='sick-certificates'
        and not private.has_sick_certificate_storage_reference(name)
      )
      or (
        bucket_id='vehicle-files'
        and not private.has_vehicle_storage_reference(name)
      )
      or (
        bucket_id='material-request-files'
        and not private.has_material_storage_reference(name)
      )
    )
  );

-- Metadata cannot be attached retroactively after the configured edit window.
drop policy if exists message_attachments_member_insert
  on public.message_attachments;
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
      join public.organization_settings settings
        on settings.organization_id=attached_message.organization_id
      where attached_message.id=message_attachments.message_id
        and attached_message.conversation_id=
          message_attachments.conversation_id
        and attached_message.organization_id=
          message_attachments.organization_id
        and attached_message.sender_id=message_attachments.uploaded_by
        and attached_message.retracted_at is null
        and attached_message.created_at>
          now()-make_interval(mins=>settings.message_edit_window_minutes)
    )
  );

-- Supabase grants broad privileges to Data API roles by default. Anonymous
-- users need no public application tables, and RLS does not protect TRUNCATE.
revoke all privileges on all tables in schema public from anon;
revoke truncate, references, trigger, maintain on all tables in schema public
  from authenticated;
revoke all privileges on all sequences in schema public from anon;

-- New objects must opt into Data API access explicitly instead of inheriting
-- broad table/function/sequence privileges from either migration owner.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
-- Function EXECUTE is granted to PUBLIC by PostgreSQL's global built-in
-- default. A schema-local revoke cannot override that global grant.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

notify pgrst, 'reload schema';
