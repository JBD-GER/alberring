begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(28);

insert into public.organizations(id,name,slug) values
  ('e1000000-0000-4000-8000-000000000001','Employee editing','employee-editing'),
  ('e1000000-0000-4000-8000-000000000002','Other employee org','employee-editing-other');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
  ('e2000000-0000-4000-8000-000000000001','edit-admin@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('e2000000-0000-4000-8000-000000000002','edit-employee@example.test',now(),'{}','{}','authenticated','authenticated'),
  ('e2000000-0000-4000-8000-000000000003','edit-invited@example.test',null,'{"organization_id":"e1000000-0000-4000-8000-000000000001"}','{}','authenticated','authenticated'),
  ('e2000000-0000-4000-8000-000000000004','edit-foreign@example.test',null,'{"organization_id":"e1000000-0000-4000-8000-000000000002"}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Edit Admin','edit-admin@example.test','active'),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Edit Employee','edit-employee@example.test','active'),
  ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','Edit Invite','edit-invited@example.test','invited'),
  ('e3000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000002','Other Invite','edit-foreign@example.test','invited');
insert into public.roles(id,organization_id,name,system_key) values
  ('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
  ('e4000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Teamleitung','team_lead');
insert into public.user_roles(profile_id,role_id,organization_id) values
  ('e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001');
insert into public.role_permissions(role_id,permission_key) values ('e4000000-0000-4000-8000-000000000002','users.manage');
select set_config('test.employee_fields','{"firstName":"Alice","lastName":"Müller","displayName":"Alice Müller","employeeNumber":"E-42","workPhone":"030 12345","jobTitle":"Pflegefachkraft","employmentStatus":"leave","startDate":"2026-01-01","endDate":"2026-12-31","birthDate":"1990-02-03","weeklyHours":32.5}',true);

select ok(not has_function_privilege('anon','public.admin_update_employee(uuid,jsonb,uuid)','execute'),'Anonymous cannot edit employees');
select ok(not has_function_privilege('service_role','public.admin_begin_employee_email_change(uuid,text,uuid)','execute'),'Email edits require an authorized caller');
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.admin_update_employee('e3000000-0000-4000-8000-000000000003',current_setting('test.employee_fields')::jsonb,null)$$,'42501','permission_denied','Even a Team Lead with users.manage cannot correct employee details');
select throws_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','new@example.test',gen_random_uuid())$$,'42501','permission_denied','Non-Super-Admin cannot change login email');
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.admin_update_employee('e3000000-0000-4000-8000-000000000004',current_setting('test.employee_fields')::jsonb,null)$$,'P0002','profile_not_found','Employee edits cannot cross organization boundaries');
select throws_ok($$select public.admin_update_employee('e3000000-0000-4000-8000-000000000003',current_setting('test.employee_fields')::jsonb||'{"endDate":"2025-01-01"}',null)$$,'22023','invalid_employee_fields','Invalid employment dates are rejected');
select lives_ok($$select public.admin_update_employee('e3000000-0000-4000-8000-000000000003',current_setting('test.employee_fields')::jsonb,'e5000000-0000-4000-8000-000000000001')$$,'Super Admin can correct an invited employee');
reset role;
select is((select display_name from public.profiles where id='e3000000-0000-4000-8000-000000000003'),'Alice Müller','Display name is saved');
select is((select first_name||'|'||last_name||'|'||employee_number||'|'||work_phone||'|'||job_title||'|'||employment_status||'|'||weekly_hours::text from public.employee_profiles where profile_id='e3000000-0000-4000-8000-000000000003'),'Alice|Müller|E-42|030 12345|Pflegefachkraft|leave|32.50','Employee fields are saved together');
select is((select status from public.profiles where id='e3000000-0000-4000-8000-000000000003'),'invited','Employment status does not grant account access');
select is((select email from auth.users where id='e2000000-0000-4000-8000-000000000003'),'edit-invited@example.test','Saving details never changes Auth email');
select is((select count(*) from public.audit_logs where action='user.employee_data_updated' and request_id='e5000000-0000-4000-8000-000000000001'),1::bigint,'Employee edit is audited');
set local role authenticated;
select throws_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000004','new@example.test',gen_random_uuid())$$,'P0002','profile_not_found','Email edits cannot cross organization boundaries');
select throws_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','edit-admin@example.test',gen_random_uuid())$$,'23505','email_not_available','Existing email addresses cannot be stolen');
select lives_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','corrected@example.test','e5000000-0000-4000-8000-000000000002')$$,'Email correction reserves the target');
select throws_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','another@example.test',gen_random_uuid())$$,'55000','account_operation_in_progress','Concurrent email corrections are blocked');
select throws_ok($$select public.admin_begin_invite_resend('e3000000-0000-4000-8000-000000000003',gen_random_uuid())$$,'55000','account_operation_in_progress','Resend cannot race with an email correction');
select throws_ok($$select public.admin_delete_user('e3000000-0000-4000-8000-000000000003',gen_random_uuid())$$,'55000','account_operation_in_progress','Deletion cannot race with an email correction');
select throws_ok($$select public.admin_complete_employee_email_change('e3000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000002')$$,'55000','auth_email_not_updated','Profile email cannot change before Auth accepts it');
select throws_ok($$select public.admin_complete_employee_email_change('e3000000-0000-4000-8000-000000000003',gen_random_uuid())$$,'22023','email_change_not_pending','Forged email completion IDs are rejected');
select is(public.admin_employee_email_change_state('e3000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000002'),'pending','Unfinished operation remains inspectable');
select lives_ok($$select public.admin_cancel_employee_email_change('e3000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000002',true)$$,'Failed API operation can release its reservation');
select lives_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','corrected@example.test','e5000000-0000-4000-8000-000000000003')$$,'Correction can be retried after rollback');
reset role;
-- Simulate the supported Auth API's committed result in this isolated SQL test.
update auth.users set email='corrected@example.test' where id='e2000000-0000-4000-8000-000000000003';
set local role authenticated;
select lives_ok($$select public.admin_complete_employee_email_change('e3000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000003')$$,'Verified Auth email is synchronized into the profile');
select is(public.admin_employee_email_change_state('e3000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000003'),'completed','Committed result can be recovered after a lost response');
reset role;
select is((select email from public.profiles where id='e3000000-0000-4000-8000-000000000003'),'corrected@example.test','Profile uses corrected email');
update public.profiles set deleted_at=now(),status='archived',auth_user_id=null where id='e3000000-0000-4000-8000-000000000003';
set local role authenticated;
select throws_ok($$select public.admin_update_employee('e3000000-0000-4000-8000-000000000003',current_setting('test.employee_fields')::jsonb,null)$$,'P0002','profile_not_found','Deleted historical profiles cannot be edited');
select throws_ok($$select public.admin_begin_employee_email_change('e3000000-0000-4000-8000-000000000003','after-delete@example.test',gen_random_uuid())$$,'P0002','profile_not_found','Deleted accounts cannot regain an email identity');

select * from finish();
rollback;
