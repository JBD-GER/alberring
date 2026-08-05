-- Keep initial-upload cleanup atomic from the database's perspective. Storage
-- objects may only be removed after this RPC has deleted the matching draft
-- and any document-version rows that still reference the object.

create index if not exists document_versions_active_storage_path_idx
  on public.document_versions(storage_path)
  where deleted_at is null;

create or replace function private.has_active_document_storage_reference(
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
    from public.document_versions dv
    where dv.storage_path=$1
      and dv.deleted_at is null
  )
$$;

create or replace function public.discard_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  target public.documents%rowtype;
begin
  if me is null or org is null then
    raise exception 'permission_denied' using errcode='42501';
  end if;

  select d.*
  into target
  from public.documents d
  where d.id=p_document_id
    and d.organization_id=org
    and d.created_by=me
  for update;

  if target.id is null
    or target.status<>'draft'
    or target.created_at<=now()-interval '15 minutes'
    or not private.can_manage_document(target.id) then
    raise exception 'document_upload_not_discardable' using errcode='22023';
  end if;

  delete from public.documents d
  where d.id=target.id
    and d.organization_id=org;
end;
$$;

revoke all on function private.has_active_document_storage_reference(text)
  from public, anon, authenticated, service_role;
grant execute on function private.has_active_document_storage_reference(text)
  to authenticated;

revoke all on function public.discard_document_upload(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.discard_document_upload(uuid)
  to authenticated;

-- Direct table deletion cannot enforce the required database-first cleanup
-- order. All authenticated cleanup therefore goes through the RPC above.
revoke delete on table public.documents
  from anon, authenticated;

drop policy if exists storage_documents_delete on storage.objects;
create policy storage_documents_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id='documents'
    and owner_id=(select auth.uid()::text)
    and created_at>now()-interval '15 minutes'
    and (storage.foldername(name))[1]=private.current_organization_id()::text
    and not private.has_active_document_storage_reference(storage.objects.name)
  );
