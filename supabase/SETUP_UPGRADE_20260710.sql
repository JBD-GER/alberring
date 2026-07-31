-- Alberring Connect - EINMALIGES UPGRADE
-- Fuer ein Projekt, in dem 202607100001 und 202607100002 bereits liefen.
-- Automatisch erzeugt mit: npm run supabase:build:setup
-- Nicht manuell bearbeiten; maßgeblich sind supabase/migrations und seed.sql.
begin;

-- ===== supabase/migrations/202607100003_domain_schema.sql =====
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

-- ===== supabase/migrations/202607100004_security_rls.sql =====
-- Alberring Connect: tenant isolation, least-privilege RLS and Storage policies.

-- Harden the identity/permission helpers first. All authorization derives from
-- auth.uid(), an active profile and an active organization.
create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status='active'
  limit 1
$$;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status='active'
  limit 1
$$;

create or replace function private.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id=p.organization_id and o.active
    join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
    join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
    join public.role_permissions rp on rp.role_id=r.id
    where p.auth_user_id=auth.uid()
      and p.status='active'
      and rp.permission_key=$1
      and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now())
  )
$$;

create or replace function public.my_permissions()
returns table(permission_key text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct rp.permission_key
  from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
  join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
  join public.role_permissions rp on rp.role_id=r.id
  where p.auth_user_id=auth.uid()
    and p.status='active'
    and ur.valid_from<=now()
    and (ur.valid_until is null or ur.valid_until>now())
$$;

create or replace function private.is_same_org_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=p_profile_id
      and p.organization_id=private.current_organization_id()
      and p.status<>'archived'
  )
$$;

create or replace function private.is_team_member(p_team_id uuid, p_profile_id uuid default private.current_profile_id())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id
    where tm.team_id=p_team_id
      and tm.profile_id=p_profile_id
      and tm.organization_id=private.current_organization_id()
      and tm.valid_from<=current_date
      and (tm.valid_until is null or tm.valid_until>=current_date)
      and t.active
  )
$$;

create or replace function private.can_view_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_team_member(p_team_id)
      or exists (
        select 1 from public.teams t
        where t.id=p_team_id
          and t.organization_id=private.current_organization_id()
          and t.active
          and t.lead_profile_id=private.current_profile_id()
      )
$$;

create or replace function private.can_view_profile_team(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_permission('leave.manage')
      or exists (
        select 1 from public.team_memberships tm
        where tm.profile_id=p_profile_id
          and tm.organization_id=private.current_organization_id()
          and tm.valid_from<=current_date
          and (tm.valid_until is null or tm.valid_until>=current_date)
          and private.can_view_team(tm.team_id)
      )
$$;

-- Permission checks for a specific profile are used only by server-side
-- recipient selection. Keeping this separate from auth.uid()-based checks
-- prevents notifications from leaking the existence of an absence to users
-- who cannot open the corresponding record.
create or replace function private.profile_has_permission(
  p_profile_id uuid,
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id=p.organization_id and o.active
    join public.user_roles ur on ur.profile_id=p.id and ur.organization_id=p.organization_id
    join public.roles r on r.id=ur.role_id and r.organization_id=p.organization_id and r.active
    join public.role_permissions rp on rp.role_id=r.id
    where p.id=p_profile_id
      and p.organization_id=p_organization_id
      and p.status='active'
      and rp.permission_key=p_permission_key
      and ur.valid_from<=now()
      and (ur.valid_until is null or ur.valid_until>now())
  )
$$;

create or replace function private.profile_can_view_sick_status(
  p_viewer_id uuid,
  p_subject_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_has_permission(p_viewer_id,p_organization_id,'sick_leave.manage')
      or (
        private.profile_has_permission(p_viewer_id,p_organization_id,'sick_leave.view_status')
        and (
          private.profile_has_permission(p_viewer_id,p_organization_id,'schedule.manage')
          or private.profile_has_permission(p_viewer_id,p_organization_id,'leave.manage')
          or private.profile_has_permission(p_viewer_id,p_organization_id,'users.manage')
          or exists (
            select 1
            from public.team_memberships subject_tm
            join public.teams t on t.id=subject_tm.team_id
              and t.organization_id=subject_tm.organization_id and t.active
            where subject_tm.profile_id=p_subject_id
              and subject_tm.organization_id=p_organization_id
              and subject_tm.valid_from<=current_date
              and (subject_tm.valid_until is null or subject_tm.valid_until>=current_date)
              and (
                t.lead_profile_id=p_viewer_id
                or exists (
                  select 1 from public.team_memberships viewer_tm
                  where viewer_tm.team_id=subject_tm.team_id
                    and viewer_tm.profile_id=p_viewer_id
                    and viewer_tm.organization_id=p_organization_id
                    and viewer_tm.valid_from<=current_date
                    and (viewer_tm.valid_until is null or viewer_tm.valid_until>=current_date)
                )
              )
          )
        )
      )
$$;

create or replace function private.can_view_sick_status(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_can_view_sick_status(
    private.current_profile_id(),p_profile_id,private.current_organization_id()
  )
$$;

create or replace function private.is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_permission('messages.use') and exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id=cm.conversation_id and c.organization_id=cm.organization_id
    where cm.conversation_id=cid
      and cm.profile_id=private.current_profile_id()
      and cm.organization_id=private.current_organization_id()
  )
$$;

create or replace function private.can_post_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id=p_conversation_id
      and c.organization_id=private.current_organization_id()
      and c.archived_at is null
      and private.is_conversation_member(c.id)
      and private.has_permission('messages.use')
      and (
        not c.posting_restricted
        or c.created_by=private.current_profile_id()
        or private.has_permission('messages.moderate')
        or (c.team_id is not null and exists (
          select 1 from public.teams t where t.id=c.team_id and t.lead_profile_id=private.current_profile_id()
        ))
      )
  )
$$;

create or replace function private.can_access_message_attachment(p_conversation_id uuid, p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_conversation_member(p_conversation_id)
    and exists(select 1 from public.messages m where m.id=p_message_id and m.conversation_id=p_conversation_id and m.retracted_at is null)
$$;

create or replace function private.is_news_audience(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    not exists (select 1 from public.news_audiences na where na.news_id=p_news_id)
    or exists (
      select 1
      from public.news_audiences na
      where na.news_id=p_news_id
        and na.organization_id=private.current_organization_id()
        and (
          na.audience_type='organization'
          or (na.audience_type='profile' and na.profile_id=private.current_profile_id())
          or (na.audience_type='team' and private.is_team_member(na.team_id))
          or (na.audience_type='location' and exists (
            select 1 from public.employee_profiles ep
            where ep.profile_id=private.current_profile_id() and ep.location_id=na.location_id
          ))
          or (na.audience_type='role' and exists (
            select 1 from public.user_roles ur
            join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
            where ur.profile_id=private.current_profile_id()
              and ur.organization_id=private.current_organization_id()
              and ur.role_id=na.role_id
              and ur.valid_from<=now()
              and (ur.valid_until is null or ur.valid_until>now())
          ))
        )
    )
$$;

create or replace function private.can_access_news(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.news_posts n
    where n.id=p_news_id
      and n.organization_id=private.current_organization_id()
      and (
        private.has_permission('news.manage')
        or (n.author_id=private.current_profile_id() and private.has_permission('news.create'))
        or (
          private.has_permission('news.view')
          and n.status='published'
          and coalesce(n.published_at, n.created_at)<=now()
          and (n.expires_at is null or n.expires_at>now())
          and private.is_news_audience(n.id)
        )
      )
  )
$$;

create or replace function private.profile_is_document_audience(
  p_viewer_id uuid,
  p_document_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.document_audiences da
    where da.document_id=p_document_id
      and da.organization_id=p_organization_id
      and (
        da.audience_type='organization'
        or (da.audience_type='profile' and da.profile_id=p_viewer_id)
        or (da.audience_type='team' and exists (
          select 1 from public.team_memberships tm
          join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id and t.active
          where tm.team_id=da.team_id and tm.profile_id=p_viewer_id and tm.organization_id=p_organization_id
            and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
        ))
        or (da.audience_type='location' and exists (
          select 1 from public.employee_profiles ep
          where ep.profile_id=p_viewer_id and ep.organization_id=p_organization_id and ep.location_id=da.location_id
        ))
        or (da.audience_type='role' and exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
          where ur.profile_id=p_viewer_id
            and ur.organization_id=p_organization_id
            and ur.role_id=da.role_id
            and ur.valid_from<=now()
            and (ur.valid_until is null or ur.valid_until>now())
        ))
      )
  )
$$;

create or replace function private.is_document_audience(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_is_document_audience(
    private.current_profile_id(),p_document_id,private.current_organization_id()
  )
$$;

create or replace function private.profile_can_access_document(
  p_viewer_id uuid,
  p_document_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.documents d
    where d.id=p_document_id and d.organization_id=p_organization_id and d.archived_at is null
      and (
        (
          (d.sensitivity='employee_file' or d.visibility='personal')
          and (
            private.profile_has_permission(p_viewer_id,p_organization_id,'documents.manage_employee_files')
            or (d.owner_profile_id=p_viewer_id and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_own'))
          )
        )
        or (
          d.sensitivity<>'employee_file' and d.visibility<>'personal'
          and (
            private.profile_has_permission(p_viewer_id,p_organization_id,'documents.manage')
            or (d.owner_profile_id=p_viewer_id and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_own'))
            or (
              d.status='published' and d.visibility in ('organization','team')
              and private.profile_has_permission(p_viewer_id,p_organization_id,'documents.view_shared')
              and (d.valid_from is null or d.valid_from<=now()) and (d.valid_until is null or d.valid_until>now())
              and (
                (d.visibility='organization' and not exists(select 1 from public.document_audiences da where da.document_id=d.id))
                or private.profile_is_document_audience(p_viewer_id,d.id,p_organization_id)
              )
            )
          )
        )
      )
  )
$$;

create or replace function private.can_access_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.profile_can_access_document(
    private.current_profile_id(),p_document_id,private.current_organization_id()
  )
$$;

create or replace function private.can_access_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id=p_vehicle_id and v.organization_id=private.current_organization_id()
      and (
        private.has_permission('fleet.view_all')
        or private.has_permission('fleet.manage')
        or (private.has_permission('fleet.view_own') and exists (
          select 1 from public.vehicle_assignments va
          where va.vehicle_id=v.id and va.profile_id=private.current_profile_id()
            and va.organization_id=v.organization_id and va.valid_from<=current_date
            and (va.valid_until is null or va.valid_until>=current_date)
        ))
      )
  )
$$;

create or replace function private.is_shift_assignee(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shift_assignments sa
    where sa.shift_id=p_shift_id
      and sa.profile_id=private.current_profile_id()
      and sa.organization_id=private.current_organization_id()
  )
$$;

create or replace function private.can_view_shift_team(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shifts s
    where s.id=p_shift_id
      and s.organization_id=private.current_organization_id()
      and (s.team_id is null or private.can_view_team(s.team_id))
  )
$$;

create or replace function private.can_access_material_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.material_requests mr
    where mr.id=p_request_id
      and mr.organization_id=private.current_organization_id()
      and (
        mr.requester_id=private.current_profile_id()
        or (mr.status<>'draft' and (
          private.has_permission('materials.manage')
          or private.has_permission('materials.approve')
          or (private.has_permission('materials.view_team') and mr.team_id is not null and private.can_view_team(mr.team_id))
        ))
      )
  )
$$;

-- Reset the initial placeholder policies and rebuild one complete policy set.
do $$
declare
  p record;
  t record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Organization and people ----------------------------------------------------
create policy organizations_read on public.organizations for select
  using (id=private.current_organization_id());
create policy organizations_manage on public.organizations for update
  using (id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (id=private.current_organization_id());

create policy organization_settings_read on public.organization_settings for select
  using (organization_id=private.current_organization_id());
create policy organization_settings_manage on public.organization_settings for update
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());

create policy profiles_read on public.profiles for select
  using (
    organization_id=private.current_organization_id()
    and (
      id=private.current_profile_id()
      or (status='active' and private.has_permission('directory.view'))
      or private.has_permission('users.view')
    )
  );

create policy employee_profiles_read on public.employee_profiles for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.has_permission('directory.view') or private.has_permission('users.view'))
  );
create policy employee_profiles_manage on public.employee_profiles for all
  using (organization_id=private.current_organization_id() and private.has_permission('users.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));

create policy departments_read on public.departments for select
  using (organization_id=private.current_organization_id());
create policy departments_manage on public.departments for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());
create policy locations_read on public.locations for select
  using (organization_id=private.current_organization_id());
create policy locations_manage on public.locations for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());

create policy teams_read on public.teams for select
  using (organization_id=private.current_organization_id());
create policy teams_manage on public.teams for all
  using (organization_id=private.current_organization_id() and private.has_permission('teams.manage'))
  with check (organization_id=private.current_organization_id());
create policy team_memberships_read on public.team_memberships for select
  using (organization_id=private.current_organization_id());
create policy team_memberships_manage on public.team_memberships for all
  using (organization_id=private.current_organization_id() and (private.has_permission('teams.manage') or private.has_permission('users.manage')))
  with check (
    organization_id=private.current_organization_id()
    and private.is_same_org_profile(profile_id)
    and exists (select 1 from public.teams t where t.id=team_id and t.organization_id=private.current_organization_id())
  );

create policy permissions_read on public.permissions for select
  using (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage'));
create policy roles_read on public.roles for select
  using (organization_id=private.current_organization_id() and (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage')));
create policy roles_manage on public.roles for all
  using (organization_id=private.current_organization_id() and private.has_permission('roles.manage'))
  with check (organization_id=private.current_organization_id());
create policy role_permissions_read on public.role_permissions for select
  using (exists (
    select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id()
      and (private.has_permission('roles.view') or private.has_permission('roles.manage') or private.has_permission('users.manage'))
  ));
create policy role_permissions_manage on public.role_permissions for all
  using (exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and private.has_permission('roles.manage')))
  with check (exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and private.has_permission('roles.manage')));
create policy user_roles_read on public.user_roles for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('users.view') or private.has_permission('users.manage')));
create policy user_roles_manage on public.user_roles for all
  using (organization_id=private.current_organization_id() and (private.has_permission('users.manage') or private.has_permission('roles.manage')))
  with check (
    organization_id=private.current_organization_id()
    and private.is_same_org_profile(profile_id)
    and exists (select 1 from public.roles r where r.id=role_id and r.organization_id=private.current_organization_id() and r.active)
  );

create policy user_devices_own on public.user_devices for all
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notification_preferences_own on public.notification_preferences for all
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy feature_flags_read on public.feature_flags for select
  using (organization_id=private.current_organization_id());
create policy feature_flags_manage on public.feature_flags for all
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());

-- Messaging ------------------------------------------------------------------
create policy conversations_member_read on public.conversations for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(id));
create policy conversation_members_member_read on public.conversation_members for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy messages_member_read on public.messages for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy messages_member_insert on public.messages for insert
  with check (
    organization_id=private.current_organization_id()
    and sender_id=private.current_profile_id()
    and private.can_post_conversation(conversation_id)
    and (reply_to_id is null or exists (select 1 from public.messages r where r.id=reply_to_id and r.conversation_id=conversation_id))
  );
create policy message_edits_member_read on public.message_edits for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
      and (m.sender_id=private.current_profile_id() or private.has_permission('messages.moderate'))
  ));
create policy message_attachments_member_read on public.message_attachments for select
  using (organization_id=private.current_organization_id() and message_id is not null and private.can_access_message_attachment(conversation_id,message_id));
create policy message_attachments_member_insert on public.message_attachments for insert
  with check (
    organization_id=private.current_organization_id()
    and uploaded_by=private.current_profile_id()
    and private.can_post_conversation(conversation_id)
    and (message_id is null or exists (select 1 from public.messages m where m.id=message_id and m.conversation_id=conversation_id))
  );
create policy message_reactions_member_read on public.message_reactions for select
  using (exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)));
create policy message_reactions_own_insert on public.message_reactions for insert
  with check (profile_id=private.current_profile_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
  ));
create policy message_reactions_own_delete on public.message_reactions for delete
  using (profile_id=private.current_profile_id());
create policy message_receipts_member_read on public.message_read_receipts for select
  using (exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)));
create policy message_receipts_own_insert on public.message_read_receipts for insert
  with check (profile_id=private.current_profile_id() and exists (
    select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
  ));
create policy message_receipts_own_update on public.message_read_receipts for update
  using (profile_id=private.current_profile_id()) with check (
    profile_id=private.current_profile_id() and exists (
      select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
    )
  );
create policy message_reactions_own_update on public.message_reactions for update
  using (profile_id=private.current_profile_id()) with check (
    profile_id=private.current_profile_id() and exists (
      select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)
    )
  );
create policy conversation_pins_member_read on public.conversation_pins for select
  using (organization_id=private.current_organization_id() and private.is_conversation_member(conversation_id));
create policy conversation_pins_member_insert on public.conversation_pins for insert
  with check (
    organization_id=private.current_organization_id() and pinned_by=private.current_profile_id()
    and private.is_conversation_member(conversation_id)
    and exists (select 1 from public.messages m where m.id=message_id and m.conversation_id=conversation_id)
  );
create policy conversation_pins_own_delete on public.conversation_pins for delete
  using (
    organization_id=private.current_organization_id()
    and private.is_conversation_member(conversation_id)
    and (pinned_by=private.current_profile_id() or private.has_permission('messages.moderate'))
  );

-- News and notifications ------------------------------------------------------
create policy news_posts_read on public.news_posts for select using (private.can_access_news(id));
create policy news_posts_create on public.news_posts for insert
  with check (
    organization_id=private.current_organization_id() and author_id=private.current_profile_id()
    and private.has_permission('news.create')
    and ((status in ('draft','scheduled')) or (status='published' and private.has_permission('news.publish')))
  );
create policy news_posts_update on public.news_posts for update
  using (organization_id=private.current_organization_id() and (private.has_permission('news.manage') or (author_id=private.current_profile_id() and private.has_permission('news.create'))))
  with check (
    organization_id=private.current_organization_id()
    and (private.has_permission('news.manage') or (author_id=private.current_profile_id() and private.has_permission('news.create')))
    and (status<>'published' or private.has_permission('news.publish'))
  );
create policy news_posts_delete on public.news_posts for delete
  using (organization_id=private.current_organization_id() and private.has_permission('news.manage') and status='draft');
create policy news_audiences_read on public.news_audiences for select
  using (organization_id=private.current_organization_id() and private.can_access_news(news_id));
create policy news_audiences_manage on public.news_audiences for all
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.news_posts n where n.id=news_id and (private.has_permission('news.manage') or (n.author_id=private.current_profile_id() and private.has_permission('news.create')))
  ))
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.news_posts n where n.id=news_id and n.organization_id=private.current_organization_id()
      and (private.has_permission('news.manage') or (n.author_id=private.current_profile_id() and private.has_permission('news.create')))
  ));
create policy news_reads_read on public.news_reads for select
  using (profile_id=private.current_profile_id());
create policy news_reads_insert on public.news_reads for insert
  with check (profile_id=private.current_profile_id() and private.can_access_news(news_id));
create policy news_reads_update on public.news_reads for update
  using (profile_id=private.current_profile_id())
  with check (profile_id=private.current_profile_id() and private.can_access_news(news_id));
create policy notifications_own_read on public.notifications for select
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notifications_own_update on public.notifications for update
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy notification_deliveries_own_read on public.notification_deliveries for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.notifications n where n.id=notification_id and n.profile_id=private.current_profile_id()
  ));

-- Schedule -------------------------------------------------------------------
create policy schedule_periods_read on public.schedule_periods for select
  using (organization_id=private.current_organization_id() and (
    private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')
    or (status='published' and private.has_permission('schedule.view_own'))
  ));
create policy schedule_periods_manage on public.schedule_periods for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shift_templates_read on public.shift_templates for select
  using (organization_id=private.current_organization_id() and (private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')));
create policy shift_templates_manage on public.shift_templates for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shifts_read on public.shifts for select
  using (
    organization_id=private.current_organization_id()
    and (
      private.has_permission('schedule.manage')
      or (private.has_permission('schedule.view_team') and (team_id is null or private.can_view_team(team_id)))
      or (status<>'draft' and private.has_permission('schedule.view_own') and private.is_shift_assignee(id))
    )
  );
create policy shifts_manage on public.shifts for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'));
create policy shift_assignments_read on public.shift_assignments for select
  using (
    organization_id=private.current_organization_id()
    and ((profile_id=private.current_profile_id() and private.has_permission('schedule.view_own')) or private.has_permission('schedule.manage') or (private.has_permission('schedule.view_team') and private.can_view_shift_team(shift_id)))
  );
create policy shift_assignments_manage on public.shift_assignments for all
  using (organization_id=private.current_organization_id() and private.has_permission('schedule.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('schedule.manage') and private.is_same_org_profile(profile_id));
create policy shift_acknowledgements_read on public.shift_acknowledgements for select
  using (organization_id=private.current_organization_id() and ((profile_id=private.current_profile_id() and private.has_permission('schedule.view_own')) or private.has_permission('schedule.manage')));
create policy shift_acknowledgements_own_insert on public.shift_acknowledgements for insert
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id() and private.has_permission('schedule.view_own') and exists (
    select 1 from public.shift_assignments sa where sa.shift_id=shift_id and sa.profile_id=private.current_profile_id()
  ));
create policy schedule_change_log_read on public.schedule_change_log for select
  using (organization_id=private.current_organization_id() and (private.has_permission('schedule.manage') or private.has_permission('schedule.view_team')));

-- Leave and sick leave --------------------------------------------------------
create policy leave_types_read on public.leave_types for select
  using (organization_id=private.current_organization_id() and active);
create policy leave_types_manage on public.leave_types for all
  using (organization_id=private.current_organization_id() and private.has_permission('leave.manage'))
  with check (organization_id=private.current_organization_id());
create policy public_holidays_read on public.public_holidays for select
  using (organization_id=private.current_organization_id());
create policy public_holidays_manage on public.public_holidays for all
  using (organization_id=private.current_organization_id() and private.has_permission('settings.manage'))
  with check (organization_id=private.current_organization_id());
create policy leave_requests_read on public.leave_requests for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.has_permission('leave.manage') or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(profile_id)))
  );
create policy leave_approval_steps_read on public.leave_approval_steps for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.leave_requests lr where lr.id=leave_request_id
      and (lr.profile_id=private.current_profile_id() or private.has_permission('leave.manage') or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(lr.profile_id)))
  ));
create policy leave_balances_read on public.leave_balances for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('leave.manage')));
create policy leave_balances_manage on public.leave_balances for all
  using (organization_id=private.current_organization_id() and private.has_permission('leave.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));
create policy sick_leave_read on public.sick_leave_records for select
  using (
    organization_id=private.current_organization_id()
    and (profile_id=private.current_profile_id() or private.can_view_sick_status(profile_id))
  );
create policy sick_leave_manage on public.sick_leave_records for update
  using (organization_id=private.current_organization_id() and private.has_permission('sick_leave.manage'))
  with check (organization_id=private.current_organization_id());
create policy sick_leave_own_certificate_update on public.sick_leave_records for update
  using (organization_id=private.current_organization_id() and profile_id=private.current_profile_id())
  with check (organization_id=private.current_organization_id() and profile_id=private.current_profile_id());
create policy sick_documents_read on public.sick_leave_document_versions for select
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.sick_leave_records sl where sl.id=sick_leave_id
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates'))
  ));
create policy sick_documents_insert on public.sick_leave_document_versions for insert
  with check (
    organization_id=private.current_organization_id() and uploaded_by=private.current_profile_id()
    and exists (select 1 from public.sick_leave_records sl where sl.id=sick_leave_id and sl.organization_id=private.current_organization_id()
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates')))
  );

-- Documents ------------------------------------------------------------------
create policy document_categories_read on public.document_categories for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.manage')));
create policy document_categories_manage on public.document_categories for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage'))
  with check (organization_id=private.current_organization_id());
create policy document_folders_read on public.document_folders for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.view_own') or private.has_permission('documents.manage')));
create policy document_folders_manage on public.document_folders for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage'))
  with check (organization_id=private.current_organization_id());
create policy documents_read on public.documents for select using (private.can_access_document(id));
create policy documents_create on public.documents for insert
  with check (
    organization_id=private.current_organization_id()
    and (
      (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
      or ((sensitivity='employee_file' or visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  );
create policy documents_update on public.documents for update
  using (organization_id=private.current_organization_id() and (
    (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
    or ((sensitivity='employee_file' or visibility='personal') and (
      private.has_permission('documents.manage_employee_files')
      or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
        and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
    ))
  ))
  with check (organization_id=private.current_organization_id() and (
    (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
    or ((sensitivity='employee_file' or visibility='personal') and (
      private.has_permission('documents.manage_employee_files')
      or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
        and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
    ))
  ));
create policy documents_delete on public.documents for delete
  using (
    organization_id=private.current_organization_id()
    and (
      (sensitivity<>'employee_file' and visibility<>'personal' and private.has_permission('documents.manage'))
      or ((sensitivity='employee_file' or visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (sensitivity<>'employee_file' and owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
    and (
      status='draft'
      or (created_by=private.current_profile_id() and created_at>now()-interval '15 minutes'
        and not exists(select 1 from public.document_versions dv where dv.document_id=id))
    )
  );
create policy document_versions_read on public.document_versions for select
  using (organization_id=private.current_organization_id() and private.can_access_document(document_id));
create policy document_versions_insert on public.document_versions for insert
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  ));
create policy document_versions_manage on public.document_versions for update
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  )) with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and (
        private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      ))
    )
  ));
create policy document_audiences_read on public.document_audiences for select
  using (organization_id=private.current_organization_id() and private.can_access_document(document_id));
create policy document_audiences_manage on public.document_audiences for all
  using (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
    )
  ))
  with check (organization_id=private.current_organization_id() and exists (
    select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
      (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
      or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
    )
  ));
create policy document_acknowledgements_read on public.document_acknowledgements for select
  using (organization_id=private.current_organization_id() and (
    profile_id=private.current_profile_id()
    or exists (
      select 1 from public.documents d where d.id=document_id and d.organization_id=private.current_organization_id() and (
        (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
        or ((d.sensitivity='employee_file' or d.visibility='personal') and private.has_permission('documents.manage_employee_files'))
      )
    )
  ));
create policy document_acknowledgements_own_insert on public.document_acknowledgements for insert
  with check (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
    and (version_id is null or exists (
      select 1 from public.document_versions dv
      where dv.id=version_id and dv.document_id=public.document_acknowledgements.document_id
        and dv.organization_id=private.current_organization_id() and dv.deleted_at is null
    ))
  );
create policy document_acknowledgements_own_update on public.document_acknowledgements for update
  using (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
  )
  with check (
    organization_id=private.current_organization_id()
    and profile_id=private.current_profile_id()
    and private.can_access_document(document_id)
    and (version_id is null or exists (
      select 1 from public.document_versions dv
      where dv.id=version_id and dv.document_id=public.document_acknowledgements.document_id
        and dv.organization_id=private.current_organization_id() and dv.deleted_at is null
    ))
  );
create policy document_access_log_read on public.document_access_log for select
  using (organization_id=private.current_organization_id() and private.has_permission('audit.view'));

-- Fleet ----------------------------------------------------------------------
create policy vehicles_read on public.vehicles for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(id));
create policy vehicles_manage on public.vehicles for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id());
create policy vehicle_assignments_read on public.vehicle_assignments for select
  using (organization_id=private.current_organization_id() and ((profile_id=private.current_profile_id() and private.has_permission('fleet.view_own')) or private.has_permission('fleet.view_all') or private.has_permission('fleet.manage')));
create policy vehicle_assignments_manage on public.vehicle_assignments for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id() and private.is_same_org_profile(profile_id));
create policy mileage_read on public.mileage_submissions for select
  using (organization_id=private.current_organization_id() and (profile_id=private.current_profile_id() or private.has_permission('mileage.manage')));
create policy mileage_manage on public.mileage_submissions for update
  using (organization_id=private.current_organization_id() and private.has_permission('mileage.manage'))
  with check (organization_id=private.current_organization_id());
create policy maintenance_read on public.vehicle_maintenance_events for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(vehicle_id));
create policy maintenance_manage on public.vehicle_maintenance_events for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (organization_id=private.current_organization_id() and private.has_permission('fleet.manage') and exists (
    select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id()
  ));
create policy damage_reports_read on public.vehicle_damage_reports for select
  using (organization_id=private.current_organization_id() and (reported_by=private.current_profile_id() or private.can_access_vehicle(vehicle_id)));
create policy damage_reports_insert on public.vehicle_damage_reports for insert
  with check (
    organization_id=private.current_organization_id() and reported_by=private.current_profile_id()
    and private.can_access_vehicle(vehicle_id) and status='reported' and resolved_by is null and resolved_at is null
  );
create policy damage_reports_manage on public.vehicle_damage_reports for update
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (
    organization_id=private.current_organization_id() and private.has_permission('fleet.manage')
    and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id())
    and private.is_same_org_profile(reported_by)
    and (resolved_by is null or private.is_same_org_profile(resolved_by))
  );
create policy vehicle_documents_read on public.vehicle_documents for select
  using (organization_id=private.current_organization_id() and private.can_access_vehicle(vehicle_id));
create policy vehicle_documents_manage on public.vehicle_documents for all
  using (organization_id=private.current_organization_id() and private.has_permission('fleet.manage'))
  with check (
    organization_id=private.current_organization_id() and private.has_permission('fleet.manage')
    and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.organization_id=private.current_organization_id())
    and private.is_same_org_profile(uploaded_by)
  );

-- Materials ------------------------------------------------------------------
create policy material_categories_read on public.material_categories for select
  using (organization_id=private.current_organization_id() and active);
create policy material_categories_manage on public.material_categories for all
  using (organization_id=private.current_organization_id() and private.has_permission('materials.manage'))
  with check (organization_id=private.current_organization_id());
create policy material_catalog_read on public.material_catalog_items for select
  using (organization_id=private.current_organization_id() and active);
create policy material_catalog_manage on public.material_catalog_items for all
  using (organization_id=private.current_organization_id() and private.has_permission('materials.manage'))
  with check (organization_id=private.current_organization_id());
create policy material_requests_read on public.material_requests for select using (private.can_access_material_request(id));
create policy material_items_read on public.material_request_items for select
  using (organization_id=private.current_organization_id() and private.can_access_material_request(request_id));
create policy material_history_read on public.material_request_status_history for select
  using (organization_id=private.current_organization_id() and private.can_access_material_request(material_request_id));

-- Audit and integrations ------------------------------------------------------
create policy audit_read on public.audit_logs for select
  using (organization_id=private.current_organization_id() and private.has_permission('audit.view'));
create policy integration_providers_read on public.integration_providers for select using (private.current_profile_id() is not null);
create policy integration_connections_read on public.integration_connections for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));
create policy integration_connections_manage on public.integration_connections for all
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'))
  with check (organization_id=private.current_organization_id());
create policy integration_runs_read on public.integration_sync_runs for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));
create policy integration_errors_read on public.integration_sync_errors for select
  using (organization_id=private.current_organization_id() and private.has_permission('integrations.manage'));

-- Column-level hardening. Safe directory fields stay joinable for the app;
-- auth_user_id, birth_date and HR-only fields are only returned by RPCs.
revoke select on public.profiles from authenticated;
grant select (id, organization_id, display_name, email, avatar_url, status, preferred_language, created_at, updated_at)
  on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
revoke insert, update, delete on public.user_roles from authenticated;
revoke insert, update, delete on public.team_memberships from authenticated;
revoke delete on public.teams from authenticated;
revoke update, delete on public.roles from authenticated;
revoke insert, update, delete on public.role_permissions from authenticated;
revoke select on public.employee_profiles from authenticated;
grant select (profile_id, organization_id, first_name, last_name, work_phone, job_title, department_id, location_id)
  on public.employee_profiles to authenticated;
revoke update on public.messages from authenticated;
revoke insert, update, delete on public.news_posts from authenticated;
revoke insert, update, delete on public.news_audiences from authenticated;
revoke insert, update, delete on public.news_reads from authenticated;
revoke insert, update on public.documents from authenticated;
revoke insert, update, delete on public.document_audiences from authenticated;
revoke insert, update, delete on public.document_versions from authenticated;
revoke insert, update, delete on public.leave_requests from authenticated;
revoke select on public.leave_requests from authenticated;
grant select (id,organization_id,profile_id,leave_type,leave_type_id,starts_on,ends_on,day_fraction,workdays,status,decided_by,decided_at,created_at,submitted_at,updated_at)
  on public.leave_requests to authenticated;
revoke insert, delete on public.sick_leave_records from authenticated;
revoke select on public.sick_leave_records from authenticated;
grant select (id,organization_id,profile_id,starts_on,expected_end_on,end_unknown,status,created_at,updated_at)
  on public.sick_leave_records to authenticated;
revoke update on public.sick_leave_records from authenticated;
grant update (status, certificate_status) on public.sick_leave_records to authenticated;
revoke insert, delete on public.mileage_submissions from authenticated;
revoke insert, update, delete on public.material_requests from authenticated;
revoke insert, update, delete on public.material_request_items from authenticated;
revoke insert, update, delete on public.material_request_status_history from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.my_permissions() from public;
grant execute on function public.my_permissions() to authenticated;

-- Storage buckets and per-domain object policies ------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('news-attachments','news-attachments',false,10485760,array['image/jpeg','image/png','application/pdf']),
  ('employee-documents','employee-documents',false,20971520,array['image/jpeg','image/png','application/pdf']),
  ('material-request-files','material-request-files',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end;
$$;

create policy storage_message_read on storage.objects for select to authenticated using (
  bucket_id='message-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_message_attachment(((storage.foldername(name))[2])::uuid,((storage.foldername(name))[3])::uuid)
);
create policy storage_message_upload on storage.objects for insert to authenticated with check (
  bucket_id='message-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_post_conversation(((storage.foldername(name))[2])::uuid)
);
create policy storage_message_cleanup on storage.objects for delete to authenticated using (
  bucket_id='message-attachments' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.message_attachments ma where ma.storage_path=name)
);

create policy storage_news_read on storage.objects for select to authenticated using (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_news(((storage.foldername(name))[2])::uuid)
);
create policy storage_news_upload on storage.objects for insert to authenticated with check (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.news_posts n where n.id=((storage.foldername(name))[2])::uuid
    and n.organization_id=private.current_organization_id()
    and ((n.author_id=private.current_profile_id() and private.has_permission('news.create')) or private.has_permission('news.manage')))
);
create policy storage_news_delete on storage.objects for delete to authenticated using (
  bucket_id='news-attachments'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('news.manage')
);

create policy storage_documents_read on storage.objects for select to authenticated using (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_document(((storage.foldername(name))[2])::uuid)
);
create policy storage_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and private.has_permission('documents.manage')
    and (d.visibility<>'personal' or (d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))))
);
create policy storage_documents_delete on storage.objects for delete to authenticated using (
  bucket_id='documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and private.has_permission('documents.manage')
    and (d.visibility<>'personal' or (d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))))
);

create policy storage_employee_documents_read on storage.objects for select to authenticated using (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and (
    (storage.foldername(name))[2]=private.current_profile_id()::text
    or private.has_permission('documents.manage_employee_files')
  )
);
create policy storage_employee_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('documents.manage_employee_files')
  and private.is_same_org_profile(((storage.foldername(name))[2])::uuid)
);
create policy storage_employee_documents_delete on storage.objects for delete to authenticated using (
  bucket_id='employee-documents'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('documents.manage_employee_files')
  and not exists(select 1 from public.document_versions dv where dv.storage_path=name and dv.deleted_at is null)
);

-- No SELECT policy for certificates: downloads are short-lived, audited URLs
-- issued only by create-secure-download. Employees/HR can upload to valid records.
create policy storage_certificates_upload on storage.objects for insert to authenticated with check (
  bucket_id='sick-certificates'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists (
    select 1 from public.sick_leave_records sl
    where sl.id=((storage.foldername(name))[3])::uuid
      and sl.organization_id=private.current_organization_id()
      and (storage.foldername(name))[2]=sl.profile_id::text
      and (sl.profile_id=private.current_profile_id() or private.has_permission('sick_leave.view_certificates'))
  )
);
create policy storage_certificates_cleanup on storage.objects for delete to authenticated using (
  bucket_id='sick-certificates' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.sick_leave_document_versions sd where sd.storage_path=name and sd.deleted_at is null)
);

create policy storage_vehicle_read on storage.objects for select to authenticated using (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_vehicle(((storage.foldername(name))[2])::uuid)
);
create policy storage_vehicle_upload on storage.objects for insert to authenticated with check (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_vehicle(((storage.foldername(name))[2])::uuid)
);
create policy storage_vehicle_delete on storage.objects for delete to authenticated using (
  bucket_id='vehicle-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('fleet.manage')
);
create policy storage_vehicle_cleanup on storage.objects for delete to authenticated using (
  bucket_id='vehicle-files' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.mileage_submissions ms where ms.photo_path=name)
  and not exists(select 1 from public.vehicle_documents vd where vd.storage_path=name and vd.archived_at is null)
);

create policy storage_material_read on storage.objects for select to authenticated using (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_material_request(((storage.foldername(name))[2])::uuid)
);
create policy storage_material_upload on storage.objects for insert to authenticated with check (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.can_access_material_request(((storage.foldername(name))[2])::uuid)
);
create policy storage_material_delete on storage.objects for delete to authenticated using (
  bucket_id='material-request-files'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and private.has_permission('materials.manage')
);
create policy storage_material_cleanup on storage.objects for delete to authenticated using (
  bucket_id='material-request-files' and owner_id=auth.uid()::text and created_at>now()-interval '15 minutes'
  and not exists(select 1 from public.material_requests mr where mr.attachment_path=name)
);

create policy storage_avatars_read on storage.objects for select to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=private.current_organization_id()::text
);
create policy storage_avatars_upload on storage.objects for insert to authenticated with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);
create policy storage_avatars_update on storage.objects for update to authenticated using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
) with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);
create policy storage_avatars_delete on storage.objects for delete to authenticated using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=private.current_organization_id()::text
  and ((storage.foldername(name))[2]=private.current_profile_id()::text or private.has_permission('users.manage'))
);

-- ===== supabase/migrations/202607100005_workflows.sql =====
-- Alberring Connect: transactional business workflows and safe read RPCs.

-- Integrity triggers ----------------------------------------------------------

create or replace function private.prepare_user_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_org uuid;
  role_org uuid;
begin
  select organization_id into profile_org from public.profiles where id=new.profile_id;
  select organization_id into role_org from public.roles where id=new.role_id and active;
  if profile_org is null or role_org is null or profile_org<>role_org then
    raise exception 'role_and_profile_must_share_organization' using errcode='23514';
  end if;
  new.organization_id := profile_org;
  if new.assigned_by is not null and not exists (
    select 1 from public.profiles p where p.id=new.assigned_by and p.organization_id=profile_org
  ) then
    raise exception 'assigner_must_share_organization' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists prepare_user_role on public.user_roles;
create trigger prepare_user_role before insert or update on public.user_roles
for each row execute function private.prepare_user_role();

create or replace function private.prepare_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  message_org uuid;
  message_conversation uuid;
begin
  if new.message_id is not null then
    select organization_id, conversation_id into message_org, message_conversation
    from public.messages where id=new.message_id;
    if message_org is null then raise exception 'message_not_found' using errcode='23503'; end if;
    if new.organization_id<>message_org then raise exception 'attachment_organization_mismatch' using errcode='23514'; end if;
    if new.conversation_id is not null and new.conversation_id<>message_conversation then
      raise exception 'attachment_conversation_mismatch' using errcode='23514';
    end if;
    new.conversation_id := message_conversation;
  end if;
  if new.conversation_id is null then raise exception 'conversation_required' using errcode='23502'; end if;
  return new;
end;
$$;
drop trigger if exists prepare_message_attachment on public.message_attachments;
create trigger prepare_message_attachment before insert or update on public.message_attachments
for each row execute function private.prepare_message_attachment();

create or replace function private.audit_message_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id<>old.id or new.organization_id<>old.organization_id
    or new.conversation_id<>old.conversation_id or new.sender_id<>old.sender_id
    or new.created_at<>old.created_at or new.reply_to_id is distinct from old.reply_to_id
    or new.client_nonce is distinct from old.client_nonce then
    raise exception 'immutable_message_fields_changed' using errcode='22023';
  end if;
  if new.body is distinct from old.body and not (old.retracted_at is null and new.retracted_at is not null) then
    insert into public.message_edits(organization_id,message_id,edited_by,previous_body,edited_at)
    values(old.organization_id,old.id,coalesce(private.current_profile_id(),old.sender_id),old.body,now());
    new.edited_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists audit_message_update on public.messages;
create trigger audit_message_update before update on public.messages
for each row execute function private.audit_message_update();

create or replace function private.guard_sick_leave_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.sick_workflow',true),'')<>'allowed' then
    if new.certificate_status is distinct from old.certificate_status
      and not private.has_permission('sick_leave.view_certificates') then
      if old.profile_id<>private.current_profile_id() then
        raise exception 'certificate_permission_required' using errcode='42501';
      end if;
      if new.certificate_status not in ('pending','received') then
        raise exception 'invalid_employee_certificate_status' using errcode='42501';
      end if;
    end if;
    if old.profile_id=private.current_profile_id()
      and not private.has_permission('sick_leave.manage')
      and (to_jsonb(new)-array['certificate_status','updated_at'])
          is distinct from (to_jsonb(old)-array['certificate_status','updated_at']) then
      raise exception 'only_certificate_status_may_be_updated' using errcode='42501';
    end if;
  end if;
  if new.certificate_status is distinct from old.certificate_status
    and auth.uid() is not null and private.has_permission('sick_leave.view_certificates') then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(old.organization_id,private.current_profile_id(),'sick_leave.certificate_status_changed','sick_leave',old.id,
      jsonb_build_object('from',old.certificate_status,'to',new.certificate_status));
  end if;
  if new.status is distinct from old.status and private.has_permission('sick_leave.manage') then
    new.processed_by:=private.current_profile_id();
    new.processed_at:=now();
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(old.organization_id,private.current_profile_id(),'sick_leave.status_changed','sick_leave',old.id,
      jsonb_build_object('from',old.status,'to',new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists guard_sick_leave_update on public.sick_leave_records;
create trigger guard_sick_leave_update before update on public.sick_leave_records
for each row execute function private.guard_sick_leave_update();

create or replace function private.prepare_sick_leave_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); owner_profile uuid;
begin
  if auth.uid() is null then return new; end if;
  select sl.profile_id into owner_profile from public.sick_leave_records sl
  where sl.id=new.sick_leave_id and sl.organization_id=org for update;
  if me is null or owner_profile is null then raise exception 'sick_leave_not_available' using errcode='23514'; end if;
  if owner_profile<>me and not private.has_permission('sick_leave.view_certificates') then
    raise exception 'certificate_permission_required' using errcode='42501';
  end if;
  if (storage.foldername(new.storage_path))[1] is distinct from org::text
    or (storage.foldername(new.storage_path))[2] is distinct from owner_profile::text
    or (storage.foldername(new.storage_path))[3] is distinct from new.sick_leave_id::text
    or not exists(select 1 from storage.objects so where so.bucket_id='sick-certificates' and so.name=new.storage_path) then
    raise exception 'certificate_file_missing_or_misplaced' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sick-document:'||new.sick_leave_id::text,0));
  new.organization_id:=org;
  new.uploaded_by:=me;
  select coalesce(max(sd.version),0)+1 into new.version from public.sick_leave_document_versions sd where sd.sick_leave_id=new.sick_leave_id;
  return new;
end;
$$;
drop trigger if exists prepare_sick_leave_document on public.sick_leave_document_versions;
create trigger prepare_sick_leave_document before insert on public.sick_leave_document_versions
for each row execute function private.prepare_sick_leave_document();

create or replace function private.audit_sick_leave_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare owner_profile uuid; actor uuid:=coalesce(private.current_profile_id(),new.uploaded_by);
begin
  select sl.profile_id into owner_profile from public.sick_leave_records sl where sl.id=new.sick_leave_id;
  update public.sick_leave_records set certificate_status='received'
  where id=new.sick_leave_id and certificate_status in ('required','pending','rejected');
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(new.organization_id,actor,'sick_leave.certificate_uploaded','sick_leave',new.sick_leave_id,
    jsonb_build_object('version',new.version));
  perform private.create_notification(new.organization_id,p.id,'sick_leave_certificate','Attest eingegangen',
    'Zu einer Abwesenheitsmeldung ist ein Attest eingegangen.','/app/sick-leave',
    'sick-certificate:'||new.id::text||':'||p.id::text)
  from public.profiles p
  where p.organization_id=new.organization_id and p.status='active' and p.id<>actor
    and private.profile_has_permission(p.id,new.organization_id,'sick_leave.view_certificates');
  return new;
end;
$$;
drop trigger if exists audit_sick_leave_document on public.sick_leave_document_versions;
create trigger audit_sick_leave_document after insert on public.sick_leave_document_versions
for each row execute function private.audit_sick_leave_document();

create or replace function private.guard_vehicle_maintenance_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'maintenance_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.created_by:=me;
  else
    new.organization_id:=old.organization_id;
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_maintenance_event on public.vehicle_maintenance_events;
create trigger guard_vehicle_maintenance_event before insert or update on public.vehicle_maintenance_events
for each row execute function private.guard_vehicle_maintenance_event();

create or replace function private.guard_vehicle_damage_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'damage_report_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.reported_by:=me;
    new.status:='reported';
    new.resolved_by:=null;
    new.resolved_at:=null;
  else
    new.organization_id:=old.organization_id;
    new.vehicle_id:=old.vehicle_id;
    new.reported_by:=old.reported_by;
    new.created_at:=old.created_at;
    if new.status='resolved' and old.status<>'resolved' then
      new.resolved_by:=me;
      new.resolved_at:=now();
    elsif new.status<>'resolved' then
      new.resolved_by:=null;
      new.resolved_at:=null;
    else
      new.resolved_by:=old.resolved_by;
      new.resolved_at:=old.resolved_at;
    end if;
    if new.status is distinct from old.status then
      insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
      values(org,me,'fleet.damage_status_changed','vehicle_damage_report',old.id,jsonb_build_object('from',old.status,'to',new.status));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_damage_report on public.vehicle_damage_reports;
create trigger guard_vehicle_damage_report before insert or update on public.vehicle_damage_reports
for each row execute function private.guard_vehicle_damage_report();

create or replace function private.guard_vehicle_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if auth.uid() is null then return new; end if;
  if me is null or new.organization_id<>org or not exists(
    select 1 from public.vehicles v where v.id=new.vehicle_id and v.organization_id=org
  ) then raise exception 'vehicle_document_organization_mismatch' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.uploaded_by:=me;
    if (storage.foldername(new.storage_path))[1] is distinct from org::text
      or (storage.foldername(new.storage_path))[2] is distinct from new.vehicle_id::text
      or not exists(select 1 from storage.objects so where so.bucket_id='vehicle-files' and so.name=new.storage_path) then
      raise exception 'vehicle_document_file_missing_or_misplaced' using errcode='23514';
    end if;
  else
    new.organization_id:=old.organization_id;
    new.vehicle_id:=old.vehicle_id;
    new.storage_path:=old.storage_path;
    new.uploaded_by:=old.uploaded_by;
    new.created_at:=old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_vehicle_document on public.vehicle_documents;
create trigger guard_vehicle_document before insert or update on public.vehicle_documents
for each row execute function private.guard_vehicle_document();

create or replace function private.guard_team_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op='UPDATE' then new.organization_id:=old.organization_id; end if;
  if auth.uid() is not null and new.organization_id<>private.current_organization_id() then
    raise exception 'team_organization_mismatch' using errcode='23514';
  end if;
  if new.lead_profile_id is not null and not exists(select 1 from public.profiles p where p.id=new.lead_profile_id and p.organization_id=new.organization_id and p.status<>'archived') then
    raise exception 'team_lead_organization_mismatch' using errcode='23514';
  end if;
  if new.department_id is not null and not exists(select 1 from public.departments d where d.id=new.department_id and d.organization_id=new.organization_id) then
    raise exception 'team_department_organization_mismatch' using errcode='23514';
  end if;
  if new.location_id is not null and not exists(select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then
    raise exception 'team_location_organization_mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_team_integrity on public.teams;
create trigger guard_team_integrity before insert or update on public.teams
for each row execute function private.guard_team_integrity();

create or replace function private.audit_organization_settings_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id(); changed jsonb;
begin
  if auth.uid() is null or actor is null then return new; end if;
  select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changed
  from jsonb_object_keys(to_jsonb(new)-'updated_at') k
  where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k);
  if changed<>'[]'::jsonb then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'settings.updated','organization_settings',new.organization_id,jsonb_build_object('changed_fields',changed));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_organization_settings_update on public.organization_settings;
create trigger audit_organization_settings_update after update on public.organization_settings
for each row execute function private.audit_organization_settings_update();

create or replace function private.audit_role_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id();
begin
  if auth.uid() is not null then
    if actor is null or new.organization_id<>private.current_organization_id() then raise exception 'role_organization_mismatch' using errcode='23514'; end if;
    new.system_key:=null;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_role_created on public.roles;
create trigger guard_role_created before insert on public.roles for each row execute function private.audit_role_created();

create or replace function private.audit_role_created_after()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id();
begin
  if auth.uid() is not null and actor is not null then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'role.created','role',new.id,jsonb_build_object('name',new.name));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_role_created_after on public.roles;
create trigger audit_role_created_after after insert on public.roles for each row execute function private.audit_role_created_after();

create or replace function private.audit_team_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor uuid:=private.current_profile_id(); changed jsonb;
begin
  if auth.uid() is null or actor is null then return new; end if;
  if tg_op='INSERT' then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(new.organization_id,actor,'team.created','team',new.id,jsonb_build_object('name',new.name));
  else
    select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changed
    from jsonb_object_keys(to_jsonb(new)-array['updated_at']) k
    where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k);
    if changed<>'[]'::jsonb then
      insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
      values(new.organization_id,actor,'team.updated','team',new.id,jsonb_build_object('changed_fields',changed));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists audit_team_change on public.teams;
create trigger audit_team_change after insert or update on public.teams for each row execute function private.audit_team_change();

create or replace function private.validate_audience_target()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.audience_type='team' and not exists (select 1 from public.teams t where t.id=new.team_id and t.organization_id=new.organization_id) then
    raise exception 'audience_team_organization_mismatch' using errcode='23514';
  elsif new.audience_type='location' and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then
    raise exception 'audience_location_organization_mismatch' using errcode='23514';
  elsif new.audience_type='role' and not exists (select 1 from public.roles r where r.id=new.role_id and r.organization_id=new.organization_id) then
    raise exception 'audience_role_organization_mismatch' using errcode='23514';
  elsif new.audience_type='profile' and not exists (select 1 from public.profiles p where p.id=new.profile_id and p.organization_id=new.organization_id) then
    raise exception 'audience_profile_organization_mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_news_audience_target on public.news_audiences;
create trigger validate_news_audience_target before insert or update on public.news_audiences
for each row execute function private.validate_audience_target();
drop trigger if exists validate_document_audience_target on public.document_audiences;
create trigger validate_document_audience_target before insert or update on public.document_audiences
for each row execute function private.validate_audience_target();

create or replace function private.guard_document_folder_tree()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parent_org uuid;
  folder_depth integer;
  max_depth integer;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id=new.id then raise exception 'folder_cycle' using errcode='23514'; end if;
  select organization_id into parent_org from public.document_folders where id=new.parent_id;
  if parent_org is null or parent_org<>new.organization_id then
    raise exception 'folder_parent_organization_mismatch' using errcode='23514';
  end if;
  if exists (
    with recursive descendants as (
      select id,parent_id from public.document_folders where id=new.id
      union all
      select f.id,f.parent_id from public.document_folders f join descendants d on f.parent_id=d.id
    ) select 1 from descendants where id=new.parent_id
  ) then raise exception 'folder_cycle' using errcode='23514'; end if;
  with recursive ancestors as (
    select id,parent_id,1 as depth from public.document_folders where id=new.parent_id
    union all
    select f.id,f.parent_id,a.depth+1 from public.document_folders f join ancestors a on f.id=a.parent_id
  ) select coalesce(max(depth),0)+1 into folder_depth from ancestors;
  select max_document_folder_depth into max_depth from public.organization_settings where organization_id=new.organization_id;
  if folder_depth>coalesce(max_depth,5) then raise exception 'folder_depth_exceeded' using errcode='23514'; end if;
  return new;
end;
$$;
drop trigger if exists guard_document_folder_tree on public.document_folders;
create trigger guard_document_folder_tree before insert or update of parent_id,organization_id on public.document_folders
for each row execute function private.guard_document_folder_tree();

alter table public.notifications drop constraint if exists notifications_target_path_check;
alter table public.notifications add constraint notifications_target_path_check
  check (target_path is null or target_path ~ '^/app(?:/|$)');

create or replace function private.create_notification(
  p_organization_id uuid,
  p_profile_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_target_path text,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare result uuid;
begin
  if not exists (select 1 from public.profiles p where p.id=p_profile_id and p.organization_id=p_organization_id and p.status='active') then
    return null;
  end if;
  insert into public.notifications(organization_id,profile_id,type,title,body,target_path,deduplication_key)
  values(p_organization_id,p_profile_id,p_type,left(p_title,200),left(p_body,500),p_target_path,p_deduplication_key)
  on conflict(profile_id,deduplication_key) do nothing
  returning id into result;
  return result;
end;
$$;

create or replace function private.queue_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare category_key text;
begin
  category_key := case
    when new.type like 'message%' then 'messages'
    when new.type like 'news%' then 'news'
    when new.type like 'shift%' or new.type='schedule' then 'schedule'
    when new.type like 'leave%' then 'leave'
    when new.type like 'sick%' then 'sick_leave'
    when new.type like 'document%' then 'documents'
    when new.type like 'mileage%' or new.type like 'vehicle%' then 'fleet'
    when new.type like 'material%' then 'materials'
    when new.type='birthday' then 'birthdays'
    else 'system' end;
  insert into public.notification_deliveries(organization_id,notification_id,channel,status)
  values(new.organization_id,new.id,'in_app','pending') on conflict do nothing;
  insert into public.notification_deliveries(organization_id,notification_id,channel,status)
  select new.organization_id,new.id,channel_name,'pending'
  from (
    select 'email'::text channel_name,np.email_enabled enabled from public.notification_preferences np
      where np.profile_id=new.profile_id and np.category=category_key
    union all
    select 'push'::text,np.push_enabled from public.notification_preferences np
      where np.profile_id=new.profile_id and np.category=category_key
  ) channels where enabled
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists queue_notification_deliveries on public.notifications;
create trigger queue_notification_deliveries after insert on public.notifications
for each row execute function private.queue_notification_deliveries();

-- Safe profile/directory APIs -------------------------------------------------

create or replace function public.get_my_profile()
returns table(
  id uuid,
  organization_id uuid,
  display_name text,
  email text,
  status text,
  avatar_url text,
  preferred_language text,
  first_name text,
  last_name text,
  work_phone text,
  job_title text,
  employee_number text,
  start_date date
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id,p.organization_id,p.display_name,p.email,p.status,p.avatar_url,p.preferred_language,
         ep.first_name,ep.last_name,ep.work_phone,ep.job_title,ep.employee_number,ep.start_date
  from public.profiles p
  left join public.employee_profiles ep on ep.profile_id=p.id and ep.organization_id=p.organization_id
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() and p.status in ('invited','active','suspended')
  limit 1
$$;

create or replace function public.list_directory_entries(p_search text default null)
returns table(
  id uuid,
  display_name text,
  email text,
  avatar_url text,
  work_phone text,
  job_title text,
  department_name text,
  location_name text,
  teams jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.has_permission('directory.view') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query
  select p.id,p.display_name,p.email,p.avatar_url,ep.work_phone,ep.job_title,d.name,l.name,
    coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'location_name',coalesce(tl.name,t.location_name)) order by t.name)
      from public.team_memberships tm
      join public.teams t on t.id=tm.team_id and t.organization_id=tm.organization_id and t.active
      left join public.locations tl on tl.id=t.location_id
      where tm.profile_id=p.id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    ),'[]'::jsonb)
  from public.profiles p
  left join public.employee_profiles ep on ep.profile_id=p.id
  left join public.departments d on d.id=ep.department_id
  left join public.locations l on l.id=ep.location_id
  where p.organization_id=private.current_organization_id() and p.status='active'
    and (
      nullif(trim(p_search),'') is null
      or concat_ws(' ',p.display_name,p.email,ep.job_title,d.name,l.name) ilike '%'||trim(p_search)||'%'
      or exists (
        select 1 from public.team_memberships tm join public.teams t on t.id=tm.team_id
        where tm.profile_id=p.id and t.name ilike '%'||trim(p_search)||'%'
      )
    )
  order by p.display_name;
end;
$$;

create or replace function public.admin_list_users()
returns table(
  id uuid,
  display_name text,
  email text,
  status text,
  avatar_url text,
  first_name text,
  last_name text,
  employee_number text,
  work_phone text,
  job_title text,
  employment_status text,
  start_date date,
  end_date date,
  birth_date date,
  weekly_hours numeric,
  roles jsonb,
  teams jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (private.has_permission('users.view') or private.has_permission('users.manage')) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  select p.id,p.display_name,p.email,p.status,p.avatar_url,ep.first_name,ep.last_name,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employee_number end,
    ep.work_phone,ep.job_title,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.employment_status end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.start_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.end_date end,
    case when private.has_permission('birthdays.view_admin_notifications') or private.has_permission('sick_leave.manage') then ep.birth_date end,
    case when private.has_permission('users.manage') or private.has_permission('sick_leave.manage') then ep.weekly_hours end,
    coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'system_key',r.system_key) order by r.name)
      from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.profile_id=p.id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
      from public.team_memberships tm join public.teams t on t.id=tm.team_id
      where tm.profile_id=p.id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)),'[]'::jsonb)
  from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id
  where p.organization_id=private.current_organization_id()
  order by p.display_name;
end;
$$;

create or replace function public.list_leave_requests()
returns table(
  id uuid, profile_id uuid, leave_type text, starts_on date, ends_on date,
  day_fraction numeric, workdays numeric, note text, status text,
  decided_by uuid, decided_at timestamptz, decision_note text, created_at timestamptz,
  profiles jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  return query
  select lr.id,lr.profile_id,lr.leave_type,lr.starts_on,lr.ends_on,lr.day_fraction,lr.workdays,
    case when lr.profile_id=me or private.has_permission('leave.manage')
      or (private.has_permission('leave.approve') and private.can_view_profile_team(lr.profile_id)) then lr.note end,
    lr.status,lr.decided_by,lr.decided_at,
    case when lr.profile_id=me or private.has_permission('leave.manage')
      or (private.has_permission('leave.approve') and private.can_view_profile_team(lr.profile_id)) then lr.decision_note end,
    lr.created_at,jsonb_build_object('id',p.id,'display_name',p.display_name)
  from public.leave_requests lr join public.profiles p on p.id=lr.profile_id
  where lr.organization_id=org and (
    lr.profile_id=me or private.has_permission('leave.manage')
    or ((private.has_permission('leave.view_team') or private.has_permission('leave.approve')) and private.can_view_profile_team(lr.profile_id))
  ) order by lr.created_at desc;
end;
$$;

create or replace function public.list_sick_leave_records()
returns table(
  id uuid, profile_id uuid, starts_on date, expected_end_on date, end_unknown boolean,
  certificate_status text, status text, created_at timestamptz, profiles jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  return query
  select sl.id,sl.profile_id,sl.starts_on,sl.expected_end_on,sl.end_unknown,
    case when sl.profile_id=me or private.has_permission('sick_leave.view_certificates') then sl.certificate_status end,
    sl.status,sl.created_at,jsonb_build_object('id',p.id,'display_name',p.display_name)
  from public.sick_leave_records sl join public.profiles p on p.id=sl.profile_id
  where sl.organization_id=org and (
    sl.profile_id=me or private.can_view_sick_status(sl.profile_id)
  ) order by sl.starts_on desc;
end;
$$;

create or replace function public.update_own_profile(p_display_name text, p_work_phone text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := private.current_profile_id();
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if length(trim(p_display_name)) not between 2 and 120 then raise exception 'invalid_display_name' using errcode='22023'; end if;
  if p_work_phone is not null and length(p_work_phone)>40 then raise exception 'invalid_work_phone' using errcode='22023'; end if;
  update public.profiles set display_name=trim(p_display_name) where id=me;
  update public.employee_profiles set work_phone=nullif(trim(p_work_phone),'') where profile_id=me;
end;
$$;

create or replace function public.activate_my_profile()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.profiles%rowtype;
begin
  select p.* into target from public.profiles p
  join public.organizations o on o.id=p.organization_id and o.active
  where p.auth_user_id=auth.uid() for update;
  if target.id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if target.status='active' then return; end if;
  if target.status<>'invited' then raise exception 'profile_cannot_be_activated' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'email_not_confirmed' using errcode='42501';
  end if;
  update public.profiles set status='active' where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,target.id,'user.invite_activated','profile',target.id,'{}');
end;
$$;

create or replace function public.admin_create_invited_profile(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role_id uuid,
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
  existing_org uuid;
  existing_status text;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_first_name)) not between 1 and 80 or length(trim(p_last_name)) not between 1 and 80 then raise exception 'invalid_name' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=lower(trim(p_email))) then
    raise exception 'auth_user_not_found' using errcode='23503';
  end if;
  if not exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=org and r.active) then
    raise exception 'role_not_available' using errcode='22023';
  end if;
  if exists(select 1 from public.roles r where r.id=p_role_id and r.organization_id=org and r.system_key='super_admin')
    and not private.has_permission('roles.manage') then raise exception 'super_admin_assignment_requires_role_management' using errcode='42501'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  select p.id,p.organization_id,p.status into result,existing_org,existing_status
  from public.profiles p where p.auth_user_id=p_auth_user_id for update;
  if result is not null then
    if existing_org<>org then raise exception 'auth_user_belongs_to_other_organization' using errcode='23514'; end if;
    if existing_status<>'invited' then raise exception 'account_already_initialized' using errcode='23505'; end if;
    return result;
  end if;
  insert into public.profiles(auth_user_id,organization_id,display_name,email,status)
  values(p_auth_user_id,org,trim(p_first_name)||' '||trim(p_last_name),lower(trim(p_email)),'invited')
  returning id into result;
  insert into public.employee_profiles(profile_id,organization_id,first_name,last_name)
  values(result,org,trim(p_first_name),trim(p_last_name));
  insert into public.user_roles(profile_id,role_id,organization_id,assigned_by)
  values(result,p_role_id,org,me);
  if p_team_id is not null then
    insert into public.team_memberships(team_id,profile_id,organization_id) values(p_team_id,result,org);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'user.invited','profile',result,jsonb_build_object('email_domain',split_part(lower(trim(p_email)),'@',2)));
  return result;
end;
$$;

create or replace function public.bootstrap_first_admin(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  org constant uuid:='00000000-0000-4000-8000-000000000001'::uuid;
  super_role uuid;
  result uuid;
  existing_org uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if length(trim(p_first_name)) not between 1 and 80 or length(trim(p_last_name)) not between 1 and 80 then raise exception 'invalid_name' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null) then
    raise exception 'confirmed_auth_user_not_found' using errcode='23503';
  end if;
  if not exists(select 1 from public.organizations o where o.id=org and o.active) then raise exception 'bootstrap_organization_not_found' using errcode='P0002'; end if;
  select r.id into super_role from public.roles r where r.organization_id=org and r.system_key='super_admin' and r.active limit 1;
  if super_role is null then raise exception 'super_admin_role_not_found' using errcode='P0002'; end if;
  select p.id,p.organization_id into result,existing_org from public.profiles p where p.auth_user_id=p_auth_user_id for update;
  if result is not null and existing_org<>org then raise exception 'auth_user_already_belongs_to_other_organization' using errcode='23514'; end if;
  if exists (
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id
    join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id
    where ur.organization_id=org and r.system_key='super_admin' and r.active and p.status='active'
      and p.auth_user_id<>p_auth_user_id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) then raise exception 'bootstrap_already_completed' using errcode='42501'; end if;
  if result is null then
    insert into public.profiles(auth_user_id,organization_id,display_name,email,status)
    values(p_auth_user_id,org,trim(p_first_name)||' '||trim(p_last_name),lower(trim(p_email)),'active') returning id into result;
  else
    update public.profiles set display_name=trim(p_first_name)||' '||trim(p_last_name),email=lower(trim(p_email)),status='active',archived_at=null where id=result;
  end if;
  insert into public.employee_profiles(profile_id,organization_id,first_name,last_name,employment_status)
  values(result,org,trim(p_first_name),trim(p_last_name),'active')
  on conflict(profile_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,employment_status='active';
  if not exists(select 1 from public.user_roles ur where ur.profile_id=result and ur.role_id=super_role and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) then
    insert into public.user_roles(profile_id,role_id,organization_id,assigned_by) values(result,super_role,org,result);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  select org,result,'system.first_admin_bootstrapped','profile',result,'{}'
  where not exists(select 1 from public.audit_logs al where al.organization_id=org and al.action='system.first_admin_bootstrapped' and al.entity_id=result);
  return result;
end;
$$;

create or replace function public.admin_set_profile_status(p_profile_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  auth_id uuid;
  old_status text;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('invited','active','suspended','archived') then raise exception 'invalid_status' using errcode='22023'; end if;
  if p_profile_id=me and p_status in ('suspended','archived') then raise exception 'cannot_disable_own_account' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select auth_user_id,status into auth_id,old_status from public.profiles
  where id=p_profile_id and organization_id=org for update;
  if auth_id is null then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if old_status='invited' and p_status not in ('invited','archived') then raise exception 'invite_must_be_activated_by_user' using errcode='42501'; end if;
  if old_status<>'invited' and p_status='invited' then raise exception 'invalid_status_transition' using errcode='22023'; end if;
  if p_status='active' and not exists(select 1 from auth.users u where u.id=auth_id and u.email_confirmed_at is not null) then
    raise exception 'confirmed_auth_user_required' using errcode='42501';
  end if;
  if p_status in ('suspended','archived') and exists (
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id
    where ur.profile_id=p_profile_id and ur.organization_id=org and r.system_key='super_admin'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ) and (
    select count(distinct ur.profile_id) from public.user_roles ur join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
    join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id and p.status='active'
    where ur.organization_id=org and r.system_key='super_admin' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  )<=1 then raise exception 'last_super_admin_cannot_be_disabled' using errcode='42501'; end if;
  update public.profiles set status=p_status,archived_at=case when p_status='archived' then now() else null end where id=p_profile_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'user.status_changed','profile',p_profile_id,jsonb_build_object('from',old_status,'to',p_status));
  return auth_id;
end;
$$;

create or replace function public.admin_get_invite_target(p_profile_id uuid)
returns table(auth_user_id uuid, email text, status text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query select p.auth_user_id,p.email,p.status from public.profiles p
    where p.id=p_profile_id and p.organization_id=private.current_organization_id();
end;
$$;

create or replace function public.admin_lookup_invite_email(p_email text)
returns table(auth_user_id uuid, profile_id uuid, profile_status text, reusable_unconfirmed_auth boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  org uuid:=private.current_organization_id();
  target_auth uuid;
  confirmed_at timestamptz;
  target_metadata jsonb;
  target_profile uuid;
  target_profile_org uuid;
  target_status text;
begin
  if not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  select u.id,u.email_confirmed_at,u.raw_user_meta_data into target_auth,confirmed_at,target_metadata
  from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
  if target_auth is null then return; end if;
  select p.id,p.organization_id,p.status into target_profile,target_profile_org,target_status
  from public.profiles p where p.auth_user_id=target_auth;
  if target_profile is not null then
    if target_profile_org<>org then raise exception 'email_not_available' using errcode='23505'; end if;
    return query select target_auth,target_profile,target_status,false;
    return;
  end if;
  if confirmed_at is not null then raise exception 'email_not_available' using errcode='23505'; end if;
  if coalesce(target_metadata->>'organization_id','')<>org::text then
    raise exception 'email_not_available' using errcode='23505';
  end if;
  return query select target_auth,null::uuid,null::text,true;
end;
$$;

create or replace function public.admin_begin_invite_resend(p_profile_id uuid, p_request_id uuid)
returns table(auth_user_id uuid, email text, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.profiles%rowtype;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invite-resend:'||p_profile_id::text,0));
  select * into target from public.profiles p where p.id=p_profile_id and p.organization_id=org for update;
  if target.id is null or target.status<>'invited' then raise exception 'invite_not_available' using errcode='22023'; end if;
  if exists(select 1 from public.audit_logs al where al.organization_id=org and al.entity_id=target.id
    and al.action='user.invite_resend_started' and al.created_at>now()-interval '60 seconds') then
    raise exception 'invite_cooldown' using errcode='P0001';
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  values(org,me,'user.invite_resend_started','profile',target.id,p_request_id,'{}');
  return query select target.auth_user_id,target.email,target.status;
end;
$$;

create or replace function public.set_user_role(p_profile_id uuid, p_role_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); role_key text; active_count integer;
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  if p_profile_id=me then raise exception 'cannot_change_own_roles' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  select system_key into role_key from public.roles where id=p_role_id and organization_id=org and active;
  if not found then raise exception 'role_not_available' using errcode='22023'; end if;
  if role_key='super_admin' and not private.has_permission('roles.manage') then raise exception 'super_admin_assignment_requires_role_management' using errcode='42501'; end if;
  if not p_enabled and role_key='super_admin' then
    select count(distinct ur.profile_id) into active_count from public.user_roles ur
      join public.roles r on r.id=ur.role_id and r.organization_id=ur.organization_id and r.active
      join public.profiles p on p.id=ur.profile_id and p.organization_id=ur.organization_id and p.status='active'
      where ur.organization_id=org and r.system_key='super_admin' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now());
    if active_count<=1 then raise exception 'last_super_admin_role_cannot_be_removed' using errcode='42501'; end if;
  end if;
  if p_enabled then
    if not exists(select 1 from public.user_roles ur where ur.profile_id=p_profile_id and ur.role_id=p_role_id and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())) then
      insert into public.user_roles(profile_id,role_id,organization_id,assigned_by) values(p_profile_id,p_role_id,org,me);
    end if;
  else
    update public.user_roles set valid_until=now() where profile_id=p_profile_id and role_id=p_role_id and valid_from<=now() and (valid_until is null or valid_until>now());
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when p_enabled then 'user.role_assigned' else 'user.role_revoked' end,'profile',p_profile_id,
    jsonb_build_object('role_id',p_role_id));
end;
$$;

create or replace function public.set_role_permission(p_role_id uuid, p_permission_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id();
  org uuid:=private.current_organization_id();
  role_key text;
  changed integer:=0;
begin
  if me is null or not private.has_permission('roles.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('super-admin:'||org::text,0));
  select r.system_key into role_key from public.roles r
  where r.id=p_role_id and r.organization_id=org and r.active for update;
  if not found then raise exception 'role_not_available' using errcode='22023'; end if;
  if not exists(select 1 from public.permissions p where p.key=p_permission_key) then
    raise exception 'permission_not_available' using errcode='22023';
  end if;
  if role_key='super_admin' and not p_enabled and p_permission_key in ('users.manage','roles.manage') then
    raise exception 'protected_super_admin_permission' using errcode='42501';
  end if;
  if p_enabled then
    insert into public.role_permissions(role_id,permission_key) values(p_role_id,p_permission_key)
    on conflict do nothing;
    get diagnostics changed=row_count;
  else
    delete from public.role_permissions where role_id=p_role_id and permission_key=p_permission_key;
    get diagnostics changed=row_count;
  end if;
  if changed>0 then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,case when p_enabled then 'role.permission_granted' else 'role.permission_revoked' end,
      'role',p_role_id,jsonb_build_object('permission_key',p_permission_key));
  end if;
end;
$$;

create or replace function public.set_user_team(p_profile_id uuid, p_team_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_permission('users.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  if not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then raise exception 'team_not_available' using errcode='22023'; end if;
  if p_enabled then
    if not exists(select 1 from public.team_memberships tm where tm.profile_id=p_profile_id and tm.team_id=p_team_id and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)) then
      insert into public.team_memberships(team_id,profile_id,organization_id,valid_from,valid_until)
      values(p_team_id,p_profile_id,org,current_date,null)
      on conflict(team_id,profile_id,valid_from) do update set valid_until=null;
    end if;
  else
    delete from public.team_memberships where team_id=p_team_id and profile_id=p_profile_id and valid_from=current_date;
    update public.team_memberships set valid_until=current_date-1 where team_id=p_team_id and profile_id=p_profile_id
      and valid_from<current_date and (valid_until is null or valid_until>=current_date);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when p_enabled then 'user.team_assigned' else 'user.team_revoked' end,'profile',p_profile_id,
    jsonb_build_object('team_id',p_team_id));
end;
$$;

-- Messaging APIs --------------------------------------------------------------

create or replace function public.get_or_create_direct_conversation(other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id();
  org uuid := private.current_organization_id();
  result uuid;
  pair_key text;
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  if other_profile_id=me then raise exception 'self_conversation_not_allowed' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=other_profile_id and p.organization_id=org and p.status='active') then
    raise exception 'profile_not_available' using errcode='22023';
  end if;
  pair_key := least(me::text,other_profile_id::text)||':'||greatest(me::text,other_profile_id::text);
  perform pg_advisory_xact_lock(hashtextextended(org::text||pair_key,0));
  select c.id into result from public.conversations c
  where c.organization_id=org and c.type='direct' and c.direct_key=pair_key and c.archived_at is null limit 1;
  if result is null then
    select c.id into result from public.conversations c
    where c.organization_id=org and c.type='direct' and c.archived_at is null
      and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=me)
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.profile_id=other_profile_id)
    order by c.created_at limit 1;
    if result is not null then update public.conversations set direct_key=pair_key where id=result and direct_key is null; end if;
  end if;
  if result is null then
    insert into public.conversations(organization_id,type,created_by,direct_key)
    values(org,'direct',me,pair_key) returning id into result;
    insert into public.conversation_members(conversation_id,profile_id,organization_id)
    values(result,me,org),(result,other_profile_id,org);
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'conversation.direct_created','conversation',result,'{}');
  end if;
  return result;
end;
$$;

create or replace function public.create_group_conversation(
  p_name text,
  p_member_ids uuid[],
  p_type text default 'group',
  p_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := private.current_profile_id(); org uuid := private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_type not in ('group','team','announcement') then raise exception 'invalid_conversation_type' using errcode='22023'; end if;
  if length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name' using errcode='22023'; end if;
  if p_type='announcement' and not private.has_permission('news.publish') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_type='team' and (p_team_id is null or not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active)) then
    raise exception 'valid_team_required' using errcode='22023';
  end if;
  if p_type='team' and not (
    private.has_permission('teams.manage')
    or exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.lead_profile_id=me and t.active)
  ) then raise exception 'team_conversation_permission_required' using errcode='42501'; end if;
  if p_type<>'team' and p_team_id is not null then raise exception 'team_not_allowed' using errcode='22023'; end if;
  if exists (select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) as member_ids(mid) where not private.is_same_org_profile(mid)) then
    raise exception 'member_not_available' using errcode='22023';
  end if;
  if p_type='team' and exists (
    select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) member_ids(mid)
    where not exists(select 1 from public.team_memberships tm join public.profiles p on p.id=tm.profile_id and p.status='active'
      where tm.team_id=p_team_id and tm.profile_id=mid and tm.organization_id=org
        and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date))
  ) then raise exception 'team_member_required' using errcode='22023'; end if;
  insert into public.conversations(organization_id,type,name,team_id,created_by,posting_restricted)
  values(org,p_type,trim(p_name),p_team_id,me,p_type='announcement') returning id into result;
  insert into public.conversation_members(conversation_id,profile_id,organization_id)
  select result,member_id,org from (
    select distinct unnest(array_append(coalesce(p_member_ids,'{}'::uuid[]),me)) as member_id
  ) members;
  perform private.create_notification(org,cm.profile_id,'message','Neue interne Unterhaltung',
    'Sie wurden zu einer internen Unterhaltung hinzugefügt.','/app/messages/'||result::text,
    'conversation-created:'||result::text||':'||cm.profile_id::text)
  from public.conversation_members cm
  where cm.conversation_id=result and cm.profile_id<>me
    and private.profile_has_permission(cm.profile_id,org,'messages.use');
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'conversation.group_created','conversation',result,jsonb_build_object('type',p_type));
  return result;
end;
$$;

create or replace function public.list_conversations()
returns table(
  id uuid,
  type text,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  conversation_members jsonb,
  messages jsonb,
  last_message jsonb,
  unread_count bigint,
  muted_until timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not private.has_permission('messages.use') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query
  select c.id,c.type,c.name,c.created_at,c.updated_at,
    coalesce(member_rows.members,'[]'::jsonb),
    case when latest.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'id',latest.id,'body',latest.body,'created_at',latest.created_at,
      'sender_id',latest.sender_id,'retracted_at',latest.retracted_at
    )) end,
    case when latest.id is null then null else jsonb_build_object(
      'id',latest.id,'body',latest.body,'created_at',latest.created_at,
      'sender_id',latest.sender_id,'retracted_at',latest.retracted_at
    ) end,
    (select count(*)
      from public.messages unread
      where unread.conversation_id=c.id and unread.sender_id<>me and unread.created_at>=self_member.joined_at
        and not exists(select 1 from public.message_read_receipts rr where rr.message_id=unread.id and rr.profile_id=me)
    )::bigint,
    self_member.muted_until
  from public.conversation_members self_member
  join public.conversations c on c.id=self_member.conversation_id and c.organization_id=self_member.organization_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'profile_id',cm.profile_id,
      'profiles',jsonb_build_object('display_name',p.display_name)
    ) order by p.display_name,cm.profile_id) members
    from public.conversation_members cm join public.profiles p on p.id=cm.profile_id and p.organization_id=cm.organization_id
    where cm.conversation_id=c.id and cm.organization_id=org
  ) member_rows on true
  left join lateral (
    select m.id,m.body,m.created_at,m.sender_id,m.retracted_at
    from public.messages m where m.conversation_id=c.id
    order by m.created_at desc,m.id desc limit 1
  ) latest on true
  where self_member.profile_id=me and self_member.organization_id=org and c.archived_at is null
  order by c.updated_at desc,c.created_at desc;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_client_nonce uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.can_post_conversation(p_conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_body)) not between 1 and 10000 then raise exception 'invalid_message' using errcode='22023'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id=p_reply_to_id and m.conversation_id=p_conversation_id) then
    raise exception 'invalid_reply_target' using errcode='22023';
  end if;
  if p_client_nonce is not null then
    select id into result from public.messages where sender_id=me and client_nonce=p_client_nonce;
    if result is not null then return result; end if;
  end if;
  insert into public.messages(organization_id,conversation_id,sender_id,reply_to_id,body,client_nonce)
  values(org,p_conversation_id,me,p_reply_to_id,trim(p_body),p_client_nonce) returning id into result;
  update public.conversations set updated_at=now() where id=p_conversation_id;
  perform private.create_notification(org,cm.profile_id,'message','Neue interne Nachricht','Sie haben eine neue interne Nachricht erhalten.',
    '/app/messages/'||p_conversation_id::text,'message:'||result::text||':'||cm.profile_id::text)
  from public.conversation_members cm
  join public.profiles p on p.id=cm.profile_id and p.status='active'
  where cm.conversation_id=p_conversation_id and cm.profile_id<>me and (cm.muted_until is null or cm.muted_until<=now())
    and private.profile_has_permission(cm.profile_id,org,'messages.use');
  return result;
end;
$$;

create or replace function public.edit_message(p_message_id uuid, p_new_body text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.messages%rowtype; window_minutes integer;
begin
  select * into target from public.messages where id=p_message_id for update;
  if target.id is null or target.sender_id<>private.current_profile_id() or not private.is_conversation_member(target.conversation_id) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  select message_edit_window_minutes into window_minutes from public.organization_settings where organization_id=target.organization_id;
  if target.retracted_at is not null or target.created_at<=now()-make_interval(mins=>coalesce(window_minutes,15)) then
    raise exception 'edit_window_expired' using errcode='22023';
  end if;
  if length(trim(p_new_body)) not between 1 and 10000 then raise exception 'invalid_message' using errcode='22023'; end if;
  update public.messages set body=trim(p_new_body) where id=p_message_id;
end;
$$;

create or replace function public.retract_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.messages%rowtype; window_minutes integer; me uuid:=private.current_profile_id();
begin
  select * into target from public.messages where id=p_message_id for update;
  if target.id is null or me is null or not private.is_conversation_member(target.conversation_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  select message_edit_window_minutes into window_minutes from public.organization_settings where organization_id=target.organization_id;
  if target.sender_id<>me and not private.has_permission('messages.moderate') then raise exception 'permission_denied' using errcode='42501'; end if;
  if target.sender_id=me and target.created_at<=now()-make_interval(mins=>coalesce(window_minutes,15)) then raise exception 'retract_window_expired' using errcode='22023'; end if;
  update public.messages set body='Nachricht wurde zurückgezogen.',retracted_at=coalesce(retracted_at,now()),retracted_by=me where id=p_message_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,me,'message.retracted','message',target.id,jsonb_build_object('reason_provided',nullif(trim(p_reason),'') is not null));
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and profile_id=private.current_profile_id() and organization_id=private.current_organization_id()
$$;
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare affected integer; begin
  update public.notifications set read_at=now() where profile_id=private.current_profile_id() and organization_id=private.current_organization_id() and read_at is null;
  get diagnostics affected=row_count; return affected;
end $$;

create or replace function public.save_news_post(
  p_title text,
  p_summary text,
  p_body text,
  p_priority text,
  p_ack_required boolean,
  p_action text,
  p_team_id uuid default null,
  p_news_id uuid default null,
  p_scheduled_for timestamptz default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; final_status text; target public.news_posts%rowtype; is_new boolean:=p_news_id is null;
begin
  if me is null or (is_new and not private.has_permission('news.create')) then raise exception 'permission_denied' using errcode='42501'; end if;
  final_status := case
    when p_action in ('publish','published') then 'published'
    when p_action in ('schedule','scheduled') then 'scheduled'
    when p_action in ('archive','archived') then 'archived'
    when p_action='draft' then 'draft' else null end;
  if final_status is null or p_priority not in ('normal','important','critical')
    or length(trim(p_title)) not between 3 and 180 or length(trim(p_summary)) not between 3 and 500
    or length(trim(p_body)) not between 3 and 20000 then raise exception 'invalid_news_post' using errcode='22023'; end if;
  if final_status in ('published','scheduled') and not private.has_permission('news.publish')
    and not (
      not is_new and final_status='published' and private.has_permission('news.manage')
      and exists(select 1 from public.news_posts existing where existing.id=p_news_id and existing.organization_id=org and existing.status='published')
    ) then raise exception 'publish_permission_required' using errcode='42501'; end if;
  if final_status='archived' and not private.has_permission('news.manage') then raise exception 'manage_permission_required' using errcode='42501'; end if;
  if is_new and final_status='archived' then raise exception 'new_news_cannot_be_archived' using errcode='22023'; end if;
  if final_status='scheduled' and (p_scheduled_for is null or p_scheduled_for<=now()) then raise exception 'future_schedule_required' using errcode='22023'; end if;
  if final_status<>'archived' and p_expires_at is not null and p_expires_at<=now() then raise exception 'expiry_must_be_future' using errcode='22023'; end if;
  if final_status='scheduled' and p_expires_at is not null and p_expires_at<=p_scheduled_for then raise exception 'expiry_must_follow_schedule' using errcode='22023'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  if is_new then
    insert into public.news_posts(organization_id,title,summary,body,status,priority,author_id,published_by,published_at,scheduled_for,expires_at,archived_at,acknowledgement_required)
    values(org,trim(p_title),trim(p_summary),trim(p_body),final_status,p_priority,me,
      case when final_status='published' then me end,case when final_status='published' then now() end,
      case when final_status='scheduled' then p_scheduled_for end,p_expires_at,case when final_status='archived' then now() end,p_ack_required)
    returning id into result;
  else
    select * into target from public.news_posts where id=p_news_id and organization_id=org for update;
    if target.id is null or not (private.has_permission('news.manage') or (target.author_id=me and private.has_permission('news.create'))) then raise exception 'news_not_editable' using errcode='42501'; end if;
    if target.status='published' and final_status in ('draft','scheduled') then raise exception 'published_news_cannot_be_unpublished' using errcode='22023'; end if;
    if target.status='archived' then raise exception 'archived_news_is_immutable' using errcode='22023'; end if;
    update public.news_posts set title=trim(p_title),summary=trim(p_summary),body=trim(p_body),priority=p_priority,
      acknowledgement_required=p_ack_required,status=final_status,
      scheduled_for=case when final_status='scheduled' then p_scheduled_for end,
      expires_at=p_expires_at,published_by=case when final_status='published' then me else published_by end,
      published_at=case when final_status='published' then coalesce(published_at,now()) else published_at end,
      archived_at=case when final_status='archived' then coalesce(archived_at,now()) else null end
    where id=target.id returning id into result;
    delete from public.news_audiences where news_id=result;
  end if;
  insert into public.news_audiences(organization_id,news_id,audience_type,team_id)
  values(org,result,case when p_team_id is null then 'organization' else 'team' end,p_team_id);
  if final_status='published' then
    perform private.create_notification(org,p.id,case when p_ack_required then 'news_ack_required' else 'news' end,
      case when p_priority='critical' then 'Kritische interne Mitteilung' else 'Neue interne Mitteilung' end,
      case when p_ack_required then 'Eine neue Mitteilung erfordert Ihre Lesebestätigung.' else 'Eine neue interne Mitteilung wurde veröffentlicht.' end,
      '/app/news/'||result::text,'news-published:'||result::text||':'||p.id::text)
    from public.profiles p
    where p.organization_id=org and p.status='active'
      and (p_team_id is null or private.is_team_member(p_team_id,p.id))
      and private.profile_has_permission(p.id,org,'news.view');
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,case when is_new then 'news.created' else 'news.updated' end,'news_post',result,
    jsonb_build_object('status',final_status,'audience',case when p_team_id is null then 'organization' else 'team' end));
  return result;
end;
$$;

create or replace function public.publish_scheduled_news(p_news_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.news_posts%rowtype; inserted_count integer:=0;
begin
  select * into target from public.news_posts where id=p_news_id for update;
  if target.id is null then raise exception 'news_not_found' using errcode='P0002'; end if;
  if target.status<>'scheduled' or target.scheduled_for is null then raise exception 'news_not_scheduled' using errcode='22023'; end if;
  if target.scheduled_for>now() then raise exception 'news_not_due' using errcode='22023'; end if;
  if target.expires_at is not null and target.expires_at<=now() then
    update public.news_posts set status='archived',archived_at=now(),scheduled_for=null where id=target.id;
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(target.organization_id,null,'news.scheduled_expired','news_post',target.id,'{}');
    return 0;
  end if;
  update public.news_posts set status='published',published_at=coalesce(published_at,now()),scheduled_for=null where id=target.id;
  with recipient_ids as (
    select p.id
    from public.profiles p
    where p.organization_id=target.organization_id and p.status='active'
      and (
        not exists(select 1 from public.news_audiences na where na.news_id=target.id)
        or exists(select 1 from public.news_audiences na where na.news_id=target.id and na.audience_type='organization')
      )
    union
    select na.profile_id from public.news_audiences na join public.profiles p on p.id=na.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='profile'
    union
    select tm.profile_id from public.news_audiences na join public.team_memberships tm on tm.team_id=na.team_id and tm.organization_id=na.organization_id
      join public.profiles p on p.id=tm.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='team' and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    union
    select ep.profile_id from public.news_audiences na join public.employee_profiles ep on ep.location_id=na.location_id and ep.organization_id=na.organization_id
      join public.profiles p on p.id=ep.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='location'
    union
    select ur.profile_id from public.news_audiences na join public.user_roles ur on ur.role_id=na.role_id and ur.organization_id=na.organization_id
      join public.profiles p on p.id=ur.profile_id and p.status='active'
      where na.news_id=target.id and na.audience_type='role' and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  )
  insert into public.notifications(organization_id,profile_id,type,title,body,target_path,deduplication_key)
  select target.organization_id,r.id,case when target.acknowledgement_required then 'news_ack_required' else 'news' end,
    case when target.priority='critical' then 'Kritische interne Mitteilung' else 'Neue interne Mitteilung' end,
    case when target.acknowledgement_required then 'Eine neue Mitteilung erfordert Ihre Lesebestätigung.' else 'Eine neue interne Mitteilung wurde veröffentlicht.' end,
    '/app/news/'||target.id::text,'news-published:'||target.id::text||':'||r.id::text
  from recipient_ids r
  where private.profile_has_permission(r.id,target.organization_id,'news.view')
  on conflict(profile_id,deduplication_key) do nothing;
  get diagnostics inserted_count=row_count;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.organization_id,null,'news.scheduled_published','news_post',target.id,jsonb_build_object('recipient_count',inserted_count));
  return inserted_count;
end;
$$;

create or replace function private.can_consume_news(p_news_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.news_posts n
    where n.id=p_news_id and n.organization_id=private.current_organization_id()
      and n.status='published' and coalesce(n.published_at,n.created_at)<=now()
      and (n.expires_at is null or n.expires_at>now())
      and private.has_permission('news.view') and private.is_news_audience(n.id)
  )
$$;

create or replace function public.mark_news_opened(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id();
begin
  if me is null or not private.can_consume_news(p_news_id) then raise exception 'news_not_available' using errcode='42501'; end if;
  insert into public.news_reads(news_id,profile_id,opened_at)
  values(p_news_id,me,now()) on conflict(news_id,profile_id) do nothing;
end;
$$;

create or replace function public.acknowledge_news(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); already_acknowledged boolean;
begin
  if me is null or not private.can_consume_news(p_news_id) then raise exception 'news_not_available' using errcode='42501'; end if;
  if not exists(select 1 from public.news_posts n where n.id=p_news_id and n.acknowledgement_required) then
    raise exception 'acknowledgement_not_required' using errcode='22023';
  end if;
  select nr.acknowledged_at is not null into already_acknowledged
  from public.news_reads nr where nr.news_id=p_news_id and nr.profile_id=me for update;
  insert into public.news_reads(news_id,profile_id,opened_at,acknowledged_at)
  values(p_news_id,me,now(),now())
  on conflict(news_id,profile_id) do update set acknowledged_at=coalesce(public.news_reads.acknowledged_at,excluded.acknowledged_at);
  if not coalesce(already_acknowledged,false) then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(org,me,'news.acknowledged','news_post',p_news_id,'{}');
  end if;
end;
$$;

create or replace function public.news_read_stats(p_news_id uuid)
returns table(target_count bigint, opened_count bigint, acknowledged_count bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare org uuid:=private.current_organization_id();
begin
  if not private.has_permission('news.manage') or not exists(select 1 from public.news_posts n where n.id=p_news_id and n.organization_id=org) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query
  with audience_recipients as (
    select p.id from public.profiles p where p.organization_id=org and p.status='active' and (
      not exists(select 1 from public.news_audiences na where na.news_id=p_news_id)
      or exists(select 1 from public.news_audiences na where na.news_id=p_news_id and na.audience_type='organization'))
    union select na.profile_id from public.news_audiences na join public.profiles p on p.id=na.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='profile'
    union select tm.profile_id from public.news_audiences na join public.team_memberships tm on tm.team_id=na.team_id and tm.organization_id=na.organization_id
      join public.profiles p on p.id=tm.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='team'
      and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    union select ep.profile_id from public.news_audiences na join public.employee_profiles ep on ep.location_id=na.location_id and ep.organization_id=na.organization_id
      join public.profiles p on p.id=ep.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='location'
    union select ur.profile_id from public.news_audiences na join public.user_roles ur on ur.role_id=na.role_id and ur.organization_id=na.organization_id
      join public.profiles p on p.id=ur.profile_id and p.status='active' where na.news_id=p_news_id and na.audience_type='role'
      and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
  ), recipients as (
    select ar.id from audience_recipients ar where private.profile_has_permission(ar.id,org,'news.view')
  )
  select (select count(*) from recipients),
    (select count(*) from public.news_reads nr join recipients r on r.id=nr.profile_id where nr.news_id=p_news_id),
    (select count(*) from public.news_reads nr join recipients r on r.id=nr.profile_id where nr.news_id=p_news_id and nr.acknowledged_at is not null);
end;
$$;

create or replace function private.can_manage_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.documents d
    where d.id=p_document_id and d.organization_id=private.current_organization_id()
      and (
        (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
        or private.has_permission('documents.manage_employee_files')
        or (d.sensitivity<>'employee_file' and d.visibility='personal' and d.owner_profile_id=private.current_profile_id()
          and private.has_permission('documents.manage') and private.has_permission('documents.view_own'))
      )
  )
$$;

drop function if exists public.create_document_upload(text,text,uuid);
create or replace function public.create_employee_document_upload(
  p_profile_id uuid,
  p_title text,
  p_folder_id uuid default null,
  p_category_id uuid default null,
  p_ack_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.manage_employee_files') then raise exception 'permission_denied' using errcode='42501'; end if;
  if not private.is_same_org_profile(p_profile_id) then raise exception 'profile_not_available' using errcode='22023'; end if;
  if length(trim(p_title)) not between 2 and 180 then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_folder_id is not null and not exists(select 1 from public.document_folders f where f.id=p_folder_id and f.organization_id=org) then raise exception 'folder_not_available' using errcode='22023'; end if;
  if p_category_id is not null and not exists(select 1 from public.document_categories dc where dc.id=p_category_id and dc.organization_id=org and dc.active) then raise exception 'category_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required,sensitivity)
  values(org,trim(p_title),'personal',p_profile_id,me,'draft',p_folder_id,p_category_id,p_ack_required,'employee_file') returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,profile_id)
  values(org,result,'profile',p_profile_id);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'employee_document.draft_created','document',result,jsonb_build_object('owner_profile_id',p_profile_id));
  return result;
end;
$$;

create or replace function public.create_document_upload(
  p_title text,
  p_visibility text,
  p_team_id uuid default null,
  p_folder_id uuid default null,
  p_category_id uuid default null,
  p_ack_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_title)) not between 2 and 180 or p_visibility not in ('organization','team','personal') then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_visibility='personal' and not private.has_permission('documents.view_own') then raise exception 'personal_document_permission_required' using errcode='42501'; end if;
  if p_visibility='team' and (p_team_id is null or not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active)) then
    raise exception 'valid_team_required' using errcode='22023';
  end if;
  if p_visibility<>'team' and p_team_id is not null then raise exception 'team_not_allowed' using errcode='22023'; end if;
  if p_folder_id is not null and not exists(select 1 from public.document_folders f where f.id=p_folder_id and f.organization_id=org) then raise exception 'folder_not_available' using errcode='22023'; end if;
  if p_category_id is not null and not exists(select 1 from public.document_categories dc where dc.id=p_category_id and dc.organization_id=org and dc.active) then raise exception 'category_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required)
  values(org,trim(p_title),p_visibility,case when p_visibility='personal' then me end,me,'draft',p_folder_id,p_category_id,p_ack_required) returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,team_id,profile_id)
  values(org,result,case p_visibility when 'organization' then 'organization' when 'team' then 'team' else 'profile' end,
    case when p_visibility='team' then p_team_id end,case when p_visibility='personal' then me end);
  return result;
end;
$$;

create or replace function public.finalize_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.documents%rowtype; version_path text; expected_bucket text;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) or target.status<>'draft' then raise exception 'document_not_finalizable' using errcode='22023'; end if;
  select dv.storage_path into version_path from public.document_versions dv
  where dv.document_id=target.id and dv.organization_id=org and dv.is_current and dv.deleted_at is null order by dv.version desc limit 1;
  expected_bucket:=case when target.sensitivity='employee_file' then 'employee-documents' else 'documents' end;
  if version_path is null or not exists(select 1 from storage.objects so where so.bucket_id=expected_bucket and so.name=version_path) then
    raise exception 'document_file_missing' using errcode='23514';
  end if;
  update public.documents set status='published' where id=target.id;
  perform private.create_notification(org,p.id,'document','Neues Dokument','Ein neues internes Dokument wurde bereitgestellt.',
    '/app/documents/'||target.id::text,'document-published:'||target.id::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active'
    and private.profile_can_access_document(p.id,target.id,org);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.published','document',target.id,jsonb_build_object('visibility',target.visibility));
end;
$$;

create or replace function public.add_document_version(
  p_document_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
  target public.documents%rowtype; result uuid; next_version integer; reset_count integer:=0; expected_bucket text;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) or target.status='archived' then raise exception 'document_not_versionable' using errcode='42501'; end if;
  if length(trim(p_original_name)) not between 1 and 255
    or p_mime_type not in ('image/jpeg','image/png','application/pdf')
    or p_size_bytes not between 1 and 20971520
    or length(coalesce(p_change_note,''))>500 then raise exception 'invalid_document_version' using errcode='22023'; end if;
  expected_bucket:=case when target.sensitivity='employee_file' then 'employee-documents' else 'documents' end;
  if (storage.foldername(p_storage_path))[1] is distinct from org::text
    or (target.sensitivity='employee_file' and (
      (storage.foldername(p_storage_path))[2] is distinct from target.owner_profile_id::text
      or (storage.foldername(p_storage_path))[3] is distinct from target.id::text
    ))
    or (target.sensitivity<>'employee_file' and (storage.foldername(p_storage_path))[2] is distinct from target.id::text)
    or not exists(select 1 from storage.objects so where so.bucket_id=expected_bucket and so.name=p_storage_path) then
    raise exception 'document_file_missing_or_misplaced' using errcode='23514';
  end if;
  select coalesce(max(dv.version),0)+1 into next_version from public.document_versions dv where dv.document_id=target.id;
  update public.document_versions set is_current=false where document_id=target.id and is_current and deleted_at is null;
  insert into public.document_versions(organization_id,document_id,version,storage_path,mime_type,size_bytes,uploaded_by,original_name,change_note,is_current)
  values(org,target.id,next_version,p_storage_path,p_mime_type,p_size_bytes,me,trim(p_original_name),nullif(trim(p_change_note),''),true)
  returning id into result;
  delete from public.document_acknowledgements where document_id=target.id;
  get diagnostics reset_count=row_count;
  update public.documents set updated_at=now() where id=target.id;
  if target.status='published' then
    perform private.create_notification(org,p.id,case when target.acknowledgement_required then 'document_ack_required' else 'document' end,
      'Neue Dokumentversion','Ein internes Dokument wurde aktualisiert.',
      '/app/documents/'||target.id::text,'document-version:'||result::text||':'||p.id::text)
    from public.profiles p where p.organization_id=org and p.status='active'
      and private.profile_can_access_document(p.id,target.id,org);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.version_added','document',target.id,
    jsonb_build_object('version',next_version,'acknowledgements_reset',reset_count));
  return result;
end;
$$;

create or replace function public.archive_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.documents%rowtype;
begin
  if me is null then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into target from public.documents where id=p_document_id and organization_id=org for update;
  if target.id is null or not private.can_manage_document(target.id) then raise exception 'document_not_manageable' using errcode='42501'; end if;
  if target.status='archived' then return; end if;
  update public.documents set status='archived',archived_at=now() where id=target.id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'document.archived','document',target.id,jsonb_build_object('previous_status',target.status));
end;
$$;

-- Scheduling -----------------------------------------------------------------

create or replace function public.save_shift(
  p_shift_id uuid,
  p_team_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_assignee_ids uuid[],
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
  assignee uuid; old_row public.shifts%rowtype; conflict_label text;
begin
  if me is null or not private.has_permission('schedule.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('draft','published','changed','cancelled') then raise exception 'invalid_shift_status' using errcode='22023'; end if;
  if p_status='cancelled' and p_shift_id is null then raise exception 'new_shift_cannot_be_cancelled' using errcode='22023'; end if;
  if p_status in ('published','changed') and not private.has_permission('schedule.publish') then raise exception 'publish_permission_required' using errcode='42501'; end if;
  if p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '24 hours' then raise exception 'invalid_shift_period' using errcode='22023'; end if;
  if length(trim(p_title)) not between 1 and 160 then raise exception 'invalid_title' using errcode='22023'; end if;
  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.organization_id=org and t.active) then
    raise exception 'team_not_available' using errcode='22023';
  end if;
  if p_status='cancelled' and exists (
    select 1 from unnest(coalesce(p_assignee_ids,'{}'::uuid[])) as cancelled_assignees(aid)
    where not exists(select 1 from public.profiles p where p.id=aid and p.organization_id=org)
  ) then raise exception 'assignee_organization_mismatch' using errcode='23514'; end if;
  if p_status<>'cancelled' and exists (
    select 1 from unnest(coalesce(p_assignee_ids,'{}'::uuid[])) as assignee_ids(aid)
    where not exists (
      select 1 from public.profiles p join public.employee_profiles ep on ep.profile_id=p.id
      where p.id=aid and p.organization_id=org and p.status='active' and ep.employment_status='active'
        and (ep.start_date is null or ep.start_date<=p_starts_at::date)
        and (ep.end_date is null or ep.end_date>=p_ends_at::date)
    )
  ) then raise exception 'inactive_assignee' using errcode='23514'; end if;

  for assignee in select distinct aid from unnest(case when p_status='cancelled' then '{}'::uuid[] else coalesce(p_assignee_ids,'{}'::uuid[]) end) as assignee_ids(aid) order by aid
  loop
    perform pg_advisory_xact_lock(hashtextextended(org::text||assignee::text,0));
    if exists (
      select 1 from public.shift_assignments sa join public.shifts s on s.id=sa.shift_id
      where sa.profile_id=assignee and s.organization_id=org and s.status<>'cancelled'
        and (p_shift_id is null or s.id<>p_shift_id)
        and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
    ) then conflict_label:='overlapping_shift';
    elsif exists (
      select 1 from public.leave_requests lr where lr.profile_id=assignee and lr.organization_id=org and lr.status='approved'
        and daterange(lr.starts_on,lr.ends_on,'[]') && daterange(p_starts_at::date,p_ends_at::date,'[]')
    ) then conflict_label:='approved_leave';
    elsif exists (
      select 1 from public.sick_leave_records sl where sl.profile_id=assignee and sl.organization_id=org and sl.status not in ('closed','cancelled')
        and daterange(sl.starts_on,coalesce(sl.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_at::date,p_ends_at::date,'[]')
    ) then conflict_label:='sick_leave';
    else conflict_label:=null;
    end if;
    if conflict_label is not null then raise exception 'shift_conflict:%',conflict_label using errcode='23P01'; end if;
  end loop;

  if p_shift_id is null then
    insert into public.shifts(organization_id,team_id,title,starts_at,ends_at,status,created_by,published_at)
    values(org,p_team_id,trim(p_title),p_starts_at,p_ends_at,p_status,me,case when p_status in ('published','changed') then now() end)
    returning id into result;
    insert into public.schedule_change_log(organization_id,shift_id,actor_id,change_type,after_data)
    values(org,result,me,'created',jsonb_build_object('status',p_status,'starts_at',p_starts_at,'ends_at',p_ends_at));
  else
    select * into old_row from public.shifts where id=p_shift_id and organization_id=org for update;
    if old_row.id is null then raise exception 'shift_not_found' using errcode='P0002'; end if;
    update public.shifts set team_id=p_team_id,title=trim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,status=p_status,
      published_at=case when p_status in ('published','changed') then coalesce(published_at,now()) else published_at end
    where id=p_shift_id returning id into result;
    insert into public.schedule_change_log(organization_id,shift_id,actor_id,change_type,before_data,after_data)
    values(org,result,me,case when p_status='cancelled' then 'cancelled' else 'updated' end,
      jsonb_build_object('status',old_row.status,'starts_at',old_row.starts_at,'ends_at',old_row.ends_at),
      jsonb_build_object('status',p_status,'starts_at',p_starts_at,'ends_at',p_ends_at));
    delete from public.shift_assignments where shift_id=result;
  end if;
  insert into public.shift_assignments(shift_id,profile_id,organization_id)
  select result,aid,org from (select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])) aid) assignees;
  if p_status in ('published','changed','cancelled') then
    perform private.create_notification(org,aid,'schedule',case when p_status='cancelled' then 'Schicht abgesagt' else 'Dienstplan aktualisiert' end,
      case when p_status='cancelled' then 'Eine zugewiesene Schicht wurde abgesagt.' else 'Eine Schicht wurde veröffentlicht oder geändert.' end,
      '/app/schedule','shift:'||result::text||':'||p_status||':'||extract(epoch from date_trunc('minute',now()))::bigint::text)
    from (select distinct unnest(coalesce(p_assignee_ids,'{}'::uuid[])) aid) assignees;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'shift.saved','shift',result,jsonb_build_object('status',p_status,'assignee_count',coalesce(cardinality(p_assignee_ids),0)));
  return result;
end;
$$;

create or replace function public.acknowledge_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id();
begin
  if me is null or not exists (
    select 1 from public.shift_assignments sa join public.shifts s on s.id=sa.shift_id
    where sa.shift_id=p_shift_id and sa.profile_id=me and sa.organization_id=org and s.status in ('published','changed')
  ) then raise exception 'shift_not_available' using errcode='42501'; end if;
  insert into public.shift_acknowledgements(shift_id,profile_id,organization_id)
  values(p_shift_id,me,org) on conflict(shift_id,profile_id) do update set acknowledged_at=excluded.acknowledged_at;
  update public.shift_assignments set acknowledged_at=now() where shift_id=p_shift_id and profile_id=me;
end;
$$;

-- Leave ----------------------------------------------------------------------

create or replace function private.calculate_leave_workdays(
  p_profile_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare org uuid; location uuid; result numeric;
begin
  if p_ends_on<p_starts_on or p_starts_on<current_date then raise exception 'invalid_leave_period' using errcode='22023'; end if;
  if p_day_fraction not in (0.5,1) or (p_day_fraction=0.5 and p_starts_on<>p_ends_on) then raise exception 'invalid_day_fraction' using errcode='22023'; end if;
  select p.organization_id,ep.location_id into org,location from public.profiles p left join public.employee_profiles ep on ep.profile_id=p.id where p.id=p_profile_id;
  select count(*)::numeric * p_day_fraction into result
  from generate_series(p_starts_on,p_ends_on,interval '1 day') day_value
  where extract(isodow from day_value)<6
    and not exists (
      select 1 from public.public_holidays h
      where h.organization_id=org and h.holiday_on=day_value::date and (h.location_id is null or h.location_id=location)
    );
  return coalesce(result,0);
end;
$$;

create or replace function public.submit_leave_request(
  p_leave_type text,
  p_starts_on date,
  p_ends_on date,
  p_day_fraction numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; days numeric; type_id uuid; steps integer; note_required boolean;
begin
  if me is null or not private.has_permission('leave.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'note_too_long' using errcode='22023'; end if;
  select id,requires_note into type_id,note_required from public.leave_types where organization_id=org and active and (code=p_leave_type or name=p_leave_type) limit 1;
  if type_id is null then raise exception 'leave_type_not_available' using errcode='22023'; end if;
  if note_required and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'note_required' using errcode='22023'; end if;
  days:=private.calculate_leave_workdays(me,p_starts_on,p_ends_on,p_day_fraction);
  if days<=0 then raise exception 'no_workdays_in_period' using errcode='22023'; end if;
  if exists (select 1 from public.leave_requests lr where lr.profile_id=me and lr.status in ('submitted','review','approved')
    and daterange(lr.starts_on,lr.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')) then
    raise exception 'overlapping_leave_request' using errcode='23P01';
  end if;
  insert into public.leave_requests(organization_id,profile_id,leave_type,leave_type_id,starts_on,ends_on,day_fraction,workdays,note,status)
  values(org,me,p_leave_type,type_id,p_starts_on,p_ends_on,p_day_fraction,days,nullif(trim(p_note),''),'submitted') returning id into result;
  select leave_approval_steps into steps from public.organization_settings where organization_id=org;
  insert into public.leave_approval_steps(organization_id,leave_request_id,step_number)
  select org,result,n from generate_series(1,coalesce(steps,1)) n;
  perform private.create_notification(org,p.id,'leave_approval','Neuer Urlaubsantrag','Ein Urlaubsantrag wartet auf Bearbeitung.',
    '/app/leave','leave-task:'||result::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
    and (
      private.profile_has_permission(p.id,org,'leave.manage')
      or (
        private.profile_has_permission(p.id,org,'leave.approve')
        and exists (
          select 1 from public.team_memberships subject_tm
          join public.teams t on t.id=subject_tm.team_id and t.organization_id=subject_tm.organization_id and t.active
          where subject_tm.profile_id=me and subject_tm.organization_id=org
            and subject_tm.valid_from<=current_date and (subject_tm.valid_until is null or subject_tm.valid_until>=current_date)
            and (
              t.lead_profile_id=p.id
              or exists(select 1 from public.team_memberships viewer_tm where viewer_tm.team_id=subject_tm.team_id
                and viewer_tm.profile_id=p.id and viewer_tm.organization_id=org
                and viewer_tm.valid_from<=current_date and (viewer_tm.valid_until is null or viewer_tm.valid_until>=current_date))
            )
        )
      )
    );
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.submitted','leave_request',result,jsonb_build_object('workdays',days));
  return result;
end;
$$;

create or replace function public.withdraw_leave_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); old_status text;
begin
  select status into old_status from public.leave_requests where id=p_request_id and profile_id=me and organization_id=org for update;
  if old_status is null or old_status not in ('submitted','review') then raise exception 'request_cannot_be_withdrawn' using errcode='22023'; end if;
  update public.leave_requests set status='withdrawn' where id=p_request_id;
  update public.leave_approval_steps set status='skipped',decided_by=me,decided_at=now(),comment='Vom Antragsteller zurückgezogen'
    where leave_request_id=p_request_id and status='pending';
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.withdrawn','leave_request',p_request_id,jsonb_build_object('from',old_status));
end $$;

create or replace function public.decide_leave_request(p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.leave_requests%rowtype; step_id uuid; pending_count integer;
begin
  if me is null or not (private.has_permission('leave.approve') or private.has_permission('leave.manage')) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('review','approved','rejected') then raise exception 'invalid_decision' using errcode='22023'; end if;
  if p_status='rejected' and nullif(trim(p_note),'') is null then raise exception 'rejection_reason_required' using errcode='22023'; end if;
  select * into target from public.leave_requests where id=p_request_id and organization_id=org for update;
  if target.id is null or target.status not in ('submitted','review') then raise exception 'request_not_decidable' using errcode='22023'; end if;
  if not private.has_permission('leave.manage') and not private.can_view_profile_team(target.profile_id) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status='review' then
    update public.leave_requests set status='review',decided_by=me,decided_at=now(),decision_note=nullif(trim(p_note),'') where id=p_request_id;
  else
    select id into step_id from public.leave_approval_steps where leave_request_id=p_request_id and status='pending' order by step_number limit 1 for update;
    if p_status='approved' and exists(
      select 1 from public.leave_approval_steps las
      where las.leave_request_id=p_request_id and las.status='approved' and las.decided_by=me
    ) then raise exception 'second_approver_required' using errcode='42501'; end if;
    if step_id is not null then update public.leave_approval_steps set status=p_status,decided_by=me,decided_at=now(),comment=nullif(trim(p_note),'') where id=step_id; end if;
    if p_status='rejected' then
      update public.leave_requests set status='rejected',decided_by=me,decided_at=now(),decision_note=trim(p_note) where id=p_request_id;
      update public.leave_approval_steps set status='skipped',decided_by=me,decided_at=now(),comment='Nach Ablehnung übersprungen' where leave_request_id=p_request_id and status='pending';
    else
      select count(*) into pending_count from public.leave_approval_steps where leave_request_id=p_request_id and status='pending';
      update public.leave_requests set status=case when pending_count=0 then 'approved' else 'review' end,
        decided_by=case when pending_count=0 then me else decided_by end,
        decided_at=case when pending_count=0 then now() else decided_at end,
        decision_note=case when pending_count=0 then nullif(trim(p_note),'') else decision_note end
      where id=p_request_id;
    end if;
  end if;
  perform private.create_notification(org,target.profile_id,'leave_status','Urlaubsantrag aktualisiert','Der Status Ihres Urlaubsantrags wurde geändert.',
    '/app/leave','leave-status:'||p_request_id::text||':'||p_status||':'||extract(epoch from now())::bigint::text);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'leave.decided','leave_request',p_request_id,jsonb_build_object('decision',p_status));
end;
$$;

-- Sick leave -----------------------------------------------------------------

create or replace function public.report_sick_leave(
  p_starts_on date,
  p_expected_end_on date,
  p_end_unknown boolean,
  p_certificate_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('sick_leave.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_starts_on<current_date-interval '14 days' or p_starts_on>current_date+interval '1 day' then raise exception 'invalid_start_date' using errcode='22023'; end if;
  if p_certificate_status not in ('not_required','required','pending') then raise exception 'invalid_certificate_status' using errcode='22023'; end if;
  if (p_end_unknown and p_expected_end_on is not null) or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<p_starts_on)) then
    raise exception 'invalid_end_date' using errcode='22023';
  end if;
  if exists(select 1 from public.sick_leave_records sl where sl.profile_id=me and sl.status not in ('closed','cancelled')
    and daterange(sl.starts_on,coalesce(sl.expected_end_on,'infinity'::date),'[]') && daterange(p_starts_on,coalesce(p_expected_end_on,'infinity'::date),'[]')) then
    raise exception 'overlapping_sick_leave' using errcode='23P01';
  end if;
  insert into public.sick_leave_records(organization_id,profile_id,starts_on,expected_end_on,end_unknown,certificate_status,certificate_required,employee_confirmation,status)
  values(org,me,p_starts_on,p_expected_end_on,p_end_unknown,p_certificate_status,p_certificate_status in ('required','pending'),true,'reported') returning id into result;
  perform private.create_notification(org,p.id,'sick_leave','Neue Abwesenheitsmeldung','Eine neue Abwesenheitsmeldung ist eingegangen.',
    '/app/sick-leave','sick-task:'||result::text||':'||p.id::text)
  from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
    and private.profile_can_view_sick_status(p.id,me,org);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'sick_leave.reported','sick_leave',result,jsonb_build_object('certificate_expected',p_certificate_status<>'not_required'));
  return result;
end;
$$;

create or replace function public.extend_sick_leave(p_record_id uuid, p_expected_end_on date, p_end_unknown boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); start_date date;
begin
  select starts_on into start_date from public.sick_leave_records where id=p_record_id and profile_id=me and organization_id=org and status not in ('closed','cancelled') for update;
  if start_date is null then raise exception 'record_not_extendable' using errcode='22023'; end if;
  if (p_end_unknown and p_expected_end_on is not null) or (not p_end_unknown and (p_expected_end_on is null or p_expected_end_on<start_date)) then raise exception 'invalid_end_date' using errcode='22023'; end if;
  perform set_config('app.sick_workflow','allowed',true);
  update public.sick_leave_records set expected_end_on=p_expected_end_on,end_unknown=p_end_unknown,status='extended' where id=p_record_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'sick_leave.extended','sick_leave',p_record_id,'{}');
end;
$$;

create or replace function public.set_sick_leave_status(p_record_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); owner_id uuid;
begin
  if me is null or not private.has_permission('sick_leave.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('reported','confirmed','closed','cancelled') then raise exception 'invalid_status' using errcode='22023'; end if;
  select profile_id into owner_id from public.sick_leave_records where id=p_record_id and organization_id=org for update;
  if owner_id is null then raise exception 'record_not_found' using errcode='P0002'; end if;
  update public.sick_leave_records set status=p_status where id=p_record_id;
  perform private.create_notification(org,owner_id,'sick_leave_status','Krankmeldung aktualisiert',
    'Der Bearbeitungsstatus Ihrer Meldung wurde aktualisiert.','/app/sick-leave','sick-status:'||p_record_id::text||':'||p_status);
end;
$$;

-- Fleet ----------------------------------------------------------------------

create or replace function public.save_vehicle(
  p_vehicle_id uuid,
  p_internal_name text,
  p_license_plate text,
  p_make text,
  p_model text,
  p_status text,
  p_current_mileage integer,
  p_next_service_on date,
  p_assignee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; old_mileage integer;
begin
  if me is null or not private.has_permission('fleet.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_internal_name)) not between 1 and 120 or length(trim(p_license_plate)) not between 2 and 20 then raise exception 'invalid_vehicle_data' using errcode='22023'; end if;
  if p_status not in ('active','workshop','out_of_service','sold') or p_current_mileage<0 then raise exception 'invalid_vehicle_data' using errcode='22023'; end if;
  if p_assignee_id is not null and not exists(select 1 from public.profiles p where p.id=p_assignee_id and p.organization_id=org and p.status='active') then
    raise exception 'assignee_not_available' using errcode='22023';
  end if;
  if p_status<>'active' then p_assignee_id:=null; end if;
  if p_vehicle_id is null then
    insert into public.vehicles(organization_id,internal_name,license_plate,make,model,status,current_mileage,next_service_on)
    values(org,trim(p_internal_name),upper(trim(p_license_plate)),nullif(trim(p_make),''),nullif(trim(p_model),''),p_status,p_current_mileage,p_next_service_on)
    returning id into result;
  else
    select current_mileage into old_mileage from public.vehicles where id=p_vehicle_id and organization_id=org for update;
    if old_mileage is null then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
    if p_current_mileage<old_mileage then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
    update public.vehicles set internal_name=trim(p_internal_name),license_plate=upper(trim(p_license_plate)),
      make=nullif(trim(p_make),''),model=nullif(trim(p_model),''),status=p_status,current_mileage=p_current_mileage,next_service_on=p_next_service_on
    where id=p_vehicle_id returning id into result;
  end if;
  delete from public.vehicle_assignments where vehicle_id=result and valid_until is null and valid_from=current_date;
  update public.vehicle_assignments set valid_until=current_date-1 where vehicle_id=result and valid_until is null and valid_from<current_date;
  if p_assignee_id is not null then
    delete from public.vehicle_assignments where profile_id=p_assignee_id and primary_assignment and valid_until is null and valid_from=current_date;
    update public.vehicle_assignments set valid_until=current_date-1 where profile_id=p_assignee_id and primary_assignment and valid_until is null and valid_from<current_date;
    insert into public.vehicle_assignments(organization_id,vehicle_id,profile_id,valid_from,primary_assignment)
    values(org,result,p_assignee_id,current_date,true);
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'vehicle.saved','vehicle',result,jsonb_build_object('status',p_status,'assigned',p_assignee_id is not null));
  return result;
end;
$$;

create or replace function public.submit_mileage(
  p_vehicle_id uuid,
  p_mileage integer,
  p_read_on date,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; previous integer; result_status text:='submitted'; rejected_id uuid;
begin
  if me is null or not private.has_permission('mileage.submit_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_mileage<0 or p_read_on>current_date or p_read_on<current_date-interval '62 days' then raise exception 'invalid_mileage_submission' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||p_vehicle_id::text,0));
  if not exists (
    select 1 from public.vehicle_assignments va where va.vehicle_id=p_vehicle_id and va.profile_id=me and va.organization_id=org
      and va.valid_from<=p_read_on and (va.valid_until is null or va.valid_until>=p_read_on)
  ) then raise exception 'vehicle_not_assigned' using errcode='42501'; end if;
  if exists(select 1 from public.mileage_submissions ms where ms.vehicle_id=p_vehicle_id and ms.reporting_month=date_trunc('month',p_read_on)::date and ms.status<>'rejected') then
    raise exception 'monthly_submission_exists' using errcode='23505';
  end if;
  select id into rejected_id from public.mileage_submissions ms where ms.vehicle_id=p_vehicle_id and ms.profile_id=me
    and ms.reporting_month=date_trunc('month',p_read_on)::date and ms.status='rejected' for update;
  select ms.mileage into previous from public.mileage_submissions ms
    where ms.vehicle_id=p_vehicle_id and ms.status not in ('rejected') and ms.read_on<=p_read_on
    order by ms.read_on desc,ms.created_at desc limit 1;
  if previous is null then select current_mileage into previous from public.vehicles where id=p_vehicle_id and organization_id=org; end if;
  if previous is null then raise exception 'vehicle_not_found' using errcode='P0002'; end if;
  if p_mileage<previous then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
  if p_mileage-previous>5000 then result_status:='flagged'; end if;
  if p_photo_path is not null and p_photo_path not like org::text||'/'||p_vehicle_id::text||'/%' then raise exception 'invalid_photo_path' using errcode='22023'; end if;
  if rejected_id is null then
    insert into public.mileage_submissions(organization_id,vehicle_id,profile_id,mileage,read_on,status,photo_path,previous_mileage,flagged_extreme_jump)
    values(org,p_vehicle_id,me,p_mileage,p_read_on,result_status,p_photo_path,previous,result_status='flagged') returning id into result;
  else
    update public.mileage_submissions set mileage=p_mileage,read_on=p_read_on,status=result_status,photo_path=p_photo_path,
      previous_mileage=previous,flagged_extreme_jump=result_status='flagged',reviewed_by=null,reviewed_at=null,review_note=null
    where id=rejected_id returning id into result;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'mileage.submitted','mileage_submission',result,jsonb_build_object('flagged',result_status='flagged'));
  return result;
end;
$$;

create or replace function public.review_mileage_submission(p_submission_id uuid, p_status text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.mileage_submissions%rowtype; prior integer;
begin
  if me is null or not private.has_permission('mileage.manage') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('verified','rejected') then raise exception 'invalid_review_status' using errcode='22023'; end if;
  if p_status='rejected' and nullif(trim(p_comment),'') is null then raise exception 'rejection_reason_required' using errcode='22023'; end if;
  select * into target from public.mileage_submissions where id=p_submission_id and organization_id=org for update;
  if target.id is null or target.status not in ('submitted','flagged') then raise exception 'submission_not_reviewable' using errcode='22023'; end if;
  if p_status='verified' then
    select max(mileage) into prior from public.mileage_submissions where vehicle_id=target.vehicle_id and status='verified' and read_on<=target.read_on and id<>target.id;
    if prior is not null and target.mileage<prior then raise exception 'mileage_cannot_decrease' using errcode='22023'; end if;
  end if;
  update public.mileage_submissions set status=p_status,reviewed_by=me,reviewed_at=now(),review_note=nullif(trim(p_comment),'') where id=target.id;
  if p_status='verified' then update public.vehicles set current_mileage=greatest(current_mileage,target.mileage) where id=target.vehicle_id; end if;
  perform private.create_notification(org,target.profile_id,'mileage_status','Kilometerstand geprüft',
    case when p_status='verified' then 'Ihre Kilometerstandsmeldung wurde bestätigt.' else 'Ihre Kilometerstandsmeldung wurde abgelehnt.' end,
    '/app/fleet','mileage-review:'||target.id::text||':'||p_status);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'mileage.reviewed','mileage_submission',target.id,jsonb_build_object('status',p_status));
end;
$$;

-- Material requests -----------------------------------------------------------

create or replace function public.save_material_request(
  p_request_id uuid,
  p_category text,
  p_item text,
  p_quantity numeric,
  p_unit text,
  p_priority text,
  p_needed_on date,
  p_reason text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid; old_status text; primary_team uuid;
begin
  if me is null or not private.has_permission('materials.create_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status not in ('draft','submitted') or length(trim(p_category)) not between 1 and 80
    or length(trim(p_item)) not between 1 and 180 or p_quantity<=0 or length(trim(p_unit)) not between 1 and 40
    or p_priority not in ('low','normal','high','urgent') or length(coalesce(p_reason,''))>1000 then
    raise exception 'invalid_material_request' using errcode='22023';
  end if;
  select tm.team_id into primary_team from public.team_memberships tm
    where tm.profile_id=me and tm.organization_id=org and tm.valid_from<=current_date and (tm.valid_until is null or tm.valid_until>=current_date)
    order by tm.valid_from desc limit 1;
  if p_request_id is null then
    insert into public.material_requests(organization_id,requester_id,team_id,category,item,title,quantity,unit,priority,needed_on,reason,status,submitted_at)
    values(org,me,primary_team,trim(p_category),trim(p_item),trim(p_item),p_quantity,trim(p_unit),p_priority,p_needed_on,nullif(trim(p_reason),''),p_status,
      case when p_status='submitted' then now() end) returning id into result;
    insert into public.material_request_items(organization_id,request_id,item_name,quantity,unit)
    values(org,result,trim(p_item),p_quantity,trim(p_unit));
  else
    select status into old_status from public.material_requests where id=p_request_id and requester_id=me and organization_id=org for update;
    if old_status is null or old_status<>'draft' then raise exception 'request_not_editable' using errcode='22023'; end if;
    update public.material_requests set category=trim(p_category),item=trim(p_item),title=trim(p_item),quantity=p_quantity,unit=trim(p_unit),
      priority=p_priority,needed_on=p_needed_on,reason=nullif(trim(p_reason),''),status=p_status,
      submitted_at=case when p_status='submitted' then now() else submitted_at end
    where id=p_request_id returning id into result;
    update public.material_request_items set item_name=trim(p_item),quantity=p_quantity,unit=trim(p_unit)
      where id=(select id from public.material_request_items where request_id=result order by created_at limit 1);
    if old_status<>p_status then
      insert into public.material_request_status_history(organization_id,material_request_id,from_status,to_status,actor_id)
      values(org,result,old_status,p_status,me);
    end if;
  end if;
  if p_status='submitted' then
    perform private.create_notification(org,p.id,'materials','Neue Materialanforderung','Eine Materialanforderung wartet auf Bearbeitung.',
      '/app/material-requests','material-task:'||result::text||':'||p.id::text)
    from public.profiles p where p.organization_id=org and p.status='active' and p.id<>me
      and exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id
        where ur.profile_id=p.id and ur.organization_id=org and rp.permission_key in ('materials.manage','materials.approve')
          and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now()));
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'material.saved','material_request',result,jsonb_build_object('status',p_status));
  return result;
end;
$$;

create or replace function public.create_material_request(
  p_category text,
  p_item text,
  p_quantity numeric,
  p_unit text,
  p_priority text,
  p_needed_on date,
  p_reason text
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.save_material_request(null,p_category,p_item,p_quantity,p_unit,p_priority,p_needed_on,p_reason,'submitted')
$$;

create or replace function public.set_material_request_status(p_request_id uuid, p_status text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); target public.material_requests%rowtype; allowed boolean:=false;
begin
  if me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into target from public.material_requests where id=p_request_id and organization_id=org for update;
  if target.id is null then raise exception 'request_not_found' using errcode='P0002'; end if;
  if target.requester_id=me then
    allowed := (p_status='cancelled' and target.status in ('draft','submitted','review')) or (p_status='completed' and target.status='delivered');
  elsif private.has_permission('materials.manage') or private.has_permission('materials.approve') then
    allowed := case target.status
      when 'submitted' then p_status in ('review','approved','rejected','cancelled')
      when 'review' then p_status in ('approved','rejected','cancelled')
      when 'approved' then p_status in ('ordered','cancelled')
      when 'ordered' then p_status in ('partially_delivered','delivered','cancelled')
      when 'partially_delivered' then p_status in ('delivered','cancelled')
      when 'delivered' then p_status in ('completed')
      else false end;
  end if;
  if not allowed then raise exception 'invalid_status_transition' using errcode='22023'; end if;
  if p_status in ('rejected','cancelled') and nullif(trim(p_comment),'') is null then raise exception 'comment_required' using errcode='22023'; end if;
  update public.material_requests set status=p_status,
    closed_at=case when p_status in ('completed','cancelled','rejected') then now() else null end
  where id=target.id;
  insert into public.material_request_status_history(organization_id,material_request_id,from_status,to_status,actor_id,comment)
  values(org,target.id,target.status,p_status,me,nullif(trim(p_comment),''));
  perform private.create_notification(org,target.requester_id,'material_status','Materialanforderung aktualisiert',
    'Der Status Ihrer Materialanforderung wurde geändert.','/app/material-requests','material-status:'||target.id::text||':'||p_status);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(org,me,'material.status_changed','material_request',target.id,jsonb_build_object('from',target.status,'to',p_status));
end;
$$;

-- Audited authorization for Edge Function signed downloads -------------------

create or replace function public.authorize_secure_download(p_bucket text, p_storage_path text, p_request_id uuid default gen_random_uuid())
returns table(allowed boolean, organization_id uuid, entity_type text, entity_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); allowed_value boolean:=false; kind text; target_id uuid; doc_id uuid; version_id uuid;
begin
  if me is null or p_storage_path not like org::text||'/%' then
    return query select false,org,null::text,null::uuid; return;
  end if;
  if p_bucket='sick-certificates' then
    select sl.id into target_id from public.sick_leave_document_versions sd
      join public.sick_leave_records sl on sl.id=sd.sick_leave_id and sl.organization_id=sd.organization_id
      where sd.storage_path=p_storage_path and sd.deleted_at is null and sd.organization_id=org
        and (sl.profile_id=me or private.has_permission('sick_leave.view_certificates'));
    kind:='sick_leave'; allowed_value:=target_id is not null;
  elsif p_bucket in ('documents','employee-documents') then
    select dv.document_id,dv.id into doc_id,version_id from public.document_versions dv
      where dv.storage_path=p_storage_path and dv.deleted_at is null and dv.organization_id=org and private.can_access_document(dv.document_id);
    target_id:=doc_id; kind:='document'; allowed_value:=target_id is not null;
    if allowed_value then
      insert into public.document_access_log(organization_id,document_id,version_id,profile_id,action,request_id)
      values(org,doc_id,version_id,me,'signed_url_created',p_request_id);
    end if;
  elsif p_bucket='message-attachments' then
    select ma.id into target_id from public.message_attachments ma where ma.storage_path=p_storage_path and ma.organization_id=org and private.is_conversation_member(ma.conversation_id);
    kind:='message_attachment'; allowed_value:=target_id is not null;
  elsif p_bucket='vehicle-files' then
    select v.id into target_id from public.vehicles v where v.id=((storage.foldername(p_storage_path))[2])::uuid and v.organization_id=org and private.can_access_vehicle(v.id);
    kind:='vehicle'; allowed_value:=target_id is not null;
  elsif p_bucket='material-request-files' then
    select mr.id into target_id from public.material_requests mr where mr.id=((storage.foldername(p_storage_path))[2])::uuid and mr.organization_id=org and private.can_access_material_request(mr.id);
    kind:='material_request'; allowed_value:=target_id is not null;
  end if;
  if allowed_value then
    insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,request_id,metadata)
    values(org,me,'file.signed_url_created',kind,target_id,p_request_id,jsonb_build_object('bucket',p_bucket));
  end if;
  return query select allowed_value,org,kind,target_id;
end;
$$;

-- Function privileges and Realtime -------------------------------------------

do $$
declare f record;
begin
  for f in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'my_permissions','get_my_profile','list_directory_entries','admin_list_users','update_own_profile',
      'list_leave_requests','list_sick_leave_records',
      'activate_my_profile','admin_create_invited_profile','admin_set_profile_status','admin_get_invite_target',
      'admin_lookup_invite_email','admin_begin_invite_resend',
      'set_user_role','set_user_team','set_role_permission',
      'get_or_create_direct_conversation','create_group_conversation','list_conversations','send_message','edit_message','retract_message',
      'mark_notification_read','mark_all_notifications_read','save_shift','acknowledge_shift','submit_leave_request',
      'withdraw_leave_request','decide_leave_request','report_sick_leave','extend_sick_leave','save_vehicle',
      'submit_mileage','review_mileage_submission','save_material_request','create_material_request',
      'set_material_request_status','authorize_secure_download','save_news_post','mark_news_opened','acknowledge_news','news_read_stats','set_sick_leave_status',
      'create_document_upload','create_employee_document_upload','finalize_document_upload','add_document_version','archive_document'
    )
  loop
    execute format('revoke all on function %I.%I(%s) from public',f.nspname,f.proname,f.args);
    execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);
  end loop;
end;
$$;

revoke all on function public.publish_scheduled_news(uuid) from public,anon,authenticated;
grant execute on function public.publish_scheduled_news(uuid) to service_role;
revoke all on function public.bootstrap_first_admin(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text,text) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['messages','message_reactions','message_read_receipts','conversation_members','conversations','notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then execute format('alter publication supabase_realtime add table public.%I',table_name); end if;
  end loop;
end;
$$;

-- ===== supabase/migrations/202607100006_reference_data.sql =====
-- Alberring Connect: idempotent production reference data.

-- The permission catalogue must exist before the role matrix below. Supabase
-- runs seed.sql only after all migrations, so relying on the seed here would
-- leave newly introduced standard roles without any effective permissions.
insert into public.permissions(key,description) values
('dashboard.view','Dashboard anzeigen'),('directory.view','Mitarbeiterverzeichnis anzeigen'),('users.view','Benutzer anzeigen'),('users.manage','Benutzer verwalten'),('roles.view','Rollen anzeigen'),('roles.manage','Rollen verwalten'),('teams.manage','Teams verwalten'),('messages.use','Nachrichten verwenden'),('messages.moderate','Moderationszugriff'),('news.view','News anzeigen'),('news.create','News erstellen'),('news.publish','News veröffentlichen'),('news.manage','News verwalten'),('schedule.view_own','Eigenen Plan anzeigen'),('schedule.view_team','Teamplan anzeigen'),('schedule.manage','Plan verwalten'),('schedule.publish','Plan veröffentlichen'),('leave.create_own','Eigenen Urlaub beantragen'),('leave.view_team','Teamanträge anzeigen'),('leave.approve','Urlaub genehmigen'),('leave.manage','Urlaub verwalten'),('sick_leave.create_own','Eigene Krankmeldung erstellen'),('sick_leave.view_status','Abwesenheitsstatus anzeigen'),('sick_leave.manage','Krankmeldungen verwalten'),('sick_leave.view_certificates','Atteste abrufen'),('documents.view_own','Eigene Dokumente anzeigen'),('documents.view_shared','Freigegebene Dokumente anzeigen'),('documents.manage','Dokumente verwalten'),('documents.manage_employee_files','Mitarbeiterdokumente verwalten'),('fleet.view_own','Eigenes Fahrzeug anzeigen'),('fleet.view_all','Fuhrpark anzeigen'),('fleet.manage','Fuhrpark verwalten'),('mileage.submit_own','Eigenen Kilometerstand melden'),('mileage.manage','Kilometerstände verwalten'),('materials.create_own','Material anfordern'),('materials.view_team','Team-Anforderungen anzeigen'),('materials.approve','Anforderungen freigeben'),('materials.manage','Anforderungen verwalten'),('birthdays.view_admin_notifications','Geburtstagshinweise anzeigen'),('notifications.manage_templates','Benachrichtigungen verwalten'),('audit.view','Audit anzeigen'),('settings.manage','Einstellungen verwalten'),('integrations.manage','Integrationen verwalten')
on conflict(key) do update set description=excluded.description;

-- Keep a fresh SQL/CLI setup deterministic. No Auth user or password is seeded.
insert into public.organizations(id,name,slug)
values('00000000-0000-4000-8000-000000000001','Alberring Pflegedienst (Demo)','alberring-demo')
on conflict do nothing;
insert into public.organization_settings(organization_id)
values('00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Required role catalogue (roles remain editable per organization).
insert into public.roles(id,organization_id,name,system_key)
select role_id,o.id,role_name,system_key
from public.organizations o
cross join (values
  ('10000000-0000-4000-8000-000000000001'::uuid,'Super Admin','super_admin'),
  ('10000000-0000-4000-8000-000000000002'::uuid,'Mitarbeiter','employee'),
  ('10000000-0000-4000-8000-000000000003'::uuid,'Personal / HR','hr'),
  ('10000000-0000-4000-8000-000000000004'::uuid,'Disposition','dispatch'),
  ('10000000-0000-4000-8000-000000000005'::uuid,'Administration','administration'),
  ('10000000-0000-4000-8000-000000000006'::uuid,'Pflegedienstleitung','care_management'),
  ('10000000-0000-4000-8000-000000000007'::uuid,'Teamleitung','team_lead'),
  ('10000000-0000-4000-8000-000000000008'::uuid,'Fuhrpark','fleet'),
  ('10000000-0000-4000-8000-000000000009'::uuid,'Auditor / Datenschutz','auditor')
) defaults(role_id,role_name,system_key)
where o.id='00000000-0000-4000-8000-000000000001'::uuid
on conflict do nothing;

-- For additional organizations, use generated IDs while retaining system_key.
insert into public.roles(organization_id,name,system_key)
select o.id,d.role_name,d.system_key
from public.organizations o
cross join (values
  ('Super Admin','super_admin'),('Administration','administration'),
  ('Pflegedienstleitung','care_management'),('Teamleitung','team_lead'),
  ('Disposition','dispatch'),('Personal / HR','hr'),('Fuhrpark','fleet'),
  ('Mitarbeiter','employee'),('Auditor / Datenschutz','auditor')
) d(role_name,system_key)
where not exists(select 1 from public.roles r where r.organization_id=o.id and r.system_key=d.system_key)
on conflict do nothing;

-- Standard role permissions. Existing customized grants are never removed.
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r cross join public.permissions p
where r.system_key='super_admin'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','users.manage','roles.view','teams.manage',
  'messages.use','news.view','news.create','news.publish','news.manage',
  'documents.view_shared','documents.manage','fleet.view_all','materials.view_team',
  'materials.manage','notifications.manage_templates','settings.manage','integrations.manage'
]) where r.system_key='administration' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','roles.view','messages.use','news.view','news.create','news.publish',
  'schedule.view_team','schedule.manage','schedule.publish','leave.view_team','leave.approve','leave.manage',
  'sick_leave.view_status','documents.view_shared','fleet.view_all','materials.view_team','materials.approve'
]) where r.system_key='care_management' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','news.create','schedule.view_own','schedule.view_team',
  'leave.create_own','leave.view_team','leave.approve','sick_leave.create_own','sick_leave.view_status',
  'documents.view_own','documents.view_shared','fleet.view_own','mileage.submit_own',
  'materials.create_own','materials.view_team'
]) where r.system_key='team_lead' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','schedule.view_own','schedule.view_team',
  'schedule.manage','schedule.publish','leave.create_own','sick_leave.create_own','sick_leave.view_status',
  'documents.view_own','documents.view_shared','fleet.view_own','fleet.view_all','mileage.submit_own',
  'materials.create_own'
]) where r.system_key='dispatch' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','users.view','messages.use','news.view','leave.view_team','leave.approve','leave.manage',
  'sick_leave.view_status','sick_leave.manage','sick_leave.view_certificates','documents.view_own','documents.view_shared',
  'documents.manage_employee_files','birthdays.view_admin_notifications'
]) where r.system_key='hr' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','fleet.view_own','fleet.view_all','fleet.manage',
  'mileage.submit_own','mileage.manage'
]) where r.system_key='fleet' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array[
  'dashboard.view','directory.view','messages.use','news.view','schedule.view_own','leave.create_own',
  'sick_leave.create_own','documents.view_own','documents.view_shared','fleet.view_own',
  'mileage.submit_own','materials.create_own'
]) where r.system_key='employee' on conflict do nothing;

insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key=any(array['dashboard.view','audit.view','roles.view'])
where r.system_key='auditor' on conflict do nothing;

-- Configurable absence types required by the client workflow.
insert into public.leave_types(organization_id,code,name,paid,requires_note)
select o.id,v.code,v.name,v.paid,v.requires_note
from public.organizations o cross join (values
  ('annual','Erholungsurlaub',true,false),
  ('special','Sonderurlaub',true,true),
  ('unpaid','Unbezahlter Urlaub',false,true),
  ('time_off','Freizeitausgleich',true,false)
) v(code,name,paid,requires_note)
on conflict(organization_id,code) do update set name=excluded.name;

insert into public.feature_flags(organization_id,key,enabled,description)
select id,'onboarding_enabled',false,'Onboarding ist für das MVP vorbereitet, aber deaktiviert.'
from public.organizations on conflict(organization_id,key) do nothing;

insert into public.integration_providers(key,display_name,enabled,capabilities) values
  ('manual','Manuelle Verwaltung',true,array['employees','schedules','availability']),
  ('careville','Careville',true,array['not_configured'])
on conflict(key) do update set display_name=excluded.display_name,enabled=excluded.enabled,capabilities=excluded.capabilities;

insert into public.document_categories(organization_id,name,description)
select o.id,v.name,v.description from public.organizations o cross join (values
  ('Allgemein','Allgemeine Organisationsdokumente'),
  ('Dienstpläne','Veröffentlichte Planungsdokumente'),
  ('Richtlinien','Richtlinien und Arbeitsanweisungen'),
  ('Formulare','Interne Formulare'),
  ('Mitarbeiterdokumente','Persönliche, besonders geschützte Dokumente')
) v(name,description)
on conflict(organization_id,name) do nothing;

insert into public.material_categories(organization_id,name,approval_required)
select o.id,v.name,v.approval from public.organizations o cross join (values
  ('Pflegeverbrauchsmaterial',false),('Büromaterial',false),('Arbeitskleidung',true),
  ('Technik',true),('Sonstiges',false)
) v(name,approval)
on conflict(organization_id,name) do nothing;

-- ===== supabase/migrations/202607120007_document_folders.sql =====
-- Private, role-based and system document folders.

insert into public.permissions(key,description) values
  ('documents.manage_folders','Vorgegebene und rollenbasierte Dokumentordner verwalten'),
  ('documents.view_acknowledgements','Namen und Zeitpunkte von Dokumentbestätigungen anzeigen')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_key)
select r.id,p.key from public.roles r join public.permissions p on p.key in ('documents.manage_folders','documents.view_acknowledgements')
where r.system_key in ('super_admin','administration') on conflict do nothing;

alter table public.document_folders
  add column if not exists scope text not null default 'organization'
    check (scope in ('organization','personal','role')),
  add column if not exists owner_profile_id uuid references public.profiles on delete cascade;

create table if not exists public.document_folder_roles (
  folder_id uuid not null references public.document_folders on delete cascade,
  role_id uuid not null references public.roles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  primary key(folder_id,role_id)
);
alter table public.document_folder_roles enable row level security;

create or replace function private.can_access_document_folder(p_folder_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.document_folders f
    where f.id=p_folder_id and f.organization_id=private.current_organization_id()
      and f.archived_at is null and (
        f.scope='organization'
        or (f.scope='personal' and f.owner_profile_id=private.current_profile_id())
        or (f.scope='role' and exists (
          select 1 from public.document_folder_roles fr
          join public.user_roles ur on ur.role_id=fr.role_id
          join public.roles r on r.id=ur.role_id and r.active
          where fr.folder_id=f.id and ur.profile_id=private.current_profile_id()
            and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
        ))
        or private.has_permission('documents.manage_folders')
      )
  )
$$;

drop policy if exists document_folders_read on public.document_folders;
drop policy if exists document_folders_manage on public.document_folders;
create policy document_folders_read on public.document_folders for select
  using (private.can_access_document_folder(id));
create policy document_folders_admin_manage on public.document_folders for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'))
  with check (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'));
create policy document_folder_roles_read on public.document_folder_roles for select
  using (organization_id=private.current_organization_id() and private.can_access_document_folder(folder_id));
create policy document_folder_roles_manage on public.document_folder_roles for all
  using (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'))
  with check (organization_id=private.current_organization_id() and private.has_permission('documents.manage_folders'));

create or replace function public.create_document_folder(p_name text,p_scope text default 'personal',p_role_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or length(trim(p_name)) not between 1 and 120 then raise exception 'invalid_folder' using errcode='22023'; end if;
  if p_scope not in ('personal','role','organization') then raise exception 'invalid_folder_scope' using errcode='22023'; end if;
  if p_scope<>'personal' and not private.has_permission('documents.manage_folders') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_scope='role' and (p_role_id is null or not exists(select 1 from public.roles where id=p_role_id and organization_id=org and active)) then
    raise exception 'valid_role_required' using errcode='22023';
  end if;
  insert into public.document_folders(organization_id,name,created_by,scope,owner_profile_id)
  values(org,trim(p_name),me,p_scope,case when p_scope='personal' then me end) returning id into result;
  if p_scope='role' then insert into public.document_folder_roles(folder_id,role_id,organization_id) values(result,p_role_id,org); end if;
  return result;
end $$;

create or replace function private.can_manage_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.documents d where d.id=p_document_id and d.organization_id=private.current_organization_id() and (
    (d.sensitivity<>'employee_file' and d.visibility<>'personal' and private.has_permission('documents.manage'))
    or private.has_permission('documents.manage_employee_files')
    or (d.sensitivity<>'employee_file' and d.visibility='personal' and d.owner_profile_id=private.current_profile_id()
      and private.has_permission('documents.view_own'))
  ))
$$;

create or replace function public.create_personal_document_upload(p_title text,p_folder_id uuid default null,p_category_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid:=private.current_profile_id(); org uuid:=private.current_organization_id(); result uuid;
begin
  if me is null or not private.has_permission('documents.view_own') then raise exception 'permission_denied' using errcode='42501'; end if;
  if length(trim(p_title)) not between 2 and 180 then raise exception 'invalid_document' using errcode='22023'; end if;
  if p_folder_id is not null and not private.can_access_document_folder(p_folder_id) then raise exception 'folder_not_available' using errcode='22023'; end if;
  insert into public.documents(organization_id,title,visibility,owner_profile_id,created_by,status,folder_id,category_id,acknowledgement_required)
  values(org,trim(p_title),'personal',me,me,'draft',p_folder_id,p_category_id,false) returning id into result;
  insert into public.document_audiences(organization_id,document_id,audience_type,profile_id) values(org,result,'profile',me);
  return result;
end $$;

drop policy if exists storage_documents_upload on storage.objects;
create policy storage_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id='documents' and (storage.foldername(name))[1]=private.current_organization_id()::text
  and exists(select 1 from public.documents d where d.id=((storage.foldername(name))[2])::uuid
    and d.organization_id=private.current_organization_id() and d.sensitivity<>'employee_file'
    and ((d.visibility='personal' and d.owner_profile_id=private.current_profile_id() and private.has_permission('documents.view_own'))
      or (d.visibility<>'personal' and private.has_permission('documents.manage'))))
);

drop policy if exists document_categories_read on public.document_categories;
create policy document_categories_read on public.document_categories for select
  using (organization_id=private.current_organization_id() and (private.has_permission('documents.view_shared') or private.has_permission('documents.view_own') or private.has_permission('documents.manage')));
drop policy if exists document_acknowledgements_read on public.document_acknowledgements;
create policy document_acknowledgements_read on public.document_acknowledgements for select
  using (organization_id=private.current_organization_id() and (
    profile_id=private.current_profile_id()
    or (private.has_permission('documents.view_acknowledgements') and private.can_access_document(document_id))
  ));

revoke all on function public.create_document_folder(text,text,uuid) from public;
revoke all on function public.create_personal_document_upload(text,uuid,uuid) from public;
grant execute on function public.create_document_folder(text,text,uuid) to authenticated;
grant execute on function public.create_personal_document_upload(text,uuid,uuid) to authenticated;

-- ===== supabase/migrations/202607120008_document_folder_audiences.sql =====
-- Folder visibility is independently assignable and role folders enforce the
-- same role audience for every document filed into them.

insert into public.permissions(key,description)
values('documents.view_folders','Dokumentordner anzeigen')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_key)
select distinct r.id,'documents.view_folders'
from public.roles r
join public.role_permissions rp on rp.role_id=r.id
where rp.permission_key in ('documents.view_own','documents.view_shared','documents.manage')
on conflict do nothing;

create or replace function private.can_access_document_folder(p_folder_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.document_folders f
    where f.id=p_folder_id and f.organization_id=private.current_organization_id()
      and f.archived_at is null and (
        private.has_permission('documents.manage_folders')
        or (private.has_permission('documents.view_folders') and (
          f.scope='organization'
          or (f.scope='personal' and f.owner_profile_id=private.current_profile_id())
          or (f.scope='role' and exists (
            select 1 from public.document_folder_roles fr
            join public.user_roles ur on ur.role_id=fr.role_id
            join public.roles r on r.id=ur.role_id and r.active
            where fr.folder_id=f.id and ur.profile_id=private.current_profile_id()
              and ur.valid_from<=now() and (ur.valid_until is null or ur.valid_until>now())
          ))
        ))
      )
  )
$$;

create or replace function private.apply_folder_document_audience()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare target_role uuid;
begin
  select fr.role_id into target_role
  from public.documents d
  join public.document_folders f on f.id=d.folder_id and f.scope='role'
  join public.document_folder_roles fr on fr.folder_id=f.id
  where d.id=new.document_id and f.organization_id=new.organization_id
  order by fr.role_id limit 1;
  if target_role is not null then
    new.audience_type:='role'; new.role_id:=target_role;
    new.team_id:=null; new.location_id:=null; new.profile_id:=null;
  end if;
  return new;
end $$;

drop trigger if exists apply_folder_document_audience on public.document_audiences;
create trigger apply_folder_document_audience before insert on public.document_audiences
for each row execute function private.apply_folder_document_audience();

-- ===== supabase/migrations/202607240009_messaging_policy_hardening.sql =====
-- Keep reply targets, attachments and pins inside the conversation selected by
-- the new row. Explicit target-table qualification prevents PostgreSQL from
-- resolving both sides of the comparison to the inner subquery alias.

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert
on public.messages
for insert
with check (
  messages.organization_id = private.current_organization_id()
  and messages.sender_id = private.current_profile_id()
  and private.can_post_conversation(messages.conversation_id)
  and (
    messages.reply_to_id is null
    or exists (
      select 1
      from public.messages reply_message
      where reply_message.id = messages.reply_to_id
        and reply_message.conversation_id = messages.conversation_id
        and reply_message.organization_id = messages.organization_id
    )
  )
);

drop policy if exists message_attachments_member_insert on public.message_attachments;
create policy message_attachments_member_insert
on public.message_attachments
for insert
with check (
  message_attachments.organization_id = private.current_organization_id()
  and message_attachments.uploaded_by = private.current_profile_id()
  and private.can_post_conversation(message_attachments.conversation_id)
  and (
    message_attachments.message_id is null
    or exists (
      select 1
      from public.messages attached_message
      where attached_message.id = message_attachments.message_id
        and attached_message.conversation_id =
          message_attachments.conversation_id
        and attached_message.organization_id =
          message_attachments.organization_id
    )
  )
);

drop policy if exists conversation_pins_member_insert on public.conversation_pins;
create policy conversation_pins_member_insert
on public.conversation_pins
for insert
with check (
  conversation_pins.organization_id = private.current_organization_id()
  and conversation_pins.pinned_by = private.current_profile_id()
  and private.is_conversation_member(conversation_pins.conversation_id)
  and exists (
    select 1
    from public.messages pinned_message
    where pinned_message.id = conversation_pins.message_id
      and pinned_message.conversation_id =
        conversation_pins.conversation_id
      and pinned_message.organization_id =
        conversation_pins.organization_id
  )
);

notify pgrst, 'reload schema';

-- ===== supabase/migrations/20260730100141_harden_function_execute_privileges.sql =====
-- SECURITY DEFINER functions are API endpoints in an exposed schema. PostgreSQL
-- grants EXECUTE to PUBLIC by default, which also makes them callable by anon.
-- Keep the existing authenticated/service-role API surface, but require a
-- signed-in session before the function's own authorization checks run.
do $$
declare
  function_record record;
begin
  for function_record in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to authenticated, service_role',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end
$$;

-- This is an internal scheduler audit table. It deliberately has no client RLS
-- policy; make that boundary explicit at the privilege layer as well.
revoke all on table public.scheduled_jobs_log from anon, authenticated;

-- ===== supabase/seed.sql =====
-- Reference data only. Auth users are created by the documented bootstrap script, never with seeded passwords.
insert into public.permissions(key,description) values
('dashboard.view','Dashboard anzeigen'),('directory.view','Mitarbeiterverzeichnis anzeigen'),('users.view','Benutzer anzeigen'),('users.manage','Benutzer verwalten'),('roles.view','Rollen anzeigen'),('roles.manage','Rollen verwalten'),('teams.manage','Teams verwalten'),('messages.use','Nachrichten verwenden'),('messages.moderate','Moderationszugriff'),('news.view','News anzeigen'),('news.create','News erstellen'),('news.publish','News veröffentlichen'),('news.manage','News verwalten'),('schedule.view_own','Eigenen Plan anzeigen'),('schedule.view_team','Teamplan anzeigen'),('schedule.manage','Plan verwalten'),('schedule.publish','Plan veröffentlichen'),('leave.create_own','Eigenen Urlaub beantragen'),('leave.view_team','Teamanträge anzeigen'),('leave.approve','Urlaub genehmigen'),('leave.manage','Urlaub verwalten'),('sick_leave.create_own','Eigene Krankmeldung erstellen'),('sick_leave.view_status','Abwesenheitsstatus anzeigen'),('sick_leave.manage','Krankmeldungen verwalten'),('sick_leave.view_certificates','Atteste abrufen'),('documents.view_own','Eigene Dokumente anzeigen'),('documents.view_shared','Freigegebene Dokumente anzeigen'),('documents.manage','Dokumente verwalten'),('documents.manage_employee_files','Mitarbeiterdokumente verwalten'),('fleet.view_own','Eigenes Fahrzeug anzeigen'),('fleet.view_all','Fuhrpark anzeigen'),('fleet.manage','Fuhrpark verwalten'),('mileage.submit_own','Eigenen Kilometerstand melden'),('mileage.manage','Kilometerstände verwalten'),('materials.create_own','Material anfordern'),('materials.view_team','Team-Anforderungen anzeigen'),('materials.approve','Anforderungen freigeben'),('materials.manage','Anforderungen verwalten'),('birthdays.view_admin_notifications','Geburtstagshinweise anzeigen'),('notifications.manage_templates','Benachrichtigungen verwalten'),('audit.view','Audit anzeigen'),('settings.manage','Einstellungen verwalten'),('integrations.manage','Integrationen verwalten') on conflict do nothing;

insert into public.organizations(id,name,slug) values('00000000-0000-4000-8000-000000000001','Alberring Pflegedienst (Demo)','alberring-demo') on conflict do nothing;
insert into public.organization_settings(organization_id) values('00000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.roles(id,organization_id,name,system_key) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Super Admin','super_admin'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Mitarbeiter','employee'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Personal / HR','hr'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Disposition','dispatch') on conflict do nothing;
insert into public.role_permissions(role_id,permission_key) select '10000000-0000-4000-8000-000000000001',key from public.permissions on conflict do nothing;
insert into public.role_permissions(role_id,permission_key) select '10000000-0000-4000-8000-000000000002',key from public.permissions where key in ('dashboard.view','directory.view','messages.use','news.view','schedule.view_own','leave.create_own','sick_leave.create_own','documents.view_own','documents.view_shared','fleet.view_own','mileage.submit_own','materials.create_own') on conflict do nothing;
insert into public.role_permissions(role_id,permission_key) select '10000000-0000-4000-8000-000000000003',key from public.permissions where key in ('dashboard.view','directory.view','users.view','leave.view_team','leave.approve','leave.manage','sick_leave.manage','sick_leave.view_certificates','documents.manage_employee_files') on conflict do nothing;
insert into public.role_permissions(role_id,permission_key) select '10000000-0000-4000-8000-000000000004',key from public.permissions where key in ('dashboard.view','directory.view','schedule.view_team','schedule.manage','schedule.publish','sick_leave.view_status','fleet.view_all') on conflict do nothing;
insert into public.teams(id,organization_id,name,location_name) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Team Nord','Hauptstelle'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Team Süd','Außenstelle Süd') on conflict do nothing;
insert into public.integration_connections(organization_id,provider,status) values('00000000-0000-4000-8000-000000000001','manual','active'),('00000000-0000-4000-8000-000000000001','careville','not_configured') on conflict do nothing;

commit;
