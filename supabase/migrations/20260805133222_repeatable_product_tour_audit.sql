-- Record one audit event per product-tour cycle while keeping repeated
-- completion requests for the same cycle idempotent.
create or replace function public.save_product_tour_progress(
  p_step smallint,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_profile public.profiles%rowtype;
begin
  select p.* into target_profile
  from public.profiles p
  join auth.users u on u.id=p.auth_user_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and p.onboarding_completed_at is not null
    and lower(trim(p.email))='info@alberring.de'
    and lower(trim(u.email))='info@alberring.de'
  for update of p;

  if target_profile.id is null then
    raise exception 'product_tour_not_available' using errcode='42501';
  end if;
  if not private.has_permission('settings.manage')
    or not private.has_permission('users.manage')
    or not private.has_permission('teams.manage')
    or not private.has_permission('dashboard.view')
    or not private.has_permission('messages.use')
    or not (
      private.has_permission('schedule.view_own')
      or private.has_permission('schedule.view_team')
      or private.has_permission('schedule.manage')
    )
    or not (
      private.has_permission('documents.view_own')
      or private.has_permission('documents.view_shared')
      or private.has_permission('documents.manage')
    ) then
    raise exception 'product_tour_not_available' using errcode='42501';
  end if;
  if p_step is null
    or p_action is null
    or p_step not between 0 and 6
    or p_action not in ('progress','deferred','completed') then
    raise exception 'invalid_product_tour_progress' using errcode='22023';
  end if;
  if target_profile.product_tour_completed_at is not null
    and p_action<>'completed' then
    raise exception 'product_tour_already_completed' using errcode='22023';
  end if;

  update public.profiles
  set
    product_tour_required=p_action<>'completed',
    product_tour_completed_at=case
      when p_action='completed' then coalesce(product_tour_completed_at,now())
      else null
    end,
    product_tour_version=1,
    product_tour_step=p_step,
    product_tour_deferred_until=case
      when p_action='deferred' then now()+interval '1 day'
      else null
    end,
    updated_at=now()
  where id=target_profile.id;

  insert into public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,metadata
  )
  select
    target_profile.organization_id,target_profile.id,
    case p_action
      when 'completed' then 'admin.product_tour_completed'
      when 'deferred' then 'admin.product_tour_deferred'
      else 'admin.product_tour_progressed'
    end,
    'profile',target_profile.id,
    jsonb_build_object('step',p_step,'version',1)
  where (p_action<>'progress' or p_step in (1,3,6))
    and not (
      p_action='completed'
      and target_profile.product_tour_completed_at is not null
    );
end;
$$;

revoke all on function public.save_product_tour_progress(smallint,text)
  from public,anon,authenticated;
grant execute on function public.save_product_tour_progress(smallint,text)
  to authenticated;
