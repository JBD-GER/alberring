begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated,anon,service_role;
grant execute on all functions in schema extensions to authenticated,anon,service_role;
select plan(33);
insert into auth.users(id,email) values
  ('70000000-0000-4000-8000-000000000001','push-a@example.test'),
  ('70000000-0000-4000-8000-000000000002','push-b@example.test');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
  ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Push A','push-a@example.test','active'),
  ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Push B','push-b@example.test','active');
insert into auth.sessions(id,user_id) values
  ('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'),
  ('72000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002');
select ok(not has_function_privilege('anon','public.register_push_device(uuid,text,text,text,text)','execute'),'anon cannot register');
select ok(not has_function_privilege('authenticated','public.active_push_devices(uuid)','execute'),'client cannot fetch delivery tokens');
select ok(not has_function_privilege('authenticated','public.claim_notification_batch(integer)','execute'),'client cannot claim automation');
select ok(not has_table_privilege('authenticated','public.user_devices','insert'),'direct registrations disabled');
select ok(not has_column_privilege('authenticated','public.user_devices','push_token','select'),'raw token is server-only');
select ok(not has_column_privilege('authenticated','public.user_devices','push_token_hash','select'),'token hash is server-only');
select ok(not has_table_privilege('authenticated','public.push_delivery_receipts','select'),'delivery receipts server-only');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000001"}',true);
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000001','ios',repeat('a',64))$$,'42501',null,'foreign auth session rejected');
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"invalid"}',true);
select throws_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000001','ios',repeat('a',64))$$,'42501',null,'malformed auth session rejected');
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000001','ios',repeat('a',64))$$,'active user registers device');
select is((select count(*) from public.user_devices),1::bigint,'owner sees device');
select throws_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000002','ios','invalid')$$,'22023',null,'invalid token rejected');
select lives_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000001','ios',repeat('b',64))$$,'rotation upserts installation');
select is((select count(*) from public.user_devices),1::bigint,'rotation does not accumulate devices');
select lives_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000003','android',repeat('c',64))$$,'second device accepted');
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.user_devices),0::bigint,'another user cannot read devices');
select public.revoke_push_device('73000000-0000-4000-8000-000000000001');
reset role;
select is((select count(*) from public.user_devices where revoked_at is null),2::bigint,'another user cannot revoke devices');
set local role authenticated;
select lives_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000004','ios',repeat('b',64))$$,'token rebind allowed for new logged-in user');
reset role;
select is((select count(*) from public.user_devices where push_token=repeat('b',64) and revoked_at is null),1::bigint,'one active owner per token');
select ok((select revoked_at is not null and push_token is null from public.user_devices where installation_id='73000000-0000-4000-8000-000000000001'),'old binding revoked and token erased');
set local role service_role;
select is((select count(*) from public.active_push_devices('71000000-0000-4000-8000-000000000002')),1::bigint,'service resolves active session device');
reset role;
delete from auth.sessions where id='72000000-0000-4000-8000-000000000002';
set local role service_role;
select is((select count(*) from public.active_push_devices('71000000-0000-4000-8000-000000000002')),0::bigint,'revoked session excludes device');
set local role authenticated;
select throws_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000004','ios',repeat('b',64))$$,'42501',null,'revoked session cannot register');
select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000001"}',true);
select public.revoke_push_device('73000000-0000-4000-8000-000000000003');
reset role;
select ok((select revoked_at is not null and push_token is null from public.user_devices where installation_id='73000000-0000-4000-8000-000000000003'),'logout erases own token');
update public.profiles set status='suspended' where id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.register_push_device('73000000-0000-4000-8000-000000000003','android',repeat('c',64))$$,'42501',null,'suspended account cannot register');
select lives_ok($$select public.revoke_push_device('73000000-0000-4000-8000-000000000003')$$,'suspended account can remove own device');
reset role;
select ok((select not public and 'audio/mp4'=any(allowed_mime_types) and 'audio/webm'=any(allowed_mime_types) from storage.buckets where id='message-attachments'),'audio allowed only in private chat bucket');
select is((select file_size_limit from storage.buckets where id='message-attachments'),10485760::bigint,'10 MiB size guard unchanged');
select ok((select not 'audio/mp4'=any(allowed_mime_types) from storage.buckets where id='sick-certificates'),'medical upload types unchanged');
-- Claims use leases and preserve queued work across concurrent scheduler runs.
update public.notification_deliveries set next_attempt_at=now()+interval '1 day' where status='pending';
insert into public.notifications(organization_id,profile_id,type,title,body)
select '00000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','system','Queue test','Queue test'
from generate_series(1,12);
set local role service_role;
select is((select count(*) from public.claim_notification_batch(100)),10::bigint,'claim clamps scheduler request to bounded batch');
select is((select count(*) from public.claim_notification_batch(100)),2::bigint,'second claim skips leased rows');
select is((select count(*) from public.claim_notification_batch(100)),0::bigint,'leased notifications are not claimed again');
reset role;
select is((select min(attempt_count) from public.notification_deliveries d join public.notifications n on n.id=d.notification_id where n.title='Queue test'),1::smallint,'each claimed delivery increments attempt once');
select * from finish();
rollback;
