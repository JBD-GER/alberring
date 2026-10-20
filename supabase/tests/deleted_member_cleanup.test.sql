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


-- A retained tombstone is distinct from a merely archived employee.
update public.profiles set auth_user_id=null,deleted_at=now(),display_name='Gelöschter Benutzer'
where id='c2000000-0000-4000-8000-000000000003';
update public.team_memberships set valid_from=current_date-10;
insert into public.messages(id,organization_id,conversation_id,sender_id,body) values
 ('c6000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','Retained test message');
insert into public.conversations(id,organization_id,type,created_by) values
 ('c4000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','direct','c2000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,profile_id,organization_id)
select 'c4000000-0000-4000-8000-000000000002',('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'c0000000-0000-4000-8000-000000000001' from unnest(array[1,3]) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.admin_list_deleted_memberships()$$,'42501','permission_denied','Employees cannot list removed accounts');
select throws_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000003')$$,'42501','permission_denied','Employees cannot remove memberships');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.admin_list_deleted_memberships()),1::bigint,'Admin sees only deleted accounts with memberships');
select is((select chat_count from public.admin_list_deleted_memberships()),1::bigint,'Only group membership is counted');
select throws_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000002')$$,'22023','deleted_profile_not_available','Active users protected');
select throws_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000004')$$,'22023','deleted_profile_not_available','Archived users protected');
select throws_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000006')$$,'22023','deleted_profile_not_available','Foreign users protected');
select lives_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000003')$$,'Admin removes obsolete memberships');
select lives_ok($$select public.admin_remove_deleted_memberships('c2000000-0000-4000-8000-000000000003')$$,'Repeated cleanup is harmless');
select is((select count(*) from public.admin_list_deleted_memberships()),0::bigint,'Cleaned account disappears from pending cleanup');
reset role;
select is((select count(*) from public.messages where id='c6000000-0000-4000-8000-000000000001'),1::bigint,'Message remains');
select is((select count(*) from public.profiles where id='c2000000-0000-4000-8000-000000000003'),1::bigint,'Retained profile remains');
select is((select count(*) from public.conversation_members where profile_id='c2000000-0000-4000-8000-000000000003'),1::bigint,'Direct conversation remains');
select is((select valid_until from public.team_memberships where profile_id='c2000000-0000-4000-8000-000000000003'),current_date-1,'Past team period remains');
select is((select count(*) from public.audit_logs where action='user.deleted_memberships_removed' and entity_id='c2000000-0000-4000-8000-000000000003'),1::bigint,'Cleanup logged once');
select ok(not has_function_privilege('anon','public.admin_remove_deleted_memberships(uuid)','execute'),'Anonymous cleanup blocked');
select ok(not has_function_privilege('anon','public.admin_list_deleted_memberships()','execute'),'Anonymous list blocked');
select is((select enabled from public.integration_providers where key='curasoft'),false,'CuraSoft remains disabled');
select * from finish();
rollback;
