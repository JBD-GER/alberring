-- SECURITY DEFINER functions are API endpoints in an exposed schema. PostgreSQL
-- grants EXECUTE to PUBLIC by default, which also makes them callable by anon.
-- Keep the existing authenticated/service-role API surface, but require a
-- signed-in session before the function's own authorization checks run.
do $$
declare
  function_record record;
begin
  for function_record in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to authenticated, service_role',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end
$$;

-- This is an internal scheduler audit table. It deliberately has no client RLS
-- policy; make that boundary explicit at the privilege layer as well.
revoke all on table public.scheduled_jobs_log from anon, authenticated;
