begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(54);

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','rls-a@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','rls-b@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','rls-foreign@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','rls-dispatch@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','rls-technical@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','rls-teamlead@example.test',now(),'{}','{}','authenticated','authenticated');

insert into public.organizations(id,name,slug) values
  ('00000000-0000-4000-8000-000000000099','RLS Fremdorganisation','rls-foreign');
insert into public.organization_settings(organization_id) values('00000000-0000-4000-8000-000000000099');

insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
  ('30000000-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','RLS Mitarbeiter A','rls-a@example.test','active'),
  ('30000000-0000-4000-8000-000000000012','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','00000000-0000-4000-8000-000000000001','RLS Mitarbeiter B','rls-b@example.test','active'),
  ('30000000-0000-4000-8000-000000000013','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-4000-8000-000000000099','RLS Fremd','rls-foreign@example.test','active'),
  ('30000000-0000-4000-8000-000000000014','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','00000000-0000-4000-8000-000000000001','RLS Disposition','rls-dispatch@example.test','active'),
  ('30000000-0000-4000-8000-000000000015','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','00000000-0000-4000-8000-000000000001','RLS Technik','rls-technical@example.test','active'),
  ('30000000-0000-4000-8000-000000000016','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','00000000-0000-4000-8000-000000000001','RLS Teamleitung','rls-teamlead@example.test','active');
insert into public.employee_profiles(profile_id,organization_id,first_name,last_name,employment_status) values
  ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','RLS','A','active'),
  ('30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','RLS','B','active'),
  ('30000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000099','RLS','Fremd','active'),
  ('30000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','RLS','Disposition','active'),
  ('30000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','RLS','Technik','active'),
  ('30000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000001','RLS','Teamleitung','active');

insert into public.roles(id,organization_id,name,system_key) values
  ('10000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000099','Mitarbeiter','employee'),
  ('10000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000001','Technische Administration','technical_admin');
insert into public.role_permissions(role_id,permission_key)
select '10000000-0000-4000-8000-000000000099',key from public.permissions where key in ('dashboard.view','directory.view','messages.use','news.view');
insert into public.role_permissions(role_id,permission_key)
select '10000000-0000-4000-8000-000000000098',key from public.permissions where key in ('dashboard.view','directory.view','users.view','users.manage','roles.manage','settings.manage','documents.manage','sick_leave.view_status','sick_leave.manage');
insert into public.user_roles(profile_id,role_id,organization_id) values
  ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000099'),
  ('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001');

update public.teams set lead_profile_id='30000000-0000-4000-8000-000000000016'
where id='20000000-0000-4000-8000-000000000001';
insert into public.team_memberships(team_id,profile_id,organization_id) values
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');

insert into public.conversations(id,organization_id,type,name,created_by) values
  ('40000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','group','Privat A','30000000-0000-4000-8000-000000000011');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values
  ('40000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001');
insert into public.messages(id,organization_id,conversation_id,sender_id,body) values
  ('50000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','Nur für A');
insert into public.message_attachments(
  id,organization_id,conversation_id,message_id,uploaded_by,
  storage_path,original_name,mime_type,size_bytes
) values(
  '61000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000011',
  '50000000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000011/50000000-0000-4000-8000-000000000011/test.pdf',
  'test.pdf','application/pdf',100
);
insert into storage.objects(id,bucket_id,name) values
  ('60000000-0000-4000-8000-000000000011','message-attachments','00000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000011/50000000-0000-4000-8000-000000000011/test.pdf'),
  ('60000000-0000-4000-8000-000000000012','message-attachments','00000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000011/50000000-0000-4000-8000-000000000011/orphan.pdf');

insert into public.sick_leave_records(id,organization_id,profile_id,starts_on,expected_end_on,end_unknown,certificate_status,status)
values
  ('70000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000012',current_date,current_date+1,false,'received','reported'),
  ('70000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011',current_date,current_date+1,false,'pending','reported');
insert into public.sick_leave_document_versions(id,organization_id,sick_leave_id,storage_path,version,uploaded_by)
values('71000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/70000000-0000-4000-8000-000000000011/71000000-0000-4000-8000-000000000011.pdf',1,'30000000-0000-4000-8000-000000000012');
insert into storage.objects(id,bucket_id,name) values
  ('72000000-0000-4000-8000-000000000011','sick-certificates','00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/70000000-0000-4000-8000-000000000011/71000000-0000-4000-8000-000000000011.pdf');

insert into public.documents(id,organization_id,owner_profile_id,title,visibility,status,sensitivity,created_by) values
  ('73000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000012','Persönlich B','personal','published','internal','30000000-0000-4000-8000-000000000015'),
  ('73000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000012','Mitarbeiterakte B','personal','published','employee_file','30000000-0000-4000-8000-000000000015');
insert into public.document_versions(id,organization_id,document_id,version,storage_path,mime_type,size_bytes,uploaded_by) values
  ('74000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000011',1,'00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000011/personal.pdf','application/pdf',100,'30000000-0000-4000-8000-000000000015'),
  ('74000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000012',1,'00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/73000000-0000-4000-8000-000000000012/employee.pdf','application/pdf',100,'30000000-0000-4000-8000-000000000015');
insert into storage.objects(id,bucket_id,name) values
  ('75000000-0000-4000-8000-000000000011','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000011/personal.pdf'),
  ('75000000-0000-4000-8000-000000000012','employee-documents','00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/73000000-0000-4000-8000-000000000012/employee.pdf');

insert into public.notifications(organization_id,profile_id,type,title,body,deduplication_key) values
  ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','system','Eigene','Test','rls-own'),
  ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000012','system','Fremde','Test','rls-other');

insert into public.shifts(id,organization_id,team_id,title,starts_at,ends_at,status,created_by) values
  ('76000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Schicht A',now()+interval '1 day',now()+interval '1 day 8 hours','published','30000000-0000-4000-8000-000000000014'),
  ('76000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Schicht B',now()+interval '2 days',now()+interval '2 days 8 hours','published','30000000-0000-4000-8000-000000000014');
insert into public.shift_assignments(shift_id,profile_id,organization_id) values
  ('76000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
  ('76000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');

insert into public.documents(id,organization_id,title,visibility,status,sensitivity,created_by,created_at) values
  ('73000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','Versioniertes Dokument','organization','published','internal','30000000-0000-4000-8000-000000000015',now()),
  ('73000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','Unfertiger Upload','organization','published','internal','30000000-0000-4000-8000-000000000015',now());
insert into public.document_versions(id,organization_id,document_id,version,storage_path,mime_type,size_bytes,uploaded_by) values
  ('74000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000013',1,'00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000013/version.pdf','application/pdf',100,'30000000-0000-4000-8000-000000000015');

insert into public.documents(id,organization_id,owner_profile_id,title,visibility,status,sensitivity,created_by,created_at) values
  ('73000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','Persönlicher Upload A','personal','draft','internal','30000000-0000-4000-8000-000000000011',now()),
  ('73000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000001',null,'Nicht verwaltbarer Upload A','organization','draft','internal','30000000-0000-4000-8000-000000000011',now()),
  ('73000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000001',null,'Versionierter Draft Technik','organization','draft','internal','30000000-0000-4000-8000-000000000015',now()),
  ('73000000-0000-4000-8000-000000000018','00000000-0000-4000-8000-000000000001',null,'Alter Draft Technik','organization','draft','internal','30000000-0000-4000-8000-000000000015',now()-interval '16 minutes'),
  ('73000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000001',null,'Veröffentlichter Upload Technik','organization','published','internal','30000000-0000-4000-8000-000000000015',now()),
  ('73000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',null,'Dokument mit gelöschter Version','organization','published','internal','30000000-0000-4000-8000-000000000015',now());
insert into public.document_versions(id,organization_id,document_id,version,storage_path,mime_type,size_bytes,uploaded_by,is_current,deleted_at) values
  ('74000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000017',1,'00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000017/1/active.pdf','application/pdf',100,'30000000-0000-4000-8000-000000000015',true,null),
  ('74000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000020',1,'00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000020/1/deleted.pdf','application/pdf',100,'30000000-0000-4000-8000-000000000015',false,now());

update storage.objects
set owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',created_at=now()
where id='75000000-0000-4000-8000-000000000011';
insert into storage.objects(id,bucket_id,name,owner_id,created_at) values
  ('75000000-0000-4000-8000-000000000013','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000017/1/active.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now()),
  ('75000000-0000-4000-8000-000000000014','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000014/1/unreferenced.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now()),
  ('75000000-0000-4000-8000-000000000015','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000014/1/other-owner.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',now()),
  ('75000000-0000-4000-8000-000000000016','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000014/1/stale.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now()-interval '16 minutes'),
  ('75000000-0000-4000-8000-000000000017','documents','00000000-0000-4000-8000-000000000099/73000000-0000-4000-8000-000000000014/1/foreign-org.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now()),
  ('75000000-0000-4000-8000-000000000018','documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000020/1/deleted.pdf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',now());

select ok(
  not has_function_privilege('authenticated','public.publish_scheduled_news(uuid)','execute')
  and has_function_privilege('service_role','public.publish_scheduled_news(uuid)','execute'),
  'Geplante Veröffentlichung bleibt ausschließlich service_role vorbehalten'
);
select ok(
  not has_function_privilege('authenticated','public.bootstrap_first_admin(uuid,text,text,text)','execute')
  and has_function_privilege('service_role','public.bootstrap_first_admin(uuid,text,text,text)','execute'),
  'Erstadmin-Bootstrap bleibt ausschließlich service_role vorbehalten'
);
select ok(
  position('raw_app_meta_data' in pg_get_functiondef('public.admin_lookup_invite_email(text)'::regprocedure))>0,
  'Einladungswiederaufnahme verwendet serverkontrollierte App-Metadaten'
);
select ok(
  position('raw_user_meta_data' in pg_get_functiondef('public.admin_lookup_invite_email(text)'::regprocedure))=0,
  'Einladungswiederaufnahme vertraut keinen benutzereditierbaren Metadaten'
);
select ok(
  not has_table_privilege('authenticated','public.roles','insert')
  and not has_table_privilege('authenticated','public.roles','update')
  and not has_table_privilege('authenticated','public.roles','delete')
  and not has_table_privilege('authenticated','public.user_roles','insert')
  and not has_table_privilege('authenticated','public.user_roles','update')
  and not has_table_privilege('authenticated','public.user_roles','delete')
  and not has_table_privilege('authenticated','public.role_permissions','insert')
  and not has_table_privilege('authenticated','public.role_permissions','update')
  and not has_table_privilege('authenticated','public.role_permissions','delete'),
  'Direkte Rollen- und Berechtigungsmutationen sind für authenticated gesperrt'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='rls_auto_enable'
      and (
        has_function_privilege('anon',p.oid,'execute')
        or has_function_privilege('authenticated',p.oid,'execute')
        or has_function_privilege('service_role',p.oid,'execute')
      )
  ),
  'RLS-Event-Trigger besitzt keine Data-API-Ausführungsrechte'
);
select ok(
  has_function_privilege('authenticated','public.create_role(text)','execute')
  and not has_function_privilege('anon','public.create_role(text)','execute'),
  'Rollenanlage ist nur als authentifizierte, intern autorisierte RPC verfügbar'
);
select ok(
  not has_table_privilege('authenticated','public.documents','delete'),
  'Dokumente können nicht mehr direkt über die Data API gelöscht werden'
);
select ok(
  has_function_privilege('authenticated','public.discard_document_upload(uuid)','execute')
  and not has_function_privilege('anon','public.discard_document_upload(uuid)','execute'),
  'Upload-Aufräumen ist ausschließlich als authentifizierte RPC verfügbar'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select is((select count(*)::integer from public.profiles where id in (
  '30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000012',
  '30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000014',
  '30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000016'
)),5,'A sieht aktive Testprofile der eigenen Organisation, nicht die Fremdorganisation');
select is((select count(*)::integer from public.profiles where organization_id='00000000-0000-4000-8000-000000000099'),0,'Organisationsgrenze schützt Profile');
select throws_ok($$ select auth_user_id from public.profiles $$,'42501',null,'auth_user_id besitzt keinen Client-SELECT-Grant');
select is((select count(*)::integer from public.messages),1,'Konversationsmitglied liest eigene Konversation');
select is((select count(*)::integer from storage.objects where bucket_id='message-attachments'),1,'Konversationsmitglied liest zugehörigen Anhang');
select is((select count(*)::integer from public.notifications),1,'Benutzer liest nur eigene Notifications');
select throws_ok($$ insert into public.news_posts(organization_id,title,summary,body,status,author_id) values('00000000-0000-4000-8000-000000000001','Nein','Nein','Nein','published','30000000-0000-4000-8000-000000000011') $$,'42501',null,'Mitarbeiter kann keine News veröffentlichen');
select throws_ok($$ insert into public.user_roles(profile_id,role_id,organization_id) values('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001') $$,'42501',null,'Mitarbeiter kann eigene Rolle nicht erhöhen');
select throws_ok($$ select public.create_role('Nicht erlaubt') $$,'42501','permission_denied','Mitarbeiter ohne roles.manage kann keine Rolle per RPC anlegen');
select throws_ok(
  $$ insert into public.shift_acknowledgements(shift_id,profile_id,organization_id) values('76000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'Mitarbeiter kann nur eine tatsächlich zugewiesene Schicht bestätigen'
);
select lives_ok(
  $$ insert into public.shift_acknowledgements(shift_id,profile_id,organization_id) values('76000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001') $$,
  'Mitarbeiter kann die eigene zugewiesene Schicht bestätigen'
);
select lives_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000015') $$,
  'Mitarbeiter kann den eigenen frischen persönlichen Draft verwerfen'
);
select throws_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000016') $$,
  '22023',
  'document_upload_not_discardable',
  'Eigentum allein erlaubt kein Verwerfen eines nicht verwaltbaren Drafts'
);

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',true);
select is((select count(*)::integer from public.messages),0,'Nichtmitglied kann private Nachricht nicht lesen');
select is((select count(*)::integer from storage.objects where bucket_id='message-attachments'),0,'Nichtmitglied kann privaten Chat-Anhang nicht lesen');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select is((select count(*)::integer from public.sick_leave_records where id in (
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000012'
)),2,'Disposition sieht planungsrelevanten Test-Abwesenheitsstatus organisationsweit');
select is((select count(*)::integer from storage.objects where bucket_id='sick-certificates'),0,'Disposition kann kein Attest direkt lesen');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',true);
select is((select count(*)::integer from storage.objects where bucket_id='sick-certificates'),0,'Technischer Admin ohne HR-Recht kann kein Attest lesen');
select is((select allowed from public.authorize_secure_download('sick-certificates','00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/70000000-0000-4000-8000-000000000011/71000000-0000-4000-8000-000000000011.pdf')),false,'Technischer Admin erhält keine signierte Attestfreigabe');
select throws_ok($$ update public.sick_leave_records set certificate_status='verified' where id='70000000-0000-4000-8000-000000000011' $$,'42501',null,'Krankmeldungs-Manager ohne Attestrecht kann fremden Atteststatus nicht ändern');
select is((select count(*)::integer from public.messages),0,'Entzogenes messages.use sperrt Chat trotz fortbestehender Mitgliedschaft');
select is((select count(*)::integer from public.documents where id in ('73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000012')),0,'Allgemeine Dokumentverwaltung sieht weder persönliche Dokumente noch Mitarbeiterakten');
select is((select allowed from public.authorize_secure_download('documents','00000000-0000-4000-8000-000000000001/73000000-0000-4000-8000-000000000011/personal.pdf')),false,'Allgemeine Dokumentverwaltung erhält keinen persönlichen Download');
select is((select allowed from public.authorize_secure_download('employee-documents','00000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000012/73000000-0000-4000-8000-000000000012/employee.pdf')),false,'Allgemeine Dokumentverwaltung erhält keinen Mitarbeiterakten-Download');
select throws_ok($$ insert into public.role_permissions(role_id,permission_key) values('10000000-0000-4000-8000-000000000098','roles.manage') $$,'42501',null,'Role-Permissions sind nur über die auditierte RPC änderbar');
select throws_ok(
  $$ insert into public.roles(organization_id,name,active) values('00000000-0000-4000-8000-000000000001','Direkte Testrolle',true) $$,
  '42501',
  null,
  'Auch Rollenmanager können Rollen nicht direkt anlegen'
);
select lives_ok(
  $$ select public.create_role('RLS Benutzerdefiniert') $$,
  'Rollenmanager kann eine benutzerdefinierte Rolle über die geprüfte RPC anlegen'
);
select ok(
  (
    select organization_id='00000000-0000-4000-8000-000000000001'::uuid
      and system_key is null
      and active
    from public.roles
    where name='RLS Benutzerdefiniert'
  ),
  'Neue RPC-Rolle ist aktiv, mandantengebunden und niemals eine Systemrolle'
);
select throws_ok(
  $$ delete from public.documents where id='73000000-0000-4000-8000-000000000014' $$,
  '42501',
  null,
  'Auch ein Dokumentenmanager kann Dokumente nicht direkt löschen'
);
select throws_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000016') $$,
  '22023',
  'document_upload_not_discardable',
  'Ein Manager kann keinen Draft eines anderen Erstellers verwerfen'
);
select throws_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000018') $$,
  '22023',
  'document_upload_not_discardable',
  'Ein mehr als 15 Minuten alter Draft kann nicht verworfen werden'
);
select throws_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000019') $$,
  '22023',
  'document_upload_not_discardable',
  'Ein veröffentlichtes Dokument kann nicht als Upload-Rollback verworfen werden'
);
select lives_ok(
  $$ select public.discard_document_upload('73000000-0000-4000-8000-000000000017') $$,
  'Der eigene frische Draft wird einschließlich seiner Version atomar verworfen'
);
select ok(
  exists(
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='storage_documents_delete' and cmd='DELETE'
      and roles=array['authenticated'::name]
  ),
  'Dokument-Storage besitzt genau den authentifizierten DELETE-Pfad'
);
select ok(
  (select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_documents_delete')
    like '%owner_id%auth.uid%',
  'Storage-Aufräumen ist an den Objektbesitzer gebunden'
);
select ok(
  (select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_documents_delete')
    like '%created_at%00:15:00%',
  'Storage-Aufräumen ist auf 15 Minuten begrenzt'
);
select ok(
  (select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_documents_delete')
    like '%foldername%current_organization_id%',
  'Storage-Aufräumen bleibt im Organisationspfad'
);
select ok(
  (select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_documents_delete')
    like '%has_active_document_storage_reference%',
  'Aktiv referenzierte Dokumentobjekte sind von der Löschung ausgeschlossen'
);
select ok(
  position('document_versions' in lower(pg_get_functiondef((
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='has_active_document_storage_reference'
  ))))>0
  and position('deleted_at is null' in lower(pg_get_functiondef((
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='has_active_document_storage_reference'
  ))))>0,
  'Die Referenzprüfung berücksichtigt nur aktive Dokumentversionen'
);
select ok(
  exists(
    select 1
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where t.tgrelid='storage.objects'::regclass
      and n.nspname='storage' and p.proname='protect_delete'
      and not t.tgisinternal
  ),
  'Direkte SQL-Löschungen bleiben durch die Storage-Plattform gesperrt'
);

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',true);
select is((select count(*)::integer from public.sick_leave_records where id in (
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000012'
)),1,'Teamleitung sieht Test-Krankmeldungsstatus nur im eigenen Team');
select is((select count(*)::integer from public.list_sick_leave_records() where id in (
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000012'
)),1,'Maskierende Krankmeldungs-RPC hält denselben Team-Scope für Testdaten ein');

reset role;
select ok(
  not exists(select 1 from public.documents where id in ('73000000-0000-4000-8000-000000000015','73000000-0000-4000-8000-000000000017'))
  and not exists(select 1 from public.document_versions where id='74000000-0000-4000-8000-000000000014'),
  'Verworfene Drafts und deren aktive Version wurden vollständig entfernt'
);
select is(
  (select count(*)::integer from public.documents where id in ('73000000-0000-4000-8000-000000000016','73000000-0000-4000-8000-000000000018','73000000-0000-4000-8000-000000000019')),
  3,
  'Nicht verwaltbare, fremde, alte und veröffentlichte Dokumente bleiben erhalten'
);
select is(
  (select count(*)::integer from storage.objects where id in ('75000000-0000-4000-8000-000000000011','75000000-0000-4000-8000-000000000015','75000000-0000-4000-8000-000000000016','75000000-0000-4000-8000-000000000017')),
  4,
  'Referenz-, Besitzer-, Zeit- und Organisationsschutz lassen die Objekte unangetastet'
);
select * from finish();
rollback;
