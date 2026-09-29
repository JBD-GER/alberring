-- A single approval is the default for existing organizations as well as new ones.
-- Historical decisions remain unchanged. Open requests still require an explicit
-- decision; the migration never approves requests automatically.
update public.organization_settings
set leave_approval_steps=1,updated_at=now()
where leave_approval_steps<>1;

update public.leave_approval_steps step
set status='skipped',decided_by=null,decided_at=now(),
  comment='Umstellung auf eine Freigabe; weiterer Schritt entfällt'
from public.leave_requests request
where request.id=step.leave_request_id
  and request.organization_id=step.organization_id
  and request.status in ('submitted','review')
  and step.status='pending'
  and step.step_number>1;

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
  required_steps integer;
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
  if target.profile_id=me and not (
    private.has_permission('leave.manage')
    and private.has_system_role(array['admin','administration','super_admin'])
  ) then
    raise exception 'self_approval_not_allowed' using errcode='42501';
  end if;
  if not private.has_permission('leave.manage')
    and not private.can_view_profile_team(target.profile_id) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  select coalesce(settings.leave_approval_steps,1) into required_steps
  from public.organization_settings settings
  where settings.organization_id=org;
  required_steps:=coalesce(required_steps,1);
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
    if p_status='approved' and required_steps>1 and step_id is not null and exists (
      select 1
      from public.leave_approval_steps las
      where las.leave_request_id=p_request_id
        and las.status='approved'
        and las.decided_by=me
    ) then
      raise exception 'second_approver_required' using errcode='42501';
    end if;
    if step_id is not null and not (
      p_status='approved' and required_steps=1 and exists (
        select 1 from public.leave_approval_steps
        where leave_request_id=p_request_id and status='approved'
      )
    ) then
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
      if required_steps=1 then
        update public.leave_approval_steps
        set status='skipped',decided_by=me,decided_at=now(),
          comment='Eine Freigabe genügt; weiterer Schritt entfällt'
        where leave_request_id=p_request_id and status='pending';
      end if;
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

-- Administrators with leave.manage may also decide their own request.
-- Ordinary approvers retain the self-decision restriction at the table boundary.
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
    ) and not coalesce(
      new.decided_by=private.current_profile_id()
      and new.organization_id=private.current_organization_id()
      and private.has_permission('leave.manage')
      and private.has_system_role(array['admin','administration','super_admin']),
      false
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

-- Preserve the authenticated RPC boundary and keep the trigger private.
revoke all on function public.decide_leave_request(uuid,text,text) from public,anon;
grant execute on function public.decide_leave_request(uuid,text,text) to authenticated;
revoke all on function private.guard_leave_self_decision() from public,anon,authenticated,service_role;
