-- =========================================================================
-- CirclesFundMe Operations App — Stage 1 MVP
-- Migration 0001: Enums & Tables
-- =========================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------------------

create type officer_role as enum (
  'portfolio_officer',
  'team_leader',
  'branch_manager',
  'general_agent_manager',
  'head_office_admin'
);

create type officer_rank as enum (
  'applicant',
  'training',
  'temporary_po',
  'junior_po',
  'senior_po',
  'team_leader',
  'branch_manager',
  'area_manager'
);

create type officer_status as enum ('active', 'suspended', 'terminated');

create type savings_frequency as enum ('daily', 'weekly', 'monthly');

-- Canonical member lifecycle state machine (see SRS §3)
create type member_status as enum (
  'registration_pending',
  'registered',
  'pending_approval',
  'approved_acquisition',
  'qualified_member',
  'active',
  'due_soon',
  'needs_follow_up',
  'at_risk',
  'minor_recovery_request',
  'defaulted',
  'major_recovery_request',
  'recovery_pending_review',
  'reassigned'
);

create type follow_up_outcome as enum (
  'interested', 'registered', 'callback_requested', 'declined'
);

create type at_risk_reason as enum (
  'slow_business', 'family_emergency', 'forgot', 'atm_issue', 'payment_failed', 'other'
);

create type recovery_type as enum ('minor', 'major');
create type recovery_status as enum ('pending_review', 'approved', 'rejected');

create type commission_type as enum ('acquisition', 'recurring');
create type commission_status as enum ('pending', 'approved', 'paid', 'on_hold');

create type violation_severity as enum ('minor', 'major');

create type suggestion_category as enum ('product', 'operations', 'technology', 'marketing');
create type suggestion_status as enum ('submitted', 'reviewed', 'implemented', 'declined');

create type promotion_decision as enum ('approved', 'declined');

-- ------------------------------------------------------------------------
-- LOOKUP TABLES
-- ------------------------------------------------------------------------

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  manager_id uuid, -- FK added after officers table exists
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references branches(id) on delete set null,
  manager_id uuid, -- FK added after officers table exists
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------
-- OFFICERS  (1:1 with auth.users)
-- ------------------------------------------------------------------------

create table officers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role officer_role not null default 'portfolio_officer',
  rank officer_rank not null default 'applicant',
  team_id uuid references teams(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  status officer_status not null default 'active',
  compliance_points int not null default 100,
  created_at timestamptz not null default now()
);

alter table branches add constraint branches_manager_fk
  foreign key (manager_id) references officers(id) on delete set null;
alter table teams add constraint teams_manager_fk
  foreign key (manager_id) references officers(id) on delete set null;

-- ------------------------------------------------------------------------
-- MEMBERS
-- ------------------------------------------------------------------------

create table members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  location text,
  savings_frequency savings_frequency not null,
  officer_id uuid not null references officers(id) on delete restrict,
  status member_status not null default 'registration_pending',
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references officers(id),
  last_contribution_date date,
  qualifying_cycle_start date,
  cycles_completed int not null default 0,
  is_archived boolean not null default false,
  reassigned_from uuid references officers(id),
  kyc_passed boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_members_officer on members(officer_id);
create index idx_members_status on members(status);

-- ------------------------------------------------------------------------
-- DAILY REPORTS  (structured, per SRS §7.1 / §5.4)
-- ------------------------------------------------------------------------

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  report_date date not null default current_date,
  new_members jsonb not null default '[]',        -- [{name, phone, location, plan, registration_date}]
  follow_ups jsonb not null default '[]',          -- [{member_id, outcome}]
  at_risk_visits jsonb not null default '[]',      -- [{member_id, reason}]
  recovery_reports jsonb not null default '[]',    -- [{member_id, reason, action_taken, evidence_urls[], expected_next_contribution_date}]
  general_feedback text,
  suggestions text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references officers(id),
  reviewed_at timestamptz,
  unique (officer_id, report_date)
);

-- ------------------------------------------------------------------------
-- RECOVERY REQUESTS
-- ------------------------------------------------------------------------

create table recovery_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  officer_id uuid not null references officers(id) on delete cascade,
  type recovery_type not null,
  status recovery_status not null default 'pending_review',
  evidence_urls text[] not null default '{}',
  cycles_completed int not null default 0, -- major recovery needs 2 before approval
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references officers(id)
);

create index idx_recovery_member on recovery_requests(member_id);

-- ------------------------------------------------------------------------
-- COMMISSIONS
-- ------------------------------------------------------------------------

create table commissions (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  type commission_type not null,
  cycle_number int, -- which 30-day cycle this recurring payment covers
  amount numeric(12,2) not null,
  status commission_status not null default 'pending',
  hold_reason text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references officers(id),
  paid_at timestamptz
);

create index idx_commissions_officer on commissions(officer_id);
create index idx_commissions_status on commissions(status);

-- ------------------------------------------------------------------------
-- KPI SNAPSHOTS (monthly, one row per officer per month)
-- ------------------------------------------------------------------------

create table kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  period date not null, -- first-of-month
  acquisition_score numeric not null default 0,
  portfolio_quality_score numeric not null default 100,
  overall_performance_score numeric not null default 0,
  total_portfolio int not null default 0,
  at_risk_count int not null default 0,
  defaulted_count int not null default 0,
  at_risk_rate numeric not null default 0,
  default_rate numeric not null default 0,
  compliance_points int not null default 100,
  created_at timestamptz not null default now(),
  unique (officer_id, period)
);

-- ------------------------------------------------------------------------
-- COMPLIANCE
-- ------------------------------------------------------------------------

create table compliance_violation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  severity violation_severity not null,
  points_deducted int not null,
  auto_commission_hold boolean not null default false,
  active boolean not null default true
);

create table compliance_violations (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  violation_type_id uuid references compliance_violation_types(id),
  severity violation_severity not null,
  description text,
  points_deducted int not null default 0,
  commission_hold boolean not null default false,
  reviewed_by uuid references officers(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------
-- TRAINING / SUGGESTIONS / PROMOTIONS
-- ------------------------------------------------------------------------

create table training_records (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  course_name text not null,
  attended boolean not null default false,
  assessment_score numeric,
  certified boolean not null default false,
  created_at timestamptz not null default now()
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  category suggestion_category not null,
  text text not null,
  status suggestion_status not null default 'submitted',
  credited_publicly boolean not null default false,
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  reviewed_by uuid references officers(id),
  reviewed_at timestamptz
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  officer_id uuid not null references officers(id) on delete cascade,
  from_rank officer_rank not null,
  to_rank officer_rank not null,
  decided_by uuid references officers(id),
  decision promotion_decision not null,
  notes text,
  decided_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------
-- CONFIG TABLES  (tunable without redeploying — SRS flags these as open items)
-- ------------------------------------------------------------------------

create table acquisition_score_config (
  id uuid primary key default gen_random_uuid(),
  event_name text not null unique, -- 'approved_acquisition' | 'qualified_member' | 'monthly_target_bonus'
  points numeric not null,
  threshold int, -- e.g. 20 qualified members/month for the bonus row
  active boolean not null default true
);

create table app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------
-- AUDIT LOG  (generic — catches anything not already covered by
-- reviewed_by/decided_by columns on individual tables)
-- ------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references officers(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
