-- Alberring Connect: idempotent production reference data.

-- The permission catalogue must exist before the role matrix below. Supabase
-- runs seed.sql only after all migrations, so relying on the seed here would
-- leave newly introduced standard roles without any effective permissions.
insert into public.permissions(key,description) values
('dashboard.view','Dashboard anzeigen'),('directory.view','Mitarbeiterverzeichnis anzeigen'),('users.view','Benutzer anzeigen'),('users.manage','Benutzer verwalten'),('roles.view','Rollen anzeigen'),('roles.manage','Rollen verwalten'),('teams.manage','Teams verwalten'),('messages.use','Nachrichten verwenden'),('messages.moderate','Moderationszugriff'),('news.view','News anzeigen'),('news.create','News erstellen'),('news.publish','News veröffentlichen'),('news.manage','News verwalten'),('schedule.view_own','Eigenen Plan anzeigen'),('schedule.view_team','Teamplan anzeigen'),('schedule.manage','Plan verwalten'),('schedule.publish','Plan veröffentlichen'),('leave.create_own','Eigenen Urlaub beantragen'),('leave.view_team','Teamanträge anzeigen'),('leave.approve','Urlaub genehmigen'),('leave.manage','Urlaub verwalten'),('sick_leave.create_own','Eigene Krankmeldung erstellen'),('sick_leave.view_status','Abwesenheitsstatus anzeigen'),('sick_leave.manage','Krankmeldungen verwalten'),('sick_leave.view_certificates','Atteste abrufen'),('documents.view_own','Eigene Dokumente anzeigen'),('documents.view_shared','Freigegebene Dokumente anzeigen'),('documents.manage','Dokumente verwalten'),('documents.manage_employee_files','Mitarbeiterdokumente verwalten'),('fleet.view_own','Eigenes Fahrzeug anzeigen'),('fleet.view_all','Fuhrpark anzeigen'),('fleet.manage','Fuhrpark verwalten'),('mileage.submit_own','Eigenen Kilometerstand melden'),('mileage.manage','Kilometerstände verwalten'),('materials.create_own','Material anfordern'),('materials.view_team','Team-Anforderungen anzeigen'),('materials.approve','Anforderungen freigeben'),('materials.manage','Anforderungen verwalten'),('birthdays.view_admin_notifications','Geburtstagshinweise anzeigen'),('notifications.manage_templates','Benachrichtigungen verwalten'),('audit.view','Audit anzeigen'),('settings.manage','Einstellungen verwalten'),('integrations.manage','Integrationen verwalten')
on conflict(key) do update set description=excluded.description;

-- Keep a fresh SQL/CLI setup deterministic. No Auth user or password is seeded.
insert into public.organizations(id,name,slug)
values('00000000-0000-4000-8000-000000000001','Alberring Pflegedienst (Demo)','alberring-demo')
on conflict do nothing;
insert into public.organization_settings(organization_id)
values('00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Required role catalogue (roles remain editable per organization).
insert into public.roles(id,organization_id,name,system_key)
select role_id,o.id,role_name,system_key
from public.organizations o
cross join (values
  ('10000000-0000-4000-8000-000000000001'::uuid,'Super Admin','super_admin'),
  ('10000000-0000-4000-8000-000000000002'::uuid,'Mitarbeiter','employee'),
  ('10000000-0000-4000-8000-000000000003'::uuid,'Personal / HR','hr'),
  ('10000000-0000-4000-8000-000000000004'::uuid,'Disposition','dispatch'),
  ('10000000-0000-4000-8000-000000000005'::uuid,'Administration','administration'),
  ('10000000-0000-4000-8000-000000000006'::uuid,'Pflegedienstleitung','care_management'),
  ('10000000-0000-4000-8000-000000000007'::uuid,'Teamleitung','team_lead'),
  ('10000000-0000-4000-8000-000000000008'::uuid,'Fuhrpark','fleet'),
  ('10000000-0000-4000-8000-000000000009'::uuid,'Auditor / Datenschutz','auditor')
) defaults(role_id,role_name,system_key)
where o.id='00000000-0000-4000-8000-000000000001'::uuid
on conflict do nothing;

-- For additional organizations, use generated IDs while retaining system_key.
insert into public.roles(organization_id,name,system_key)
select o.id,d.role_name,d.system_key
from public.organizations o
cross join (values
  ('Super Admin','super_admin'),('Administration','administration'),
  ('Pflegedienstleitung','care_management'),('Teamleitung','team_lead'),
  ('Disposition','dispatch'),('Personal / HR','hr'),('Fuhrpark','fleet'),
  ('Mitarbeiter','employee'),('Auditor / Datenschutz','auditor')
) d(role_name,system_key)
where not exists(select 1 from public.roles r where r.organization_id=o.id and r.system_key=d.system_key)
on conflict do nothing;

-- Standard role permissions. Existing customized grants are never removed.
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r cross join public.permissions p
where r.system_key='super_admin'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','users.manage','roles.view','teams.manage',
  'messages.use','news.view','news.create','news.publish','news.manage',
  'documents.view_shared','documents.manage','fleet.view_all','materials.view_team',
  'materials.manage','notifications.manage_templates','settings.manage','integrations.manage'
]) where r.system_key='administration' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','roles.view','messages.use','news.view','news.create','news.publish',
  'schedule.view_team','schedule.manage','schedule.publish','leave.view_team','leave.approve','leave.manage',
  'sick_leave.view_status','documents.view_shared','fleet.view_all','materials.view_team','materials.approve'
]) where r.system_key='care_management' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','news.create','schedule.view_own','schedule.view_team',
  'leave.create_own','leave.view_team','leave.approve','sick_leave.create_own','sick_leave.view_status',
  'documents.view_own','documents.view_shared','fleet.view_own','mileage.submit_own',
  'materials.create_own','materials.view_team'
]) where r.system_key='team_lead' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','schedule.view_own','schedule.view_team',
  'schedule.manage','schedule.publish','leave.create_own','sick_leave.create_own','sick_leave.view_status',
  'documents.view_own','documents.view_shared','fleet.view_own','fleet.view_all','mileage.submit_own',
  'materials.create_own'
]) where r.system_key='dispatch' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','messages.use','news.view','leave.view_team','leave.approve','leave.manage',
  'sick_leave.view_status','sick_leave.manage','sick_leave.view_certificates','documents.view_own','documents.view_shared',
  'documents.manage_employee_files','birthdays.view_admin_notifications'
]) where r.system_key='hr' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','fleet.view_own','fleet.view_all','fleet.manage',
  'mileage.submit_own','mileage.manage'
]) where r.system_key='fleet' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','schedule.view_own','leave.create_own',
  'sick_leave.create_own','documents.view_own','documents.view_shared','fleet.view_own',
  'mileage.submit_own','materials.create_own'
]) where r.system_key='employee' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array['dashboard.view','audit.view','roles.view'])
where r.system_key='auditor' on conflict do nothing;

-- Configurable absence types required by the client workflow.
insert into public.leave_types(organization_id,code,name,paid,requires_note)
select o.id,v.code,v.name,v.paid,v.requires_note
from public.organizations o cross join (values
  ('annual','Erholungsurlaub',true,false),
  ('special','Sonderurlaub',true,true),
  ('unpaid','Unbezahlter Urlaub',false,true),
  ('time_off','Freizeitausgleich',true,false)
) v(code,name,paid,requires_note)
on conflict(organization_id,code) do update set name=excluded.name;

insert into public.feature_flags(organization_id,key,enabled,description)
select id,'onboarding_enabled',false,'Onboarding ist für das MVP vorbereitet, aber deaktiviert.'
from public.organizations on conflict(organization_id,key) do nothing;

insert into public.integration_providers(key,display_name,enabled,capabilities) values
  ('manual','Manuelle Verwaltung',true,array['employees','schedules','availability']),
  ('careville','Careville',true,array['not_configured'])
on conflict(key) do update set display_name=excluded.display_name,enabled=excluded.enabled,capabilities=excluded.capabilities;

insert into public.document_categories(organization_id,name,description)
select o.id,v.name,v.description from public.organizations o cross join (values
  ('Allgemein','Allgemeine Organisationsdokumente'),
  ('Dienstpläne','Veröffentlichte Planungsdokumente'),
  ('Richtlinien','Richtlinien und Arbeitsanweisungen'),
  ('Formulare','Interne Formulare'),
  ('Mitarbeiterdokumente','Persönliche, besonders geschützte Dokumente')
) v(name,description)
on conflict(organization_id,name) do nothing;

insert into public.material_categories(organization_id,name,approval_required)
select o.id,v.name,v.approval from public.organizations o cross join (values
  ('Pflegeverbrauchsmaterial',false),('Büromaterial',false),('Arbeitskleidung',true),
  ('Technik',true),('Sonstiges',false)
) v(name,approval)
on conflict(organization_id,name) do nothing;
