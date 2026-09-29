begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();
select is((select proconfig from pg_proc where oid='public.admin_delete_unused_invited_user(uuid,uuid)'::regprocedure),
  array['search_path=pg_catalog']::text[], 'public deletion wrapper has a fixed search path');

insert into public.organizations(id,name,slug) values
  ('d1000000-0000-4000-8000-000000000001','Delete invitations','delete-invitations'),
  ('d1000000-0000-4000-8000-000000000002','Other organization','delete-invitations-other');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data,aud,role) values
  ('d2000000-0000-4000-8000-000000000001','delete-admin@example.test','{}','{}','authenticated','authenticated'),
  ('d2000000-0000-4000-8000-000000000002','delete-employee@example.test','{}','{}','authenticated','authenticated'),
  ('d2000000-0000-4000-8000-000000000003','delete-invited@example.test','{"organization_id":"d1000000-0000-4000-8000-000000000001"}','{}','authenticated','authenticated'),
  ('d2000000-0000-4000-8000-000000000004','delete-foreign@example.test','{"organization_id":"d1000000-0000-4000-8000-000000000002"}','{}','authenticated','authenticated'),
  ('d2000000-0000-4000-8000-000000000005','delete-manager@example.test','{}','{}','authenticated','authenticated');
update auth.users set email_confirmed_at=now()
  where id in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000005');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
  ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Super Admin','delete-admin@example.test','active'),
  ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','Employee','delete-employee@example.test','active'),
  ('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','Unused invitation','delete-invited@example.test','invited'),
  ('d3000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000002','Foreign invitation','delete-foreign@example.test','invited'),
  ('d3000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','Manager','delete-manager@example.test','active');
insert into public.roles(id,organization_id,name,system_key) values
  ('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
  ('d4000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','Teamleitung','team_lead');
insert into public.role_permissions(role_id,permission_key) values ('d4000000-0000-4000-8000-000000000002','users.manage');
insert into public.user_roles(profile_id,role_id,organization_id,assigned_by) values
  ('d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',null),
  ('d3000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001'),
  ('d3000000-0000-4000-8000-000000000005','d4000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',null);
insert into public.employee_profiles(profile_id,organization_id,first_name,last_name) values
  ('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','Unused','Invitation');
insert into public.teams(id,organization_id,name) values ('d5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Setup team');
insert into public.team_memberships(team_id,profile_id,organization_id) values ('d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001');

-- A real used account with history must now be removable without data loss.
update public.profiles set status='active' where id='d3000000-0000-4000-8000-000000000003';
update auth.users set email_confirmed_at=now(),last_sign_in_at=now() where id='d2000000-0000-4000-8000-000000000003';
insert into public.roles(id,organization_id,name,system_key) values
  ('d4000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','Mitarbeiter','employee');
insert into public.role_permissions(role_id,permission_key) values
  ('d4000000-0000-4000-8000-000000000003','messages.use'),
  ('d4000000-0000-4000-8000-000000000003','directory.view');
insert into public.user_roles(profile_id,role_id,organization_id) values
  ('d3000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001');
insert into public.conversations(id,organization_id,type,name,created_by) values
  ('d8000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','group','History','d3000000-0000-4000-8000-000000000003');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values
  ('d8000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001'),
  ('d8000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001');
insert into public.messages(id,organization_id,conversation_id,sender_id,body) values
  ('d9000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003','Diese Nachricht bleibt erhalten.');
insert into auth.sessions(id,user_id) values ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003');
insert into auth.refresh_tokens(user_id,token,session_id) values ('d2000000-0000-4000-8000-000000000003','local-test-only-token','d6000000-0000-4000-8000-000000000001');
insert into public.user_devices(organization_id,profile_id,platform,push_token,push_token_hash) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003','web','local-test-push','local-test-push-hash');
insert into storage.objects(bucket_id,name,owner,owner_id) values
  ('message-attachments','d1000000-0000-4000-8000-000000000001/history/retained.pdf','d2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003');
insert into public.message_attachments(organization_id,conversation_id,message_id,uploaded_by,storage_path,original_name,mime_type,size_bytes) values
  ('d1000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001/history/retained.pdf','retained.pdf','application/pdf',100);
create table public.deletion_cascade_history(profile_id uuid references public.profiles on delete cascade);
create table public.deletion_null_history(profile_id uuid references public.profiles on delete set null);
insert into public.deletion_cascade_history values ('d3000000-0000-4000-8000-000000000003');
insert into public.deletion_null_history values ('d3000000-0000-4000-8000-000000000003');

select ok(not has_function_privilege('anon','public.admin_delete_user(uuid,uuid)','execute'),'Anonymous cannot delete users');
select ok(not has_function_privilege('service_role','public.admin_delete_user(uuid,uuid)','execute'),'Service role cannot bypass caller authorization');
select ok(not has_function_privilege('anon','private.delete_user(uuid,uuid)','execute'),'Private implementation is not executable anonymously');
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003',null)$$,'42501','permission_denied','Employee cannot delete users');
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003',null)$$,'42501','permission_denied','Team lead with users.manage still cannot delete users');
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000004',null)$$,'P0002','profile_not_found','Cross-organization targets are hidden');
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000001',null)$$,'42501','cannot_delete_own_account','Own account and sole active Super Admin are protected');
reset role;
insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','user.email_change_started','profile','d3000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003',null)$$,'55000','account_operation_in_progress','In-flight email changes block concurrent removal');
reset role;
select is((select count(*) from auth.users where id='d2000000-0000-4000-8000-000000000003'),1::bigint,'Rejected removal preserves Auth identity');
insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','user.email_change_failed','profile','d3000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','user.invite_resend_started','profile','d3000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003',null)$$,'55000','account_operation_in_progress','In-flight invitation delivery blocks concurrent removal');
reset role;
insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','user.invite_resent','profile','d3000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000002')$$,'A used account with messages, sessions and files can be removed');
select lives_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000003',null)$$,'Repeated deletion is idempotent');
select is((select count(*) from public.admin_list_users() where id='d3000000-0000-4000-8000-000000000003'),0::bigint,'Deleted user disappears from administration');
reset role;
select is((select count(*) from public.profiles where id='d3000000-0000-4000-8000-000000000003'),1::bigint,'Stable profile ID is retained');
select is((select display_name from public.profiles where id='d3000000-0000-4000-8000-000000000003'),'Gelöschter Benutzer','Profile exposes the required placeholder');
select ok((select auth_user_id is null and deleted_at is not null and status='archived' from public.profiles where id='d3000000-0000-4000-8000-000000000003'),'Auth link is removed and profile permanently deactivated');
select is((select count(*) from auth.users where id='d2000000-0000-4000-8000-000000000003'),0::bigint,'Auth account removed');
select is((select count(*) from auth.sessions where user_id='d2000000-0000-4000-8000-000000000003'),0::bigint,'Sessions revoked by Auth cascade');
select is((select count(*) from auth.refresh_tokens where user_id='d2000000-0000-4000-8000-000000000003'),0::bigint,'Refresh tokens removed');
select is((select count(*) from public.user_devices where profile_id='d3000000-0000-4000-8000-000000000003' and revoked_at is not null and push_token is null),1::bigint,'Device delivery access revoked');
select is((select count(*) from public.employee_profiles where profile_id='d3000000-0000-4000-8000-000000000003'),1::bigint,'Employee history retained for authorized administration');
select is((select count(*) from public.user_roles where profile_id='d3000000-0000-4000-8000-000000000003')+(select count(*) from public.team_memberships where profile_id='d3000000-0000-4000-8000-000000000003'),2::bigint,'Historic assignments retained');
select is((select body from public.messages where id='d9000000-0000-4000-8000-000000000001'),'Diese Nachricht bleibt erhalten.','Message body retained unchanged');
select is((select count(*) from public.message_attachments where message_id='d9000000-0000-4000-8000-000000000001'),1::bigint,'Attachment reference retained');
select is((select count(*) from storage.objects where name='d1000000-0000-4000-8000-000000000001/history/retained.pdf' and owner is null and owner_id is null),1::bigint,'Storage object retained with former Auth ownership cleared');
select is((select count(*) from public.deletion_cascade_history),1::bigint,'CASCADE-linked future domain history retained');
select is((select count(*) from public.deletion_null_history where profile_id='d3000000-0000-4000-8000-000000000003'),1::bigint,'SET NULL-linked future history retains actor reference');
select is((select count(*) from public.audit_logs where action='user.deleted_access_revoked' and entity_id='d3000000-0000-4000-8000-000000000003'),1::bigint,'One attributable audit event for repeated removal');
select throws_ok($$update public.profiles set status='active' where id='d3000000-0000-4000-8000-000000000003'$$,'42501','deleted_account_is_immutable','Retained deleted profile cannot be reactivated');

set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
select is((select p.display_name from public.messages m join public.profiles p on p.id=m.sender_id where m.id='d9000000-0000-4000-8000-000000000001'),'Gelöschter Benutzer','Remaining chat participant sees retained message and author placeholder');
select is((select count(*) from public.employee_profiles where profile_id='d3000000-0000-4000-8000-000000000003'),0::bigint,'Colleagues cannot recover former employee details through directory RLS');
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.messages where conversation_id='d8000000-0000-4000-8000-000000000001'),0::bigint,'Old JWT subject loses message access immediately');
select is((select count(*) from public.profiles),0::bigint,'Old JWT subject loses organization/profile access immediately');
select throws_ok($$select public.admin_delete_user('d3000000-0000-4000-8000-000000000002',null)$$,'42501','permission_denied','Former Super Admin cannot use an old token for privileged actions');
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.admin_delete_unused_invited_user('d3000000-0000-4000-8000-000000000005',null)$$,'Legacy endpoint also preserves data for active users');
reset role;
select is((select count(*) from public.profiles where id='d3000000-0000-4000-8000-000000000005'),1::bigint,'Legacy endpoint retains profile history');
select is((select count(*) from auth.users where id='d2000000-0000-4000-8000-000000000005'),0::bigint,'Legacy endpoint revokes Auth access');
select * from finish();
rollback;
