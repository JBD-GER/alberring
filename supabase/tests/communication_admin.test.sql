begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();
select is((select array_agg(system_key order by system_key) from public.roles
  where organization_id='00000000-0000-4000-8000-000000000001' and active),
  array['employee','super_admin','team_lead']::text[],
  'Only the three supported roles are active in the migrated organization');
select ok(not exists(select 1 from public.roles
  where organization_id='00000000-0000-4000-8000-000000000001'
    and coalesce(system_key,'') not in ('super_admin','employee','team_lead') and active),
  'Retired and custom catalogue roles are inactive');
insert into public.organizations(id,name,slug) values('e0000000-0000-4000-8000-000000000001','Communication tests','communication-tests'),('e0000000-0000-4000-8000-000000000002','Foreign tests','communication-foreign');
insert into public.organization_settings(organization_id) values('e0000000-0000-4000-8000-000000000001');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000001','communication-0@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','Member 0','communication-0@example.test','active');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000002','communication-1@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','Member 1','communication-1@example.test','active');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000003','communication-2@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001','Member 2','communication-2@example.test','active');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000004','communication-3@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001','Member 3','communication-3@example.test','active');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000005','communication-4@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001','Member 4','communication-4@example.test','active');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('e1000000-0000-4000-8000-000000000006','communication-5@example.test',now(),'{}','{}','authenticated','authenticated');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values('e2000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-000000000002','Member 5','communication-5@example.test','active');
insert into public.roles(id,organization_id,name,system_key) values('e3000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','super_admin','super_admin');
insert into public.roles(id,organization_id,name,system_key) values('e3000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','administration','administration');
insert into public.roles(id,organization_id,name,system_key) values('e3000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001','employee','employee');
insert into public.roles(id,organization_id,name,system_key) values('e3000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001','hr','hr');
insert into public.roles(id,organization_id,name,system_key) values('e3000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001','Teamleitung','team_lead');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000002','users.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000002','teams.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000002','messages.use');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000002','leave.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000002','sick_leave.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000003','messages.use');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000003','leave.view_own');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000003','sick_leave.view_own');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000003','leave.create_own');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000003','sick_leave.create_own');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000004','leave.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000004','sick_leave.manage');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000004','leave.create');
insert into public.role_permissions(role_id,permission_key) values('e3000000-0000-4000-8000-000000000004','sick_leave.create');
insert into public.user_roles(profile_id,role_id,organization_id) values('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001');
insert into public.user_roles(profile_id,role_id,organization_id) values('e2000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001');
insert into public.user_roles(profile_id,role_id,organization_id) values('e2000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001');
insert into public.user_roles(profile_id,role_id,organization_id) values('e2000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000001');
insert into public.user_roles(profile_id,role_id,organization_id) values('e2000000-0000-4000-8000-000000000005','e3000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001');
insert into public.leave_types(organization_id,code,name) values('e0000000-0000-4000-8000-000000000001','annual','Jahresurlaub');
insert into public.teams(id,organization_id,name) values('e5000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','Initial team');
insert into public.conversations(id,organization_id,type,name,created_by,team_id) values('e4000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','team','Team chat','e2000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001'),('e4000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','direct',null,'e2000000-0000-4000-8000-000000000003',null);
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id) values('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name,metadata) values('conversation-avatars','e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/avatar.png','{"mimetype":"image/png","size":100}'),('conversation-avatars','e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/replacement.png','{"mimetype":"image/png","size":100}');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select ok(not exists(select 1 from public.my_permissions() where permission_key='leave.create') and not exists(select 1 from public.my_permissions() where permission_key='sick_leave.create'),'Employees cannot create absences');
select ok(not exists(select 1 from public.my_permissions() where permission_key='leave.create_own') and not exists(select 1 from public.my_permissions() where permission_key='sick_leave.create_own'),'Legacy employee grants cannot enable self-service creation');
select ok(exists(select 1 from public.my_permissions() where permission_key='leave.view_own') and exists(select 1 from public.my_permissions() where permission_key='sick_leave.view_own'),'Employees retain access to their own absence lists');
select throws_ok($$ select public.create_leave_request_for_user('e2000000-0000-4000-8000-000000000003','annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'42501','permission_denied','Employee leave creation is rejected');
select throws_ok($$ select public.report_sick_leave_for_user('e2000000-0000-4000-8000-000000000003',current_date,current_date,false,'not_required') $$,'42501','permission_denied','Employee sick leave creation is rejected');
select throws_ok($$ select public.submit_leave_request('annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'42501','permission_denied','Legacy leave RPC is also administrator-only');
select throws_ok($$ select public.report_sick_leave(current_date,current_date,false,'not_required') $$,'42501','permission_denied','Legacy sick leave RPC is also administrator-only');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
select ok(not exists(select 1 from public.my_permissions() where permission_key='leave.create') and not exists(select 1 from public.my_permissions() where permission_key='sick_leave.create'),'HR and custom grants do not confer admin-only creation');
select throws_ok($$ select public.create_leave_request_for_user('e2000000-0000-4000-8000-000000000003','annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'42501','permission_denied','Nonadmin manager cannot create staff leave');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select ok(exists(select 1 from public.my_permissions() where permission_key='leave.create') and exists(select 1 from public.my_permissions() where permission_key='sick_leave.create'),'System administrator can create both absence kinds');
select lives_ok($$ select public.create_leave_request_for_user('e2000000-0000-4000-8000-000000000003','annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'Administrator creates leave for selected employee');
select lives_ok($$ select public.report_sick_leave_for_user('e2000000-0000-4000-8000-000000000003',current_date,current_date,false,'not_required') $$,'Administrator creates sick leave for selected employee');
select ok(exists(select 1 from public.leave_requests where profile_id='e2000000-0000-4000-8000-000000000003'),'Leave belongs to selected employee');
select ok(exists(select 1 from public.sick_leave_records where profile_id='e2000000-0000-4000-8000-000000000003'),'Sick leave belongs to selected employee');
select throws_ok($$ select public.create_leave_request_for_user('e2000000-0000-4000-8000-000000000006','annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'22023','profile_not_available','Foreign organization employee cannot be selected');
select throws_ok($$ select public.report_sick_leave_for_user('e2000000-0000-4000-8000-000000000006',current_date,current_date,false,'not_required') $$,'22023','profile_not_available','Foreign organization sick leave target cannot be selected');
select lives_ok($$ select public.submit_leave_request('annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null) $$,'Administrator can still record their own leave with legacy RPC');
select lives_ok($$ select public.report_sick_leave(current_date,current_date,false,'not_required') $$,'Administrator can still record own sick leave with legacy RPC');
select lives_ok($$ select public.create_team('New team','Berlin',array['e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000005']::uuid[]) $$,'Team creation saves the initial members');
select ok((select count(*) from public.team_memberships tm join public.teams t on t.id=tm.team_id where t.name='New team')=2,'Created team contains both selected members');
select lives_ok($$ select public.set_team_members((select id from public.teams where name='New team'),array['e2000000-0000-4000-8000-000000000003']::uuid[]) $$,'Team members can be removed later');
select lives_ok($$ select public.set_team_members((select id from public.teams where name='New team'),array['e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000005']::uuid[]) $$,'Removed member can be restored on the same day');
select throws_ok($$ select public.create_team('Invalid team',null,array['e2000000-0000-4000-8000-000000000006']::uuid[]) $$,'22023','member_not_available','Invalid member rejects entire team creation');
select ok(not exists(select 1 from public.teams where name='Invalid team'),'Failed team creation leaves no partial team');
select ok((select cardinality(team_ids) from public.admin_list_team_members() where id='e2000000-0000-4000-8000-000000000003')=1,'Team management directory returns assigned teams');
select lives_ok($$ select public.set_conversation_members('e4000000-0000-4000-8000-000000000001',array['e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000004']::uuid[]) $$,'Manager adds coworker outside team and removes an existing member');
select ok(not exists(select 1 from public.conversation_members where conversation_id='e4000000-0000-4000-8000-000000000001' and profile_id='e2000000-0000-4000-8000-000000000005'),'Removed chat member is no longer present');
select throws_ok($$ select public.set_conversation_members('e4000000-0000-4000-8000-000000000001',array['e2000000-0000-4000-8000-000000000003']::uuid[]) $$,'22023','conversation_manager_required','Non-super manager must retain their own management access');
select throws_ok($$ select public.set_conversation_members('e4000000-0000-4000-8000-000000000001',array['e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000006']::uuid[]) $$,'22023','member_not_available','Chat members must share the organization');
select lives_ok($$ select public.set_conversation_avatar('e4000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/avatar.png') $$,'Authorized manager sets the group avatar');
select ok((select avatar_path from public.list_conversations() where id='e4000000-0000-4000-8000-000000000001')='e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/avatar.png','Chat list exposes the saved avatar path');
select ok(exists(select 1 from storage.objects where bucket_id='conversation-avatars' and name='e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/avatar.png'),'Current members can read their group avatar');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
select ok(not public.can_manage_conversation('e4000000-0000-4000-8000-000000000001'),'Removed member cannot manage chat');
select ok(not exists(select 1 from public.conversations where id='e4000000-0000-4000-8000-000000000001'),'Removed member can no longer read chat');
select ok(not exists(select 1 from storage.objects where bucket_id='conversation-avatars' and name='e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/avatar.png'),'Removed member can no longer request avatar download');
select throws_ok($$ select public.set_conversation_avatar('e4000000-0000-4000-8000-000000000001',null) $$,'42501','permission_denied','Removed member cannot modify avatar');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select ok((select count(*) from public.my_permissions())=(select count(*) from public.permissions),'Super Admin has all permissions with no explicit role grants');
select lives_ok($$ select public.set_user_roles('e2000000-0000-4000-8000-000000000005',array['e3000000-0000-4000-8000-000000000005']::uuid[]) $$,'Super Admin changes existing employee to team lead atomically');
select lives_ok($$ select public.set_user_roles('e2000000-0000-4000-8000-000000000005',array['e3000000-0000-4000-8000-000000000003']::uuid[]) $$,'Roles can be changed back later');
select throws_ok($$ select public.set_user_roles('e2000000-0000-4000-8000-000000000001',array['e3000000-0000-4000-8000-000000000003']::uuid[]) $$,'42501','last_super_admin_role_cannot_be_removed','Final Super Admin cannot be removed');
select lives_ok($$ select public.set_user_roles('e2000000-0000-4000-8000-000000000001',array['e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003']::uuid[]) $$,'Super Admin can update their own additional roles');
select throws_ok($$ select public.set_role_permission('e3000000-0000-4000-8000-000000000003','leave.create',true) $$,'42501','admin_only_permission','Admin-only creation cannot be delegated through custom permissions');
select ok(public.can_manage_conversation('e4000000-0000-4000-8000-000000000001'),'Super Admin can administer group without being a member');
select ok(not public.can_manage_conversation('e4000000-0000-4000-8000-000000000002'),'Direct conversations remain excluded from group management');
select ok(not exists(select 1 from public.conversations where id='e4000000-0000-4000-8000-000000000001'),'Admin management authority does not automatically expose message history');
select lives_ok($$ select public.set_conversation_avatar('e4000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/replacement.png') $$,'Super Admin can update a nonmember group avatar');
select ok(exists(select 1 from storage.objects where bucket_id='conversation-avatars' and name='e0000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/replacement.png'),'Super Admin can read managed group avatar without membership');
select lives_ok($$ select public.set_conversation_members('e4000000-0000-4000-8000-000000000001',array['e2000000-0000-4000-8000-000000000002']::uuid[]) $$,'Super Admin may remove original group creator');
select throws_ok($$ select public.set_conversation_members('e4000000-0000-4000-8000-000000000001','{}'::uuid[]) $$,'22023','conversation_requires_members','Group cannot be left without members');
reset role;
select ok(exists(select 1 from public.audit_logs where actor_id='e2000000-0000-4000-8000-000000000002' and action='leave.submitted' and metadata->>'profile_id'='e2000000-0000-4000-8000-000000000003'),'Absence audit records both administrator and employee');
select ok(not (select employee_confirmation from public.sick_leave_records where profile_id='e2000000-0000-4000-8000-000000000003'),'Staff sickness entered by admin is not marked employee-confirmed');
select ok(not has_function_privilege('anon','public.set_user_roles(uuid,uuid[])','execute') and not has_function_privilege('anon','public.set_conversation_avatar(uuid,text)','execute'),'New management RPCs require authentication');
select ok(not has_table_privilege('authenticated','public.conversation_members','insert') and not has_table_privilege('authenticated','public.conversations','update'),'Direct writes cannot bypass the management workflows');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select ok(exists(select 1 from public.my_permissions() where permission_key='data.correct'),
  'Super Admin has effective correction permission without a manual grant');
select throws_ok($$ select public.set_role_permission('e3000000-0000-4000-8000-000000000003','data.correct',true) $$,
  '42501','admin_only_permission','Correction permission cannot be delegated to employees');
select throws_ok($$ select public.set_role_permission('e3000000-0000-4000-8000-000000000005','data.correct',true) $$,
  '42501','admin_only_permission','Correction permission cannot be delegated to team leads');
select throws_ok($$ select public.create_role('Fourth role') $$,
  '22023','fixed_role_catalog','Even Super Admin cannot add a fourth catalogue role');
select throws_ok($$ select public.set_user_roles('e2000000-0000-4000-8000-000000000005',array['e3000000-0000-4000-8000-000000000002']::uuid[]) $$,
  '42501','role_delegation_not_allowed','Retired administration role cannot be newly assigned');
reset role;
-- Even a direct stale grant cannot turn a non-Super-Admin into a corrector.
insert into public.role_permissions(role_id,permission_key) values
 ('e3000000-0000-4000-8000-000000000003','data.correct'),
 ('e3000000-0000-4000-8000-000000000005','data.correct') on conflict do nothing;
insert into public.user_roles(profile_id,role_id,organization_id) values
 ('e2000000-0000-4000-8000-000000000005','e3000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
select ok(not exists(select 1 from public.my_permissions() where permission_key='data.correct'),
  'Employee and team-lead grants together still do not confer data.correct');
reset role;
select * from finish();
rollback;
