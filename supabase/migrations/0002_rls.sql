-- =========================================================================
-- Migration 0002: Row Level Security
-- Every table with member/officer/money data is locked down by default;
-- the frontend never gets more access than these policies grant, regardless
-- of what client-side code tries to do.
-- =========================================================================

-- ------------------------------------------------------------------------
-- HELPER FUNCTIONS  (SECURITY DEFINER so they can read `officers` even
-- though the calling role may not have direct SELECT on it yet)
-- ------------------------------------------------------------------------

create or replace function current_officer_role()
returns officer_role
language sql stable security definer set search_path = public as $$
  select role from officers where id = auth.uid();
$$;

create or replace function current_officer_team()
returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from officers where id = auth.uid();
$$;

create or replace function current_officer_branch()
returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from officers where id = auth.uid();
$$;

create or replace function is_head_office()
returns boolean
language sql stable security definer set search_path = public as $$
  select current_officer_role() = 'head_office_admin';
$$;

create or replace function is_manager_tier()
returns boolean
language sql stable security definer set search_path = public as $$
  select current_officer_role() in
    ('team_leader','branch_manager','general_agent_manager','head_office_admin');
$$;

-- ------------------------------------------------------------------------
-- ENABLE RLS EVERYWHERE
-- ------------------------------------------------------------------------

alter table officers enable row level security;
alter table teams enable row level security;
alter table branches enable row level security;
alter table members enable row level security;
alter table daily_reports enable row level security;
alter table recovery_requests enable row level security;
alter table commissions enable row level security;
alter table kpi_snapshots enable row level security;
alter table compliance_violations enable row level security;
alter table compliance_violation_types enable row level security;
alter table training_records enable row level security;
alter table suggestions enable row level security;
alter table promotions enable row level security;
alter table acquisition_score_config enable row level security;
alter table app_config enable row level security;
alter table audit_log enable row level security;

-- ------------------------------------------------------------------------
-- OFFICERS
-- ------------------------------------------------------------------------

create policy officers_select_self on officers for select
  using (id = auth.uid());

create policy officers_select_team on officers for select
  using (current_officer_role() = 'team_leader' and team_id = current_officer_team());

create policy officers_select_branch on officers for select
  using (current_officer_role() in ('branch_manager') and branch_id = current_officer_branch());

create policy officers_select_all_for_national on officers for select
  using (current_officer_role() in ('general_agent_manager', 'head_office_admin'));

create policy officers_insert_ho_only on officers for insert
  with check (is_head_office());

create policy officers_update_ho_only on officers for update
  using (is_head_office());

-- ------------------------------------------------------------------------
-- TEAMS / BRANCHES — readable by any authenticated officer (lookup data),
-- writable only by HO
-- ------------------------------------------------------------------------

create policy teams_select_all on teams for select using (auth.uid() is not null);
create policy teams_write_ho on teams for insert with check (is_head_office());
create policy teams_update_ho on teams for update using (is_head_office());

create policy branches_select_all on branches for select using (auth.uid() is not null);
create policy branches_write_ho on branches for insert with check (is_head_office());
create policy branches_update_ho on branches for update using (is_head_office());

-- ------------------------------------------------------------------------
-- MEMBERS
-- ------------------------------------------------------------------------

create policy members_select_own on members for select
  using (officer_id = auth.uid());

create policy members_select_team on members for select
  using (
    current_officer_role() = 'team_leader'
    and officer_id in (select id from officers where team_id = current_officer_team())
  );

create policy members_select_branch on members for select
  using (
    current_officer_role() = 'branch_manager'
    and officer_id in (select id from officers where branch_id = current_officer_branch())
  );

create policy members_select_national on members for select
  using (current_officer_role() in ('general_agent_manager', 'head_office_admin'));

-- Officers can register a new prospect (status forced to registration_pending
-- by the default; state-machine transitions beyond that go through the
-- fn_change_member_status function only — see migration 0003).
create policy members_insert_own on members for insert
  with check (officer_id = auth.uid() and status = 'registration_pending');

-- Direct UPDATE of members is blocked for everyone. All status changes and
-- reassignments must go through the SECURITY DEFINER functions in 0003,
-- which perform their own authorization checks. This satisfies SRS §5.10:
-- "the app never issues raw UPDATE members SET status = ... from the client."
create policy members_no_direct_update on members for update
  using (false);

-- ------------------------------------------------------------------------
-- DAILY REPORTS
-- ------------------------------------------------------------------------

create policy daily_reports_select_own on daily_reports for select
  using (officer_id = auth.uid());

create policy daily_reports_select_manager on daily_reports for select
  using (is_manager_tier());

create policy daily_reports_insert_own on daily_reports for insert
  with check (officer_id = auth.uid());

create policy daily_reports_update_own_same_day on daily_reports for update
  using (officer_id = auth.uid() and reviewed_at is null);

create policy daily_reports_review_ho on daily_reports for update
  using (is_head_office());

-- ------------------------------------------------------------------------
-- RECOVERY REQUESTS
-- ------------------------------------------------------------------------

create policy recovery_select_own on recovery_requests for select
  using (officer_id = auth.uid());

create policy recovery_select_manager on recovery_requests for select
  using (is_manager_tier());

create policy recovery_insert_own on recovery_requests for insert
  with check (officer_id = auth.uid());

-- Approval/rejection happens via fn_review_recovery_request (0003), not
-- direct UPDATE, so no general update policy is granted here.

-- ------------------------------------------------------------------------
-- COMMISSIONS  — officers see only their own, never each other's earnings
-- ------------------------------------------------------------------------

create policy commissions_select_own on commissions for select
  using (officer_id = auth.uid());

create policy commissions_select_ho on commissions for select
  using (is_head_office());

-- No client-side insert/update: commissions are created and transitioned
-- only by SECURITY DEFINER functions (0003).

-- ------------------------------------------------------------------------
-- KPI SNAPSHOTS
-- ------------------------------------------------------------------------

create policy kpi_select_own on kpi_snapshots for select
  using (officer_id = auth.uid());

create policy kpi_select_team on kpi_snapshots for select
  using (
    current_officer_role() = 'team_leader'
    and officer_id in (select id from officers where team_id = current_officer_team())
  );

create policy kpi_select_branch on kpi_snapshots for select
  using (
    current_officer_role() = 'branch_manager'
    and officer_id in (select id from officers where branch_id = current_officer_branch())
  );

create policy kpi_select_national on kpi_snapshots for select
  using (current_officer_role() in ('general_agent_manager', 'head_office_admin'));

-- ------------------------------------------------------------------------
-- COMPLIANCE
-- ------------------------------------------------------------------------

create policy violations_select_own on compliance_violations for select
  using (officer_id = auth.uid());

create policy violations_select_ho on compliance_violations for select
  using (is_head_office());

create policy violations_insert_ho on compliance_violations for insert
  with check (is_head_office());

create policy violation_types_select_all on compliance_violation_types for select
  using (auth.uid() is not null);

create policy violation_types_write_ho on compliance_violation_types for all
  using (is_head_office()) with check (is_head_office());

-- ------------------------------------------------------------------------
-- TRAINING
-- ------------------------------------------------------------------------

create policy training_select_own on training_records for select
  using (officer_id = auth.uid());

create policy training_select_manager on training_records for select
  using (is_manager_tier());

create policy training_write_ho on training_records for all
  using (is_head_office()) with check (is_head_office());

-- ------------------------------------------------------------------------
-- SUGGESTIONS
-- ------------------------------------------------------------------------

create policy suggestions_select_own on suggestions for select
  using (officer_id = auth.uid());

create policy suggestions_select_ho on suggestions for select
  using (is_head_office());

create policy suggestions_select_public_credited on suggestions for select
  using (credited_publicly = true and status = 'implemented');

create policy suggestions_insert_own on suggestions for insert
  with check (officer_id = auth.uid());

create policy suggestions_review_ho on suggestions for update
  using (is_head_office());

-- ------------------------------------------------------------------------
-- PROMOTIONS
-- ------------------------------------------------------------------------

create policy promotions_select_own on promotions for select
  using (officer_id = auth.uid());

create policy promotions_select_manager on promotions for select
  using (is_manager_tier());

create policy promotions_write_ho on promotions for insert
  with check (is_head_office());

-- ------------------------------------------------------------------------
-- CONFIG TABLES — readable by managers (need thresholds to reason about
-- dashboards), writable only by HO
-- ------------------------------------------------------------------------

create policy acq_config_select on acquisition_score_config for select
  using (auth.uid() is not null);

create policy acq_config_write_ho on acquisition_score_config for all
  using (is_head_office()) with check (is_head_office());

create policy app_config_select on app_config for select
  using (auth.uid() is not null);

create policy app_config_write_ho on app_config for all
  using (is_head_office()) with check (is_head_office());

-- ------------------------------------------------------------------------
-- AUDIT LOG — HO can read; nobody writes directly (functions insert via
-- security definer, bypassing RLS on write)
-- ------------------------------------------------------------------------

create policy audit_select_ho on audit_log for select
  using (is_head_office());
