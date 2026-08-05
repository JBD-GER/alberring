begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
select plan(34);

select ok(has_table_privilege('authenticated', 'public.messages', 'select'),
  'Authenticated darf sichtbare Nachrichten lesen');
select ok(not has_table_privilege('authenticated', 'public.messages', 'insert'),
  'Nachrichten werden ausschließlich über den geprüften RPC erstellt');
select ok(has_table_privilege('authenticated', 'public.user_roles', 'select'),
  'Authenticated darf freigegebene Rollenzuweisungen lesen');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'insert'),
  'Rollenzuweisungen bleiben RPC-only');
select ok(has_table_privilege('authenticated', 'public.news_posts', 'select'),
  'Authenticated darf per RLS freigegebene News lesen');
select ok(not has_table_privilege('authenticated', 'public.news_posts', 'update'),
  'News-Änderungen bleiben RPC-only');
select ok(has_table_privilege('authenticated', 'public.documents', 'select'),
  'Authenticated darf per RLS freigegebene Dokumente lesen');
select ok(not has_table_privilege('authenticated', 'public.documents', 'delete'),
  'Dokumente werden nicht direkt gelöscht');
select ok(has_table_privilege('authenticated', 'public.shifts', 'select'),
  'Authenticated darf per RLS freigegebene Einsätze lesen');
select ok(not has_table_privilege('authenticated', 'public.shifts', 'update'),
  'Einsatzänderungen bleiben RPC-only');
select ok(has_table_privilege('authenticated', 'public.vehicles', 'select'),
  'Authenticated darf per RLS freigegebene Fahrzeuge lesen');
select ok(not has_table_privilege('authenticated', 'public.vehicles', 'update'),
  'Fahrzeugänderungen bleiben RPC-only');
select ok(has_table_privilege('authenticated', 'public.material_requests', 'select'),
  'Authenticated darf per RLS freigegebene Materialanfragen lesen');
select ok(not has_table_privilege('authenticated', 'public.material_requests', 'insert'),
  'Materialanfragen werden ausschließlich über den geprüften RPC erstellt');

select ok(has_column_privilege('authenticated', 'public.leave_requests', 'status', 'select'),
  'Der freigegebene Urlaubsstatus bleibt lesbar');
select ok(not has_column_privilege('authenticated', 'public.leave_requests', 'note', 'select'),
  'Vertrauliche Urlaubsnotizen bleiben maskiert');
select ok(has_column_privilege('authenticated', 'public.profiles', 'id', 'select'),
  'Die öffentliche Profil-ID bleibt joinbar');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'auth_user_id', 'select'),
  'Die Auth-ID bleibt außerhalb sicherer RPCs verborgen');
select ok(has_column_privilege('authenticated', 'public.employee_profiles', 'first_name', 'select'),
  'Der freigegebene Vorname bleibt im Verzeichnis lesbar');
select ok(not has_column_privilege('authenticated', 'public.employee_profiles', 'birth_date', 'select'),
  'Das Geburtsdatum bleibt außerhalb sicherer RPCs verborgen');
select ok(has_column_privilege('authenticated', 'public.sick_leave_records', 'status', 'select'),
  'Der freigegebene Abwesenheitsstatus bleibt lesbar');
select ok(not has_column_privilege('authenticated', 'public.sick_leave_records', 'certificate_status', 'select'),
  'Der Atteststatus bleibt außerhalb sicherer RPCs verborgen');
select ok(has_column_privilege('authenticated', 'public.sick_leave_records', 'status', 'update'),
  'Der trigger-geschützte Krankmeldungsstatus bleibt aktualisierbar');
select ok(not has_column_privilege('authenticated', 'public.sick_leave_records', 'expected_end_on', 'update'),
  'Andere Krankmeldungsfelder sind nicht direkt aktualisierbar');
select ok(has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update'),
  'Eigene Benachrichtigungen können als gelesen markiert werden');
select ok(not has_column_privilege('authenticated', 'public.notifications', 'body', 'update'),
  'Benachrichtigungsinhalte sind unveränderlich');

select ok(not has_table_privilege('authenticated', 'public.scheduled_jobs_log', 'select'),
  'Scheduler-Protokolle bleiben service-only');
select ok(not has_table_privilege('anon', 'public.messages', 'select'),
  'Anon hat keinen Zugriff auf Anwendungstabellen');
select ok(not has_table_privilege('authenticated', 'public.messages', 'truncate'),
  'Authenticated darf RLS nicht mit TRUNCATE umgehen');
select ok(not has_table_privilege('authenticated', 'public.roles', 'insert'),
  'Rollen werden ausschließlich über den geprüften RPC erstellt');
select ok(has_table_privilege('service_role', 'public.scheduled_jobs_log', 'select'),
  'Service Role kann interne Scheduler-Protokolle verarbeiten');
select ok(has_table_privilege('service_role', 'public.messages', 'insert'),
  'Service Role behält den administrativen Tabellenzugriff');
select is(
  (
    select count(*)
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and not (
        has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'select')
        and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'insert')
        and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'update')
        and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'delete')
      )
  ),
  0::bigint,
  'Service Role hat vollständiges DML auf allen aktuellen Public-Tabellen'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  0::bigint,
  'Alle Public-Tabellen mit Data-API-Basisrechten sind durch RLS geschützt'
);

select * from finish();
rollback;
