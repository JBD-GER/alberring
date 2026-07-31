-- Alberring Connect: complete domain schema (additive upgrade after 0001/0002).
-- This migration deliberately keeps the original MVP columns so deployed clients
-- continue to work while the normalized workflows are introduced.

create extension if not exists pgcrypto;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Organization, employee and access metadata ---------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  cost_center text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  federal_state_code text check (federal_state_code is null or federal_state_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Europe/Berlin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.organization_settings
  add column if not exists birthday_reminder_days smallint[] not null default '{7,0}',
  add column if not exists mileage_overdue_day smallint not null default 2,
  add column if not exists max_document_folder_depth smallint not null default 5,
  add column if not exists message_edit_window_minutes smallint not null default 15;

alter table public.profiles
  add column if not exists preferred_language text not null default 'de',
  add column if not exists archived_at timestamptz;

create unique index if not exists profiles_org_email_ci_unique_idx
  on public.profiles(organization_id, lower(email));

alter table public.employee_profiles drop constraint if exists employee_profiles_weekly_hours_check;
alter table public.employee_profiles add constraint employee_profiles_weekly_hours_check
  check (weekly_hours is null or weekly_hours between 0 and 80);
alter table public.employee_profiles drop constraint if exists employee_profiles_employment_dates_check;
alter table public.employee_profiles add constraint employee_profiles_employment_dates_check
  check (end_date is null or start_date is null or end_date >= start_date);

alter table public.employee_profiles
  add column if not exists employment_status text not null default 'active',
  add column if not exists department_id uuid references public.departments on delete set null,
  add column if not exists location_id uuid references public.locations on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.employee_profiles drop constraint if exists employee_profiles_employment_status_check;
alter table public.employee_profiles add constraint employee_profiles_employment_status_check
  check (employment_status in ('active','leave','inactive','terminated'));

alter table public.teams
  add column if not exists department_id uuid references public.departments on delete set null,
  add column if not exists location_id uuid references public.locations on delete set null,
  add column if not exists cost_center text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.team_memberships drop constraint if exists team_memberships_dates_check;
alter table public.team_memberships add constraint team_memberships_dates_check
  check (valid_until is null or valid_until >= valid_from);

alter table public.user_roles add column if not exists organization_id uuid references public.organizations on delete cascade;
update public.user_roles ur set organization_id=p.organization_id
from public.profiles p where p.id=ur.profile_id and ur.organization_id is null;
alter table public.user_roles alter column organization_id set not null;
alter table public.user_roles drop constraint if exists user_roles_dates_check;
alter table public.user_roles add constraint user_roles_dates_check
  check (valid_until is null or valid_until > valid_from);

create unique index if not exists roles_org_system_key_unique_idx
  on public.roles(organization_id,system_key) where system_key is not null;

alter table public.profiles drop constraint if exists profiles_id_organization_unique;
alter table public.profiles add constraint profiles_id_organization_unique unique (id, organization_id);
alter table public.roles drop constraint if exists roles_id_organization_unique;
alter table public.roles add constraint roles_id_organization_unique unique (id, organization_id);
alter table public.teams drop constraint if exists teams_id_organization_unique;
alter table public.teams add constraint teams_id_organization_unique unique (id, organization_id);
alter table public.user_roles drop constraint if exists user_roles_profile_organization_fkey;
alter table public.user_roles add constraint user_roles_profile_organization_fkey
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade;
alter table public.user_roles drop constraint if exists user_roles_role_organization_fkey;
alter table public.user_roles add constraint user_roles_role_organization_fkey
  foreign key (role_id, organization_id) references public.roles(id, organization_id) on delete cascade;
alter table public.team_memberships drop constraint if exists team_memberships_profile_organization_fkey;
alter table public.team_memberships add constraint team_memberships_profile_organization_fkey
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade;
alter table public.team_memberships drop constraint if exists team_memberships_team_organization_fkey;
alter table public.team_memberships add constraint team_memberships_team_organization_fkey
  foreign key (team_id, organization_id) references public.teams(id, organization_id) on delete cascade;

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  platform text not null check (platform in ('web','ios','android')),
  push_token text,
  push_token_hash text,
  device_label text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, push_token_hash)
);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  category text not null check (category in ('messages','news','schedule','leave','sick_leave','documents','fleet','materials','birthdays','system')),
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  show_sensitive_preview boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, category),
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,80}$'),
  enabled boolean not null default false,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- Communication --------------------------------------------------------------

alter table public.conversations
  add column if not exists icon_path text,
  add column if not exists posting_restricted boolean not null default false,
  add column if not exists direct_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists conversations_direct_key_unique_idx
  on public.conversations(organization_id, direct_key)
  where type='direct' and archived_at is null;

alter table public.messages
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists retracted_by uuid references public.profiles on delete set null,
  add column if not exists client_nonce uuid;

create unique index if not exists messages_sender_client_nonce_unique_idx
  on public.messages(sender_id, client_nonce) where client_nonce is not null;

create table public.message_edits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  message_id uuid not null references public.messages on delete cascade,
  edited_by uuid not null references public.profiles on delete restrict,
  previous_body text not null check (length(previous_body) between 1 and 10000),
  edited_at timestamptz not null default now()
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  conversation_id uuid not null references public.conversations on delete cascade,
  message_id uuid references public.messages on delete cascade,
  uploaded_by uuid not null references public.profiles on delete restrict,
  storage_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table public.conversation_pins (
  conversation_id uuid not null references public.conversations on delete cascade,
  message_id uuid not null references public.messages on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  pinned_by uuid not null references public.profiles on delete restrict,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

-- News and notifications ------------------------------------------------------

alter table public.news_posts
  add column if not exists scheduled_for timestamptz,
  add column if not exists published_by uuid references public.profiles on delete set null,
  add column if not exists cover_storage_path text,
  add column if not exists question_conversation_id uuid references public.conversations on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

create table public.news_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  news_id uuid not null references public.news_posts on delete cascade,
  audience_type text not null check (audience_type in ('organization','team','location','role','profile')),
  team_id uuid references public.teams on delete cascade,
  location_id uuid references public.locations on delete cascade,
  role_id uuid references public.roles on delete cascade,
  profile_id uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (audience_type='organization' and team_id is null and location_id is null and role_id is null and profile_id is null)
    or (audience_type='team' and team_id is not null and location_id is null and role_id is null and profile_id is null)
    or (audience_type='location' and team_id is null and location_id is not null and role_id is null and profile_id is null)
    or (audience_type='role' and team_id is null and location_id is null and role_id is not null and profile_id is null)
    or (audience_type='profile' and team_id is null and location_id is null and role_id is null and profile_id is not null)
  )
);
create unique index news_audiences_unique_idx on public.news_audiences (
  news_id, audience_type,
  coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  notification_id uuid not null references public.notifications on delete cascade,
  channel text not null check (channel in ('in_app','email','push')),
  status text not null default 'pending' check (status in ('pending','sent','delivered','failed','skipped')),
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error_code text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create table public.scheduled_jobs_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete cascade,
  job_name text not null,
  idempotency_key text not null,
  status text not null check (status in ('running','succeeded','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer not null default 0 check (processed_count >= 0),
  error_code text,
  metadata jsonb not null default '{}',
  unique (job_name, idempotency_key)
);

-- Scheduling -----------------------------------------------------------------

create table public.schedule_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  team_id uuid references public.teams on delete set null,
  location_id uuid references public.locations on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references public.profiles on delete restrict,
  published_by uuid references public.profiles on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  team_id uuid references public.teams on delete set null,
  location_id uuid references public.locations on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  title text not null check (length(trim(title)) between 1 and 160),
  starts_at time not null,
  ends_at time not null,
  break_minutes smallint not null default 0 check (break_minutes between 0 and 720),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.shifts
  add column if not exists schedule_period_id uuid references public.schedule_periods on delete set null,
  add column if not exists shift_template_id uuid references public.shift_templates on delete set null,
  add column if not exists location_id uuid references public.locations on delete set null,
  add column if not exists break_minutes smallint not null default 0,
  add column if not exists internal_note text,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.shifts drop constraint if exists shifts_break_minutes_check;
alter table public.shifts add constraint shifts_break_minutes_check check (break_minutes between 0 and 720);

create table public.shift_acknowledgements (
  shift_id uuid not null references public.shifts on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (shift_id, profile_id)
);

create table public.schedule_change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  shift_id uuid not null references public.shifts on delete cascade,
  actor_id uuid references public.profiles on delete set null,
  change_type text not null check (change_type in ('created','updated','assigned','unassigned','published','cancelled','override')),
  before_data jsonb not null default '{}',
  after_data jsonb not null default '{}',
  reason text,
  created_at timestamptz not null default now()
);

-- Leave and absence -----------------------------------------------------------

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  paid boolean not null default true,
  requires_note boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, name)
);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  location_id uuid references public.locations on delete cascade,
  holiday_on date not null,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, location_id, holiday_on)
);

alter table public.leave_requests
  add column if not exists leave_type_id uuid references public.leave_types on delete restrict,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table public.leave_approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  leave_request_id uuid not null references public.leave_requests on delete cascade,
  step_number smallint not null check (step_number between 1 and 2),
  status text not null default 'pending' check (status in ('pending','approved','rejected','skipped')),
  decided_by uuid references public.profiles on delete set null,
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (leave_request_id, step_number),
  check ((status='pending' and decided_at is null) or (status<>'pending' and decided_at is not null))
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  year smallint not null check (year between 2000 and 2200),
  entitlement_days numeric(6,1) not null default 0,
  carryover_days numeric(6,1) not null default 0,
  adjustment_days numeric(6,1) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, year)
);

alter table public.sick_leave_records
  add column if not exists certificate_required boolean not null default false,
  add column if not exists employee_confirmation boolean not null default false,
  add column if not exists processed_by uuid references public.profiles on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.sick_leave_records drop constraint if exists sick_leave_records_certificate_status_check;
alter table public.sick_leave_records add constraint sick_leave_records_certificate_status_check
  check (certificate_status in ('not_required','required','pending','received','verified','rejected'));
alter table public.sick_leave_records drop constraint if exists sick_leave_records_status_check;
alter table public.sick_leave_records add constraint sick_leave_records_status_check
  check (status in ('reported','confirmed','extended','closed','cancelled'));
alter table public.sick_leave_records drop constraint if exists sick_leave_records_dates_check;
alter table public.sick_leave_records add constraint sick_leave_records_dates_check
  check ((end_unknown and expected_end_on is null) or (not end_unknown and expected_end_on is not null and expected_end_on >= starts_on));

alter table public.sick_leave_document_versions
  add column if not exists original_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists deleted_at timestamptz;

-- Documents ------------------------------------------------------------------

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.document_folders
  add column if not exists created_by uuid references public.profiles on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

alter table public.documents
  add column if not exists category_id uuid references public.document_categories on delete set null,
  add column if not exists created_by uuid references public.profiles on delete set null,
  add column if not exists status text not null default 'published',
  add column if not exists acknowledgement_required boolean not null default false,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists sensitivity text not null default 'internal',
  add column if not exists updated_at timestamptz not null default now();

alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check check (status in ('draft','published','archived'));
alter table public.documents drop constraint if exists documents_sensitivity_check;
alter table public.documents add constraint documents_sensitivity_check check (sensitivity in ('internal','confidential','employee_file'));
alter table public.documents drop constraint if exists documents_validity_check;
alter table public.documents add constraint documents_validity_check check (valid_until is null or valid_from is null or valid_until > valid_from);

alter table public.document_versions
  add column if not exists original_name text,
  add column if not exists change_note text,
  add column if not exists is_current boolean not null default true,
  add column if not exists deleted_at timestamptz;

with ranked_versions as (
  select id,row_number() over(partition by document_id order by version desc,created_at desc,id desc) rn
  from public.document_versions where deleted_at is null
)
update public.document_versions dv set is_current=(r.rn=1)
from ranked_versions r where dv.id=r.id;

create unique index document_versions_one_current_idx on public.document_versions(document_id) where is_current and deleted_at is null;

create table public.document_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  audience_type text not null check (audience_type in ('organization','team','location','role','profile')),
  team_id uuid references public.teams on delete cascade,
  location_id uuid references public.locations on delete cascade,
  role_id uuid references public.roles on delete cascade,
  profile_id uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (audience_type='organization' and team_id is null and location_id is null and role_id is null and profile_id is null)
    or (audience_type='team' and team_id is not null and location_id is null and role_id is null and profile_id is null)
    or (audience_type='location' and team_id is null and location_id is not null and role_id is null and profile_id is null)
    or (audience_type='role' and team_id is null and location_id is null and role_id is not null and profile_id is null)
    or (audience_type='profile' and team_id is null and location_id is null and role_id is null and profile_id is not null)
  )
);
create unique index document_audiences_unique_idx on public.document_audiences (
  document_id, audience_type,
  coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table public.document_acknowledgements (
  document_id uuid not null references public.documents on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  version_id uuid references public.document_versions on delete set null,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, profile_id)
);

create table public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  document_id uuid not null references public.documents on delete restrict,
  version_id uuid references public.document_versions on delete set null,
  profile_id uuid references public.profiles on delete set null,
  action text not null check (action in ('view','download','signed_url_created')),
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Fleet ----------------------------------------------------------------------

alter table public.vehicles
  add column if not exists model_year smallint,
  add column if not exists vin text,
  add column if not exists location_id uuid references public.locations on delete set null,
  add column if not exists next_service_mileage integer,
  add column if not exists inspection_due_on date,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check (status in ('active','workshop','out_of_service','sold'));
alter table public.vehicles drop constraint if exists vehicles_model_year_check;
alter table public.vehicles add constraint vehicles_model_year_check check (model_year is null or model_year between 1950 and 2200);
alter table public.vehicles drop constraint if exists vehicles_next_service_mileage_check;
alter table public.vehicles add constraint vehicles_next_service_mileage_check check (next_service_mileage is null or next_service_mileage >= 0);

with ranked_assignments as (
  select id,row_number() over(partition by profile_id order by valid_from desc,id desc) rn
  from public.vehicle_assignments where primary_assignment and valid_until is null
)
update public.vehicle_assignments va set valid_until=va.valid_from
from ranked_assignments r where va.id=r.id and r.rn>1;

create unique index vehicle_profile_primary_active_idx on public.vehicle_assignments(profile_id)
  where primary_assignment and valid_until is null;

alter table public.shifts
  add column if not exists vehicle_id uuid references public.vehicles on delete set null;

alter table public.mileage_submissions
  add column if not exists reviewed_by uuid references public.profiles on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists previous_mileage integer,
  add column if not exists flagged_extreme_jump boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.mileage_submissions drop constraint if exists mileage_submissions_status_check;
alter table public.mileage_submissions add constraint mileage_submissions_status_check
  check (status in ('submitted','flagged','verified','rejected','corrected'));

create table public.vehicle_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  vehicle_id uuid not null references public.vehicles on delete cascade,
  event_type text not null check (event_type in ('service','inspection','repair','tyres','other')),
  title text not null check (length(trim(title)) between 1 and 160),
  due_on date,
  due_mileage integer check (due_mileage is null or due_mileage >= 0),
  completed_on date,
  completed_mileage integer check (completed_mileage is null or completed_mileage >= 0),
  status text not null default 'planned' check (status in ('planned','due','completed','cancelled')),
  notes text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_damage_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  vehicle_id uuid not null references public.vehicles on delete cascade,
  reported_by uuid not null references public.profiles on delete restrict,
  occurred_on date,
  description text not null check (length(trim(description)) between 1 and 4000),
  status text not null default 'reported' check (status in ('reported','reviewing','repair_planned','resolved','rejected')),
  resolved_by uuid references public.profiles on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  vehicle_id uuid not null references public.vehicles on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references public.profiles on delete restrict,
  expires_on date,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Material requests -----------------------------------------------------------

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  approval_required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.material_catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  category_id uuid references public.material_categories on delete set null,
  name text not null check (length(trim(name)) between 1 and 180),
  sku text,
  default_unit text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

alter table public.material_requests
  add column if not exists category_id uuid references public.material_categories on delete set null,
  add column if not exists team_id uuid references public.teams on delete set null,
  add column if not exists location_id uuid references public.locations on delete set null,
  add column if not exists title text,
  add column if not exists attachment_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

update public.material_requests set title = item where title is null;
alter table public.material_requests alter column title set not null;
alter table public.material_requests drop constraint if exists material_requests_status_check;
alter table public.material_requests add constraint material_requests_status_check
  check (status in ('draft','submitted','review','approved','rejected','ordered','partially_delivered','delivered','completed','cancelled'));
alter table public.material_requests drop constraint if exists material_requests_priority_check;
alter table public.material_requests add constraint material_requests_priority_check
  check (priority in ('low','normal','high','urgent'));

create table public.material_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  request_id uuid not null references public.material_requests on delete cascade,
  catalog_item_id uuid references public.material_catalog_items on delete set null,
  item_name text not null check (length(trim(item_name)) between 1 and 180),
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 40),
  created_at timestamptz not null default now()
);

insert into public.material_request_items (organization_id, request_id, item_name, quantity, unit)
select organization_id, id, item, quantity, unit
from public.material_requests mr
where not exists (select 1 from public.material_request_items mri where mri.request_id=mr.id);

create table public.material_request_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  material_request_id uuid not null references public.material_requests on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

-- Integration metadata --------------------------------------------------------

create table public.integration_providers (
  key text primary key check (key in ('manual','careville')),
  display_name text not null,
  enabled boolean not null default true,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  connection_id uuid not null references public.integration_connections on delete cascade,
  direction text not null check (direction in ('pull','push','test')),
  resource text not null,
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','not_configured','not_supported')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0 check (records_processed >= 0),
  created_by uuid references public.profiles on delete set null,
  metadata jsonb not null default '{}'
);

create table public.integration_sync_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  sync_run_id uuid not null references public.integration_sync_runs on delete cascade,
  error_code text not null,
  message text not null,
  external_reference text,
  created_at timestamptz not null default now()
);

-- Performance indexes ---------------------------------------------------------

create index if not exists employee_profiles_org_name_idx on public.employee_profiles(organization_id, last_name, first_name);
create index if not exists team_memberships_profile_active_idx on public.team_memberships(profile_id, valid_until);
create index if not exists user_roles_profile_active_idx on public.user_roles(profile_id, valid_until);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists news_posts_org_status_publish_idx on public.news_posts(organization_id, status, published_at desc);
create index if not exists news_audiences_news_idx on public.news_audiences(news_id);
create index if not exists news_reads_profile_idx on public.news_reads(profile_id, opened_at desc);
create index if not exists shifts_team_time_idx on public.shifts(organization_id, team_id, starts_at, ends_at);
create index if not exists shift_assignments_profile_idx on public.shift_assignments(profile_id, shift_id);
create index if not exists leave_requests_profile_dates_idx on public.leave_requests(profile_id, starts_on, ends_on);
create index if not exists leave_requests_org_status_idx on public.leave_requests(organization_id, status, created_at desc);
create index if not exists sick_leave_profile_dates_idx on public.sick_leave_records(profile_id, starts_on, expected_end_on);
create index if not exists document_audiences_document_idx on public.document_audiences(document_id);
create index if not exists documents_owner_idx on public.documents(owner_profile_id, created_at desc);
create index if not exists vehicle_assignments_profile_dates_idx on public.vehicle_assignments(profile_id, valid_from, valid_until);
create index if not exists mileage_vehicle_date_idx on public.mileage_submissions(vehicle_id, read_on desc);
with ranked_mileage as (
  select id,row_number() over(partition by vehicle_id,reporting_month order by created_at desc,id desc) rn
  from public.mileage_submissions where status<>'rejected'
)
update public.mileage_submissions ms set status='rejected',review_note='Automatisch als Dublette markiert (Schema-Upgrade).'
from ranked_mileage r where ms.id=r.id and r.rn>1;
create unique index if not exists mileage_vehicle_month_unique_idx on public.mileage_submissions(vehicle_id, reporting_month) where status<>'rejected';
create index if not exists material_requests_org_status_idx on public.material_requests(organization_id, status, created_at desc);
create index if not exists material_request_history_request_idx on public.material_request_status_history(material_request_id, created_at);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Every new API-visible table starts closed. Policies are added in 0004.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments','locations','user_devices','notification_preferences','feature_flags',
    'message_edits','message_attachments','conversation_pins','news_audiences',
    'notification_deliveries','scheduled_jobs_log','schedule_periods','shift_templates',
    'shift_acknowledgements','schedule_change_log','leave_types','public_holidays',
    'leave_approval_steps','leave_balances','document_categories','document_audiences',
    'document_acknowledgements','document_access_log','vehicle_maintenance_events',
    'vehicle_damage_reports','vehicle_documents','material_categories','material_catalog_items',
    'material_request_items','material_request_status_history','integration_providers',
    'integration_sync_runs','integration_sync_errors'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Consistent updated_at handling.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','organization_settings','profiles','employee_profiles','departments','locations',
    'teams','user_devices','notification_preferences','feature_flags','conversations','messages',
    'news_posts','notification_deliveries','schedule_periods','shift_templates','shifts',
    'leave_types','leave_requests','leave_approval_steps','leave_balances','sick_leave_records',
    'document_categories','document_folders','documents','vehicles','mileage_submissions',
    'vehicle_maintenance_events','vehicle_damage_reports','material_categories',
    'material_catalog_items','material_requests','integration_providers','integration_connections'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;
