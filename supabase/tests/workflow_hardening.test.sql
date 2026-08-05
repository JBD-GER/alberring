begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(41);

insert into auth.users(
  id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values
  ('91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','workflow-hr@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','workflow-a@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','workflow-b@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','workflow-manager@example.test',now(),'{}','{}','authenticated','authenticated');

insert into public.organizations(id,name,slug) values
  ('91000000-0000-4000-8000-000000000001','Workflow Organisation','workflow-org'),
  ('91000000-0000-4000-8000-000000000002','Workflow Fremdorganisation','workflow-foreign');
insert into public.organization_settings(organization_id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002');

insert into public.profiles(
  id,auth_user_id,organization_id,display_name,email,status
) values
  ('92000000-0000-4000-8000-000000000001','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','91000000-0000-4000-8000-000000000001','Workflow HR','workflow-hr@example.test','active'),
  ('92000000-0000-4000-8000-000000000002','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','91000000-0000-4000-8000-000000000001','Workflow A','workflow-a@example.test','active'),
  ('92000000-0000-4000-8000-000000000003','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','91000000-0000-4000-8000-000000000001','Workflow B','workflow-b@example.test','active'),
  ('92000000-0000-4000-8000-000000000004','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','91000000-0000-4000-8000-000000000001','Workflow Manager','workflow-manager@example.test','active');
insert into public.employee_profiles(
  profile_id,organization_id,first_name,last_name,employment_status
) values
  ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Workflow','HR','active'),
  ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Workflow','A','active'),
  ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','Workflow','B','active'),
  ('92000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','Workflow','Manager','active');

insert into public.roles(id,organization_id,name) values
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Workflow HR'),
  ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Workflow Mitglied'),
  ('93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','Workflow Manager');
insert into public.role_permissions(role_id,permission_key) values
  ('93000000-0000-4000-8000-000000000001','documents.manage_employee_files'),
  ('93000000-0000-4000-8000-000000000002','directory.view'),
  ('93000000-0000-4000-8000-000000000002','messages.use'),
  ('93000000-0000-4000-8000-000000000003','directory.view'),
  ('93000000-0000-4000-8000-000000000003','fleet.manage'),
  ('93000000-0000-4000-8000-000000000003','messages.use'),
  ('93000000-0000-4000-8000-000000000003','mileage.manage'),
  ('93000000-0000-4000-8000-000000000003','schedule.manage'),
  ('93000000-0000-4000-8000-000000000003','schedule.publish');
insert into public.user_roles(profile_id,role_id,organization_id) values
  ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001');

insert into public.departments(id,organization_id,name) values
  ('93100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','Fremde Abteilung');
update public.employee_profiles
set department_id='93100000-0000-4000-8000-000000000001'
where profile_id='92000000-0000-4000-8000-000000000003';

insert into public.conversations(
  id,organization_id,type,name,created_by
) values(
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'group','Workflow Chat','92000000-0000-4000-8000-000000000002'
);
insert into public.conversation_members(
  conversation_id,profile_id,organization_id
) values
  ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001');
insert into public.messages(
  id,organization_id,conversation_id,sender_id,body,retracted_at
) values
  ('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','Nachricht A',null),
  ('95000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','Nachricht B',null),
  ('95000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','Zurückgezogen',now());
insert into public.message_attachments(
  id,organization_id,conversation_id,message_id,uploaded_by,
  storage_path,original_name,mime_type,size_bytes
) values
  ('96000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/a.pdf','a.pdf','application/pdf',100),
  ('96000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000003/retracted.pdf','retracted.pdf','application/pdf',100),
  ('96000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',null,'92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/unlinked.pdf','unlinked.pdf','application/pdf',100),
  ('96000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001/another-conversation/95000000-0000-4000-8000-000000000001/wrong.pdf','wrong.pdf','application/pdf',100);

insert into public.documents(
  id,organization_id,owner_profile_id,title,visibility,status,sensitivity,created_by
) values
  ('97000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',null,'Normales Dokument','organization','published','internal','92000000-0000-4000-8000-000000000004'),
  ('97000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','Mitarbeiterakte','personal','published','employee_file','92000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','Persönliches Dokument','personal','published','internal','92000000-0000-4000-8000-000000000001');

insert into public.vehicles(
  id,organization_id,internal_name,license_plate,status,current_mileage
) values
  ('98000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Workflow Fahrzeug','WF-A 1','active',100),
  ('98000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','Fremdes Fahrzeug','WF-F 1','active',100);
insert into public.mileage_submissions(
  id,organization_id,vehicle_id,profile_id,mileage,read_on,status,previous_mileage
) values(
  '98100000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000003',
  120,current_date,'submitted',100
);

select ok(
  not has_table_privilege('authenticated','public.shifts','insert')
  and not has_table_privilege('authenticated','public.shifts','update')
  and not has_table_privilege('authenticated','public.shifts','delete')
  and not has_table_privilege('authenticated','public.shift_assignments','insert')
  and not has_table_privilege('authenticated','public.shift_assignments','update')
  and not has_table_privilege('authenticated','public.shift_assignments','delete')
  and not has_table_privilege('authenticated','public.mileage_submissions','update')
  and not has_table_privilege('authenticated','public.messages','insert')
  and not has_table_privilege('authenticated','public.messages','update')
  and not has_table_privilege('authenticated','public.messages','delete')
  and not has_table_privilege('authenticated','public.vehicles','insert')
  and not has_table_privilege('authenticated','public.vehicles','update')
  and not has_table_privilege('authenticated','public.vehicles','delete')
  and not has_table_privilege('authenticated','public.vehicle_assignments','insert')
  and not has_table_privilege('authenticated','public.vehicle_assignments','update')
  and not has_table_privilege('authenticated','public.vehicle_assignments','delete'),
  'Kernobjekte sind ausschließlich über ihre Workflow-RPCs mutierbar'
);
select ok(
  not exists (
    select 1
    from information_schema.role_table_grants grants
    where grants.table_schema='public'
      and grants.grantee='anon'
  ),
  'Anonymous besitzt keinerlei Tabellenrechte im Anwendungsschema'
);
select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relkind in ('r','p')
      and (
        has_table_privilege('authenticated',relation.oid,'TRUNCATE')
        or has_table_privilege('authenticated',relation.oid,'REFERENCES')
        or has_table_privilege('authenticated',relation.oid,'TRIGGER')
        or has_table_privilege('authenticated',relation.oid,'MAINTAIN')
      )
  ),
  'Authenticated besitzt keine RLS-umgehenden Verwaltungsrechte'
);

create table public.pgtap_default_acl_table_probe(id bigint);
create sequence public.pgtap_default_acl_sequence_probe;
create function public.pgtap_default_acl_function_probe()
returns boolean language sql as $$ select true $$;
select ok(
  not has_table_privilege(
    'anon','public.pgtap_default_acl_table_probe','SELECT'
  )
  and not has_table_privilege(
    'authenticated','public.pgtap_default_acl_table_probe','SELECT'
  )
  and not has_sequence_privilege(
    'anon','public.pgtap_default_acl_sequence_probe','USAGE'
  )
  and not has_sequence_privilege(
    'authenticated','public.pgtap_default_acl_sequence_probe','USAGE'
  )
  and not has_function_privilege(
    'anon','public.pgtap_default_acl_function_probe()','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.pgtap_default_acl_function_probe()','EXECUTE'
  ),
  'Neue Public-Objekte erhalten tatsächlich keine Data-API-Rechte'
);
select throws_ok(
  $$ insert into public.vehicle_assignments(id,organization_id,vehicle_id,profile_id,valid_from) values('98200000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003',current_date) $$,
  '23503',
  null,
  'Composite FK verhindert organisationsfremde Fahrzeugzuordnung'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select throws_ok(
  $$ select public.archive_document('97000000-0000-4000-8000-000000000001') $$,
  '42501','document_not_manageable',
  'HR-only darf kein gewöhnliches Organisationsdokument archivieren'
);
select lives_ok(
  $$ select public.archive_document('97000000-0000-4000-8000-000000000002') $$,
  'HR-only darf eine Mitarbeiterakte verwalten'
);
select throws_ok(
  $$ select public.archive_document('97000000-0000-4000-8000-000000000003') $$,
  '42501','document_not_manageable',
  'HR-only darf kein fremdes persönliches Dokument verwalten'
);

reset role;
select is(
  (select count(*)::integer from public.documents where id in (
    '97000000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000003'
  ) and status='archived'),
  1,
  'Nur die ausdrücklich als Mitarbeiterakte markierte Datei wurde archiviert'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select throws_ok(
  $$ insert into storage.objects(id,bucket_id,name,owner_id) values('99000000-0000-4000-8000-000000000001','message-attachments','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/foreign-message.pdf','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') $$,
  '42501',null,
  'Mitglied kann kein Storage-Objekt unter einer fremden Nachricht hochladen'
);
select throws_ok(
  $$ insert into storage.objects(id,bucket_id,name,owner_id) values('99000000-0000-4000-8000-000000000002','message-attachments','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000003/retracted-message.pdf','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') $$,
  '42501',null,
  'Zurückgezogene Nachrichten akzeptieren auch im Storage keinen Anhang'
);
select lives_ok(
  $$ insert into storage.objects(id,bucket_id,name,owner_id) values('99000000-0000-4000-8000-000000000003','message-attachments','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') $$,
  'Eigene aktive Nachricht akzeptiert den passenden Storage-Upload'
);
select lives_ok(
  $$ insert into storage.objects(id,bucket_id,name,owner_id) values('99000000-0000-4000-8000-000000000004','message-attachments','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/unreferenced-cleanup.pdf','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') $$,
  'Eigener unverknüpfter Upload wird für den Cleanup angelegt'
);
select is(
  (select count(*)::integer from storage.objects
   where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf'),
  0,
  'Storage-Objekt bleibt ohne gebundene Anhangsmetadaten unsichtbar'
);
select throws_ok(
  $$ insert into public.message_attachments(organization_id,conversation_id,message_id,uploaded_by,storage_path,original_name,mime_type,size_bytes) values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/foreign.pdf','foreign.pdf','application/pdf',100) $$,
  '42501',null,
  'Mitglied kann keinen Anhang an eine fremde Nachricht hängen'
);
select throws_ok(
  $$ insert into public.message_attachments(organization_id,conversation_id,message_id,uploaded_by,storage_path,original_name,mime_type,size_bytes) values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000003/new.pdf','new.pdf','application/pdf',100) $$,
  '42501',null,
  'An eine zurückgezogene Nachricht kann kein Anhang gehängt werden'
);
select throws_ok(
  $$ insert into public.message_attachments(organization_id,conversation_id,message_id,uploaded_by,storage_path,original_name,mime_type,size_bytes) values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/wrong/95000000-0000-4000-8000-000000000002/new.pdf','new.pdf','application/pdf',100) $$,
  '42501',null,
  'Anhangspfad muss zu Mandant, Unterhaltung und Nachricht gehören'
);
select lives_ok(
  $$ insert into public.message_attachments(organization_id,conversation_id,message_id,uploaded_by,storage_path,original_name,mime_type,size_bytes) values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf','storage-bound.pdf','application/pdf',100) $$,
  'Eigene aktive Nachricht akzeptiert einen korrekt gebundenen Anhang'
);
select is(
  (select count(*)::integer from storage.objects
   where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf'),
  1,
  'Erst vollständig gebundene Anhangsmetadaten machen das Objekt lesbar'
);
select throws_ok(
  $$ insert into public.messages(organization_id,conversation_id,sender_id,body) values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','Direkter Bypass') $$,
  '42501',null,
  'Nachrichten können nicht an send_message vorbei eingefügt werden'
);
select lives_ok(
  $$ select public.send_message('94000000-0000-4000-8000-000000000001','Workflow-Nachricht',null,null) $$,
  'send_message bleibt nach dem DML-Revoke funktionsfähig'
);
select is(
  (select allowed from public.authorize_secure_download(
    'message-attachments',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/a.pdf'
  )),true,
  'Aktiver Anhang in eigener Unterhaltung bleibt downloadbar'
);
select is(
  (select allowed from public.authorize_secure_download(
    'message-attachments',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000003/retracted.pdf'
  )),false,
  'Zurückgezogener Nachrichtenanhang erhält keine signierte URL'
);
select is(
  (select allowed from public.authorize_secure_download(
    'message-attachments',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/unlinked.pdf'
  )),false,
  'Unverknüpfter Anhang erhält keine signierte URL'
);
select is(
  (select allowed from public.authorize_secure_download(
    'message-attachments',
    '91000000-0000-4000-8000-000000000001/another-conversation/95000000-0000-4000-8000-000000000001/wrong.pdf'
  )),false,
  'Inkonsistenter Anhangspfad erhält keine signierte URL'
);

reset role;
update public.messages
set retracted_at=now()
where id='95000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select is(
  (select count(*)::integer
   from public.message_attachments
   where storage_path='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf'),
  0,
  'Retract blendet die gebundenen Anhangsmetadaten für den Aufrufer aus'
);
select set_config('storage.allow_delete_query','true',true);
select set_config(
  'storage.operation','storage.object.get_authenticated',true
);
select is(
  (select count(*)::integer from storage.objects
   where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/unreferenced-cleanup.pdf'),
  0,
  'Cleanup-Sichtbarkeit gibt unverknüpfte Objekte nicht an GET frei'
);
select set_config(
  'storage.operation','storage.object.delete_many',true
);
delete from storage.objects
where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf';

reset role;
select is(
  (select count(*)::integer from storage.objects
   where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/storage-bound.pdf'),
  1,
  'RLS-unabhängige Referenzprüfung sperrt den Cleanup trotz Retract'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select set_config('storage.allow_delete_query','true',true);
select set_config(
  'storage.operation','storage.object.delete_many',true
);
delete from storage.objects
where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/unreferenced-cleanup.pdf';

reset role;
select is(
  (select count(*)::integer from storage.objects
   where name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/95000000-0000-4000-8000-000000000002/unreferenced-cleanup.pdf'),
  0,
  'Eigener frischer und unverknüpfter Upload bleibt aufräumbar'
);

select ok(
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_certificates_cleanup')
    like '%foldername%current_organization_id%'
  and
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_certificates_cleanup')
    like '%has_sick_certificate_storage_reference%'
  and exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='has_sick_certificate_storage_reference'
      and p.prosecdef
  ),
  'Attest-Cleanup ist organisationsgebunden und prüft Referenzen RLS-unabhängig'
);
select ok(
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_vehicle_cleanup')
    like '%foldername%current_organization_id%'
  and
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_vehicle_cleanup')
    like '%has_vehicle_storage_reference%'
  and
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_vehicle_delete')
    like '%has_vehicle_storage_reference%'
  and exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='has_vehicle_storage_reference'
      and p.prosecdef
  ),
  'Fahrzeug-Cleanup und Management-Delete respektieren aktive Referenzen'
);
select ok(
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_material_cleanup')
    like '%foldername%current_organization_id%'
  and
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_material_cleanup')
    like '%has_material_storage_reference%'
  and
  (select qual from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='storage_material_delete')
    like '%has_material_storage_reference%'
  and exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='has_material_storage_reference'
      and p.prosecdef
  ),
  'Material-Cleanup und Management-Delete respektieren aktive Referenzen'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select is(
  (select department_name from public.list_directory_entries(null)
   where id='92000000-0000-4000-8000-000000000003'),
  null::text,
  'Directory übernimmt keine Abteilung aus einem fremden Mandanten'
);

select set_config('request.jwt.claim.sub','91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',true);
select throws_ok(
  $$ insert into public.shifts(organization_id,title,starts_at,ends_at,status,created_by) values('91000000-0000-4000-8000-000000000001','Direkter Dienst',now()+interval '1 day',now()+interval '1 day 8 hours','published','92000000-0000-4000-8000-000000000004') $$,
  '42501',null,
  'Schichten können nicht an save_shift vorbei veröffentlicht werden'
);
select lives_ok(
  $$ select public.save_shift(null,null,'Geprüfter Dienst',now()+interval '1 day',now()+interval '1 day 8 hours','{}'::uuid[],'published') $$,
  'save_shift bleibt nach dem DML-Revoke funktionsfähig'
);
select throws_ok(
  $$ update public.mileage_submissions set status='verified',mileage=1 where id='98100000-0000-4000-8000-000000000001' $$,
  '42501',null,
  'Kilometerprüfung kann nicht direkt umgangen werden'
);
select lives_ok(
  $$ select public.review_mileage_submission('98100000-0000-4000-8000-000000000001','verified',null) $$,
  'review_mileage_submission bleibt nach dem DML-Revoke funktionsfähig'
);
select is(
  (select current_mileage from public.vehicles where id='98000000-0000-4000-8000-000000000001'),
  120,
  'Geprüfter Kilometerstand wird kontrolliert auf das Fahrzeug übernommen'
);
select throws_ok(
  $$ update public.vehicles set current_mileage=1 where id='98000000-0000-4000-8000-000000000001' $$,
  '42501',null,
  'Fahrzeugdaten können nicht an save_vehicle vorbei geändert werden'
);
select lives_ok(
  $$ select public.save_vehicle(null,'RPC Fahrzeug','WF-RPC 1','Alberring','Test','active',10,null,null) $$,
  'save_vehicle bleibt nach dem DML-Revoke funktionsfähig'
);
select throws_ok(
  $$ insert into public.vehicle_assignments(organization_id,vehicle_id,profile_id,valid_from) values('91000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003',current_date) $$,
  '42501',null,
  'Fahrzeugzuordnungen können nicht am Workflow vorbei angelegt werden'
);

reset role;
select * from finish();
rollback;
