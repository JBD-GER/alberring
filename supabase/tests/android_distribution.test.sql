begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated, anon;
grant execute on all functions in schema extensions to authenticated, anon;
select plan(9);
insert into public.organizations(id,name,slug)
values('ad000000-0000-4000-8000-000000000001','Android release tests','android-release-tests');
insert into auth.users(id,email) values
('ad100000-0000-4000-8000-000000000001','android-active@example.test'),
('ad100000-0000-4000-8000-000000000002','android-suspended@example.test'),
('ad100000-0000-4000-8000-000000000003','android-no-profile@example.test');
insert into public.profiles(auth_user_id,organization_id,display_name,email,status) values
('ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','Active','android-active@example.test','active'),
('ad100000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000001','Suspended','android-suspended@example.test','suspended');
insert into storage.objects(bucket_id,name) values
('app-releases','android/Alberring-1.0.3-11.apk'),
('app-releases','private/signing.key');
select is((select public from storage.buckets where id='app-releases'),false,'APK bucket is private');
set local role anon;
select is((select count(*) from storage.objects where bucket_id='app-releases'),0::bigint,'anonymous users cannot read binaries');
set local role authenticated;
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
select is((select count(*) from storage.objects where bucket_id='app-releases'),1::bigint,'active employee can read only release APKs');
select throws_ok($$insert into storage.objects(bucket_id,name) values('app-releases','android/Alberring-1.0.4-12.apk')$$,'42501',null,'employees cannot upload binaries');
with changed as (update storage.objects set name='android/Alberring-1.0.4-12.apk' where bucket_id='app-releases' returning id)
select is((select count(*) from changed),0::bigint,'employees cannot replace binaries');
with removed as (delete from storage.objects where bucket_id='app-releases' returning id)
select is((select count(*) from removed),0::bigint,'employees cannot delete binaries');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000002',true);
select is((select count(*) from storage.objects where bucket_id='app-releases'),0::bigint,'suspended employee cannot download');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000003',true);
select is((select count(*) from storage.objects where bucket_id='app-releases'),0::bigint,'auth user without employee profile cannot download');
reset role;
update public.organizations set active=false where id='ad000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
select is((select count(*) from storage.objects where bucket_id='app-releases'),0::bigint,'inactive organization cannot download');
reset role;
select * from finish();
rollback;
