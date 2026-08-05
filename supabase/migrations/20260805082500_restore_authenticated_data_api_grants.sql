-- Fresh databases do not necessarily inherit Supabase's historical broad
-- Data API defaults. Establish the intended authenticated baseline explicitly,
-- then reapply every table/column restriction that must remain RPC-only.
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

-- Service-owned scheduler state is never exposed through the Data API.
revoke all privileges on table public.scheduled_jobs_log from authenticated;

-- Directory fields stay joinable while identity and HR fields remain RPC-only.
revoke select on table public.profiles from authenticated;
grant select (
  id,
  organization_id,
  display_name,
  email,
  avatar_url,
  status,
  preferred_language,
  created_at,
  updated_at
) on table public.profiles to authenticated;
revoke update on table public.profiles from authenticated;

revoke select on table public.employee_profiles from authenticated;
grant select (
  profile_id,
  organization_id,
  first_name,
  last_name,
  work_phone,
  job_title,
  department_id,
  location_id
) on table public.employee_profiles to authenticated;

-- These relations are mutated only through checked RPCs or Edge Functions.
revoke insert, update, delete on table
  public.user_roles,
  public.team_memberships,
  public.roles,
  public.role_permissions,
  public.messages,
  public.news_posts,
  public.news_audiences,
  public.news_reads,
  public.documents,
  public.document_audiences,
  public.document_versions,
  public.leave_requests,
  public.mileage_submissions,
  public.material_requests,
  public.material_request_items,
  public.material_request_status_history,
  public.shifts,
  public.shift_assignments,
  public.vehicles,
  public.vehicle_assignments
from authenticated;
revoke delete on table public.teams from authenticated;

-- Sensitive workflow columns are exposed only through their safe projections.
revoke select on table public.leave_requests from authenticated;
grant select (
  id,
  organization_id,
  profile_id,
  leave_type,
  leave_type_id,
  starts_on,
  ends_on,
  day_fraction,
  workdays,
  status,
  decided_by,
  decided_at,
  created_at,
  submitted_at,
  updated_at
) on table public.leave_requests to authenticated;

revoke select on table public.sick_leave_records from authenticated;
grant select (
  id,
  organization_id,
  profile_id,
  starts_on,
  expected_end_on,
  end_unknown,
  status,
  created_at,
  updated_at
) on table public.sick_leave_records to authenticated;
revoke insert, update, delete on table public.sick_leave_records
  from authenticated;
grant update (status, certificate_status)
  on table public.sick_leave_records to authenticated;

revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- Anonymous access and non-RLS-protected privilege classes remain closed.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke truncate, references, trigger, maintain on all tables in schema public
  from authenticated;

notify pgrst, 'reload schema';
