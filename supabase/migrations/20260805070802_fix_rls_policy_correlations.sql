-- Correlate RLS subqueries explicitly with the row currently being checked.
-- Unqualified column names inside the subqueries previously resolved to the
-- inner relation, weakening the acknowledgement and deletion guards.

drop policy if exists shift_acknowledgements_own_insert
  on public.shift_acknowledgements;
create policy shift_acknowledgements_own_insert
  on public.shift_acknowledgements
  for insert
  with check (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.has_permission('schedule.view_own')
    and exists (
      select 1
      from public.shift_assignments sa
      where sa.shift_id=shift_acknowledgements.shift_id
        and sa.profile_id=private.current_profile_id()
        and sa.organization_id=shift_acknowledgements.organization_id
    )
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete
  on public.documents
  for delete
  using (
    organization_id=private.current_organization_id()
    and (
      (
        sensitivity<>'employee_file'
        and visibility<>'personal'
        and private.has_permission('documents.manage')
      )
      or (
        (sensitivity='employee_file' or visibility='personal')
        and (
          private.has_permission('documents.manage_employee_files')
          or (
            sensitivity<>'employee_file'
            and owner_profile_id=private.current_profile_id()
            and private.has_permission('documents.manage')
            and private.has_permission('documents.view_own')
          )
        )
      )
    )
    and (
      status='draft'
      or (
        created_by=private.current_profile_id()
        and created_at>now()-interval '15 minutes'
        and not exists (
          select 1
          from public.document_versions dv
          where dv.document_id=documents.id
        )
      )
    )
  );
