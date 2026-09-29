begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select plan(42);
insert into public.organizations(id,name,slug) values
 ('b6000000-0000-4000-8000-000000000001','Fleet correction tests','fleet-correction-tests'),
 ('b6000000-0000-4000-8000-000000000002','Foreign fleet','fleet-correction-foreign');
do $$ declare n integer; begin for n in 1..3 loop
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role)
 values(('b6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fleet-correction-'||n::text||'@example.test',now(),'{}','{}','authenticated','authenticated');
 insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status)
 values(('b6200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('b6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'b6000000-0000-4000-8000-000000000001','Fleet test '||n::text,'fleet-correction-'||n::text||'@example.test','active');
end loop; end $$;
insert into public.roles(id,organization_id,name,system_key) values
 ('b6300000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
 ('b6300000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001','Employee','employee');
insert into public.role_permissions(role_id,permission_key) values
 ('b6300000-0000-4000-8000-000000000002','fleet.manage'),('b6300000-0000-4000-8000-000000000002','mileage.manage');
insert into public.user_roles(profile_id,role_id,organization_id) values
 ('b6200000-0000-4000-8000-000000000001','b6300000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001'),
 ('b6200000-0000-4000-8000-000000000002','b6300000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001');
insert into public.vehicles(id,organization_id,internal_name,license_plate,current_mileage,status) values
 ('b6400000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','Vehicle One','TEST-1',21000,'active'),
 ('b6400000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001','Vehicle Two','TEST-2',5000,'active'),
 ('b6400000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000002','Foreign Vehicle','TEST-3',6000,'active');
insert into public.vehicle_maintenance_events(id,organization_id,vehicle_id,event_type,title,due_on,status,created_by) values
 ('b6500000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','service','Old service','2030-01-10','planned','b6200000-0000-4000-8000-000000000002'),
 ('b6500000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000003','service','Foreign service','2030-01-10','planned',null);
insert into public.vehicle_damage_reports(id,organization_id,vehicle_id,reported_by,occurred_on,description,status) values
 ('b6600000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000003','2026-01-02','Original description','reported'),
 ('b6600000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000003','b6200000-0000-4000-8000-000000000003','2026-01-02','Foreign description','reported');
insert into public.mileage_submissions(id,organization_id,vehicle_id,profile_id,mileage,read_on,status,previous_mileage,photo_path) values
 ('b6700000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000003',21000,'2026-01-04','verified',10000,'original-photo'),
 ('b6700000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000003',10000,'2025-12-04','verified',9000,null),
 ('b6700000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000001','b6200000-0000-4000-8000-000000000003',15000,'2026-02-04','verified',12000,null),
 ('b6700000-0000-4000-8000-000000000004','b6000000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000003','b6200000-0000-4000-8000-000000000003',6000,'2026-01-04','verified',5000,null);

set local role authenticated;
select set_config('request.jwt.claim.sub','b6100000-0000-4000-8000-000000000001',true);
select lives_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'planned','Workshop B','Corrected note',null,null) $$,'Super Admin edits existing maintenance fields and vehicle');
select ok((select title='Moved inspection' and due_on='2030-02-10' and due_mileage=18000 and provider='Workshop B' and event_type='inspection' and notes='Corrected note'
 and created_by='b6200000-0000-4000-8000-000000000002' from public.vehicle_maintenance_events where id='b6500000-0000-4000-8000-000000000001'),'Maintenance changes persist with original creator');
select lives_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'completed','Workshop B','Done','2026-01-05',5100) $$,'Super Admin records completion details');
select lives_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'completed','Workshop B','Done corrected','2026-01-06',5200) $$,'Previously completed maintenance is correctable');
select ok((select completed_on='2026-01-06' and completed_mileage=5200 from public.vehicle_maintenance_events where id='b6500000-0000-4000-8000-000000000001'),'Corrected completion data persists');
select lives_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'cancelled','Workshop B','Cancelled',null,null) $$,'Super Admin can cancel maintenance without deletion');
select ok((select status='cancelled' and completed_on is null and completed_mileage is null from public.vehicle_maintenance_events where id='b6500000-0000-4000-8000-000000000001'),'Cancelled event remains with cleared completion fields');
select throws_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'completed',null,null,current_date+1,5200) $$,'22023','invalid_maintenance_data','Future completion date is rejected');
select throws_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection',null,null,'planned',null,null,null,null) $$,'22023','invalid_maintenance_data','Open maintenance requires a due date or mileage');
select throws_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'planned',null,null,null,null) $$,'P0002','maintenance_not_found','Foreign maintenance cannot be edited');
select throws_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000003','inspection','Moved inspection','2030-02-10',18000,'planned',null,null,null,null) $$,'P0002','vehicle_not_found','Maintenance cannot move to foreign vehicle');
select lives_ok($$ select public.correct_vehicle_damage_report('b6600000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','2026-01-03','Corrected damage description','resolved') $$,'Super Admin corrects damage details and vehicle');
select ok((select vehicle_id='b6400000-0000-4000-8000-000000000002' and description='Corrected damage description' and occurred_on='2026-01-03'
 and reported_by='b6200000-0000-4000-8000-000000000003' and resolved_by='b6200000-0000-4000-8000-000000000001' and status='resolved'
 from public.vehicle_damage_reports where id='b6600000-0000-4000-8000-000000000001'),'Damage correction preserves reporter and attributes resolution');
select throws_ok($$ select public.correct_vehicle_damage_report('b6600000-0000-4000-8000-000000000002','b6400000-0000-4000-8000-000000000002','2026-01-03','Corrected damage description','resolved') $$,'P0002','damage_report_not_found','Foreign damage report cannot be corrected');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',12000,'2026-01-04','verified','') $$,'22023','invalid_mileage_correction','Mileage correction requires a reason');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',9000,'2026-01-04','verified','Correction reason') $$,'22023','mileage_conflicts_with_history','Corrected mileage cannot precede earlier accepted reading');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',16000,'2026-01-04','verified','Correction reason') $$,'22023','mileage_conflicts_with_history','Corrected mileage cannot exceed a later accepted reading');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',12000,'2026-02-04','verified','Correction reason') $$,'23505','monthly_submission_exists','Correction cannot collide with another monthly submission');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000004',6000,'2026-01-04','verified','Correction reason') $$,'P0002','mileage_submission_not_found','Foreign mileage cannot be corrected');
select lives_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',12000,'2026-01-05','verified','Transposed digits corrected') $$,'Super Admin corrects an already verified reading');
select ok((select mileage=12000 and read_on='2026-01-05' and profile_id='b6200000-0000-4000-8000-000000000003' and photo_path='original-photo'
 from public.mileage_submissions where id='b6700000-0000-4000-8000-000000000001'),'Mileage correction keeps original reporter and photo');
select is((select current_mileage from public.vehicles where id='b6400000-0000-4000-8000-000000000001'),15000,'Vehicle reading follows corrected verified history');
select lives_ok($$ select public.save_vehicle('b6400000-0000-4000-8000-000000000001','Vehicle One','TEST-1',null,null,'active',18000,null,null) $$,'Vehicle manual reading can be raised');
select lives_ok($$ select public.save_vehicle('b6400000-0000-4000-8000-000000000001','Vehicle One','TEST-1',null,null,'active',16000,null,null) $$,'Super Admin can correct a manual vehicle reading downward');
select throws_ok($$ select public.save_vehicle('b6400000-0000-4000-8000-000000000001','Vehicle One','TEST-1',null,null,'active',14000,null,null) $$,'22023','mileage_conflicts_with_history','Vehicle correction preserves verified mileage floor');

select set_config('request.jwt.claim.sub','b6100000-0000-4000-8000-000000000002',true);
select throws_ok($$ select public.save_vehicle_maintenance_event('b6500000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','inspection','Moved inspection','2030-02-10',18000,'planned',null,null,null,null) $$,'42501','permission_denied','fleet.manage alone cannot use maintenance correction');
select throws_ok($$ update public.vehicle_maintenance_events set title='Unauthorized correction' where id='b6500000-0000-4000-8000-000000000001' $$,'42501','permission_denied','Direct maintenance correction cannot bypass Super Admin requirement');
select throws_ok($$ select public.correct_vehicle_damage_report('b6600000-0000-4000-8000-000000000001','b6400000-0000-4000-8000-000000000002','2026-01-03','Corrected damage description','resolved') $$,'42501','permission_denied','fleet.manage alone cannot correct damage details');
select throws_ok($$ update public.vehicle_damage_reports set description='Unauthorized description' where id='b6600000-0000-4000-8000-000000000001' $$,'42501','permission_denied','Direct damage correction cannot bypass Super Admin requirement');
select throws_ok($$ select public.correct_mileage_submission('b6700000-0000-4000-8000-000000000001',12000,'2026-01-04','verified','Correction reason') $$,'42501','permission_denied','mileage.manage alone cannot correct verified readings');
select throws_ok($$ select public.save_vehicle('b6400000-0000-4000-8000-000000000001','Vehicle One','TEST-1',null,null,'active',15000,null,null) $$,'22023','mileage_cannot_decrease','Ordinary managers retain mileage decrease restriction');
select lives_ok($$ select set_config('test.fleet_created',public.save_vehicle_maintenance_event(null,'b6400000-0000-4000-8000-000000000002','service','Regular service','2030-03-10',null,'planned',null,null,null,null)::text,true) $$,'Ordinary fleet manager can still create maintenance');
select lives_ok($$ update public.vehicle_maintenance_events set status='completed',completed_on=current_date,completed_mileage=5100 where id=current_setting('test.fleet_created')::uuid $$,'Ordinary fleet manager can still complete planned maintenance');
select lives_ok($$ update public.vehicle_damage_reports set status='reviewing' where id='b6600000-0000-4000-8000-000000000001' $$,'Ordinary fleet manager can still change damage status');
reset role;
select ok(exists(select 1 from public.audit_logs where action='fleet.maintenance_saved' and entity_id='b6500000-0000-4000-8000-000000000001'
 and metadata->'before'->>'title'='Old service' and metadata->'after'->>'title'='Moved inspection'),'Maintenance audit preserves previous and changed values');
select ok(exists(select 1 from public.audit_logs where action='fleet.damage_updated' and entity_id='b6600000-0000-4000-8000-000000000001'
 and metadata->'before'->>'description'='Original description' and metadata->'after'->>'description'='Corrected damage description'),'Damage audit preserves correction history');
select ok(exists(select 1 from public.audit_logs where action='mileage.corrected' and entity_id='b6700000-0000-4000-8000-000000000001'
 and metadata->'before'->>'mileage'='21000' and metadata->'after'->>'mileage'='12000' and metadata->>'reason'='Transposed digits corrected'),'Mileage audit preserves prior reading and correction reason');
select ok(exists(select 1 from public.audit_logs where action='vehicle.saved' and entity_id='b6400000-0000-4000-8000-000000000001'
 and metadata->'before'->>'current_mileage'='18000' and metadata->'after'->>'current_mileage'='16000'),'Vehicle correction audit keeps before and after readings');
select ok(not has_function_privilege('anon','public.save_vehicle_maintenance_event(uuid,uuid,text,text,date,integer,text,text,text,date,integer)','execute')
 and not has_function_privilege('anon','public.correct_vehicle_damage_report(uuid,uuid,date,text,text)','execute')
 and not has_function_privilege('anon','public.correct_mileage_submission(uuid,integer,date,text,text)','execute'),'Correction RPCs are not callable anonymously');
select ok(not has_function_privilege('service_role','public.save_vehicle_maintenance_event(uuid,uuid,text,text,date,integer,text,text,text,date,integer)','execute'),
 'Maintenance editing requires the authenticated caller instead of service_role');
select ok(not has_function_privilege('service_role','public.correct_vehicle_damage_report(uuid,uuid,date,text,text)','execute'),
 'Damage correction is not executable by service_role');
select ok(not has_function_privilege('service_role','public.correct_mileage_submission(uuid,integer,date,text,text)','execute'),
 'Mileage correction is not executable by service_role');
select * from finish();
rollback;
