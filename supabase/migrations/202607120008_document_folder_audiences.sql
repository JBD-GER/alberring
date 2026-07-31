-- Folder visibility is independently assignable and role folders enforce the
-- same role audience for every document filed into them.

insert into public.permissions(key,description)
values('documents.view_folders','Dokumentordner anzeigen')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_key)
select distinct r.id,'documents.view_folders'
from public.roles r
join public.role_permissions rp on rp.role_id=r.id
where rp.permission_key in ('documents.view_own','documents.view_shared','documents.manage')
on conflict do nothing;

create or replace function private.can_access_document_folder(p_folder_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.document_folders f
    where f.id=p_folder_id and f.organization_id=private.current_organization_id()
      and f.archived_at is null and (
        private.has_permission('documents.manage_folders')
        or (private.has_permission('documents.view_folders') and (
          f.scope='organization'
          or (f.scope='personal' and f.owner_profile_id=private.current_profile_id())
          or (f.scope='role' and exists (
            select 1 from public.document_folder_roles fr
            join public.user_roles ur on ur.role_id=fr.role_id
            join public.roles r on r.id=ur.role_id and r.active
            where fr.folder_id=f.id and ur.profile_id=private.current_profile_id()
              and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
          ))
        ))
      )
  )
$$;

create or replace function private.apply_folder_document_audience()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare target_role uuid;
begin
  select fr.role_id into target_role
  from public.documents d
  join public.document_folders f on f.id=d.folder_id and f.scope='role'
  join public.document_folder_roles fr on fr.folder_id=f.id
  where d.id=new.document_id and f.organization_id=new.organization_id
  order by fr.role_id limit 1;
  if target_role is not null then
    new.audience_type:='role'; new.role_id:=target_role;
    new.team_id:=null; new.location_id:=null; new.profile_id:=null;
  end if;
  return new;
end $$;

drop trigger if exists apply_folder_document_audience on public.document_audiences;
create trigger apply_folder_document_audience before insert on public.document_audiences
for each row execute function private.apply_folder_document_audience();

