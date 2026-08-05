-- Always keep the target account's current primary team inside the bounded
-- onboarding catalog so opening the wizard cannot silently replace it.

create or replace function public.get_admin_onboarding_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
  primary_team_id uuid;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_required
    and p.onboarding_completed_at is null
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  limit 1;

  if target_profile.id is null
    or not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage') then
    raise exception 'onboarding_not_available' using errcode='42501';
  end if;

  select membership.team_id into primary_team_id
  from public.team_memberships membership
  join public.teams team
    on team.id=membership.team_id
    and team.organization_id=membership.organization_id
    and team.active
  where membership.profile_id=target_profile.id
    and membership.organization_id=target_profile.organization_id
    and membership.valid_from<=current_date
    and (
      membership.valid_until is null
      or membership.valid_until>=current_date
    )
  order by membership.valid_from desc,team.name
  limit 1;

  return jsonb_build_object(
    'roles',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',role.id,
          'name',role.name,
          'systemKey',role.system_key
        ) order by
          case when role.system_key='employee' then 0 else 1 end,
          role.name
      )
      from public.roles role
      where role.organization_id=target_profile.organization_id
        and role.active
        and (
          role.system_key is null
          or role.system_key not in ('super_admin','auditor')
        )
        and private.can_delegate_role(role.id)
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(
        jsonb_build_object('id',team.id,'name',team.name)
        order by team.sort_rank,team.name
      )
      from (
        select
          existing.id,
          existing.name,
          case when existing.id=primary_team_id then 0 else 1 end sort_rank
        from public.teams existing
        where existing.organization_id=target_profile.organization_id
          and existing.active
        order by sort_rank,existing.name
        limit 8
      ) team
    ),'[]'::jsonb),
    'pendingInvites',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',invitee.id,
          'firstName',employee.first_name,
          'lastName',employee.last_name,
          'email',invitee.email,
          'roleId',invite_role.id,
          'teamName',coalesce(invite_team.name,'')
        ) order by invitee.created_at
      )
      from public.profiles invitee
      join public.employee_profiles employee
        on employee.profile_id=invitee.id
        and employee.organization_id=invitee.organization_id
      join lateral (
        select role.id
        from public.user_roles assignment
        join public.roles role
          on role.id=assignment.role_id
          and role.organization_id=assignment.organization_id
          and role.active
        where assignment.profile_id=invitee.id
          and assignment.organization_id=invitee.organization_id
          and assignment.valid_from<=now()
          and (
            assignment.valid_until is null
            or assignment.valid_until>now()
          )
        order by assignment.valid_from desc
        limit 1
      ) invite_role on true
      left join lateral (
        select team.name
        from public.team_memberships membership
        join public.teams team
          on team.id=membership.team_id
          and team.organization_id=membership.organization_id
        where membership.profile_id=invitee.id
          and membership.organization_id=invitee.organization_id
          and membership.valid_from<=current_date
          and (
            membership.valid_until is null
            or membership.valid_until>=current_date
          )
        order by membership.valid_from desc,team.name
        limit 1
      ) invite_team on true
      where invitee.organization_id=target_profile.organization_id
        and invitee.status='invited'
        and target_profile.onboarding_prepared_at is not null
        and exists(
          select 1 from public.audit_logs audit
          where audit.organization_id=target_profile.organization_id
            and audit.actor_id=target_profile.id
            and audit.entity_id=invitee.id
            and audit.action='user.invited'
            and audit.created_at>=target_profile.onboarding_prepared_at
        )
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_onboarding_catalog()
  from public,anon,authenticated;
grant execute on function public.get_admin_onboarding_catalog()
  to authenticated;

notify pgrst, 'reload schema';
