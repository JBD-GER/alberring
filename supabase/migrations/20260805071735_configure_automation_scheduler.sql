-- Supabase Cron invokes the idempotent automation functions with a dedicated
-- secret. Secret values live in Vault and never enter migrations or logs.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_automation(
  p_function text,
  p_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, private, vault, net
as $$
declare
  project_url text;
  automation_secret text;
  request_id bigint;
begin
  if p_function not in (
    'process-scheduled-news',
    'send-notification-batch',
    'process-birthday-reminders',
    'process-mileage-reminders'
  ) then
    raise exception 'automation_function_not_allowed' using errcode='42501';
  end if;

  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name='alberring_project_url';
  select decrypted_secret into automation_secret
  from vault.decrypted_secrets
  where name='alberring_automation_secret';

  if project_url is null or automation_secret is null then
    raise exception 'automation_vault_secrets_missing' using errcode='55000';
  end if;

  select net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/'||p_function,
    headers:=jsonb_build_object(
      'content-type','application/json',
      'x-automation-secret',automation_secret
    ),
    body:=coalesce(p_body,'{}'::jsonb),
    timeout_milliseconds:=120000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_automation(text,jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.cleanup_automation_logs()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, cron
as $$
begin
  delete from public.scheduled_jobs_log
  where started_at<now()-interval '90 days';

  delete from cron.job_run_details
  where coalesce(end_time,start_time)<now()-interval '30 days';
end;
$$;

revoke all on function private.cleanup_automation_logs()
  from public, anon, authenticated, service_role;

create or replace function private.configure_automation_schedules()
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, cron
as $$
begin
  if (
    select count(*)
    from vault.decrypted_secrets
    where name in ('alberring_project_url','alberring_automation_secret')
  )<>2 then
    raise exception 'automation_vault_secrets_missing' using errcode='55000';
  end if;

  perform cron.schedule(
    'alberring-process-scheduled-news',
    '* * * * *',
    $job$select private.invoke_automation('process-scheduled-news','{}'::jsonb)$job$
  );
  perform cron.schedule(
    'alberring-send-notification-batch',
    '*/5 * * * *',
    $job$select private.invoke_automation('send-notification-batch','{"limit":100}'::jsonb)$job$
  );
  perform cron.schedule(
    'alberring-process-birthday-reminders',
    '5 * * * *',
    $job$select private.invoke_automation('process-birthday-reminders','{}'::jsonb)$job$
  );
  perform cron.schedule(
    'alberring-process-mileage-reminders',
    '15 * * * *',
    $job$select private.invoke_automation('process-mileage-reminders','{}'::jsonb)$job$
  );
  perform cron.schedule(
    'alberring-cleanup-automation-logs',
    '40 3 * * *',
    $job$select private.cleanup_automation_logs()$job$
  );
end;
$$;

revoke all on function private.configure_automation_schedules()
  from public, anon, authenticated, service_role;

do $$
begin
  if (
    select count(*)
    from vault.decrypted_secrets
    where name in ('alberring_project_url','alberring_automation_secret')
  )=2 then
    perform private.configure_automation_schedules();
  else
    raise notice 'Automation schedules skipped: configure alberring_project_url and alberring_automation_secret in Vault first.';
  end if;
end
$$;
