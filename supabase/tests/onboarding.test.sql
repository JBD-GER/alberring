begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(51);

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
set
  onboarding_required=true,
  onboarding_completed_at=null,
  onboarding_prepared_at=null,
  product_tour_required=false,
  product_tour_completed_at=null,
  product_tour_version=0,
  product_tour_step=0,
  product_tour_deferred_until=null
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

insert into public.teams(
  id,organization_id,name,location_name,active
) values(
  'b3000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Onboarding Existing Team','Bestehender Außenstandort',true
);
insert into public.teams(organization_id,name,active)
select
  '00000000-0000-4000-8000-000000000001',
  'Onboarding Catalog Extra '||series,
  true
from generate_series(1,8) series;

delete from public.team_memberships membership
using public.profiles profile
where membership.profile_id=profile.id
  and lower(profile.email)='info@alberring.de';
insert into public.team_memberships(
  team_id,profile_id,organization_id,valid_from,valid_until
)
select team.id,profile.id,profile.organization_id,current_date,null
from public.profiles profile
join public.teams team
  on team.organization_id=profile.organization_id
  and team.name='Onboarding Catalog Extra 8'
where lower(profile.email)='info@alberring.de';

select set_config(
  'pgtap.onboarding_auth_id',
  (
    select p.auth_user_id::text from public.profiles p
    where lower(p.email)='info@alberring.de'
  ),
  true
);
select set_config(
  'pgtap.setup_audit_before',
  (
    select count(*)::text
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.onboarding_setup_saved'
  ),
  true
);
select set_config(
  'pgtap.complete_audit_before',
  (
    select count(*)::text
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.onboarding_completed'
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
select has_column(
  'public','profiles','onboarding_prepared_at',
  'Die sichere Vorbereitung wird getrennt vom Abschluss gespeichert'
);
select has_column(
  'public','profiles','product_tour_required',
  'Profile besitzen einen serverseitigen Produkttour-Status'
);
select has_column(
  'public','profiles','product_tour_completed_at',
  'Der Produkttour-Abschluss wird dauerhaft gespeichert'
);
select ok(
  has_function_privilege(
    'authenticated','public.get_my_onboarding_state()','execute'
  )
  and has_function_privilege(
    'authenticated','public.get_admin_onboarding_defaults()','execute'
  )
  and has_function_privilege(
    'authenticated','public.get_admin_onboarding_catalog()','execute'
  )
  and has_function_privilege(
    'authenticated','public.get_my_product_tour_state()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_my_onboarding_state()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_admin_onboarding_defaults()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_admin_onboarding_catalog()','execute'
  )
  and not has_function_privilege(
    'anon','public.get_my_product_tour_state()','execute'
  ),
  'Alle Lese-RPCs sind ausschließlich authentifiziert erreichbar'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_admin_onboarding_v2(text,text,text,text,text,text,text,text,text,text[],smallint,smallint[],smallint,smallint[],smallint,boolean,boolean)',
    'execute'
  )
  and has_function_privilege(
    'authenticated','public.finalize_admin_onboarding()','execute'
  )
  and has_function_privilege(
    'authenticated','public.save_product_tour_progress(smallint,text)','execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.complete_admin_onboarding(text,text,text,text,text,text,text,text,text,text,smallint,smallint[],smallint,smallint[],smallint,boolean,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon','public.finalize_admin_onboarding()','execute'
  )
  and not has_function_privilege(
    'anon',
    'public.prepare_admin_onboarding_v2(text,text,text,text,text,text,text,text,text,text[],smallint,smallint[],smallint,smallint[],smallint,boolean,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon','public.save_product_tour_progress(smallint,text)','execute'
  ),
  'Nur der neue, mehrstufige Mutationspfad ist authentifiziert erreichbar'
);
select ok(
  not has_column_privilege(
    'authenticated','public.profiles','onboarding_required','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','onboarding_prepared_at','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_required','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','onboarding_completed_at','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_completed_at','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_version','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_step','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_deferred_until','select'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_completed_at','update'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_version','update'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_step','update'
  )
  and not has_column_privilege(
    'authenticated','public.profiles','product_tour_deferred_until','update'
  ),
  'Interne Onboarding- und Tourfelder sind nicht direkt über die Data API erreichbar'
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
select throws_ok(
  $$
    update public.profiles
    set product_tour_required=true
    where email='onboarding-other@example.test'
  $$,
  '23514',null,
  'Die Tabelleninvariante verbietet die Produkttour für andere Profile'
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
select is(
  (select eligible from public.get_my_product_tour_state()),
  false,
  'Ein anderer Super Admin ist nicht für die Produkttour berechtigt'
);
select throws_ok(
  $$ select * from public.get_admin_onboarding_defaults() $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann die exklusiven Vorgaben nicht laden'
);
select throws_ok(
  $$ select public.get_admin_onboarding_catalog() $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann Rollen und Teams des Onboardings nicht laden'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Fremde Organisation','Fremder Admin','Fremd','Admin','','',
      'Europe/Berlin','','',array['Fremdes Team'],1::smallint,
      array[25]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,false,false
    )
  $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann die Vorbereitung nicht ausführen'
);
select throws_ok(
  $$ select public.finalize_admin_onboarding() $$,
  '42501','onboarding_not_available',
  'Ein anderer Super Admin kann das Onboarding nicht finalisieren'
);
select throws_ok(
  $$ select public.save_product_tour_progress(1::smallint,'progress') $$,
  '42501','product_tour_not_available',
  'Ein anderer Super Admin kann keinen Produkttour-Status schreiben'
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
select ok(
  exists(
    select 1
    from jsonb_array_elements(
      public.get_admin_onboarding_catalog()->'roles'
    ) role
    where role->>'systemKey'='employee'
  )
  and exists(
    select 1
    from jsonb_array_elements(
      public.get_admin_onboarding_catalog()->'roles'
    ) role
    where role->>'systemKey'='team_lead'
  )
  and not exists(
    select 1
    from jsonb_array_elements(
      public.get_admin_onboarding_catalog()->'roles'
    ) role
    where role->>'systemKey' in ('super_admin','auditor')
  )
  and jsonb_array_length(
    public.get_admin_onboarding_catalog()->'teams'
  )=8
  and public.get_admin_onboarding_catalog()->'teams'->0->>'name'
    ='Onboarding Catalog Extra 8',
  'Der sichere Katalog bleibt begrenzt und enthält das bisherige Primärteam zuerst'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Invalid/Timezone',
      'Hauptstelle','Verwaltung',array['Administration'],1::smallint,
      array[25]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,true,false
    )
  $$,
  '22023','invalid_onboarding_timezone',
  'Eine unbekannte Zeitzone wird abgewiesen'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle','Verwaltung',array['Administration'],1::smallint,
      array[0]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,true,false
    )
  $$,
  '22023','invalid_mileage_reminder_days',
  'Ungültige Kilometer-Erinnerungstage werden abgewiesen'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle','Verwaltung',array['Doppelt',' doppelt '],1::smallint,
      array[25]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,true,false
    )
  $$,
  '22023','invalid_onboarding_teams',
  'Teamnamen müssen bereinigt und ohne Duplikate sein'
);
select throws_ok(
  $$ select public.finalize_admin_onboarding() $$,
  '22023','onboarding_setup_required',
  'Die Finalisierung ist vor der vollständigen Vorbereitung gesperrt'
);
select lives_ok(
  $$
    select set_config(
      'pgtap.prepared_team_result',
      public.prepare_admin_onboarding_v2(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle Onboarding','Verwaltung Onboarding',
      array['Onboarding Existing Team','Onboarding Test Team B'],2::smallint,
      array[28,25,25]::smallint[],3::smallint,
      array[0,14,7,7]::smallint[],30::smallint,true,false
      )::text,
      true
    )
  $$,
  'Das Zielkonto kann Organisation, Profil, mehrere Teams und Regeln vorbereiten'
);
select is(
  (select required from public.get_my_onboarding_state()),
  true,
  'Das Onboarding bleibt bis nach erfolgreichen Einladungen ausstehend'
);

reset role;
select ok(
  (
    select onboarding_prepared_at is not null
      and onboarding_completed_at is null
    from public.profiles
    where lower(email)='info@alberring.de'
  ),
  'Vorbereitung und Abschluss sind serverseitig getrennte Zustände'
);
select is(
  (
    select name from public.organizations
    where id='00000000-0000-4000-8000-000000000001'
  ),
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
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      current_setting('pgtap.prepared_team_result')::jsonb->'teams'
    ) result
    join public.teams team
      on team.id=(result->>'id')::uuid
      and team.name=result->>'name'
  ),
  2,
  'Der RPC liefert für jedes vorbereitete Team eine echte ID und den Namen zurück'
);
select is(
  (
    select count(*)::integer
    from public.teams team
    join public.locations location on location.id=team.location_id
    join public.departments department on department.id=team.department_id
    where team.name='Onboarding Test Team B'
      and location.name='Hauptstelle Onboarding'
      and department.name='Verwaltung Onboarding'
      and team.location_name='Hauptstelle Onboarding'
      and team.active
  ),
  1,
  'Neu angelegte Teams sind relational und abwärtskompatibel mit Standort verknüpft'
);
select ok(
  exists(
    select 1 from public.teams team
    where team.id='b3000000-0000-4000-8000-000000000001'
      and team.name='Onboarding Existing Team'
      and team.location_name='Bestehender Außenstandort'
      and team.location_id is null
      and team.department_id is null
      and team.lead_profile_id is null
      and team.active
  ),
  'Bestehende Team-, Standort- und Leitungsdaten bleiben unverändert'
);
select ok(
  exists(
    select 1
    from public.profiles p
    join public.team_memberships membership on membership.profile_id=p.id
    join public.teams team on team.id=membership.team_id
    where lower(p.email)='info@alberring.de'
      and team.name='Onboarding Existing Team'
      and membership.valid_until is null
  ),
  'Das erste Team wurde als Primärteam dem Admin zugeordnet'
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

update public.profiles
set onboarding_prepared_at=clock_timestamp()-interval '1 hour'
where lower(email)='info@alberring.de';
select set_config(
  'pgtap.prepared_at_before_retry',
  (
    select onboarding_prepared_at::text
    from public.profiles
    where lower(email)='info@alberring.de'
  ),
  true
);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values(
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  'onboarding-pending@example.test',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
);
insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
)
select
  'b2000000-0000-4000-8000-000000000003',
  'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  target.organization_id,'Ausstehende Einladung',
  'onboarding-pending@example.test','invited'
from public.profiles target
where lower(target.email)='info@alberring.de';
insert into public.employee_profiles(
  profile_id,organization_id,first_name,last_name,job_title
)
select
  invitee.id,invitee.organization_id,'Pending','Invite','Pflege'
from public.profiles invitee
where invitee.email='onboarding-pending@example.test';
insert into public.user_roles(profile_id,role_id,organization_id)
select invitee.id,role.id,invitee.organization_id
from public.profiles invitee
join public.roles role
  on role.organization_id=invitee.organization_id
  and role.system_key='employee'
where invitee.email='onboarding-pending@example.test';
insert into public.team_memberships(
  team_id,profile_id,organization_id,valid_from,valid_until
)
select team.id,invitee.id,invitee.organization_id,current_date,null
from public.profiles invitee
join public.teams team
  on team.organization_id=invitee.organization_id
  and team.name='Onboarding Test Team B'
where invitee.email='onboarding-pending@example.test';
insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
)
select
  target.organization_id,target.id,'user.invited','profile',invitee.id,
  jsonb_build_object('source','onboarding')
from public.profiles target
join public.profiles invitee
  on invitee.organization_id=target.organization_id
  and invitee.email='onboarding-pending@example.test'
where lower(target.email)='info@alberring.de';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.onboarding_auth_id'),
  true
);
select lives_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Alberring Ambulante Pflege','Alberring Admin','Alberring','Admin',
      '+49 40 123456','Geschäftsführung','Europe/Berlin',
      'Hauptstelle Onboarding','Verwaltung Onboarding',
      array['Onboarding Existing Team','Onboarding Test Team B'],2::smallint,
      array[28,25]::smallint[],3::smallint,
      array[0,14,7]::smallint[],45::smallint,true,false
    )
  $$,
  'Ein Wiederholungsversuch speichert geänderte Regeln idempotent'
);
select ok(
  exists(
    select 1
    from jsonb_array_elements(
      public.get_admin_onboarding_catalog()->'pendingInvites'
    ) invite
    where invite->>'email'='onboarding-pending@example.test'
  ),
  'Ausstehende Einladungen bleiben auch nach erneutem Vorbereiten sichtbar'
);
reset role;
select is(
  (
    select onboarding_prepared_at::text
    from public.profiles
    where lower(email)='info@alberring.de'
  ),
  current_setting('pgtap.prepared_at_before_retry'),
  'Der erste Vorbereitungszeitpunkt bleibt über Wiederholungen stabil'
);
select is(
  (
    select message_edit_window_minutes
    from public.organization_settings
    where organization_id='00000000-0000-4000-8000-000000000001'
  ),
  45::smallint,
  'Geänderte Workflowwerte werden beim Einladungs-Retry erneut gespeichert'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.onboarding_setup_saved'
  ),
  current_setting('pgtap.setup_audit_before')::integer+2,
  'Die Vorbereitung wurde revisionssicher protokolliert'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.onboarding_auth_id'),
  true
);
select lives_ok(
  $$ select public.finalize_admin_onboarding() $$,
  'Nach vorbereiteten Einladungen kann das Zielkonto finalisieren'
);
select lives_ok(
  $$ select public.finalize_admin_onboarding() $$,
  'Eine verlorene Abschlussantwort kann idempotent wiederholt werden'
);
select is(
  (select required from public.get_my_onboarding_state()),
  false,
  'Nach der Finalisierung wird das Zielkonto nicht erneut umgeleitet'
);
select is(
  (select required from public.get_my_product_tour_state()),
  true,
  'Nach dem Onboarding startet ausschließlich die Produkttour'
);

reset role;
select ok(
  (
    select onboarding_completed_at is not null
      and product_tour_required
      and product_tour_completed_at is null
      and product_tour_version=1
      and product_tour_step=0
    from public.profiles
    where lower(email)='info@alberring.de'
  ),
  'Abschlusszeitpunkt und initialer Produkttour-Status wurden gespeichert'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.onboarding_completed'
  ),
  current_setting('pgtap.complete_audit_before')::integer+1,
  'Der finale Onboarding-Abschluss wurde revisionssicher protokolliert'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('pgtap.onboarding_auth_id'),
  true
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Erneute Änderung','Alberring Admin','Alberring','Admin','','',
      'Europe/Berlin','','',array['Noch einmal'],1::smallint,
      array[25]::smallint[],2::smallint,array[7,0]::smallint[],
      15::smallint,false,false
    )
  $$,
  '42501','onboarding_not_available',
  'Das einmalige Onboarding kann nicht erneut vorbereitet werden'
);
select is(
  (select required from public.get_my_onboarding_state()),
  false,
  'Das Zielkonto bleibt nach erneutem Aufruf dauerhaft abgeschlossen'
);

select * from finish();
rollback;
