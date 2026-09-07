-- =========================================================================
-- Default config values — all tunable later from the HO admin UI or
-- directly in the table, no redeploy needed. Values below are the SRS's
-- own suggested placeholders (§6.1, §6.9, §6.10); adjust freely.
-- =========================================================================

insert into acquisition_score_config (event_name, points, threshold) values
  ('approved_acquisition', 1, null),
  ('qualified_member', 3, null),
  ('monthly_target_bonus', 10, 20); -- +10 pts at 20 qualified members/month

insert into app_config (key, value, description) values
  ('acquisition_commission_amount', '2000', 'One-time ₦ commission when a member reaches Qualified Member'),
  ('recurring_commission_amount', '500', '₦ commission per subsequent completed 30-day cycle'),
  ('commission_min_portfolio_quality', '{"value": 70}', 'Minimum Portfolio Quality Score to release a commission run — SRS floated 70-75%, confirm before go-live');

insert into compliance_violation_types (name, severity, points_deducted, auto_commission_hold) values
  ('Late daily report', 'minor', 2, false),
  ('Incomplete member data', 'minor', 3, false),
  ('Missed follow-up visit', 'minor', 5, false),
  ('Fraudulent registration', 'major', 100, true),
  ('Forged evidence document', 'major', 100, true),
  ('Deliberate misinformation to HO', 'major', 100, true);

-- To create your first Head Office Administrator:
--  1. Sign up normally through the app (creates an auth.users row).
--  2. Run this, swapping in that user's email:
--
--  update officers set role = 'head_office_admin', rank = 'area_manager'
--  where email = 'you@example.com';
