-- Keep the first successful preparation boundary stable across browser reloads
-- and repeated invite retries. Clearing the marker explicitly remains possible
-- for a deliberate administrative reset.

create or replace function private.preserve_initial_onboarding_prepared_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.onboarding_prepared_at is not null
    and new.onboarding_prepared_at is not null then
    new.onboarding_prepared_at:=least(
      old.onboarding_prepared_at,
      new.onboarding_prepared_at
    );
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_initial_onboarding_prepared_at()
  from public,anon,authenticated,service_role;

drop trigger if exists preserve_initial_onboarding_prepared_at
  on public.profiles;
create trigger preserve_initial_onboarding_prepared_at
before update of onboarding_prepared_at on public.profiles
for each row
when (
  old.onboarding_prepared_at is not null
  and new.onboarding_prepared_at is not null
  and old.onboarding_prepared_at is distinct from new.onboarding_prepared_at
)
execute function private.preserve_initial_onboarding_prepared_at();
