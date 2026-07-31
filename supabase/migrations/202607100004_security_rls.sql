-- Alberring Connect: tenant isolation, least-privilege RLS and Storage policies.

-- Harden the identity/permission helpers first. All authorization derives from
-- auth.uid(), an active profile and an active organization.
create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status='active'
  limit 1
$$;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status='active'
  limit 1
$$;

create or replace function private.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id=p.organization_id and o.active
    join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
    join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
    join public.role_permissions rp on rp.role_id=r.id
    where p.auth_user_id=auth.uid()
      and p.status='active'
      and rp.permission_key=$1
      and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now())
  )
$$;

create or replace function public.my_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct rp.permission_key
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
  join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
  join public.role_permissions rp on rp.role_id=r.id
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and ur.valid_from<=now()
    and (ur.valid_until is null or ur.valid_until>now())
$$;

create or replace function private.is_same_org_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=p_profile_id
      and p.organization_id=private.current_organization_id()
      and p.status<>'archived'
  )
$$;

create or replace function private.is_team_member(p_team_id uuid, p_profile_id uuid default private.current_profile_id())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id
    where tm.team_id=p_team_id
      and tm.profile_id=p_profile_id
      and tm.organization_id=private.current_organization_id()
      and tm.valid_from<=current_date
      and (tm.valid_until is null or tm.valid_until>=current_date)
      and t.active
  )
$$;

create or replace function private.can_view_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_team_member(p_team_id)
      or exists (
        select 1 from public.teams t
        where t.id=p_team_id
          and t.organization_id=private.current_organization_id()
          and t.active
          and t.lead_profile_id=private.current_profile_id()
      )
$$;

create or replace function private.can_view_profile_team(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_permission('leave.manage')
      or exists (
        select 1 from public.team_memberships tm
        where tm.profile_id=p_profile_id
          and tm.organization_id=private.current_organization_id()
          and tm.valid_from<=current_date
          and (tm.valid_until is null or tm.valid_until>=current_date)
          and private.can_view_team(tm.team_id)
      )
$$;

-- Permission checks for a specific profile are used only by server-side
-- recipient selection. Keeping this separate from auth.uid()-based checks
-- prevents notifications from leaking the existence of an absence to users
-- who cannot open the corresponding record.
create or replace function private.profile_has_permission(
  p_profile_id uuid,
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id=p.organization_id and o.active
    join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
    join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
    join public.role_permissions rp on rp.role_id=r.id
    where p.id=p_profile_id
      and p.organization_id=p_organization_id
      and p.status='active'
      and rp.permission_key=p_permission_key
      and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now())
  )
$$;

create or replace function private.profile_can_view_sick_status(
  p_viewer_id uuid,
  p_subject_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_has_permission(p_viewer_id,p_organization_id,'sick_leave.manage')
      or (
        private.profile_has_permission(p_viewer_id,p_organization_id,'sick_leave.view_status')
        and (
          private.profile_has_permission(p_viewer_id,p_organization_id,'schedule.manage')
          or private.profile_has_permission(p_viewer_id,p_organization_id,'leave.manage')
          or private.profile_has_permission(p_viewer_id,p_organization_id,'users.manage')
          or exists (
            select 1
            from public.team_memberships subject_tm
            join public.teams t on t.id=subject_tm.team_id
              and t.organization_id=subject_tm.organization_id and t.active
            where subject_tm.profile_id=p_subject_id
              and subject_tm.organization_id=p_organization_id
              and subject_tm.valid_from<=current_date
              and (subject_tm.valid_until is null or subject_tm.valid_until>=current_date)
              and (
                t.lead_profile_id=p_viewer_id
                or exists (
                  select 1 from public.team_memberships viewer_tm
                  where viewer_tm.team_id=subject_tm.team_id
                    and viewer_tm.profile_id=p_viewer_id
                    and viewer_tm.organization_id=p_organization_id
                    and viewer_tm.valid_from<=current_date
                    and (viewer_tm.valid_until is null or viewer_tm.valid_until>=current_date)
                )
              )
          )
        )
      )
$$;

create or replace function private.can_view_sick_status(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_can_view_sick_status(
    private.current_profile_id(),p_profile_id,private.current_organization_id()
  )
$$;

create or replace function private.is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_permission('messages.use') and exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id=cm.conversation_id and c.organization_id=cm.organization_id
    where cm.conversation_id=cid
      and cm.profile_id=private.current_profile_id()
      and cm.organization_id=private.current_organization_id()
  )
$$;

create or replace function private.can_post_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id=p_conversation_id
      and c.organization_id=private.current_organization_id()
      and c.archived_at is null
      and private.is_conversation_member(c.id)
      and private.has_permission('messages.use')
      and (
        not c.posting_restricted
        or c.created_by=private.current_profile_id()
        or private.has_permission('messages.moderate')
        or (c.team_id is not null and exists (
          select 1 from public.teams t where t.id=c.team_id and t.lead_profile_id=private.current_profile_id()
        ))
      )
  )
$$;

create or replace function private.can_access_message_attachment(p_conversation_id uuid, p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_conversation_member(p_conversation_id)
    and exists(select 1 from public.messages m where m.id=p_message_id and m.conversation_id=p_conversation_id and m.retracted_at is null)
$$;

create or replace function private.is_news_audience(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    not exists (select 1 from public.news_audiences na where na.news_id=p_news_id)
    or exists (
      select 1
      from public.news_audiences na
      where na.news_id=p_news_id
        and na.organization_id=private.current_organization_id()
        and (
          na.audience_type='organization'
          or (na.audience_type='profile' and na.profile_id=private.current_profile_id())
          or (na.audience_type='team' and private.is_team_member(na.team_id))
          or (na.audience_type='location' and exists (
            select 1 from public.employee_profiles ep
            where ep.profile_id=private.current_profile_id() and ep.location_id=na.location_id
          ))
          or (na.audience_type='role' and exists (
            select 1 from public.user_roles ur
            join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
            where ur.profile_id=private.current_profile_id()
              and ur.organization_id=private.current_organization_id()
              and ur.role_id=na.role_id
              and ur.valid_from<=now()
              and (ur.valid_until is null or ur.valid_until>now())
          ))
        )
    )
$$;

create or replace function private.can_access_news(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.news_posts n
    where n.id=p_news_id
      and n.organization_id=private.current_organization_id()
      and (
        private.has_permission('news.manage')
        or (n.author_id=private.current_profile_id() and private.has_permission('news.create'))
        or (
          private.has_permission('news.view')
          and n.status='published'
          and coalesce(n.published_at, n.created_at)<=now()
          and (n.expires_at is null or n.expires_at>now())
          and private.is_news_audience(n.id)
        )
      )
  )
$$;

create or replace function private.profile_is_document_audience(
  p_viewer_id uuid,
  p_document_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.document_audiences da
    where da.document_id=p_document_id
      and da.organization_id=p_organization_id
      and (
        da.audience_type='organization'
        or (da.audience_type='profile' and da.profile_id=p_viewer_id)
        or (da.audience_type='team' and exists (
          select 1 from public.team_memberships tm
          join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id and t.active
          where tm.team_id=da.team_id and tm.profile_id=p_viewer_id and tm.organization_id=p_organization_id
            and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
        ))
        or (da.audience_type='location' and exists (
          select 1 from public.employee_profiles ep
          where ep.profile_id=p_viewer_id and ep.organization_id=p_organization_id and ep.location_id=da.location_id
        ))
        or (da.audience_type='role' and exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
          where ur.profile_id=p_viewer_id
            and ur.organization_id=p_organization_id
            and ur.role_id=da.role_id
            and ur.valid_from<=now()
            and (ur.valid_until is null or ur.valid_until>now())
        ))
      )
  )
$$;

create or replace function private.is_document_audience(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_is_document_audience(
    private.current_profile_id(),p_document_id,private.current_organization_id()
  )
$$;

create or replace function private.profile_can_access_document(
  p_viewer_id uuid,
  p_document_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.documents d
    where d.id=p_document_id and d.organization_id=p_organization_id and d.archived_at is null
      and (
        (
          (d.sensitivity='employee_file' or d.visibility='personal')
          and (
            private.profile_has_permission(p_viewer_id,p_organization_id,'documents.manage_employee_files')
            or (d.owner_profile_id=p_viewer_id and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_own'))
          )
        )
        or (
          d.sensitivity<>'employee_file' and d.visibility<>'personal'
          and (
            private.profile_has_permission(p_viewer_id,p_organization_id,'documents.manage')
            or (d.owner_profile_id=p_viewer_id and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_own'))
            or (
              d.status='published' and d.visibility in ('organization','team')
              and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_shared')
              and (d.valid_from is null or d.valid_from<=now()) and (d.valid_until is null or d.valid_until>now())
              and (
                (d.visibility='organization' and not exists(select 1 from public.document_audiences da where da.document_id=d.id))
                or private.profile_is_document_audience(p_viewer_id,d.id,p_organization_id)
              )
            )
          )
        )
      )
  )
$$;

create or replace function private.can_access_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_can_access_document(
    private.current_profile_id(),p_document_id,private.current_organization_id()
  )
$$;

create or replace function private.can_access_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id=p_vehicle_id and v.organization_id=private.current_organization_id()
      and (
        private.has_permission('fleet.view_all')
        or private.has_permission('fleet.manage')
        or (private.has_permission('fleet.view_own') and exists (
          select 1 from public.vehicle_assignments va
          where va.vehicle_id=v.id and va.profile_id=private.current_profile_id()
            and va.organization_id=v.organization_id and va.valid_from<=current_date
            and (va.valid_until is null or va.valid_until>=current_date)
        ))
      )
  )
$$;

create or replace function private.is_shift_assignee(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shift_assignments sa
    where sa.shift_id=p_shift_id
      and sa.profile_id=private.current_profile_id()
      and sa.organization_id=private.current_organization_id()
  )
$$;

create or replace function private.can_view_shift_team(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shifts s
    where s.id=p_shift_id
      and s.organization_id=private.current_organization_id()
      and (s.team_id is null or private.can_view_team(s.team_id))
  )
$$;

create or replace function private.can_access_material_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.material_requests mr
    where mr.id=p_request_id
      and mr.organization_id=private.current_organization_id()
      and (
        mr.requester_id=private.current_profile_id()
        or (mr.status<>'draft' and (
          private.has_permission('materials.manage')
          or private.has_permission('materials.approve')
          or (private.has_permission('materials.view_team') and mr.team_id is not null and private.can_view_team(mr.team_id))
        ))
      )
  )
$$;

-- Reset the initial placeholder policies and rebuild one complete policy set.
do $$
declare
  p record;
  t record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Organization and people ----------------------------------------------------
create policy organizations_read on public.organizations for select
  using (id=private.current_organization_id());
create policy organizations_manage on public.organizations for update
  using (id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (id=private.current_organization_id());

create policy organization_settings_read on public.organization_settings for select
  using (organization_id=private.current_organization_id());
create policy organization_settings_manage on public.organization_settings for update
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());

create policy profiles_read on public.profiles for select
  using (
    organization_id=private.current_organization_id()
    and (
      id=private.current_profile_id()
      or (status='active' and private.has_permission('directory.view'))
      or private.has_permission('users.view')
    )
  );

create policy employee_profiles_read on public.employee_profiles for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.has_permission('directory.view') or private.has_permission('users.view'))
  );
create policy employee_profiles_manage on public.employee_profiles for all
  using (organization_id=private.current_organization_id() and private.has_permission('users.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));

create policy departments_read on public.departments for select
  using (organization_id=private.current_organization_id());
create policy departments_manage on public.departments for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());
create policy locations_read on public.locations for select
  using (organization_id=private.current_organization_id());
create policy locations_manage on public.locations for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());

create policy teams_read on public.teams for select
  using (organization_id=private.current_organization_id());
create policy teams_manage on public.teams for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());
create policy team_memberships_read on public.team_memberships for select
  using (organization_id=private.current_organization_id());
create policy team_memberships_manage on public.team_memberships for all
  using (organization_id=private.current_organization_id() and (private.has_permission('teams.manage') or private.has_permission('users.manage')))
  with check (
    organization_id=private.current_organization_id()
    and private.is_same_org_profile(profile_id)
    and exists (select 1 from public.teams t where t.id=team_id and t.organization_id=private.current_organization_id())
  );

create policy permissions_read on public.permissions for select
  using (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage'));
create policy roles_read on public.roles for select
  using (organization_id=private.current_organization_id() and (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage')));
create policy roles_manage on public.roles for all
  using (organization_id=private.current_organization_id() and private.has_permission('roles.manage'))
  with check (organization_id=private.current_organization_id());
create policy role_permissions_read on public.role_permissions for select
  using (exists (
    select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id()
      and (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage'))
  ));
create policy role_permissions_manage on public.role_permissions for all
  using (exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and private.has_permission('roles.manage')))
  with check (exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and private.has_permission('roles.manage')));
create policy user_roles_read on public.user_roles for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('users.view') or private.has_permission('users.manage')));
create policy user_roles_manage on public.user_roles for all
  using (organization_id=private.current_organization_id() and (private.has_permission('users.manage') or private.has_permission('roles.manage')))
  with check (
    organization_id=private.current_organization_id()
    and private.is_same_org_profile(profile_id)
    and exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and r.active)
  );

create policy user_devices_own on public.user_devices for all
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notification_preferences_own on public.notification_preferences for all
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy feature_flags_read on public.feature_flags for select
  using (organization_id=private.current_organization_id());
create policy feature_flags_manage on public.feature_flags for all
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());

-- Messaging ------------------------------------------------------------------
create policy conversations_member_read on public.conversations for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(id));
create policy conversation_members_member_read on public.conversation_members for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy messages_member_read on public.messages for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy messages_member_insert on public.messages for insert
  with check (
    organization_id=private.current_organization_id()
    and sender_id=private.current_profile_id()
    and private.can_post_conversation(conversation_id)
    and (reply_to_id is null or exists (select 1 from public.messages r where r.id=reply_to_id and r.conversation_id=conversation_id))
  );
create policy message_edits_member_read on public.message_edits for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
      and (m.sender_id=private.current_profile_id() or private.has_permission('messages.moderate'))
  ));
create policy message_attachments_member_read on public.message_attachments for select
  using (organization_id=private.current_organization_id() and message_id is not null and private.can_access_message_attachment(conversation_id,message_id));
create policy message_attachments_member_insert on public.message_attachments for insert
  with check (
    organization_id=private.current_organization_id()
    and uploaded_by=private.current_profile_id()
    and private.can_post_conversation(conversation_id)
    and (message_id is null or exists (select 1 from public.messages m where m.id=message_id and m.conversation_id=conversation_id))
  );
create policy message_reactions_member_read on public.message_reactions for select
  using (exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)));
create policy message_reactions_own_insert on public.message_reactions for insert
  with check (profile_id=private.current_profile_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
  ));
create policy message_reactions_own_delete on public.message_reactions for delete
  using (profile_id=private.current_profile_id());
create policy message_receipts_member_read on public.message_read_receipts for select
  using (exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)));
create policy message_receipts_own_insert on public.message_read_receipts for insert
  with check (profile_id=private.current_profile_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
  ));
create policy message_receipts_own_update on public.message_read_receipts for update
  using (profile_id=private.current_profile_id()) with check (
    profile_id=private.current_profile_id() and exists (
      select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
    )
  );
create policy message_reactions_own_update on public.message_reactions for update
  using (profile_id=private.current_profile_id()) with check (
    profile_id=private.current_profile_id() and exists (
      select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
    )
  );
create policy conversation_pins_member_read on public.conversation_pins for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy conversation_pins_member_insert on public.conversation_pins for insert
  with check (
    organization_id=private.current_organization_id() and pinned_by=private.current_profile_id()
    and private.is_conversation_member(conversation_id)
    and exists (select 1 from public.messages m where m.id=message_id and m.conversation_id=conversation_id)
  );
create policy conversation_pins_own_delete on public.conversation_pins for delete
  using (
    organization_id=private.current_organization_id()
    and private.is_conversation_member(conversation_id)
    and (pinned_by=private.current_profile_id() or private.has_permission('messages.moderate'))
  );

-- News and notifications ------------------------------------------------------
create policy news_posts_read on public.news_posts for select using (private.can_access_news(id));
create policy news_posts_create on public.news_posts for insert
  with check (
    organization_id=private.current_organization_id() and author_id=private.current_profile_id()
    and private.has_permission('news.create')
    and ((status in ('draft','scheduled')) or (status='published' and private.has_permission('news.publish')))
  );
create policy news_posts_update on public.news_posts for update
  using (organization_id=private.current_organization_id() and (private.has_permission('news.manage') or (author_id=private.current_profile_id() and private.has_permission('news.create'))))
  with check (
    organization_id=private.current_organization_id()
    and (private.has_permission('news.manage') or (author_id=private.current_profile_id() and private.has_permission('news.create')))
    and (status<>'published' or private.has_permission('news.publish'))
  );
create policy news_posts_delete on public.news_posts for delete
  using (organization_id=private.current_organization_id() and private.has_permission('news.manage') and status='draft');
create policy news_audiences_read on public.news_audiences for select
  using (organization_id=private.current_organization_id() and private.can_access_news(news_id));
create policy news_audiences_manage on public.news_audiences for all
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.news_posts n where n.id=news_id and (private.has_permission('news.manage') or (n.author_id=private.current_profile_id() and private.has_permission('news.create')))
  ))
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.news_posts n where n.id=news_id and n.organization_id=private.current_organization_id()
      and (private.has_permission('news.manage') or (n.author_id=private.current_profile_id() and private.has_permission('news.create')))
  ));
create policy news_reads_read on public.news_reads for select
  using (profile_id=private.current_profile_id());
create policy news_reads_insert on public.news_reads for insert
  with check (profile_id=private.current_profile_id() and private.can_access_news(news_id));
create policy news_reads_update on public.news_reads for update
  using (profile_id=private.current_profile_id())
  with check (profile_id=private.current_profile_id() and private.can_access_news(news_id));
create policy notifications_own_read on public.notifications for select
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notifications_own_update on public.notifications for update
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notification_deliveries_own_read on public.notification_deliveries for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.notifications n where n.id=notification_id and n.profile_id=private.current_profile_id()
  ));

-- Schedule -------------------------------------------------------------------
create policy schedule_periods_read on public.schedule_periods for select
  using (organization_id=private.current_organization_id() and (
    private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')
    or (status='published' and private.has_permission('schedule.view_own'))
  ));
create policy schedule_periods_manage on public.schedule_periods for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shift_templates_read on public.shift_templates for select
  using (organization_id=private.current_organization_id() and (private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')));
create policy shift_templates_manage on public.shift_templates for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shifts_read on public.shifts for select
  using (
    organization_id=private.current_organization_id()
    and (
      private.has_permission('schedule.manage')
      or (private.has_permission('schedule.view_team') and (team_id is null or private.can_view_team(team_id)))
      or (status<>'draft' and private.has_permission('schedule.view_own') and private.is_shift_assignee(id))
    )
  );
create policy shifts_manage on public.shifts for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shift_assignments_read on public.shift_assignments for select
  using (
    organization_id=private.current_organization_id()
    and ((profile_id=private.current_profile_id() and private.has_permission('schedule.view_own')) or private.has_permission('schedule.manage') or (private.has_permission('schedule.view_team') and private.can_view_shift_team(shift_id)))
  );
create policy shift_assignments_manage on public.shift_assignments for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage') and private.is_same_org_profile(profile_id));
create policy shift_acknowledgements_read on public.shift_acknowledgements for select
  using (organization_id=private.current_organization_id() and ((profile_id=private.current_profile_id() and private.has_permission('schedule.view_own')) or private.has_permission('schedule.manage')));
create policy shift_acknowledgements_own_insert on public.shift_acknowledgements for insert
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id() and private.has_permission('schedule.view_own') and exists (
    select 1 from public.shift_assignments sa where sa.shift_id=shift_id and sa.profile_id=private.current_profile_id()
  ));
create policy schedule_change_log_read on public.schedule_change_log for select
  using (organization_id=private.current_organization_id() and (private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')));

-- Leave and sick leave --------------------------------------------------------
create policy leave_types_read on public.leave_types for select
  using (organization_id=private.current_organization_id() and active);
create policy leave_types_manage on public.leave_types for all
  using (organization_id=private.current_organization_id() and private.has_permission('leave.manage'))
  with check (organization_id=private.current_organization_id());
create policy public_holidays_read on public.public_holidays for select
  using (organization_id=private.current_organization_id());
create policy public_holidays_manage on public.public_holidays for all
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());
create policy leave_requests_read on public.leave_requests for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.has_permission('leave.manage') or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(profile_id)))
  );
create policy leave_approval_steps_read on public.leave_approval_steps for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.leave_requests lr where lr.id=leave_request_id
      and (lr.profile_id=private.current_profile_id() or private.has_permission('leave.manage') or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(lr.profile_id)))
  ));
create policy leave_balances_read on public.leave_balances for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('leave.manage')));
create policy leave_balances_manage on public.leave_balances for all
  using (organization_id=private.current_organization_id() and private.has_permission('leave.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));
create policy sick_leave_read on public.sick_leave_records for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.can_view_sick_status(profile_id))
  );
create policy sick_leave_manage on public.sick_leave_records for update
  using (organization_id=private.current_organization_id() and private.has_permission('sick_leave.manage'))
  with check (organization_id=private.current_organization_id());
create policy sick_leave_own_certificate_update on public.sick_leave_records for update
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy sick_documents_read on public.sick_leave_document_versions for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.sick_leave_records sl where sl.id=sick_leave_id
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates'))
  ));
create policy sick_documents_insert on public.sick_leave_document_versions for insert
  with check (
    organization_id=private.current_organization_id() and uploaded_by=private.current_profile_id()
    and exists (select 1 from public.sick_leave_records sl where sl.id=sick_leave_id and sl.organization_id=private.current_organization_id()
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates')))
  );

-- Documents ------------------------------------------------------------------
create policy document_categories_read on public.document_categories for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.manage')));
create policy document_categories_manage on public.document_categories for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage'))
  with check (organization_id=private.current_organization_id());
create policy document_folders_read on public.document_folders for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.view_own') or private.has_permission('documents.manage')));
create policy document_folders_manage on public.document_folders for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage'))
  with check (organization_id=private.current_organization_id());
create policy documents_read on public.documents for select using (private.can_access_document(id));
create policy documents_create on public.documents for insert
  with check (
    organization_id=private.current_organization_id()
    and (
      (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
      or ((sensitivity='employee_file' or visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  );
create policy documents_update on public.documents for update
  using (organization_id=private.current_organization_id() and (
    (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
    or ((sensitivity='employee_file' or visibility='personal') and (
      private.has_permission('documents.manage_employee_files')
      or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
        and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
    ))
  ))
  with check (organization_id=private.current_organization_id() and (
    (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
    or ((sensitivity='employee_file' or visibility='personal') and (
      private.has_permission('documents.manage_employee_files')
      or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
        and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
    ))
  ));
create policy documents_delete on public.documents for delete
  using (
    organization_id=private.current_organization_id()
    and (
      (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
      or ((sensitivity='employee_file' or visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
    and (
      status='draft'
      or (created_by=private.current_profile_id() and created_at>now()-interval '15 minutes'
        and not exists(select 1 from public.document_versions dv where dv.document_id=id))
    )
  );
create policy document_versions_read on public.document_versions for select
  using (organization_id=private.current_organization_id() and private.can_access_document(document_id));
create policy document_versions_insert on public.document_versions for insert
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  ));
create policy document_versions_manage on public.document_versions for update
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  )) with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  ));
create policy document_audiences_read on public.document_audiences for select
  using (organization_id=private.current_organization_id() and private.can_access_document(document_id));
create policy document_audiences_manage on public.document_audiences for all
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
    )
  ))
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
    )
  ));
create policy document_acknowledgements_read on public.document_acknowledgements for select
  using (organization_id=private.current_organization_id() and (
    profile_id=private.current_profile_id()
    or exists (
      select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
        (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
        or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
      )
    )
  ));
create policy document_acknowledgements_own_insert on public.document_acknowledgements for insert
  with check (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
    and (version_id is null or exists (
      select 1 from public.document_versions dv
      where dv.id=version_id and dv.document_id=public.document_acknowledgements.document_id
        and dv.organization_id=private.current_organization_id() and dv.deleted_at is null
    ))
  );
create policy document_acknowledgements_own_update on public.document_acknowledgements for update
  using (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
  )
  with check (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
    and (version_id is null or exists (
      select 1 from public.document_versions dv
      where dv.id=version_id and dv.document_id=public.document_acknowledgements.document_id
        and dv.organization_id=private.current_organization_id() and dv.deleted_at is null
    ))
  );
create policy document_access_log_read on public.document_access_log for select
  using (organization_id=private.current_organization_id() and private.has_permission('audit.view'));

-- Fleet ----------------------------------------------------------------------
create policy vehicles_read on public.vehicles for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(id));
create policy vehicles_manage on public.vehicles for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id());
create policy vehicle_assignments_read on public.vehicle_assignments for select
  using (organization_id=private.current_organization_id() and ((profile_id=private.current_profile_id() and private.has_permission('fleet.view_own')) or private.has_permission('fleet.view_all') or private.has_permission('fleet.manage')));
create policy vehicle_assignments_manage on public.vehicle_assignments for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));
create policy mileage_read on public.mileage_submissions for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('mileage.manage')));
create policy mileage_manage on public.mileage_submissions for update
  using (organization_id=private.current_organization_id() and private.has_permission('mileage.manage'))
  with check (organization_id=private.current_organization_id());
create policy maintenance_read on public.vehicle_maintenance_events for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(vehicle_id));
create policy maintenance_manage on public.vehicle_maintenance_events for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('fleet.manage') and exists (
    select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id()
  ));
create policy damage_reports_read on public.vehicle_damage_reports for select
  using (organization_id=private.current_organization_id() and (reported_by=private.current_profile_id() or private.can_access_vehicle(vehicle_id)));
create policy damage_reports_insert on public.vehicle_damage_reports for insert
  with check (
    organization_id=private.current_organization_id() and reported_by=private.current_profile_id()
    and private.can_access_vehicle(vehicle_id) and status='reported' and resolved_by is null and resolved_at is null
  );
create policy damage_reports_manage on public.vehicle_damage_reports for update
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (
    organization_id=private.current_organization_id() and private.has_permission('fleet.manage')
    and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id())
    and private.is_same_org_profile(reported_by)
    and (resolved_by is null or private.is_same_org_profile(resolved_by))
  );
create policy vehicle_documents_read on public.vehicle_documents for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(vehicle_id));
create policy vehicle_documents_manage on public.vehicle_documents for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (
    organization_id=private.current_organization_id() and private.has_permission('fleet.manage')
    and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id())
    and private.is_same_org_profile(uploaded_by)
  );

-- Materials ------------------------------------------------------------------
create policy material_categories_read on public.material_categories for select
  using (organization_id=private.current_organization_id() and active);
create policy material_categories_manage on public.material_categories for all
  using (organization_id=private.current_organization_id() and private.has_permission('materials.manage'))
  with check (organization_id=private.current_organization_id());
create policy material_catalog_read on public.material_catalog_items for select
  using (organization_id=private.current_organization_id() and active);
create policy material_catalog_manage on public.material_catalog_items for all
  using (organization_id=private.current_organization_id() and private.has_permission('materials.manage'))
  with check (organization_id=private.current_organization_id());
create policy material_requests_read on public.material_requests for select using (private.can_access_material_request(id));
create policy material_items_read on public.material_request_items for select
  using (organization_id=private.current_organization_id() and private.can_access_material_request(request_id));
create policy material_history_read on public.material_request_status_history for select
  using (organization_id=private.current_organization_id() and private.can_access_material_request(material_request_id));

-- Audit and integrations ------------------------------------------------------
create policy audit_read on public.audit_logs for select
  using (organization_id=private.current_organization_id() and private.has_permission('audit.view'));
create policy integration_providers_read on public.integration_providers for select using (private.current_profile_id() is not null);
create policy integration_connections_read on public.integration_connections for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));
create policy integration_connections_manage on public.integration_connections for all
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'))
  with check (organization_id=private.current_organization_id());
create policy integration_runs_read on public.integration_sync_runs for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));
create policy integration_errors_read on public.integration_sync_errors for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));

-- Column-level hardening. Safe directory fields stay joinable for the app;
-- auth_user_id, birth_date and HR-only fields are only returned by RPCs.
revoke select on public.profiles from authenticated;
grant select (id, organization_id, display_name, email, avatar_url, status, preferred_language, created_at, updated_at)
  on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
revoke insert, update, delete on public.user_roles from authenticated;
revoke insert, update, delete on public.team_memberships from authenticated;
revoke delete on public.teams from authenticated;
revoke update, delete on public.roles from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;
revoke select on public.employee_profiles from authenticated;
grant select (profile_id, organization_id, first_name, last_name, work_phone, job_title, department_id, location_id)
  on public.employee_profiles to authenticated;
revoke update on public.messages from authenticated;
revoke insert, update, delete on public.news_posts from authenticated;
revoke insert, update, delete on public.news_audiences from authenticated;
revoke insert, update, delete on public.news_reads from authenticated;
revoke insert, update on public.documents from authenticated;
revoke insert, update, delete on public.document_audiences from authenticated;
revoke insert, update, delete on public.document_versions from authenticated;
revoke insert, update, delete on public.leave_requests from authenticated;
revoke select on public.leave_requests from authenticated;
grant select (id,organization_id,profile_id,leave_type,leave_type_id,starts_on,ends_on,day_fraction,workdays,status,decided_by,decided_at,created_at,submitted_at,updated_at)
  on public.leave_requests to authenticated;
revoke insert, delete on public.sick_leave_records from authenticated;
revoke select on public.sick_leave_records from authenticated;
grant select (id,organization_id,profile_id,starts_on,expected_end_on,end_unknown,status,created_at,updated_at)
  on public.sick_leave_records to authenticated;
revoke update on public.sick_leave_records from authenticated;
grant update (status, certificate_status) on public.sick_leave_records to authenticated;
revoke insert, delete on public.mileage_submissions from authenticated;
revoke insert, update, delete on public.material_requests from authenticated;
revoke insert, update, delete on public.material_request_items from authenticated;
revoke insert, update, delete on public.material_request_status_history from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.my_permissions() from public;
grant execute on function public.my_permissions() to authenticated;

-- Storage buckets and per-domain object policies ------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('news-attachments','news-attachments',false,10485760,array['image/jpeg','image/png','application/pdf']),
  ('employee-documents','employee-documents',false,20971520,array['image/jpeg','image/png','application/pdf']),
  ('material-request-files','material-request-files',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end;
$$;

create policy storage_message_read on storage.objects for select to authenticated using (
  bucket_id='message-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_message_attachment(((storage.foldername(name))[2])::uuid,((storage.foldername(name))[3])::uuid)
);
create policy storage_message_upload on storage.objects for insert to authenticated with check (
  bucket_id='message-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_post_conversation(((storage.foldername(name))[2])::uuid)
);
create policy storage_message_cleanup on storage.objects for delete to authenticated using (
  bucket_id='message-attachments' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.message_attachments ma where ma.storage_path=name)
);

create policy storage_news_read on storage.objects for select to authenticated using (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_news(((storage.foldername(name))[2])::uuid)
);
create policy storage_news_upload on storage.objects for insert to authenticated with check (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.news_posts n where n.id=((storage.foldername(name))[2])::uuid
    and n.organization_id=private.current_organization_id()
    and ((n.author_id=private.current_profile_id() and private.has_permission('news.create')) or private.has_permission('news.manage')))
);
create policy storage_news_delete on storage.objects for delete to authenticated using (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('news.manage')
);

create policy storage_documents_read on storage.objects for select to authenticated using (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_document(((storage.foldername(name))[2])::uuid)
);
create policy storage_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and private.has_permission('documents.manage')
    and (d.visibility<>'personal' or (d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))))
);
create policy storage_documents_delete on storage.objects for delete to authenticated using (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and private.has_permission('documents.manage')
    and (d.visibility<>'personal' or (d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))))
);

create policy storage_employee_documents_read on storage.objects for select to authenticated using (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and (
    (storage.foldername(name))[2]=private.current_profile_id()::text
    or private.has_permission('documents.manage_employee_files')
  )
);
create policy storage_employee_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('documents.manage_employee_files')
  and private.is_same_org_profile(((storage.foldername(name))[2])::uuid)
);
create policy storage_employee_documents_delete on storage.objects for delete to authenticated using (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('documents.manage_employee_files')
  and not exists(select 1 from public.document_versions dv where dv.storage_path=name and dv.deleted_at is null)
);

-- No SELECT policy for certificates: downloads are short-lived, audited URLs
-- issued only by create-secure-download. Employees/HR can upload to valid records.
create policy storage_certificates_upload on storage.objects for insert to authenticated with check (
  bucket_id='sick-certificates'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (
    select 1 from public.sick_leave_records sl
    where sl.id=((storage.foldername(name))[3])::uuid
      and sl.organization_id=private.current_organization_id()
      and (storage.foldername(name))[2]=sl.profile_id::text
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates'))
  )
);
create policy storage_certificates_cleanup on storage.objects for delete to authenticated using (
  bucket_id='sick-certificates' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.sick_leave_document_versions sd where sd.storage_path=name and sd.deleted_at is null)
);

create policy storage_vehicle_read on storage.objects for select to authenticated using (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_vehicle(((storage.foldername(name))[2])::uuid)
);
create policy storage_vehicle_upload on storage.objects for insert to authenticated with check (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_vehicle(((storage.foldername(name))[2])::uuid)
);
create policy storage_vehicle_delete on storage.objects for delete to authenticated using (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('fleet.manage')
);
create policy storage_vehicle_cleanup on storage.objects for delete to authenticated using (
  bucket_id='vehicle-files' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.mileage_submissions ms where ms.photo_path=name)
  and not exists(select 1 from public.vehicle_documents vd where vd.storage_path=name and vd.archived_at is null)
);

create policy storage_material_read on storage.objects for select to authenticated using (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_material_request(((storage.foldername(name))[2])::uuid)
);
create policy storage_material_upload on storage.objects for insert to authenticated with check (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_material_request(((storage.foldername(name))[2])::uuid)
);
create policy storage_material_delete on storage.objects for delete to authenticated using (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('materials.manage')
);
create policy storage_material_cleanup on storage.objects for delete to authenticated using (
  bucket_id='material-request-files' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.material_requests mr where mr.attachment_path=name)
);

create policy storage_avatars_read on storage.objects for select to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=private.current_organization_id()::text
);
create policy storage_avatars_upload on storage.objects for insert to authenticated with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);
create policy storage_avatars_update on storage.objects for update to authenticated using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
) with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);
create policy storage_avatars_delete on storage.objects for delete to authenticated using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);
