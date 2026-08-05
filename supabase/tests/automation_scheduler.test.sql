begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(8);

select ok(
  exists(select 1 from pg_extension where extname='pg_cron'),
  'pg_cron ist installiert'
);
select ok(
  exists(select 1 from pg_extension where extname='pg_net'),
  'pg_net ist installiert'
);
select ok(
  not has_function_privilege('anon','private.invoke_automation(text,jsonb)','execute')
  and not has_function_privilege('authenticated','private.invoke_automation(text,jsonb)','execute')
  and not has_function_privilege('service_role','private.invoke_automation(text,jsonb)','execute'),
  'Data-API-Rollen können Automationsaufrufe nicht direkt starten'
);
select ok(
  not has_function_privilege('anon','private.configure_automation_schedules()','execute')
  and not has_function_privilege('authenticated','private.configure_automation_schedules()','execute')
  and not has_function_privilege('service_role','private.configure_automation_schedules()','execute'),
  'Zeitpläne lassen sich nur administrativ konfigurieren'
);
select ok(
  not has_function_privilege('anon','private.cleanup_automation_logs()','execute')
  and not has_function_privilege('authenticated','private.cleanup_automation_logs()','execute')
  and not has_function_privilege('service_role','private.cleanup_automation_logs()','execute'),
  'Log-Bereinigung ist nicht über die Data API aufrufbar'
);
select is(
  (
    select count(*)::integer
    from cron.job
    where jobname like 'alberring-%'
  ),
  case when (
    select count(*)
    from vault.decrypted_secrets
    where name in ('alberring_project_url','alberring_automation_secret')
  )=2 then 5 else 0 end,
  'Bei konfiguriertem Vault sind exakt fünf Alberring-Jobs aktiv'
);
select ok(
  (
    select count(*)=4
    from cron.job
    where jobname in (
      'alberring-process-scheduled-news',
      'alberring-send-notification-batch',
      'alberring-process-birthday-reminders',
      'alberring-process-mileage-reminders'
    )
      and active
      and command like '%private.invoke_automation%'
  ) or not exists (
    select 1
    from vault.decrypted_secrets
    where name='alberring_automation_secret'
  ),
  'Alle fachlichen Jobs rufen ausschließlich den privaten Dispatcher auf'
);
select ok(
  exists (
    select 1 from cron.job
    where jobname='alberring-cleanup-automation-logs'
      and schedule='40 3 * * *'
      and active
  ) or not exists (
    select 1
    from vault.decrypted_secrets
    where name='alberring_automation_secret'
  ),
  'Die tägliche Log-Retention ist konfiguriert'
);

select * from finish();
rollback;
