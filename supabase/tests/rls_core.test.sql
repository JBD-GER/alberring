begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
select '10000000-0000-4000-8000-000000000098',key from public.permissions where key in ('dashboard.view','directory.view','users.view','users.manage','settings.manage','documents.manage','sick_leave.view_status','sick_leave.manage');
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
insert into storage.objects(id,bucket_id,name) values
  ('60000000-0000-4000-8000-000000000011','message-attachments','00000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000011/50000000-0000-4000-8000-000000000011/test.pdf');

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

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select is((select count(*)::integer from public.profiles),5,'A sieht aktive Profile der eigenen Organisation, nicht die Fremdorganisation');
select is((select count(*)::integer from public.profiles where organization_id='00000000-0000-4000-8000-000000000099'),0,'Organisationsgrenze schützt Profile');
select throws_ok($$ select auth_user_id from public.profiles $$,'42501',null,'auth_user_id besitzt keinen Client-SELECT-Grant');
select is((select count(*)::integer from public.messages),1,'Konversationsmitglied liest eigene Konversation');
select is((select count(*)::integer from storage.objects where bucket_id='message-attachments'),1,'Konversationsmitglied liest zugehörigen Anhang');
select is((select count(*)::integer from public.notifications),1,'Benutzer liest nur eigene Notifications');
select throws_ok($$ insert into public.news_posts(organization_id,title,summary,body,status,author_id) values('00000000-0000-4000-8000-000000000001','Nein','Nein','Nein','published','30000000-0000-4000-8000-000000000011') $$,'42501',null,'Mitarbeiter kann keine News veröffentlichen');
select throws_ok($$ insert into public.user_roles(profile_id,role_id,organization_id) values('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001') $$,'42501',null,'Mitarbeiter kann eigene Rolle nicht erhöhen');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',true);
select is((select count(*)::integer from public.messages),0,'Nichtmitglied kann private Nachricht nicht lesen');
select is((select count(*)::integer from storage.objects where bucket_id='message-attachments'),0,'Nichtmitglied kann privaten Chat-Anhang nicht lesen');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',true);
select is((select count(*)::integer from public.sick_leave_records),2,'Disposition sieht planungsrelevanten Abwesenheitsstatus organisationsweit');
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

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',true);
select is((select count(*)::integer from public.sick_leave_records),1,'Teamleitung sieht Krankmeldungsstatus nur im eigenen Team');
select is((select count(*)::integer from public.list_sick_leave_records()),1,'Maskierende Krankmeldungs-RPC hält denselben Team-Scope ein');

reset role;
select * from finish();
rollback;
