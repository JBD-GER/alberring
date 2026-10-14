begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();

insert into public.organizations(id,name,slug) values
 ('c0000000-0000-4000-8000-000000000001','Employee feedback tests','employee-feedback-tests'),
 ('c0000000-0000-4000-8000-000000000002','Foreign organization','employee-feedback-foreign');
insert into public.organization_settings(organization_id) values ('c0000000-0000-4000-8000-000000000001');
do $$
declare n integer; org uuid;
begin
 for n in 1..6 loop
  org:=case when n=6 then 'c0000000-0000-4000-8000-000000000002'::uuid else 'c0000000-0000-4000-8000-000000000001'::uuid end;
  insert into auth.users(id,email,aud,role,email_confirmed_at) values
   (('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'feedback-'||n||'@example.test','authenticated','authenticated',now());
  insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
   (('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,org,'Feedback test '||n,'feedback-'||n||'@example.test',case when n in (3,4) then 'archived' else 'active' end);
 end loop;
end $$;
insert into public.roles(id,organization_id,name,system_key) values
 ('c3000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
 ('c3000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Employee','employee');
insert into public.role_permissions(role_id,permission_key) values
 ('c3000000-0000-4000-8000-000000000002','leave.view_own'),
 ('c3000000-0000-4000-8000-000000000002','leave.create_own'),
 ('c3000000-0000-4000-8000-000000000002','messages.use');
insert into public.user_roles(profile_id,role_id,organization_id)
select ('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=1 then 'c3000000-0000-4000-8000-000000000001'::uuid else 'c3000000-0000-4000-8000-000000000002'::uuid end,
 'c0000000-0000-4000-8000-000000000001' from generate_series(1,5) n;
insert into public.leave_types(organization_id,code,name) values ('c0000000-0000-4000-8000-000000000001','annual','Urlaub');
insert into public.conversations(id,organization_id,type,name,created_by) values
 ('c4000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','group','Retained history','c2000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id)
select 'c4000000-0000-4000-8000-000000000001',('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'c0000000-0000-4000-8000-000000000001' from unnest(array[1,3]) n;
insert into public.teams(id,organization_id,name) values ('c5000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Retained team');
insert into public.team_memberships(team_id,profile_id,organization_id) values ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001');

-- Dates are relative to the next Monday so these assertions stay valid.
select is(private.calculate_leave_workdays('c2000000-0000-4000-8000-000000000002',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+13,1),6::numeric,'Monday through Sunday deducts six days');
select is(private.calculate_leave_workdays('c2000000-0000-4000-8000-000000000002',date_trunc('week',current_date)::date+12,date_trunc('week',current_date)::date+12,0.5),0.5::numeric,'A half Saturday counts');
select is(private.calculate_leave_workdays('c2000000-0000-4000-8000-000000000002',date_trunc('week',current_date)::date+13,date_trunc('week',current_date)::date+13,1),0::numeric,'Sunday does not count');
insert into public.public_holidays(organization_id,holiday_on,name) values ('c0000000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date+12,'Test Saturday holiday');
select is(private.calculate_leave_workdays('c2000000-0000-4000-8000-000000000002',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+13,1),5::numeric,'A Saturday public holiday is excluded');

set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.submit_leave_request('annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+13,1,'Own request')$$,'Employee submits own leave');
select is((select workdays from public.leave_requests where profile_id='c2000000-0000-4000-8000-000000000002'),5::numeric,'Persisted days exclude Sunday and holiday');
select is((select status from public.leave_requests where profile_id='c2000000-0000-4000-8000-000000000002'),'submitted','Employee request requires approval');
select throws_ok($$select public.create_leave_request_for_user('c2000000-0000-4000-8000-000000000005','annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null)$$,'42501','permission_denied','Employee cannot submit for someone else');
select throws_ok($$select public.create_leave_request_for_user('c2000000-0000-4000-8000-000000000002','annual',date_trunc('week',current_date)::date+21,date_trunc('week',current_date)::date+21,1,null)$$,'42501','permission_denied','Administrative RPC stays admin-only even for self');
select throws_ok($$select public.submit_leave_request('annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+8,1,null)$$,'23P01','overlapping_leave_request','Overlapping requests are still rejected');
select throws_ok($$select public.submit_leave_request('annual',date_trunc('week',current_date)::date+20,date_trunc('week',current_date)::date+20,1,null)$$,'22023','no_workdays_in_period','Sunday-only requests are rejected');
select throws_ok($$select public.decide_leave_request((select id from public.leave_requests where profile_id='c2000000-0000-4000-8000-000000000002'),'approved',null)$$,'42501','permission_denied','Employee cannot approve own request');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.set_conversation_members('c4000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000005']::uuid[])$$,'Active replacement can join a group retaining a deleted member');
select lives_ok($$select public.set_team_members('c5000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000005']::uuid[])$$,'Active replacement can join a team retaining a deleted member');
select throws_ok($$select public.set_conversation_members('c4000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000004']::uuid[])$$,'22023','member_not_available','Cannot add a different archived account to a group');
select throws_ok($$select public.set_team_members('c5000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000004']::uuid[])$$,'22023','member_not_available','Cannot add a different archived account to a team');
select throws_ok($$select public.set_conversation_members('c4000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000006']::uuid[])$$,'22023','member_not_available','Foreign active profiles cannot join the group');
select throws_ok($$select public.set_team_members('c5000000-0000-4000-8000-000000000001',array['c2000000-0000-4000-8000-000000000006']::uuid[])$$,'22023','member_not_available','Foreign active profiles cannot join the team');
select lives_ok($$select public.correct_leave_request((select id from public.leave_requests where profile_id='c2000000-0000-4000-8000-000000000002'),'annual',date_trunc('week',current_date)::date+14,date_trunc('week',current_date)::date+20,1,null,'Correct dates')$$,'Super Admin can correct to a six-day week');
select is((select workdays from public.leave_requests where profile_id='c2000000-0000-4000-8000-000000000002'),6::numeric,'Corrections also calculate six days');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.list_conversations()$$,'42501','permission_denied','Retained archived account still has no conversation access');
select throws_ok($$select public.submit_leave_request('annual',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+7,1,null)$$,'42501','permission_denied','Archived account cannot submit leave');
reset role;
select is((select count(*) from public.conversation_members where conversation_id='c4000000-0000-4000-8000-000000000001'),3::bigint,'Original members and active replacement are retained');
select is((select status from public.profiles where id='c2000000-0000-4000-8000-000000000003'),'archived','Retaining history never reactivates an old account');
select ok(not has_function_privilege('authenticated','private.create_leave_request_for_user(uuid,text,date,date,numeric,text)','execute'),'Private shared creation function is not callable directly');
select ok(not has_function_privilege('anon','public.submit_leave_request(text,date,date,numeric,text)','execute'),'Anonymous users cannot submit leave');
select * from finish();
rollback;
