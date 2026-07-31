-- Private, role-based and system document folders.

insert into public.permissions(key,description) values
  ('documents.manage_folders','Vorgegebene und rollenbasierte Dokumentordner verwalten'),
  ('documents.view_acknowledgements','Namen und Zeitpunkte von Dokumentbestätigungen anzeigen')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key in ('documents.manage_folders','documents.view_acknowledgements')
where r.system_key in ('super_admin','administration') on conflict do nothing;

alter table public.document_folders
  add column if not exists scope text not null default 'organization'
    check (scope in ('organization','personal','role')),
  add column if not exists owner_profile_id uuid references public.profiles on delete cascade;

create table if not exists public.document_folder_roles (
  folder_id uuid not null references public.document_folders on delete cascade,
  role_id uuid not null references public.roles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  primary key(folder_id,role_id)
);
alter table public.document_folder_roles enable row level security;

create or replace function private.can_access_document_folder(p_folder_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.document_folders f
    where f.id=p_folder_id and f.organization_id=private.current_organization_id()
      and f.archived_at is null and (
        f.scope='organization'
        or (f.scope='personal' and f.owner_profile_id=private.current_profile_id())
        or (f.scope='role' and exists (
          select 1 from public.document_folder_roles fr
          join public.user_roles ur on ur.role_id=fr.role_id
          join public.roles r on r.id=ur.role_id and r.active
          where fr.folder_id=f.id and ur.profile_id=private.current_profile_id()
            and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
        ))
        or private.has_permission('documents.manage_folders')
      )
  )
$$;

drop policy if exists document_folders_read on public.document_folders;
drop policy if exists document_folders_manage on public.document_folders;
create policy document_folders_read on public.document_folders for select
  using (private.can_access_document_folder(id));
create policy document_folders_admin_manage on public.document_folders for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'))
  with check (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'));
create policy document_folder_roles_read on public.document_folder_roles for select
  using (organization_id=private.current_organization_id() and private.can_access_document_folder(folder_id));
create policy document_folder_roles_manage on public.document_folder_roles for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'))
  with check (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'));

create or replace function public.create_document_folder(p_name text,p_scope text default 'personal',p_role_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or length(trim(p_name)) not between 1 and 120 then raise exception 'invalid_folder' using errcode='22023'; end if;
  if p_scope not in ('personal','role','organization') then raise exception 'invalid_folder_scope' using errcode='22023'; end if;
  if p_scope<>'personal' and not private.has_permission('documents.manage_folders') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_scope='role' and (p_role_id is null or not exists(select 1 from public.roles where id=p_role_id and organization_id=org and active)) then
    raise exception 'valid_role_required' using errcode='22023';
  end if;
  insert into public.document_folders(organization_id,name,created_by,scope,owner_profile_id)
  values(org,trim(p_name),me,p_scope,case when p_scope='personal' then me end) returning id into result;
  if p_scope='role' then insert into public.document_folder_roles(folder_id,role_id,organization_id) values(result,p_role_id,org); end if;
  return result;
end $$;

create or replace function private.can_manage_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.documents d where d.id=p_document_id and d.organization_id=private.current_organization_id() and (
    (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
    or private.has_permission('documents.manage_employee_files')
    or (d.sensitivity<>'employee_file' and d.visibility='personal' and d.owner_profile_id=private.current_profile_id()
      and private.has_permission('documents.view_own'))
  ))
$$;

create or replace function public.create_personal_document_upload(p_title text,p_folder_id uuid default null,p_category_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.view_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_title)) not between 2 and 180 then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_folder_id is not null and not private.can_access_document_folder(p_folder_id) then raise exception 'folder_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required)
  values(org,trim(p_title),'personal',me,me,'draft',p_folder_id,p_category_id,false) returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,profile_id) values(org,result,'profile',me);
  return result;
end $$;

drop policy if exists storage_documents_upload on storage.objects;
create policy storage_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='documents' and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists(select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and ((d.visibility='personal' and d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))
      or (d.visibility<>'personal' and private.has_permission('documents.manage'))))
);

drop policy if exists document_categories_read on public.document_categories;
create policy document_categories_read on public.document_categories for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.view_own') or private.has_permission('documents.manage')));
drop policy if exists document_acknowledgements_read on public.document_acknowledgements;
create policy document_acknowledgements_read on public.document_acknowledgements for select
  using (organization_id=private.current_organization_id() and (
    profile_id=private.current_profile_id()
    or (private.has_permission('documents.view_acknowledgements') and private.can_access_document(document_id))
  ));

revoke all on function public.create_document_folder(text,text,uuid) from public;
revoke all on function public.create_personal_document_upload(text,uuid,uuid) from public;
grant execute on function public.create_document_folder(text,text,uuid) to authenticated;
grant execute on function public.create_personal_document_upload(text,uuid,uuid) to authenticated;
