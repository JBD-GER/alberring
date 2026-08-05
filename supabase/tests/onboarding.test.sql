begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(27);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
)
select
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'info@alberring.de',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
where not exists(
  select 1 from auth.users where lower(email)='info@alberring.de'
);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values(
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'onboarding-other@example.test',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
);

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status,
  onboarding_required,onboarding_completed_at
)
select
  'b2000000-0000-4000-8000-000000000001',u.id,
  '00000000-0000-4000-8000-000000000001',
  'Onboarding Admin','info@alberring.de','active',true,null
from auth.users u
where lower(u.email)='info@alberring.de'
  and not exists(
    select 1 from public.profiles p
    where lower(p.email)='info@alberring.de'
  );

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
) values(
  'b2000000-0000-4000-8000-000000000002',
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '00000000-0000-4000-8000-000000000001',
  'Anderer Super Admin','onboarding-other@example.test','active'
);

update public.profiles
set onboarding_required=true,onboarding_completed_at=null
where lower(email)='info@alberring.de';

insert into public.employee_profiles(
  profile_id,organization_id,first_name,last_name,job_title
)
select
  p.id,p.organization_id,'Onboarding','Admin','Administration'
from public.profiles p
where lower(p.email)='info@alberring.de'
on conflict(profile_id) do nothing;

insert into public.employee_profiles(
  profile_id,organization_id,first_name,last_name,job_title
) values(
  'b2000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'Anderer','Admin','Administration'
);

insert into public.user_roles(profile_id,role_id,organization_id)
select p.id,r.id,p.organization_id
from public.profiles p
join public.roles r
  on r.organization_id=p.organization_id
  and r.system_key='super_admin'
where lower(p.email) in (
  'info@alberring.de','onboarding-other@example.test'
)
and not exists(
  select 1 from public.user_roles existing
  where existing.profile_id=p.id
    and existing.role_id=r.id
    and existing.valid_from<=now()
    and (existing.valid_until is null or existing.valid_until>now())
);

update public.organizations
set name='Onboarding Ausgang'
where id='00000000-0000-4000-8000-000000000001';

select set_config(
  'pgtap.onboarding_auth_id',
  (
    select p.auth_user_id::text from public.profiles p
    where lower(p.email)='info@alberring.de'
  ),
  true
);

select has_column(
  'public','profiles','onboarding_required',
  'Profile besitzen ein explizites Onboarding-Merkmal'
);
select has_column(
  'public','profiles','onboarding_completed_at',
  'Profile speichern den einmaligen Onboarding-Abschluss'
);
select ok(
  has_function_privilege(
    'authenticated','public.get_my_onboarding_state()','execute'
  )
  and has_function_privilege(
    'authenticated','public.get_admin_onboarding_defaults()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_my_onboarding_state()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_admin_onboarding_defaults()','execute'
  ),
  'Onboarding-Lese-RPCs sind ausschließlich authentifiziert erreichbar'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.complete_admin_onboarding(text,text,text,text,text,text,text,text,text,text,smallint,smallint[],smallint,smallint[],smallint,boolean,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_admin_onboarding(text,text,text,text,text,text,text,text,text,text,smallint,smallint[],smallint,smallint[],smallint,boolean,boolean)',
    'execute'
  ),
  'Abschluss-RPC ist nicht anonym erreichbar'
);
select ok(
  not has_column_privilege(
    'authenticated','public.profiles','onboarding_required','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','onboarding_completed_at','select'
  ),
  'Interne Onboarding-Felder sind nicht direkt über die Data API lesbar'
);
select throws_ok(
  $$
    update public.profiles
    set onboarding_required=true
    where email='onboarding-other@example.test'
  $$,
  '23514',null,
  'Die Tabelleninvariante verbietet Onboarding für andere E-Mail-Adressen'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  true
);
select is(
  (select required from public.get_my_onboarding_state()),
  false,
  'Ein anderer Super Admin benötigt kein Onboarding'
);
select is(
  (select eligible from public.get_my_onboarding_state()),
  false,
  'Ein anderer Super Admin ist nicht onboarding-berechtigt'
);
select throws_ok(
  $$ select * from public.get_admin_onboarding_defaults() $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann die exklusiven Vorgaben nicht laden'
);
select throws_ok(
  $$
    select public.complete_admin_onboarding(
      'Fremde Organisation','Fremder Admin','Fremd','Admin','','',
      'Europe/Berlin','','','',1::smallint,array[25]::smallint[],
      2::smallint,array[7,0]::smallint[],15::smallint,false,false
    )
  $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann das Onboarding nicht abschließen'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.onboarding_auth_id'),
  true
);
select is(
  (select required from public.get_my_onboarding_state()),
  true,
  'Das Zielkonto wird zum exklusiven Onboarding geleitet'
);
select is(
  (select eligible from public.get_my_onboarding_state()),
  true,
  'Das Zielkonto ist serverseitig onboarding-berechtigt'
);
select is(
  (select count(*)::integer from public.get_admin_onboarding_defaults()),
  1,
  'Das Zielkonto kann seine sicheren Ausgangswerte laden'
);
select throws_ok(
  $$
    select public.complete_admin_onboarding(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Invalid/Timezone',
      'Hauptstelle','Verwaltung','Administration',1::smallint,
      array[25]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,true,false
    )
  $$,
  '22023','invalid_onboarding_timezone',
  'Eine unbekannte Zeitzone wird abgewiesen'
);
select throws_ok(
  $$
    select public.complete_admin_onboarding(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle','Verwaltung','Administration',1::smallint,
      array[0]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,true,false
    )
  $$,
  '22023','invalid_mileage_reminder_days',
  'Ungültige Kilometer-Erinnerungstage werden abgewiesen'
);
select lives_ok(
  $$
    select public.complete_admin_onboarding(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle Onboarding','Verwaltung Onboarding',
      'Administration Onboarding',2::smallint,
      array[28,25,25]::smallint[],3::smallint,
      array[0,14,7,7]::smallint[],30::smallint,true,false
    )
  $$,
  'Das Zielkonto kann alle Ersteinrichtungsdaten transaktional speichern'
);
select is(
  (select required from public.get_my_onboarding_state()),
  false,
  'Nach dem Abschluss wird das Zielkonto nicht erneut umgeleitet'
);

reset role;
select ok(
  (select onboarding_completed_at is not null from public.profiles
   where lower(email)='info@alberring.de'),
  'Der Abschlusszeitpunkt wurde am Zielprofil gespeichert'
);
select is(
  (select name from public.organizations
   where id='00000000-0000-4000-8000-000000000001'),
  'Alberring Ambulante Pflege',
  'Der Organisationsname wurde gespeichert'
);
select ok(
  exists(
    select 1
    from public.profiles p
    join public.employee_profiles ep on ep.profile_id=p.id
    where lower(p.email)='info@alberring.de'
      and p.display_name='Alberring Admin'
      and ep.first_name='Alberring'
      and ep.last_name='Admin'
      and ep.work_phone='+49 40 123456'
      and ep.job_title='Geschäftsführung'
  ),
  'Admin-Profil und Mitarbeiterangaben wurden gemeinsam aktualisiert'
);
select ok(
  exists(
    select 1 from public.organization_settings settings
    where settings.organization_id='00000000-0000-4000-8000-000000000001'
      and settings.timezone='Europe/Berlin'
      and settings.leave_approval_steps=2
      and settings.mileage_reminder_days=array[25,28]::smallint[]
      and settings.mileage_overdue_day=3
      and settings.birthday_reminder_days=array[14,7,0]::smallint[]
      and settings.message_edit_window_minutes=30
  ),
  'Workflow- und Erinnerungseinstellungen wurden validiert gespeichert'
);
select ok(
  exists(
    select 1
    from public.profiles p
    join public.employee_profiles ep on ep.profile_id=p.id
    join public.locations location on location.id=ep.location_id
    join public.departments department on department.id=ep.department_id
    where lower(p.email)='info@alberring.de'
      and location.name='Hauptstelle Onboarding'
      and department.name='Verwaltung Onboarding'
  ),
  'Standort und Bereich wurden erstellt und dem Admin zugeordnet'
);
select ok(
  exists(
    select 1
    from public.profiles p
    join public.team_memberships membership on membership.profile_id=p.id
    join public.teams team on team.id=membership.team_id
    where lower(p.email)='info@alberring.de'
      and team.name='Administration Onboarding'
      and team.lead_profile_id=p.id
      and membership.valid_until is null
  ),
  'Das erste Team wurde erstellt und dem Admin zugeordnet'
);
select is(
  (
    select count(*)::integer
    from public.notification_preferences preferences
    join public.profiles p on p.id=preferences.profile_id
    where lower(p.email)='info@alberring.de'
      and preferences.email_enabled
      and not preferences.push_enabled
  ),
  10,
  'Benachrichtigungspräferenzen wurden für alle Kategorien eingerichtet'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.onboarding_completed'
  ),
  1,
  'Der Onboarding-Abschluss wurde revisionssicher protokolliert'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.onboarding_auth_id'),
  true
);
select throws_ok(
  $$
    select public.complete_admin_onboarding(
      'Erneute Änderung','Alberring Admin','Alberring','Admin','','',
      'Europe/Berlin','','','',1::smallint,array[25]::smallint[],
      2::smallint,array[7,0]::smallint[],15::smallint,false,false
    )
  $$,
  '22023','onboarding_already_completed',
  'Das einmalige Onboarding kann nicht erneut ausgeführt werden'
);
select is(
  (
    select required from public.get_my_onboarding_state()
  ),
  false,
  'Das Zielkonto bleibt nach erneutem Aufruf dauerhaft abgeschlossen'
);

select * from finish();
rollback;
