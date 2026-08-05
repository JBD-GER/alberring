begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(38);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','rpc-manager@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','rpc-role-admin@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','rpc-target@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','rpc-workflow@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','rpc-material-manager@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','rpc-inactive-recipient@example.test',now(),'{}','{}','authenticated','authenticated'),
  (
    'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    'rpc-invite@example.test',null,
    '{"organization_id":"a1000000-0000-4000-8000-000000000001"}',
    '{}','authenticated','authenticated'
  ),
  (
    'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
    'rpc-foreign-invite@example.test',null,
    '{"organization_id":"a1000000-0000-4000-8000-000000000002"}',
    '{}','authenticated','authenticated'
  );

insert into public.organizations(id,name,slug) values
  ('a1000000-0000-4000-8000-000000000001','RPC Organisation','rpc-invariants'),
  ('a1000000-0000-4000-8000-000000000002','RPC Fremdorganisation','rpc-invariants-foreign');
insert into public.organization_settings(organization_id) values
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
) values
  ('a2000000-0000-4000-8000-000000000001','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','a1000000-0000-4000-8000-000000000001','RPC Manager','rpc-manager@example.test','active'),
  ('a2000000-0000-4000-8000-000000000002','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','a1000000-0000-4000-8000-000000000001','RPC Role Admin','rpc-role-admin@example.test','active'),
  ('a2000000-0000-4000-8000-000000000003','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','a1000000-0000-4000-8000-000000000001','RPC Target','rpc-target@example.test','active'),
  ('a2000000-0000-4000-8000-000000000004','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','a1000000-0000-4000-8000-000000000001','RPC Workflow','rpc-workflow@example.test','active'),
  ('a2000000-0000-4000-8000-000000000005','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','a1000000-0000-4000-8000-000000000001','RPC Material Manager','rpc-material-manager@example.test','active'),
  ('a2000000-0000-4000-8000-000000000006','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','a1000000-0000-4000-8000-000000000001','RPC Inactive Recipient','rpc-inactive-recipient@example.test','active');

insert into public.roles(id,organization_id,name,system_key,active) values
  ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','RPC User Manager',null,true),
  ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','RPC Super Admin','super_admin',true),
  ('a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','RPC Employee','employee',true),
  ('a3000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','RPC Elevated',null,true),
  ('a3000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000001','RPC Workflow Role',null,true),
  ('a3000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','RPC Material Manager Role',null,true),
  ('a3000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000001','RPC Inactive Approver',null,true);

insert into public.role_permissions(role_id,permission_key) values
  ('a3000000-0000-4000-8000-000000000001','users.manage'),
  ('a3000000-0000-4000-8000-000000000002','users.manage'),
  ('a3000000-0000-4000-8000-000000000002','roles.manage'),
  ('a3000000-0000-4000-8000-000000000003','dashboard.view'),
  ('a3000000-0000-4000-8000-000000000003','directory.view'),
  ('a3000000-0000-4000-8000-000000000003','documents.view_folders'),
  ('a3000000-0000-4000-8000-000000000003','documents.view_own'),
  ('a3000000-0000-4000-8000-000000000003','documents.view_shared'),
  ('a3000000-0000-4000-8000-000000000003','fleet.view_own'),
  ('a3000000-0000-4000-8000-000000000003','leave.create_own'),
  ('a3000000-0000-4000-8000-000000000003','materials.create_own'),
  ('a3000000-0000-4000-8000-000000000003','messages.use'),
  ('a3000000-0000-4000-8000-000000000003','mileage.submit_own'),
  ('a3000000-0000-4000-8000-000000000003','news.view'),
  ('a3000000-0000-4000-8000-000000000003','schedule.view_own'),
  ('a3000000-0000-4000-8000-000000000003','sick_leave.create_own'),
  ('a3000000-0000-4000-8000-000000000004','audit.view'),
  ('a3000000-0000-4000-8000-000000000005','leave.create_own'),
  ('a3000000-0000-4000-8000-000000000005','leave.approve'),
  ('a3000000-0000-4000-8000-000000000005','schedule.manage'),
  ('a3000000-0000-4000-8000-000000000005','materials.approve'),
  ('a3000000-0000-4000-8000-000000000005','documents.view_own'),
  ('a3000000-0000-4000-8000-000000000006','materials.manage'),
  ('a3000000-0000-4000-8000-000000000007','materials.approve');

insert into public.user_roles(profile_id,role_id,organization_id) values
  ('a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000004','a3000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000005','a3000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000006','a3000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000001');
update public.roles
set active=false
where id='a3000000-0000-4000-8000-000000000007';

insert into public.teams(id,organization_id,name,lead_profile_id) values(
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'RPC Team','a2000000-0000-4000-8000-000000000004'
);
insert into public.team_memberships(team_id,profile_id,organization_id) values
  ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001');

insert into public.leave_requests(
  id,organization_id,profile_id,leave_type,starts_on,ends_on,workdays,status
) values(
  'a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000004',
  'Urlaub',current_date+20,current_date+21,2,'submitted'
);
insert into public.leave_approval_steps(
  id,organization_id,leave_request_id,step_number,status
) values(
  'a5100000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',1,'pending'
);

insert into public.shifts(
  id,organization_id,team_id,title,starts_at,ends_at,status,created_by
) values(
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'RPC Published Shift',now()+interval '2 days',now()+interval '2 days 8 hours',
  'published','a2000000-0000-4000-8000-000000000002'
);
insert into public.shift_assignments(shift_id,profile_id,organization_id) values(
  'a6000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000001'
);

-- Deliberately inconsistent legacy fixture: no composite tenant foreign key
-- currently prevents an organization-one assignment from referencing an
-- organization-two shift. The definer RPC must still fail closed.
insert into public.shifts(
  id,organization_id,title,starts_at,ends_at,status
) values(
  'a6000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002',
  'RPC Foreign Shift',now()+interval '3 days',now()+interval '3 days 8 hours',
  'published'
);
insert into public.shift_assignments(shift_id,profile_id,organization_id) values(
  'a6000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000004',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.document_categories(id,organization_id,name,active) values
  ('a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','RPC Active Category',true),
  ('a7000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','RPC Inactive Category',false),
  ('a7000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','RPC Foreign Category',true);

insert into public.material_requests(
  id,organization_id,requester_id,category,item,title,quantity,unit,priority,status
) values(
  'a8000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000003',
  'Pflege','Handschuhe','Handschuhe',10,'Packung','normal','submitted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select throws_ok(
  $$ select public.set_user_role('a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002',null) $$,
  '22023','invalid_boolean',
  'NULL kann den Super-Admin-Rollenschutz nicht umgehen'
);
select ok(
  exists(
    select 1 from public.user_roles
    where profile_id='a2000000-0000-4000-8000-000000000002'
      and role_id='a3000000-0000-4000-8000-000000000002'
      and (valid_until is null or valid_until>now())
  ),
  'Super-Admin-Rolle bleibt nach dem abgewiesenen NULL-Aufruf aktiv'
);
select throws_ok(
  $$ select public.set_user_team('a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001',null) $$,
  '22023','invalid_boolean',
  'NULL kann eine Teamzuordnung nicht stillschweigend entfernen'
);
select ok(
  exists(
    select 1 from public.team_memberships
    where profile_id='a2000000-0000-4000-8000-000000000003'
      and team_id='a4000000-0000-4000-8000-000000000001'
      and valid_from<=current_date
      and (valid_until is null or valid_until>=current_date)
  ),
  'Teamzuordnung bleibt nach dem abgewiesenen NULL-Aufruf aktiv'
);
select throws_ok(
  $$ select public.set_user_role('a2000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000004',true) $$,
  '42501','role_delegation_not_allowed',
  'User-Manager kann keine Rolle mit fremden Rechten delegieren'
);
select lives_ok(
  $$ select public.set_user_role('a2000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003',true) $$,
  'User-Manager kann die ausdrückliche Employee-Basisrolle delegieren'
);
select ok(
  exists(
    select 1 from public.user_roles
    where profile_id='a2000000-0000-4000-8000-000000000003'
      and role_id='a3000000-0000-4000-8000-000000000003'
      and (valid_until is null or valid_until>now())
  ),
  'Employee-Basisrolle wurde aktiv zugewiesen'
);
select throws_ok(
  $$ select public.admin_create_invited_profile('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','rpc-invite@example.test','RPC','Invite','a3000000-0000-4000-8000-000000000004',null) $$,
  '42501','role_delegation_not_allowed',
  'Einladung kann die Rollen-Delegationsgrenze nicht umgehen'
);
reset role;
select is(
  (select count(*)::integer from public.profiles
   where auth_user_id='a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'),
  0,
  'Abgewiesene Rollendelegation hinterlässt kein Invite-Profil'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select lives_ok(
  $$ select public.admin_create_invited_profile('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','rpc-invite@example.test','RPC','Invite','a3000000-0000-4000-8000-000000000003',null) $$,
  'Invite mit passender App-Metadata und Employee-Rolle wird angelegt'
);
reset role;
select ok(
  exists(
    select 1 from public.profiles
    where auth_user_id='a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'
      and organization_id='a1000000-0000-4000-8000-000000000001'
      and status='invited'
  ),
  'Invite-Profil ist korrekt an Organisation und Status gebunden'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select throws_ok(
  $$ select public.admin_create_invited_profile('a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8','rpc-foreign-invite@example.test','RPC','Foreign','a3000000-0000-4000-8000-000000000003',null) $$,
  '42501','invite_organization_mismatch',
  'Serverseitige App-Metadata verhindert organisationsfremdes Invite-Profil'
);
reset role;
select is(
  (select count(*)::integer from public.profiles
   where auth_user_id='a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'),
  0,
  'Organisationsfremder Auth-Invite bleibt ohne lokales Profil'
);

alter table public.profiles
  disable trigger guard_invited_profile_organization;
insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
) values(
  'a2000000-0000-4000-8000-000000000008',
  'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
  'a1000000-0000-4000-8000-000000000001',
  'RPC Legacy Mismatch','rpc-foreign-invite@example.test','invited'
);
alter table public.profiles
  enable trigger guard_invited_profile_organization;
update auth.users
set email_confirmed_at=now()
where id in (
  'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
  'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',true);
select throws_ok(
  $$ select public.activate_my_profile() $$,
  '42501','invite_organization_mismatch',
  'Legacy-Invite mit widersprüchlicher App-Metadata kann nicht aktiviert werden'
);
reset role;
select is(
  (select status from public.profiles
   where auth_user_id='a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'),
  'invited',
  'Abgewiesenes Legacy-Invite bleibt im eingeladenen Zustand'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',true);
select lives_ok(
  $$ select public.activate_my_profile() $$,
  'Invite mit passender App-Metadata kann aktiviert werden'
);
reset role;
select is(
  (select status from public.profiles
   where auth_user_id='a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'),
  'active',
  'Erfolgreich geprüftes Invite wird aktiv'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',true);
select throws_ok(
  $$ select public.set_role_permission('a3000000-0000-4000-8000-000000000002','users.manage',null) $$,
  '22023','invalid_boolean',
  'NULL kann geschützte Super-Admin-Permissions nicht entfernen'
);
select ok(
  exists(
    select 1 from public.role_permissions
    where role_id='a3000000-0000-4000-8000-000000000002'
      and permission_key='users.manage'
  ),
  'Geschützte Super-Admin-Permission bleibt erhalten'
);

select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',true);
select throws_ok(
  $$ select public.decide_leave_request('a5000000-0000-4000-8000-000000000001','approved',null) $$,
  '42501','self_approval_not_allowed',
  'Teamleitung kann den eigenen Urlaubsantrag nicht genehmigen'
);
select ok(
  (select status='submitted' and decided_by is null
   from public.leave_requests
   where id='a5000000-0000-4000-8000-000000000001')
  and
  (select status='pending' and decided_by is null
   from public.leave_approval_steps
   where id='a5100000-0000-4000-8000-000000000001'),
  'Abgewiesene Selbstgenehmigung verändert weder Antrag noch Schritt'
);

reset role;
select throws_ok(
  $$ update public.leave_approval_steps set status='approved',decided_by='a2000000-0000-4000-8000-000000000004',decided_at=now() where id='a5100000-0000-4000-8000-000000000001' $$,
  '42501','self_approval_not_allowed',
  'Tabellen-Trigger blockiert Selbstgenehmigung auch außerhalb der RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',true);
select throws_ok(
  $$ select public.save_shift('a6000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','RPC Published Shift',now()+interval '2 days',now()+interval '2 days 8 hours','{}'::uuid[],'cancelled') $$,
  '42501','publish_permission_required',
  'Schedule-Manager ohne Publish darf veröffentlichte Schicht nicht absagen'
);
select throws_ok(
  $$ select public.acknowledge_shift('a6000000-0000-4000-8000-000000000001') $$,
  '42501','shift_not_available',
  'Schichtbestätigung erfordert schedule.view_own'
);

reset role;
insert into public.role_permissions(role_id,permission_key) values(
  'a3000000-0000-4000-8000-000000000005','schedule.view_own'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',true);
select lives_ok(
  $$ select public.acknowledge_shift('a6000000-0000-4000-8000-000000000001') $$,
  'Zugewiesene Schicht kann mit schedule.view_own bestätigt werden'
);
select ok(
  exists(
    select 1 from public.shift_acknowledgements
    where shift_id='a6000000-0000-4000-8000-000000000001'
      and profile_id='a2000000-0000-4000-8000-000000000004'
  ),
  'Kontrollierte Schichtbestätigung wurde gespeichert'
);
select throws_ok(
  $$ select public.acknowledge_shift('a6000000-0000-4000-8000-000000000002') $$,
  '42501','shift_not_available',
  'Inkonsistentes organisationsfremdes Assignment kann nicht bestätigt werden'
);
select throws_ok(
  $$ select public.create_personal_document_upload('RPC Dokument',null,'a7000000-0000-4000-8000-000000000003') $$,
  '22023','category_not_available',
  'Persönlicher Upload akzeptiert keine fremde Kategorie'
);
select throws_ok(
  $$ select public.create_personal_document_upload('RPC Dokument',null,'a7000000-0000-4000-8000-000000000002') $$,
  '22023','category_not_available',
  'Persönlicher Upload akzeptiert keine inaktive Kategorie'
);
select lives_ok(
  $$ select public.create_personal_document_upload('RPC Dokument',null,'a7000000-0000-4000-8000-000000000001') $$,
  'Persönlicher Upload akzeptiert aktive Kategorie der eigenen Organisation'
);
select throws_ok(
  $$ select public.set_material_request_status('a8000000-0000-4000-8000-000000000001','ordered',null) $$,
  '22023','invalid_status_transition',
  'Materials-Approver darf keine Erfüllungsphase starten'
);
select lives_ok(
  $$ select public.set_material_request_status('a8000000-0000-4000-8000-000000000001','approved',null) $$,
  'Materials-Approver darf einen eingereichten Antrag genehmigen'
);

select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',true);
select lives_ok(
  $$ select public.set_material_request_status('a8000000-0000-4000-8000-000000000001','ordered',null) $$,
  'Materials-Manager darf einen genehmigten Antrag bestellen'
);

select set_config('request.jwt.claim.sub','a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select throws_ok(
  $$ select public.save_material_request(null,'Pflege','Masken','NaN'::numeric,'Packung','normal',current_date+7,'RPC Test','submitted') $$,
  '22023','invalid_material_request',
  'Nicht-endliche Materialmenge wird abgewiesen'
);
select is(
  (select count(*)::integer
   from public.material_requests
   where requester_id='a2000000-0000-4000-8000-000000000003'
     and quantity='NaN'::numeric),
  0,
  'Abgewiesene NaN-Menge hinterlässt keinen Materialantrag'
);
select lives_ok(
  $$ select public.save_material_request(null,'Pflege','Masken',5,'Packung','normal',current_date+7,'RPC Test','submitted') $$,
  'Employee-Basisrolle kann Materialanforderung einreichen'
);

reset role;
select is(
  (select count(distinct profile_id)::integer
   from public.notifications
   where type='materials'
     and profile_id in (
       'a2000000-0000-4000-8000-000000000004',
       'a2000000-0000-4000-8000-000000000005'
     )),
  2,
  'Aktive Approver und Manager erhalten die Materialbenachrichtigung'
);
select is(
  (select count(*)::integer
   from public.notifications
   where type='materials'
     and profile_id='a2000000-0000-4000-8000-000000000006'),
  0,
  'Inaktive Rolle erhält keine Materialbenachrichtigung'
);

select * from finish();
rollback;
