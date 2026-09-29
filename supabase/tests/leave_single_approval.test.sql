begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();

insert into public.organizations(id,name,slug) values
  ('f0000000-0000-4000-8000-000000000001','Leave tests','leave-single-tests'),
  ('f0000000-0000-4000-8000-000000000002','Foreign leave tests','leave-single-foreign');
insert into public.organization_settings(organization_id) values
  ('f0000000-0000-4000-8000-000000000001');
select is((select leave_approval_steps::integer from public.organization_settings
  where organization_id='f0000000-0000-4000-8000-000000000001'),1,
  'New organizations require one approval by default');

do $$
declare n integer; org uuid;
begin
  for n in 1..6 loop
    org:=case when n=6 then 'f0000000-0000-4000-8000-000000000002'::uuid
      else 'f0000000-0000-4000-8000-000000000001'::uuid end;
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role)
    values(('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      'leave-test-'||n::text||'@example.test',now(),'{}','{}','authenticated','authenticated');
    insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status)
    values(('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      org,'Leave test '||n::text,'leave-test-'||n::text||'@example.test','active');
  end loop;
end;
$$;
insert into public.roles(id,organization_id,name,system_key) values
  ('f3000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','Administrator','administration'),
  ('f3000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
  ('f3000000-0000-4000-8000-000000000004','f0000000-0000-4000-8000-000000000001','Custom leave manager',null),
  ('f3000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000001','Team approver',null);
insert into public.role_permissions(role_id,permission_key) values
  ('f3000000-0000-4000-8000-000000000001','leave.manage'),
  ('f3000000-0000-4000-8000-000000000004','leave.manage'),
  ('f3000000-0000-4000-8000-000000000005','leave.approve');
insert into public.user_roles(profile_id,role_id,organization_id)
select ('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f0000000-0000-4000-8000-000000000001'
from unnest(array[1,2,4,5]) n;
insert into public.leave_types(organization_id,code,name) values
  ('f0000000-0000-4000-8000-000000000001','annual','Erholungsurlaub');
insert into public.teams(id,organization_id,name,lead_profile_id) values
  ('f4000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','Leave team','f2000000-0000-4000-8000-000000000005');
insert into public.team_memberships(team_id,profile_id,organization_id) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000001');

-- Legacy requests include both pre-migration pending steps and a migrated review
-- request with an existing approval. Finalized approval history is preserved.
insert into public.leave_requests(id,organization_id,profile_id,leave_type,starts_on,ends_on,workdays,status)
select ('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=6 then 'f0000000-0000-4000-8000-000000000002'::uuid else 'f0000000-0000-4000-8000-000000000001'::uuid end,
  ('f2000000-0000-4000-8000-'||lpad((case n when 2 then 1 when 3 then 2 when 4 then 4 when 5 then 5 when 6 then 6 else 3 end)::text,12,'0'))::uuid,
  'annual',current_date+n*10,current_date+n*10,1,
  case when n in (7,9) then 'review' when n=12 then 'approved' else 'submitted' end
from generate_series(1,12) n;
insert into public.leave_approval_steps(organization_id,leave_request_id,step_number,status,decided_by,decided_at,comment)
select organization_id,id,1,
  case when status in ('review','approved') then 'approved' else 'pending' end,
  case when status in ('review','approved') then 'f2000000-0000-4000-8000-000000000001'::uuid end,
  case when status in ('review','approved') then '2026-09-01 12:00:00+00'::timestamptz end,
  case when status in ('review','approved') then 'Existing approval' end
from public.leave_requests where organization_id in ('f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002');
insert into public.leave_approval_steps(organization_id,leave_request_id,step_number,status,decided_at,comment)
select organization_id,id,2,case when n=7 then 'skipped' else 'pending' end,
  case when n=7 then now() end,
  case when n=7 then 'Umstellung auf eine Freigabe; weiterer Schritt entfällt' end
from generate_series(7,11) n join public.leave_requests
  on id=('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000001','approved','Freigegeben') $$,
  'One admin approval completes an employee request');
select is((select status from public.leave_requests where id='f5000000-0000-4000-8000-000000000001'),'approved','Employee request is approved');
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000002','approved',null) $$,
  'Administrator with leave.manage may approve their own request');
select is((select status from public.leave_requests where id='f5000000-0000-4000-8000-000000000002'),'approved','Own admin request is fully approved');
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000007','approved','Bestätigt') $$,
  'Same admin completes historical review after extra step was skipped');
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000008','approved',null) $$,
  'One approval also completes a legacy request with two pending steps');
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000009','approved',null) $$,
  'Changing settings to one step lets the same admin finish prior review');
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000010','rejected',' ') $$,
  '22023','rejection_reason_required','Rejection still requires a reason');
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000010','rejected','Termin nicht möglich') $$,
  'Rejection completes all outstanding steps');
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000006','approved',null) $$,
  '22023','request_not_decidable','Cross-organization decision remains denied');
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000012','approved',null) $$,
  '22023','request_not_decidable','Existing final decisions cannot be overwritten');
select lives_ok($$ select set_config('test.leave_created',public.create_leave_request_for_user(
  'f2000000-0000-4000-8000-000000000001','annual','2030-01-07','2030-01-08',1,null)::text,true) $$,
  'Admin can create their own request through the employee selection flow');
select lives_ok($$ select public.decide_leave_request(current_setting('test.leave_created')::uuid,'approved',null) $$,
  'Same admin can then approve the request they just created');
select lives_ok($$ select set_config('test.leave_employee_created',public.create_leave_request_for_user(
  'f2000000-0000-4000-8000-000000000003','annual','2030-02-04','2030-02-05',1,null)::text,true) $$,
  'Admin can create a request on behalf of an employee');
select lives_ok($$ select public.decide_leave_request(current_setting('test.leave_employee_created')::uuid,'approved',null) $$,
  'The same admin may approve the employee request they entered');

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000003','approved',null) $$,
  'Super Admin may approve their own request');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000004','approved',null) $$,
  '42501','self_approval_not_allowed','Custom leave.manage role cannot approve their own request');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000005','approved',null) $$,
  '42501','self_approval_not_allowed','Team approvers cannot approve their own request');
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000004','approved',null) $$,
  '42501','permission_denied','Team approver cannot decide outside their team');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000004','approved',null) $$,
  '42501','permission_denied','Employee has no approval permission');

reset role;
select ok(not exists(select 1 from public.leave_requests where id in (
  'f5000000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000009'
) and status<>'approved'),'All historical requests completed with one acting admin');
select ok(not exists(select 1 from public.leave_approval_steps where leave_request_id in (
  'f5000000-0000-4000-8000-000000000007','f5000000-0000-4000-8000-000000000008','f5000000-0000-4000-8000-000000000009',
  'f5000000-0000-4000-8000-000000000010'
) and status='pending'),'No unnecessary pending approvals remain');
select ok((select status='approved' and decided_at='2026-09-01 12:00:00+00'::timestamptz and comment='Existing approval'
  from public.leave_approval_steps where leave_request_id='f5000000-0000-4000-8000-000000000007' and step_number=1),
  'Migrated review preserves the previous approval history');
select is((select status from public.leave_approval_steps where leave_request_id='f5000000-0000-4000-8000-000000000008' and step_number=2),
  'skipped','Unneeded second step is skipped rather than recorded as another approval');
select is((select status from public.leave_approval_steps where leave_request_id='f5000000-0000-4000-8000-000000000009' and step_number=2),
  'skipped','Existing first approval does not become a fabricated second approval');
select is((select count(*)::integer from public.leave_approval_steps where leave_request_id=current_setting('test.leave_created')::uuid),
  1,'New admin-created requests contain one approval step');
select ok(exists(select 1 from public.audit_logs where entity_id='f5000000-0000-4000-8000-000000000002'
  and actor_id='f2000000-0000-4000-8000-000000000001' and action='leave.decided'),
  'Own admin approval remains auditable');
select ok(exists(select 1 from public.notifications where profile_id='f2000000-0000-4000-8000-000000000003' and type='leave_status'),
  'Approved employee still receives a status notification');
select throws_ok($$ update public.leave_approval_steps set status='approved',decided_by='f2000000-0000-4000-8000-000000000004',decided_at=now()
  where leave_request_id='f5000000-0000-4000-8000-000000000004' $$,
  '42501','self_approval_not_allowed','Trigger still rejects ordinary self-approval');

-- Optional two-step setting remains explicit and retains separation of approvers.
update public.organization_settings set leave_approval_steps=2 where organization_id='f0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000011','approved',null) $$,
  'Optional two-step approval saves first approval');
select is((select status from public.leave_requests where id='f5000000-0000-4000-8000-000000000011'),'review',
  'Explicit two-step request still awaits second approver');
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000011','approved',null) $$,
  '42501','second_approver_required','Two-step setting still requires distinct approvers');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
select lives_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000011','approved',null) $$,
  'Authorized team approver can provide optional second approval');
reset role;
select is((select status from public.leave_requests where id='f5000000-0000-4000-8000-000000000011'),'approved',
  'Optional two-step request is approved after distinct approvers');
delete from public.role_permissions where role_id='f3000000-0000-4000-8000-000000000001' and permission_key='leave.manage';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select throws_ok($$ select public.decide_leave_request('f5000000-0000-4000-8000-000000000004','approved',null) $$,
  '42501','permission_denied','Admin role alone cannot bypass missing approval permission');
reset role;
select ok(not has_function_privilege('anon','public.decide_leave_request(uuid,text,text)','execute'),
  'Approval RPC remains inaccessible to anonymous callers');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
with changed as (
  update public.leave_approval_steps set status='approved',decided_by='f2000000-0000-4000-8000-000000000002',decided_at=now()
  where leave_request_id='f5000000-0000-4000-8000-000000000004'
  returning id
)
select is((select count(*)::integer from changed),0,
  'RLS prevents clients bypassing approval RPC with direct step updates');
reset role;
select * from finish();
rollback;
