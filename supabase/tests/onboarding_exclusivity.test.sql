begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(37);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
)
select
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'info@alberring.de',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
where not exists(
  select 1 from auth.users where lower(email)='info@alberring.de'
);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values
(
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'tour-admin@example.test',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
),
(
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  'tour-employee@example.test',now(),
  '{"organization_id":"00000000-0000-4000-8000-000000000001"}',
  '{}','authenticated','authenticated'
);

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status,
  onboarding_required,onboarding_completed_at
)
select
  'c2000000-0000-4000-8000-000000000001',u.id,
  '00000000-0000-4000-8000-000000000001',
  'Tour Admin','info@alberring.de','active',true,null
from auth.users u
where lower(u.email)='info@alberring.de'
  and not exists(
    select 1 from public.profiles p
    where lower(p.email)='info@alberring.de'
  );

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
) values
(
  'c2000000-0000-4000-8000-000000000002',
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '00000000-0000-4000-8000-000000000001',
  'Weiterer Super Admin','tour-admin@example.test','active'
),
(
  'c2000000-0000-4000-8000-000000000003',
  'c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  '00000000-0000-4000-8000-000000000001',
  'Normale Mitarbeiterin','tour-employee@example.test','active'
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
select p.id,p.organization_id,'Tour','Admin','Administration'
from public.profiles p
where lower(p.email)='info@alberring.de'
on conflict(profile_id) do nothing;

insert into public.employee_profiles(
  profile_id,organization_id,first_name,last_name,job_title
) values
(
  'c2000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'Normaler','Admin','Administration'
),
(
  'c2000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Normale','Mitarbeiterin','Pflege'
);

insert into public.user_roles(profile_id,role_id,organization_id)
select p.id,r.id,p.organization_id
from public.profiles p
join public.roles r
  on r.organization_id=p.organization_id
  and r.system_key=case p.email
    when 'info@alberring.de' then 'super_admin'
    when 'tour-admin@example.test' then 'super_admin'
    else 'employee'
  end
where lower(p.email) in (
  'info@alberring.de','tour-admin@example.test','tour-employee@example.test'
)
and not exists(
  select 1 from public.user_roles existing
  where existing.profile_id=p.id
    and existing.role_id=r.id
    and existing.valid_from<=now()
    and (existing.valid_until is null or existing.valid_until>now())
);

select set_config(
  'pgtap.tour_auth_id',
  (
    select auth_user_id::text from public.profiles
    where lower(email)='info@alberring.de'
  ),
  true
);

-- Model a deliberately restarted tour after an earlier completed cycle. A
-- fresh completion must create one new audit event, while retries within that
-- same cycle remain idempotent.
insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
)
select
  profile.organization_id,profile.id,'admin.product_tour_completed',
  'profile',profile.id,'{"step":6,"version":1,"fixture":true}'::jsonb
from public.profiles profile
where lower(profile.email)='info@alberring.de'
  and not exists(
    select 1 from public.audit_logs audit
    where audit.organization_id=profile.organization_id
      and audit.actor_id=profile.id
      and audit.action='admin.product_tour_completed'
  );

select set_config(
  'pgtap.tour_audit_before',
  (
    select count(*)::text
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.product_tour_completed'
  ),
  true
);

select is(
  (
    select count(*)::integer
    from public.profiles profile
    join public.user_roles assignment on assignment.profile_id=profile.id
    join public.roles role
      on role.id=assignment.role_id
      and role.organization_id=assignment.organization_id
    where profile.email in (
      'tour-admin@example.test','tour-employee@example.test'
    )
      and role.system_key=case profile.email
        when 'tour-admin@example.test' then 'super_admin'
        else 'employee'
      end
      and assignment.valid_from<=now()
      and (
        assignment.valid_until is null
        or assignment.valid_until>now()
      )
  ),
  2,
  'Die Gegenproben besitzen tatsächlich aktive Super-Admin- und Mitarbeiterrollen'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub','c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',true
);
select is(
  (select required from public.get_my_onboarding_state()),false,
  'Ein weiterer Super Admin erhält kein Onboarding'
);
select is(
  (select eligible from public.get_my_onboarding_state()),false,
  'Ein weiterer Super Admin ist nicht onboarding-berechtigt'
);
select is(
  (select eligible from public.get_my_product_tour_state()),false,
  'Ein weiterer Super Admin erhält keine Produkttour'
);

select set_config(
  'request.jwt.claim.sub','c1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true
);
select is(
  (select required from public.get_my_onboarding_state()),false,
  'Eine Mitarbeiterrolle erhält kein Onboarding'
);
select is(
  (select eligible from public.get_my_onboarding_state()),false,
  'Eine Mitarbeiterrolle ist nicht onboarding-berechtigt'
);
select is(
  (select eligible from public.get_my_product_tour_state()),false,
  'Eine Mitarbeiterrolle erhält keine Produkttour'
);
select throws_ok(
  $$ select public.get_admin_onboarding_catalog() $$,
  '42501','onboarding_not_available',
  'Eine Mitarbeiterrolle kann den Onboarding-Katalog nicht lesen'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Fremd','Fremd','Fremd','Fremd','','','Europe/Berlin','','',
      array['Fremd'],1::smallint,array[25]::smallint[],2::smallint,
      array[7,0]::smallint[],15::smallint,false,false
    )
  $$,
  '42501','onboarding_not_available',
  'Eine Mitarbeiterrolle kann keine Onboarding-Daten schreiben'
);
select throws_ok(
  $$ select public.finalize_admin_onboarding() $$,
  '42501','onboarding_not_available',
  'Eine Mitarbeiterrolle kann das Onboarding nicht finalisieren'
);
select throws_ok(
  $$ select public.save_product_tour_progress(1::smallint,'progress') $$,
  '42501','product_tour_not_available',
  'Eine Mitarbeiterrolle kann keinen Tourfortschritt schreiben'
);

reset role;
select is(
  (
    select count(*)::integer from public.profiles
    where email in ('tour-admin@example.test','tour-employee@example.test')
      and onboarding_required
  ),
  0,
  'Neue Admin- und Mitarbeiterprofile starten ohne Onboarding-Flag'
);
select is(
  (
    select count(*)::integer from public.profiles
    where email in ('tour-admin@example.test','tour-employee@example.test')
      and product_tour_required
  ),
  0,
  'Neue Admin- und Mitarbeiterprofile starten ohne Produkttour-Flag'
);

update auth.users
set email='auth-mismatch@example.test'
where id=current_setting('pgtap.tour_auth_id')::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',current_setting('pgtap.tour_auth_id'),true
);
select is(
  (select required from public.get_my_onboarding_state()),false,
  'Eine abweichende Auth-E-Mail verhindert die Onboarding-Umleitung'
);
select is(
  (select eligible from public.get_my_onboarding_state()),false,
  'Profil-E-Mail allein genügt nicht für die Onboarding-Berechtigung'
);
select throws_ok(
  $$
    select public.prepare_admin_onboarding_v2(
      'Manipuliert','Manipuliert','Mani','Puliert','','','Europe/Berlin','','',
      array['Manipuliert'],1::smallint,array[25]::smallint[],2::smallint,
      array[7,0]::smallint[],15::smallint,false,false
    )
  $$,
  '42501','onboarding_not_available',
  'Eine Auth-/Profil-E-Mail-Abweichung sperrt auch Mutationen'
);

reset role;
update auth.users
set email='info@alberring.de'
where id=current_setting('pgtap.tour_auth_id')::uuid;
update public.profiles
set
  onboarding_completed_at=now(),
  onboarding_prepared_at=now(),
  product_tour_required=true,
  product_tour_completed_at=null,
  product_tour_version=1,
  product_tour_step=0,
  product_tour_deferred_until=null
where lower(email)='info@alberring.de';

update auth.users
set email='tour-auth-mismatch@example.test'
where id=current_setting('pgtap.tour_auth_id')::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',current_setting('pgtap.tour_auth_id'),true
);
select is(
  (select required from public.get_my_product_tour_state()),false,
  'Eine abweichende Auth-E-Mail verhindert auch die automatische Produkttour'
);
select is(
  (select eligible from public.get_my_product_tour_state()),false,
  'Profil-E-Mail allein genügt auch für die Produkttour nicht'
);
select throws_ok(
  $$ select public.save_product_tour_progress(1::smallint,'progress') $$,
  '42501','product_tour_not_available',
  'Eine Auth-/Profil-E-Mail-Abweichung sperrt Tourmutationen'
);

reset role;
update auth.users
set email='info@alberring.de'
where id=current_setting('pgtap.tour_auth_id')::uuid;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',current_setting('pgtap.tour_auth_id'),true
);
select is(
  (select required from public.get_my_product_tour_state()),true,
  'Die Produkttour startet nach abgeschlossenem Zielkonto-Onboarding'
);
select is(
  (select eligible from public.get_my_product_tour_state()),true,
  'Nur das Zielkonto ist für die Produkttour berechtigt'
);
select is(
  (select current_step from public.get_my_product_tour_state()),
  0::smallint,
  'Die Produkttour beginnt beim ersten Schritt'
);
select throws_ok(
  $$ select public.save_product_tour_progress(7::smallint,'progress') $$,
  '22023','invalid_product_tour_progress',
  'Unbekannte Produkttour-Schritte werden abgewiesen'
);
select throws_ok(
  $$ select public.save_product_tour_progress(null::smallint,'progress') $$,
  '22023','invalid_product_tour_progress',
  'Ein fehlender Produkttour-Schritt wird eindeutig abgewiesen'
);
select throws_ok(
  $$ select public.save_product_tour_progress(1::smallint,null::text) $$,
  '22023','invalid_product_tour_progress',
  'Eine fehlende Produkttour-Aktion wird eindeutig abgewiesen'
);
select lives_ok(
  $$ select public.save_product_tour_progress(2::smallint,'progress') $$,
  'Ein gültiger Tourfortschritt wird gespeichert'
);
select ok(
  (
    select required and current_step=2
    from public.get_my_product_tour_state()
  ),
  'Der gespeicherte Schritt bleibt beim nächsten Laden erhalten'
);
select lives_ok(
  $$ select public.save_product_tour_progress(2::smallint,'deferred') $$,
  'Die Produkttour kann für später zurückgestellt werden'
);
select is(
  (select required from public.get_my_product_tour_state()),false,
  'Eine zurückgestellte Tour öffnet nicht sofort erneut'
);
select ok(
  (
    select deferred_until>now()
    from public.get_my_product_tour_state()
  ),
  'Der Aufschub wird serverseitig mit Zukunftszeitpunkt gespeichert'
);

reset role;
update public.profiles
set product_tour_deferred_until=now()-interval '1 minute'
where lower(email)='info@alberring.de';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',current_setting('pgtap.tour_auth_id'),true
);
select is(
  (select required from public.get_my_product_tour_state()),true,
  'Nach abgelaufenem Aufschub wird die Produkttour wieder angeboten'
);
select lives_ok(
  $$ select public.save_product_tour_progress(6::smallint,'completed') $$,
  'Die Produkttour kann vollständig abgeschlossen werden'
);
select ok(
  (
    select not required and completed_at is not null and current_step=6
    from public.get_my_product_tour_state()
  ),
  'Der Abschluss beendet die automatische Tour dauerhaft'
);
select throws_ok(
  $$ select public.save_product_tour_progress(3::smallint,'progress') $$,
  '22023','product_tour_already_completed',
  'Ein abgeschlossener Tourstatus kann nicht zurückgesetzt werden'
);
select lives_ok(
  $$ select public.save_product_tour_progress(6::smallint,'completed') $$,
  'Ein wiederholtes Abschlussereignis bleibt idempotent'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.audit_logs log
    join public.profiles p on p.id=log.actor_id
    where lower(p.email)='info@alberring.de'
      and log.action='admin.product_tour_completed'
  ),
  current_setting('pgtap.tour_audit_before')::integer+1,
  'Der Tourabschluss wird genau einmal revisionssicher protokolliert'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where email in ('tour-admin@example.test','tour-employee@example.test')
      and (
        onboarding_required
        or product_tour_required
        or onboarding_completed_at is not null
        or product_tour_completed_at is not null
      )
  ),
  0,
  'Auch nach der Zielkonto-Tour bleiben andere Rollen vollständig ausgeschlossen'
);

select * from finish();
rollback;
