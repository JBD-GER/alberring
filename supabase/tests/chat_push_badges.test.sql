begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();
insert into auth.users(id,email) values
 ('79000000-0000-4000-8000-000000000001','badge-one@example.test'),
 ('79000000-0000-4000-8000-000000000002','badge-two@example.test');
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status) values
 ('79100000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Badge One','badge-one@example.test','active'),
 ('79100000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Badge Two','badge-two@example.test','active');
insert into public.user_roles(profile_id,role_id,organization_id)
 select p.id,r.id,p.organization_id from public.profiles p join public.roles r on r.organization_id=p.organization_id and r.system_key='employee'
 where p.id in ('79100000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000002');
insert into public.conversations(id,organization_id,type,name,created_by)
 values('79200000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','group','Badge test','79100000-0000-4000-8000-000000000002');
insert into public.conversation_members(conversation_id,profile_id,organization_id)
 select '79200000-0000-4000-8000-000000000001',id,organization_id from public.profiles
 where id in ('79100000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000002');
insert into public.messages(id,organization_id,conversation_id,sender_id,body) values
 ('79300000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','79200000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000002','Synthetic badge message');
insert into public.notifications(id,organization_id,profile_id,type,title,body,deduplication_key,target_path) values
 ('79400000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000001','message','Synthetic','Synthetic',
 'message:79300000-0000-4000-8000-000000000001:79100000-0000-4000-8000-000000000001','/app/messages/79200000-0000-4000-8000-000000000001');
select ok(not has_function_privilege('anon','public.my_push_state(uuid[])','execute'),'anonymous cannot read badge state');
select ok(not has_function_privilege('authenticated','public.push_delivery_state(uuid)','execute'),'client cannot inspect arbitrary recipient');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.my_push_state()->>'badge_count')::int,1,'unread message adds badge');
select lives_ok($$select public.enable_chat_push()$$,'explicit action enables own chat preference');
reset role;
select ok((select push_enabled from public.notification_preferences where profile_id='79100000-0000-4000-8000-000000000001' and category='messages'),'chat preference enabled');
select is((public.push_delivery_state('79400000-0000-4000-8000-000000000001')->>'eligible')::boolean,true,'worker can deliver accessible unread message');
update public.conversations set archived_at=now() where id='79200000-0000-4000-8000-000000000001';
select is((public.push_delivery_state('79400000-0000-4000-8000-000000000001')->>'eligible')::boolean,false,'archived conversation never pushes');
set local role authenticated;
select throws_ok($$select public.send_message('79200000-0000-4000-8000-000000000001','No archived send')$$,'42501',null,'cannot send to archived conversation');
reset role;
update public.conversations set archived_at=null where id='79200000-0000-4000-8000-000000000001';
update public.conversation_members set muted_until=now()+interval '1 day' where conversation_id='79200000-0000-4000-8000-000000000001' and profile_id='79100000-0000-4000-8000-000000000001';
select is((public.push_delivery_state('79400000-0000-4000-8000-000000000001')->>'eligible')::boolean,false,'muted chat cannot deliver queued push');
update public.conversation_members set muted_until=null where conversation_id='79200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.my_push_state()->>'badge_count')::int,0,'other account does not see badge');
select is(public.my_push_state(array['79400000-0000-4000-8000-000000000001'::uuid])->'stale_ids','["79400000-0000-4000-8000-000000000001"]'::jsonb,'other account cannot retain old account notification');
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.message_read_receipts(message_id,profile_id) values('79300000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000001');
select is((public.my_push_state()->>'badge_count')::int,0,'reading message clears badge across platforms');
select is(public.my_push_state(array['79400000-0000-4000-8000-000000000001'::uuid])->'stale_ids','["79400000-0000-4000-8000-000000000001"]'::jsonb,'read notification removed from OS tray');
reset role;
select ok((select read_at is not null from public.notifications where id='79400000-0000-4000-8000-000000000001'),'read receipt also clears in-app notification');
select is((public.push_delivery_state('79400000-0000-4000-8000-000000000001')->>'eligible')::boolean,false,'already-read message cannot send delayed push');
select * from finish();
rollback;
