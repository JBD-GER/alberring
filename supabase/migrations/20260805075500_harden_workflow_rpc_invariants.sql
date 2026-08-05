-- Central role delegation guard. A user manager may delegate only permissions
-- they already hold; the standard employee baseline remains assignable so the
-- normal invitation workflow does not require full role administration.
create or replace function private.can_delegate_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_permission('roles.manage')
    or not exists (
      select 1
      from public.roles role
      join public.role_permissions permission
        on permission.role_id=role.id
      where role.id=p_role_id
        and role.organization_id=private.current_organization_id()
        and role.active
        and not private.has_permission(permission.permission_key)
        and not (
          role.system_key='employee'
          and permission.permission_key=any(array[
            'dashboard.view','directory.view','messages.use','news.view',
            'schedule.view_own','leave.create_own','sick_leave.create_own',
            'documents.view_own','documents.view_shared',
            'documents.view_folders','fleet.view_own','mileage.submit_own',
            'materials.create_own'
          ])
        )
    )
$$;

revoke all on function private.can_delegate_role(uuid)
  from public, anon, authenticated, service_role;

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
  select organization_id into profile_org
  from public.profiles
  where id=new.profile_id;
  select organization_id into role_org
  from public.roles
  where id=new.role_id and active;
  if profile_org is null or role_org is null or profile_org<>role_org then
    raise exception 'role_and_profile_must_share_organization'
      using errcode='23514';
  end if;
  new.organization_id := profile_org;
  if new.assigned_by is not null and not exists (
    select 1
    from public.profiles p
    where p.id=new.assigned_by and p.organization_id=profile_org
  ) then
    raise exception 'assigner_must_share_organization' using errcode='23514';
  end if;
  if tg_op='INSERT'
    and auth.uid() is not null
    and not private.can_delegate_role(new.role_id) then
    raise exception 'role_delegation_not_allowed' using errcode='42501';
  end if;
  return new;
end;
$$;

-- Repair legacy pending invitations that predate server-controlled
-- organization metadata. An explicit conflicting value is never overwritten.
update auth.users invited_user
set raw_app_meta_data=
  coalesce(invited_user.raw_app_meta_data,'{}'::jsonb)
  || jsonb_build_object('organization_id',profile.organization_id::text)
from public.profiles profile
where profile.auth_user_id=invited_user.id
  and profile.status='invited'
  and invited_user.raw_app_meta_data->>'organization_id' is null;

-- Invited profiles may only be paired with Auth users whose organization was
-- written into server-controlled app_metadata by the invitation Edge Function.
-- The invariant is checked both when an invite is created and when it becomes
-- active, so a legacy or tampered pending account cannot bypass activation.
create or replace function private.guard_invited_profile_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  organization_must_match boolean:=new.status='invited';
begin
  if tg_op='UPDATE' then
    organization_must_match := organization_must_match or (
      old.status='invited' and new.status='active'
    );
  end if;
  if organization_must_match and not exists (
    select 1
    from auth.users invited_user
    where invited_user.id=new.auth_user_id
      and coalesce(
        invited_user.raw_app_meta_data->>'organization_id',
        ''
      )=new.organization_id::text
  ) then
    raise exception 'invite_organization_mismatch' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_invited_profile_organization
  on public.profiles;
create trigger guard_invited_profile_organization
before insert or update of status, organization_id, auth_user_id
on public.profiles
for each row execute function private.guard_invited_profile_organization();

create or replace function public.set_user_role(
  p_profile_id uuid,
  p_role_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  role_key text;
  active_count integer;
begin
  if p_enabled is null then
    raise exception 'invalid_boolean' using errcode='22023';
  end if;
  if me is null or not private.has_permission('users.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('super-admin:'||org::text,0)
  );
  if p_profile_id=me then
    raise exception 'cannot_change_own_roles' using errcode='42501';
  end if;
  if not private.is_same_org_profile(p_profile_id) then
    raise exception 'profile_not_available' using errcode='22023';
  end if;
  select system_key into role_key
  from public.roles
  where id=p_role_id and organization_id=org and active;
  if not found then
    raise exception 'role_not_available' using errcode='22023';
  end if;
  if role_key='super_admin' and not private.has_permission('roles.manage') then
    raise exception 'super_admin_assignment_requires_role_management'
      using errcode='42501';
  end if;
  if not p_enabled and role_key='super_admin' then
    select count(distinct ur.profile_id) into active_count
    from public.user_roles ur
    join public.roles r
      on r.id=ur.role_id
      and r.organization_id=ur.organization_id
      and r.active
    join public.profiles p
      on p.id=ur.profile_id
      and p.organization_id=ur.organization_id
      and p.status='active'
    where ur.organization_id=org
      and r.system_key='super_admin'
      and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now());
    if active_count<=1 then
      raise exception 'last_super_admin_role_cannot_be_removed'
        using errcode='42501';
    end if;
  end if;
  if p_enabled then
    if not private.can_delegate_role(p_role_id) then
      raise exception 'role_delegation_not_allowed' using errcode='42501';
    end if;
    if not exists (
      select 1
      from public.user_roles ur
      where ur.profile_id=p_profile_id
        and ur.role_id=p_role_id
        and ur.valid_from<=now()
        and (ur.valid_until is null or ur.valid_until>now())
    ) then
      insert into public.user_roles(
        profile_id,role_id,organization_id,assigned_by
      ) values(p_profile_id,p_role_id,org,me);
    end if;
  else
    update public.user_roles
    set valid_until=now()
    where profile_id=p_profile_id
      and role_id=p_role_id
      and valid_from<=now()
      and (valid_until is null or valid_until>now());
  end if;
  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    org,me,
    case when p_enabled then 'user.role_assigned' else 'user.role_revoked' end,
    'profile',p_profile_id,jsonb_build_object('role_id',p_role_id)
  );
end;
$$;

create or replace function public.set_role_permission(
  p_role_id uuid,
  p_permission_key text,
  p_enabled boolean
)
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
  if p_enabled is null then
    raise exception 'invalid_boolean' using errcode='22023';
  end if;
  if me is null or not private.has_permission('roles.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('super-admin:'||org::text,0)
  );
  select r.system_key into role_key
  from public.roles r
  where r.id=p_role_id and r.organization_id=org and r.active
  for update;
  if not found then
    raise exception 'role_not_available' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.permissions p where p.key=p_permission_key
  ) then
    raise exception 'permission_not_available' using errcode='22023';
  end if;
  if role_key='super_admin'
    and not p_enabled
    and p_permission_key in ('users.manage','roles.manage') then
    raise exception 'protected_super_admin_permission' using errcode='42501';
  end if;
  if p_enabled then
    insert into public.role_permissions(role_id,permission_key)
    values(p_role_id,p_permission_key)
    on conflict do nothing;
    get diagnostics changed=row_count;
  else
    delete from public.role_permissions
    where role_id=p_role_id and permission_key=p_permission_key;
    get diagnostics changed=row_count;
  end if;
  if changed>0 then
    insert into public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,metadata
    ) values(
      org,me,
      case
        when p_enabled then 'role.permission_granted'
        else 'role.permission_revoked'
      end,
      'role',p_role_id,
      jsonb_build_object('permission_key',p_permission_key)
    );
  end if;
end;
$$;

create or replace function public.set_user_team(
  p_profile_id uuid,
  p_team_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
begin
  if p_enabled is null then
    raise exception 'invalid_boolean' using errcode='22023';
  end if;
  if me is null or not private.has_permission('users.manage') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if not private.is_same_org_profile(p_profile_id) then
    raise exception 'profile_not_available' using errcode='22023';
  end if;
  if not exists (
    select 1
    from public.teams t
    where t.id=p_team_id and t.organization_id=org and t.active
  ) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  if p_enabled then
    if not exists (
      select 1
      from public.team_memberships tm
      where tm.profile_id=p_profile_id
        and tm.team_id=p_team_id
        and tm.valid_from<=current_date
        and (tm.valid_until is null or tm.valid_until>=current_date)
    ) then
      insert into public.team_memberships(
        team_id,profile_id,organization_id,valid_from,valid_until
      ) values(p_team_id,p_profile_id,org,current_date,null)
      on conflict(team_id,profile_id,valid_from)
      do update set valid_until=null;
    end if;
  else
    delete from public.team_memberships
    where team_id=p_team_id
      and profile_id=p_profile_id
      and valid_from=current_date;
    update public.team_memberships
    set valid_until=current_date-1
    where team_id=p_team_id
      and profile_id=p_profile_id
      and valid_from<current_date
      and (valid_until is null or valid_until>=current_date);
  end if;
  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    org,me,
    case when p_enabled then 'user.team_assigned' else 'user.team_revoked' end,
    'profile',p_profile_id,jsonb_build_object('team_id',p_team_id)
  );
end;
$$;

create or replace function public.decide_leave_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  target public.leave_requests%rowtype;
  step_id uuid;
  pending_count integer;
begin
  if me is null or not (
    private.has_permission('leave.approve')
    or private.has_permission('leave.manage')
  ) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('review','approved','rejected') then
    raise exception 'invalid_decision' using errcode='22023';
  end if;
  if p_status='rejected' and nullif(trim(p_note),'') is null then
    raise exception 'rejection_reason_required' using errcode='22023';
  end if;
  select * into target
  from public.leave_requests
  where id=p_request_id and organization_id=org
  for update;
  if target.id is null or target.status not in ('submitted','review') then
    raise exception 'request_not_decidable' using errcode='22023';
  end if;
  if target.profile_id=me then
    raise exception 'self_approval_not_allowed' using errcode='42501';
  end if;
  if not private.has_permission('leave.manage')
    and not private.can_view_profile_team(target.profile_id) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_status='review' then
    update public.leave_requests
    set status='review',decided_by=me,decided_at=now(),
      decision_note=nullif(trim(p_note),'')
    where id=p_request_id;
  else
    select id into step_id
    from public.leave_approval_steps
    where leave_request_id=p_request_id and status='pending'
    order by step_number
    limit 1
    for update;
    if p_status='approved' and exists (
      select 1
      from public.leave_approval_steps las
      where las.leave_request_id=p_request_id
        and las.status='approved'
        and las.decided_by=me
    ) then
      raise exception 'second_approver_required' using errcode='42501';
    end if;
    if step_id is not null then
      update public.leave_approval_steps
      set status=p_status,decided_by=me,decided_at=now(),
        comment=nullif(trim(p_note),'')
      where id=step_id;
    end if;
    if p_status='rejected' then
      update public.leave_requests
      set status='rejected',decided_by=me,decided_at=now(),
        decision_note=trim(p_note)
      where id=p_request_id;
      update public.leave_approval_steps
      set status='skipped',decided_by=me,decided_at=now(),
        comment='Nach Ablehnung übersprungen'
      where leave_request_id=p_request_id and status='pending';
    else
      select count(*) into pending_count
      from public.leave_approval_steps
      where leave_request_id=p_request_id and status='pending';
      update public.leave_requests
      set status=case when pending_count=0 then 'approved' else 'review' end,
        decided_by=case when pending_count=0 then me else decided_by end,
        decided_at=case when pending_count=0 then now() else decided_at end,
        decision_note=case
          when pending_count=0 then nullif(trim(p_note),'')
          else decision_note
        end
      where id=p_request_id;
    end if;
  end if;
  perform private.create_notification(
    org,target.profile_id,'leave_status','Urlaubsantrag aktualisiert',
    'Der Status Ihres Urlaubsantrags wurde geändert.',
    '/app/leave',
    'leave-status:'||p_request_id::text||':'||p_status||':'||
      extract(epoch from now())::bigint::text
  );
  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    org,me,'leave.decided','leave_request',p_request_id,
    jsonb_build_object('decision',p_status)
  );
end;
$$;

-- No employee may approve or reject their own leave request, even when a team
-- lead role gives them both create-own and approval permissions.
create or replace function private.guard_leave_self_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status in ('approved','rejected')
    and new.decided_by is not null
    and exists (
      select 1
      from public.leave_requests request
      where request.id=new.leave_request_id
        and request.organization_id=new.organization_id
        and request.profile_id=new.decided_by
    ) then
    raise exception 'self_approval_not_allowed' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_leave_self_decision
  on public.leave_approval_steps;
create trigger guard_leave_self_decision
before update of status, decided_by
on public.leave_approval_steps
for each row execute function private.guard_leave_self_decision();

-- Published schedule state is protected at the table boundary as well as the
-- RPC boundary, including demotion and cancellation of an existing shift.
create or replace function private.guard_shift_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null
    and (
      new.status in ('published','changed')
      or (tg_op='UPDATE' and old.status in ('published','changed'))
    )
    and not private.has_permission('schedule.publish') then
    raise exception 'publish_permission_required' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_shift_publication on public.shifts;
create trigger guard_shift_publication
before insert or update on public.shifts
for each row execute function private.guard_shift_publication();

create or replace function public.acknowledge_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
begin
  if me is null
    or not private.has_permission('schedule.view_own')
    or not exists (
      select 1
      from public.shift_assignments sa
      join public.shifts s on s.id=sa.shift_id
      where sa.shift_id=p_shift_id
        and sa.profile_id=me
        and sa.organization_id=org
        and s.organization_id=sa.organization_id
        and s.organization_id=org
        and s.status in ('published','changed')
    ) then
    raise exception 'shift_not_available' using errcode='42501';
  end if;
  insert into public.shift_acknowledgements(
    shift_id,profile_id,organization_id
  ) values(p_shift_id,me,org)
  on conflict(shift_id,profile_id)
  do update set acknowledged_at=excluded.acknowledged_at;
  update public.shift_assignments
  set acknowledged_at=now()
  where shift_id=p_shift_id
    and profile_id=me
    and organization_id=org;
end;
$$;

create or replace function public.create_personal_document_upload(
  p_title text,
  p_folder_id uuid default null,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  result uuid;
begin
  if me is null or not private.has_permission('documents.view_own') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 2 and 180 then
    raise exception 'invalid_document' using errcode='22023';
  end if;
  if p_folder_id is not null
    and not private.can_access_document_folder(p_folder_id) then
    raise exception 'folder_not_available' using errcode='22023';
  end if;
  if p_category_id is not null and not exists (
    select 1
    from public.document_categories category
    where category.id=p_category_id
      and category.organization_id=org
      and category.active
  ) then
    raise exception 'category_not_available' using errcode='22023';
  end if;
  insert into public.documents(
    organization_id,title,visibility,owner_profile_id,created_by,status,
    folder_id,category_id,acknowledgement_required
  ) values(
    org,trim(p_title),'personal',me,me,'draft',p_folder_id,p_category_id,false
  ) returning id into result;
  insert into public.document_audiences(
    organization_id,document_id,audience_type,profile_id
  ) values(org,result,'profile',me);
  return result;
end;
$$;

create or replace function public.set_material_request_status(
  p_request_id uuid,
  p_status text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  target public.material_requests%rowtype;
  allowed boolean:=false;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode='28000';
  end if;
  if p_status is null then
    raise exception 'invalid_status_transition' using errcode='22023';
  end if;
  select * into target
  from public.material_requests
  where id=p_request_id and organization_id=org
  for update;
  if target.id is null then
    raise exception 'request_not_found' using errcode='P0002';
  end if;
  if target.requester_id=me then
    allowed :=
      (p_status='cancelled' and target.status in ('draft','submitted','review'))
      or (p_status='completed' and target.status='delivered');
  elsif private.has_permission('materials.manage') then
    allowed := case target.status
      when 'submitted' then p_status in ('review','approved','rejected','cancelled')
      when 'review' then p_status in ('approved','rejected','cancelled')
      when 'approved' then p_status in ('ordered','cancelled')
      when 'ordered' then p_status in ('partially_delivered','delivered','cancelled')
      when 'partially_delivered' then p_status in ('delivered','cancelled')
      when 'delivered' then p_status='completed'
      else false
    end;
  elsif private.has_permission('materials.approve') then
    allowed := target.status in ('submitted','review')
      and p_status in ('approved','rejected');
  end if;
  if not allowed then
    raise exception 'invalid_status_transition' using errcode='22023';
  end if;
  if p_status in ('rejected','cancelled')
    and nullif(trim(p_comment),'') is null then
    raise exception 'comment_required' using errcode='22023';
  end if;
  update public.material_requests
  set status=p_status,
    closed_at=case
      when p_status in ('completed','cancelled','rejected') then now()
      else null
    end
  where id=target.id;
  insert into public.material_request_status_history(
    organization_id,material_request_id,from_status,to_status,actor_id,comment
  ) values(
    org,target.id,target.status,p_status,me,nullif(trim(p_comment),'')
  );
  perform private.create_notification(
    org,target.requester_id,'material_status','Materialanforderung aktualisiert',
    'Der Status Ihrer Materialanforderung wurde geändert.',
    '/app/material-requests',
    'material-status:'||target.id::text||':'||p_status
  );
  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    org,me,'material.status_changed','material_request',target.id,
    jsonb_build_object('from',target.status,'to',p_status)
  );
end;
$$;

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
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  result uuid;
  old_status text;
  primary_team uuid;
begin
  if me is null or not private.has_permission('materials.create_own') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_status is null
    or p_status not in ('draft','submitted')
    or length(trim(p_category)) not between 1 and 80
    or length(trim(p_item)) not between 1 and 180
    or p_quantity is null
    or p_quantity::text in ('NaN','Infinity','-Infinity')
    or p_quantity<=0
    or length(trim(p_unit)) not between 1 and 40
    or p_priority not in ('low','normal','high','urgent')
    or length(coalesce(p_reason,''))>1000 then
    raise exception 'invalid_material_request' using errcode='22023';
  end if;
  select tm.team_id into primary_team
  from public.team_memberships tm
  where tm.profile_id=me
    and tm.organization_id=org
    and tm.valid_from<=current_date
    and (tm.valid_until is null or tm.valid_until>=current_date)
  order by tm.valid_from desc
  limit 1;
  if p_request_id is null then
    insert into public.material_requests(
      organization_id,requester_id,team_id,category,item,title,quantity,unit,
      priority,needed_on,reason,status,submitted_at
    ) values(
      org,me,primary_team,trim(p_category),trim(p_item),trim(p_item),
      p_quantity,trim(p_unit),p_priority,p_needed_on,nullif(trim(p_reason),''),
      p_status,case when p_status='submitted' then now() end
    ) returning id into result;
    insert into public.material_request_items(
      organization_id,request_id,item_name,quantity,unit
    ) values(org,result,trim(p_item),p_quantity,trim(p_unit));
  else
    select status into old_status
    from public.material_requests
    where id=p_request_id and requester_id=me and organization_id=org
    for update;
    if old_status is null or old_status<>'draft' then
      raise exception 'request_not_editable' using errcode='22023';
    end if;
    update public.material_requests
    set category=trim(p_category),item=trim(p_item),title=trim(p_item),
      quantity=p_quantity,unit=trim(p_unit),priority=p_priority,
      needed_on=p_needed_on,reason=nullif(trim(p_reason),''),status=p_status,
      submitted_at=case
        when p_status='submitted' then now()
        else submitted_at
      end
    where id=p_request_id
    returning id into result;
    update public.material_request_items
    set item_name=trim(p_item),quantity=p_quantity,unit=trim(p_unit)
    where id=(
      select id
      from public.material_request_items
      where request_id=result
      order by created_at
      limit 1
    );
    if old_status<>p_status then
      insert into public.material_request_status_history(
        organization_id,material_request_id,from_status,to_status,actor_id
      ) values(org,result,old_status,p_status,me);
    end if;
  end if;
  if p_status='submitted' then
    perform private.create_notification(
      org,p.id,'materials','Neue Materialanforderung',
      'Eine Materialanforderung wartet auf Bearbeitung.',
      '/app/material-requests','material-task:'||result::text||':'||p.id::text
    )
    from public.profiles p
    where p.organization_id=org
      and p.status='active'
      and p.id<>me
      and (
        private.profile_has_permission(p.id,org,'materials.manage')
        or private.profile_has_permission(p.id,org,'materials.approve')
      );
  end if;
  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  ) values(
    org,me,'material.saved','material_request',result,
    jsonb_build_object('status',p_status)
  );
  return result;
end;
$$;

notify pgrst, 'reload schema';
