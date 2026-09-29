begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on all functions in schema extensions to authenticated;
select no_plan();
insert into public.organizations(id,name,slug) values
 ('ce000000-0000-4000-8000-000000000001','Correction tests','correction-tests'),
 ('ce000000-0000-4000-8000-000000000002','Other correction tests','correction-other');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role)
select ('ce100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'correct-'||n||'@example.test',now(),'{}','{}','authenticated','authenticated' from generate_series(1,3) n;
insert into public.profiles(id,auth_user_id,organization_id,display_name,email,status)
select ('ce200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('ce100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=3 then 'ce000000-0000-4000-8000-000000000002'::uuid else 'ce000000-0000-4000-8000-000000000001'::uuid end,'Correction user '||n,'correct-'||n||'@example.test','active' from generate_series(1,3) n;
insert into public.roles(id,organization_id,name,system_key) values
 ('ce300000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
 ('ce300000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000001','Manager',null);
insert into public.user_roles(profile_id,role_id,organization_id) values
 ('ce200000-0000-4000-8000-000000000001','ce300000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001'),
 ('ce200000-0000-4000-8000-000000000002','ce300000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000001');
insert into public.role_permissions(role_id,permission_key) select 'ce300000-0000-4000-8000-000000000002',key from public.permissions where key in ('leave.manage','sick_leave.manage','materials.manage','documents.manage','data.correct');
insert into public.leave_types(organization_id,code,name) values('ce000000-0000-4000-8000-000000000001','annual','Urlaub');
insert into public.leave_requests(id,organization_id,profile_id,leave_type,starts_on,ends_on,workdays,status,decided_by,decided_at) values
 ('ce400000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000002','annual','2020-01-06','2020-01-07',2,'approved','ce200000-0000-4000-8000-000000000001','2020-01-01'),
 ('ce400000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000002','annual','2020-02-03','2020-02-04',2,'approved',null,null),
 ('ce400000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000002','ce200000-0000-4000-8000-000000000003','annual','2020-01-06','2020-01-07',2,'approved',null,null);
insert into public.leave_approval_steps(organization_id,leave_request_id,step_number,status,decided_by,decided_at) values
 ('ce000000-0000-4000-8000-000000000001','ce400000-0000-4000-8000-000000000001',1,'approved','ce200000-0000-4000-8000-000000000001','2020-01-01');
insert into public.sick_leave_records(id,organization_id,profile_id,starts_on,expected_end_on,end_unknown,status) values
 ('ce500000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000002','2020-03-02','2020-03-03',false,'closed'),
 ('ce500000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000002','ce200000-0000-4000-8000-000000000003','2020-03-02','2020-03-03',false,'closed');
insert into public.material_requests(id,organization_id,requester_id,category,item,title,quantity,unit,priority,status) values
 ('ce600000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000002','care_supplies','Handschuhe','Handschuhe',2,'Packung','normal','completed'),
 ('ce600000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000002','ce200000-0000-4000-8000-000000000003','care_supplies','Handschuhe','Handschuhe',2,'Packung','normal','completed');
insert into public.documents(id,organization_id,title,visibility,acknowledgement_required,created_by) values
 ('ce700000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','Anweisung alt','organization',false,'ce200000-0000-4000-8000-000000000002'),
 ('ce700000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000002','Fremdes Dokument','organization',false,'ce200000-0000-4000-8000-000000000003');
insert into public.document_folders(id,organization_id,name,scope,owner_profile_id,created_by) values
 ('ce800000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','Richtlinien alt','role',null,'ce200000-0000-4000-8000-000000000002'),
 ('ce800000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000001','Persönlich','personal','ce200000-0000-4000-8000-000000000002','ce200000-0000-4000-8000-000000000002'),
 ('ce800000-0000-4000-8000-000000000003','ce000000-0000-4000-8000-000000000002','Andere Organisation','organization',null,'ce200000-0000-4000-8000-000000000003'),
 ('ce800000-0000-4000-8000-000000000004','ce000000-0000-4000-8000-000000000001','Eigene Unterlagen','personal','ce200000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000001');
insert into public.document_folder_roles(organization_id,folder_id,role_id) values
 ('ce000000-0000-4000-8000-000000000001','ce800000-0000-4000-8000-000000000001','ce300000-0000-4000-8000-000000000002');
update public.documents set folder_id='ce800000-0000-4000-8000-000000000001' where id='ce700000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ce100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.correct_leave_request('ce400000-0000-4000-8000-000000000001','annual','2020-01-06','2020-01-08',1,null,'Tippfehler')$$,'42501','permission_denied','Leave manager cannot use Super Admin correction');
select throws_ok($$select public.correct_sick_leave_record('ce500000-0000-4000-8000-000000000001','2020-03-02','2020-03-04',false,'pending','Tippfehler')$$,'42501','permission_denied','Sick manager cannot use Super Admin correction');
select throws_ok($$select public.correct_material_request('ce600000-0000-4000-8000-000000000001','care_supplies','Handschuhe',3,'Packung','normal',null,null,'Tippfehler')$$,'42501','permission_denied','Material manager cannot use Super Admin correction');
select throws_ok($$select public.correct_document_metadata('ce700000-0000-4000-8000-000000000001','Anweisung neu',true,null,null,'Tippfehler')$$,'42501','permission_denied','Document manager cannot use Super Admin correction');
select throws_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000001','Neu','Tippfehler')$$,'42501','permission_denied','Ordinary manager cannot rename folders');
select set_config('request.jwt.claim.sub','ce100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.correct_leave_request('ce400000-0000-4000-8000-000000000003','annual','2020-01-06','2020-01-08',1,null,'Tippfehler')$$,'P0002','request_not_found','Leave correction is tenant scoped');
select throws_ok($$select public.correct_sick_leave_record('ce500000-0000-4000-8000-000000000003','2020-03-02','2020-03-04',false,'pending','Tippfehler')$$,'P0002','record_not_found','Sick correction is tenant scoped');
select throws_ok($$select public.correct_material_request('ce600000-0000-4000-8000-000000000003','care_supplies','Handschuhe',3,'Packung','normal',null,null,'Tippfehler')$$,'P0002','request_not_found','Material correction is tenant scoped');
select throws_ok($$select public.correct_document_metadata('ce700000-0000-4000-8000-000000000003','Anweisung neu',true,null,null,'Tippfehler')$$,'42501','document_not_available','Document correction is tenant scoped');
select throws_ok($$select public.correct_leave_request('ce400000-0000-4000-8000-000000000001','annual','2020-01-06','2020-01-08',1,null,' ')$$,'22023','correction_reason_required','Correction requires a meaningful audit reason');
select throws_ok($$select public.correct_leave_request('ce400000-0000-4000-8000-000000000001','annual','2020-02-03','2020-02-05',1,null,'Tippfehler')$$,'23P01','overlapping_leave_request','Correction cannot overlap existing leave');
select lives_ok($$select public.correct_leave_request('ce400000-0000-4000-8000-000000000001','annual','2020-01-06','2020-01-08',1,'Korrigiert','Tippfehler')$$,'Historical approved leave can be corrected');
select lives_ok($$select public.correct_sick_leave_record('ce500000-0000-4000-8000-000000000001','2020-03-02','2020-03-04',false,'pending','Tippfehler')$$,'Historical closed sick leave can be corrected');
select throws_ok($$select public.correct_sick_leave_record('ce500000-0000-4000-8000-000000000001','2020-03-02','2020-03-04',false,'verified','Tippfehler')$$,'22023','certificate_file_required','A verified certificate cannot be fabricated without a file');
select lives_ok($$select public.correct_material_request('ce600000-0000-4000-8000-000000000001','care_supplies','Handschuhe M',3,'Packung','high','2020-01-02','Bedarf angepasst','Tippfehler')$$,'Completed material request can be corrected');
select throws_ok($$select public.correct_material_request('ce600000-0000-4000-8000-000000000001','care_supplies','Handschuhe','NaN'::numeric,'Packung','normal',null,null,'Tippfehler')$$,'22023','invalid_material_request','Nonfinite quantity cannot be saved');
select lives_ok($$select public.correct_document_metadata('ce700000-0000-4000-8000-000000000001','Anweisung neu',true,'2020-01-01','2030-01-01','Tippfehler')$$,'Document metadata can be corrected');
select throws_ok($$select public.correct_document_metadata('ce700000-0000-4000-8000-000000000001','Anweisung neu',true,'2030-01-01','2020-01-01','Tippfehler')$$,'22023','invalid_document_metadata','Invalid document validity is rejected');
select throws_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000003','Neu','Tippfehler')$$,'42501','folder_not_available','Folder rename is tenant scoped');
select throws_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000002','Neu','Tippfehler')$$,'42501','folder_not_available','Foreign personal folder cannot be renamed');
select throws_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000001','Neu',' ')$$,'22023','correction_reason_required','Folder rename requires an audit reason');
select throws_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000001',' ','Tippfehler')$$,'22023','invalid_folder_name','Blank folder name is rejected');
select lives_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000001','Richtlinien neu','Tippfehler')$$,'Super Admin can rename a role folder');
select lives_ok($$select public.rename_document_folder('ce800000-0000-4000-8000-000000000004','Meine Unterlagen','Tippfehler')$$,'Super Admin can rename own personal folder');
reset role;
select ok((select status='approved' and workdays=3 and decided_at='2020-01-01'::timestamptz from public.leave_requests where id='ce400000-0000-4000-8000-000000000001'),'Workdays recalculated without changing original approval');
select ok((select status='approved' and decided_at='2020-01-01'::timestamptz from public.leave_approval_steps where leave_request_id='ce400000-0000-4000-8000-000000000001'),'Approval step history retained');
select ok((select status='closed' and expected_end_on='2020-03-04' and certificate_status='pending' from public.sick_leave_records where id='ce500000-0000-4000-8000-000000000001'),'Sick workflow status retained');
select ok((select status='completed' and quantity=3 and requester_id='ce200000-0000-4000-8000-000000000002' from public.material_requests where id='ce600000-0000-4000-8000-000000000001'),'Material status and requester retained');
select ok((select quantity=3 and item_name='Handschuhe M' from public.material_request_items where request_id='ce600000-0000-4000-8000-000000000001'),'Material position synchronized');
select ok((select title='Anweisung neu' and visibility='organization' and created_by='ce200000-0000-4000-8000-000000000002' from public.documents where id='ce700000-0000-4000-8000-000000000001'),'Document ownership and audience retained');
select is((select count(*)::integer from public.audit_logs where organization_id='ce000000-0000-4000-8000-000000000001' and action in ('leave.corrected','sick_leave.corrected','material.corrected','document.metadata_corrected') and metadata?'before' and metadata?'after' and metadata->>'reason'='Tippfehler'),4,'All correction flows capture before and after values and reason');
select ok(not has_function_privilege('anon','public.correct_leave_request(uuid,text,date,date,numeric,text,text)','execute'),'Anonymous cannot access correction RPC');
select ok(not has_function_privilege('service_role','public.correct_document_metadata(uuid,text,boolean,timestamptz,timestamptz,text)','execute'),'Service role cannot bypass authenticated correction boundary');
select ok((select name='Richtlinien neu' and scope='role' and parent_id is null and owner_profile_id is null and created_by='ce200000-0000-4000-8000-000000000002' from public.document_folders where id='ce800000-0000-4000-8000-000000000001')
 and exists(select 1 from public.document_folder_roles where folder_id='ce800000-0000-4000-8000-000000000001' and role_id='ce300000-0000-4000-8000-000000000002')
 and exists(select 1 from public.documents where id='ce700000-0000-4000-8000-000000000001' and folder_id='ce800000-0000-4000-8000-000000000001'),'Folder rename preserves scope ownership role access and contained documents');
select ok(exists(select 1 from public.audit_logs where action='document.folder_renamed' and entity_id='ce800000-0000-4000-8000-000000000001' and metadata->'before'->>'name'='Richtlinien alt' and metadata->'after'->>'name'='Richtlinien neu' and metadata->>'reason'='Tippfehler'),'Folder rename records old and new names with reason');
select ok(not has_function_privilege('anon','public.rename_document_folder(uuid,text,text)','execute') and not has_function_privilege('service_role','public.rename_document_folder(uuid,text,text)','execute'),'Folder correction cannot bypass authenticated actor boundary');
select * from finish();
rollback;
