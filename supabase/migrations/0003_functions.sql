-- =========================================================================
-- Migration 0003: Business logic functions
-- Every state transition, score change, and commission amount is computed
-- here — never trusted from the client. Functions are SECURITY DEFINER so
-- they can write to tables the caller has no direct UPDATE grant on, but
-- each one re-checks the caller's role internally before doing anything.
-- =========================================================================

-- ------------------------------------------------------------------------
-- Small helper: log to audit_log (bypasses RLS since it's called from
-- inside other SECURITY DEFINER functions)
-- ------------------------------------------------------------------------

create or replace function _audit(
  p_action text, p_table text, p_record_id uuid, p_old jsonb, p_new jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor_id, action, table_name, record_id, old_value, new_value)
  values (auth.uid(), p_action, p_table, p_record_id, p_old, p_new);
end;
$$;

-- ------------------------------------------------------------------------
-- Valid manual transitions in the state machine (SRS §3).
-- 'due_soon' / 'needs_follow_up' / 'at_risk' / 'defaulted' are reached by
-- the nightly scheduled job (fn_system_advance_lifecycle), not by manual
-- HO action, so they're excluded from this table on purpose.
-- ------------------------------------------------------------------------

create table state_transitions (
  from_status member_status not null,
  to_status member_status not null,
  primary key (from_status, to_status)
);

insert into state_transitions (from_status, to_status) values
  ('registration_pending', 'registered'),
  ('registered', 'pending_approval'),
  ('pending_approval', 'approved_acquisition'),
  ('approved_acquisition', 'qualified_member'),
  ('qualified_member', 'active'),
  ('at_risk', 'minor_recovery_request'),
  ('minor_recovery_request', 'active'),          -- HO approves minor recovery
  ('minor_recovery_request', 'at_risk'),         -- HO rejects minor recovery
  ('defaulted', 'major_recovery_request'),
  ('major_recovery_request', 'recovery_pending_review'),
  ('recovery_pending_review', 'active'),
  -- HO can archive/reassign from most non-terminal states
  ('registration_pending', 'reassigned'),
  ('pending_approval', 'reassigned'),
  ('active', 'reassigned');

-- ------------------------------------------------------------------------
-- fn_change_member_status
-- The ONLY way a member's official status may change by human decision.
-- Gated to Head Office Administrator for MVP (SRS §5.10 requires HO-only
-- writes to members.status; broadening to specific manager tiers per
-- approval routing is a config change to the role check below, not a
-- schema change).
-- ------------------------------------------------------------------------

create or replace function fn_change_member_status(
  p_member_id uuid,
  p_new_status member_status,
  p_note text default null
) returns members
language plpgsql security definer set search_path = public as $$
declare
  v_member members;
  v_old_status member_status;
  v_commission_amount numeric;
begin
  if not is_head_office() then
    raise exception 'Only Head Office can change member status';
  end if;

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found';
  end if;
  v_old_status := v_member.status;

  if not exists (
    select 1 from state_transitions
    where from_status = v_old_status and to_status = p_new_status
  ) then
    raise exception 'Invalid transition: % -> %', v_old_status, p_new_status;
  end if;

  update members set
    status = p_new_status,
    status_changed_at = now(),
    status_changed_by = auth.uid(),
    qualifying_cycle_start = case
      when p_new_status = 'approved_acquisition' and qualifying_cycle_start is null
        then current_date
      else qualifying_cycle_start
    end
  where id = p_member_id
  returning * into v_member;

  perform _audit('status_change', 'members', p_member_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'note', p_note));

  -- Reaching Qualified Member fires the one-time acquisition commission
  -- (SRS §6.10) — created as 'pending', HO must still approve it.
  if p_new_status = 'qualified_member' then
    select (value->>'amount')::numeric into v_commission_amount
      from app_config where key = 'acquisition_commission_amount';
    insert into commissions (officer_id, member_id, type, amount, status)
    values (v_member.officer_id, v_member.id, 'acquisition',
            coalesce(v_commission_amount, 2000), 'pending');
  end if;

  return v_member;
end;
$$;

-- ------------------------------------------------------------------------
-- fn_submit_recovery_request — officer-initiated, no elevated privilege
-- needed beyond owning the member record.
-- ------------------------------------------------------------------------

create or replace function fn_submit_recovery_request(
  p_member_id uuid,
  p_type recovery_type,
  p_evidence_urls text[] default '{}'
) returns recovery_requests
language plpgsql security definer set search_path = public as $$
declare
  v_member members;
  v_request recovery_requests;
  v_expected_from member_status;
begin
  select * into v_member from members where id = p_member_id;
  if not found or v_member.officer_id <> auth.uid() then
    raise exception 'Not your member';
  end if;

  v_expected_from := case when p_type = 'minor' then 'at_risk' else 'defaulted' end;
  if v_member.status <> v_expected_from then
    raise exception '% recovery requires member to be in % status', p_type, v_expected_from;
  end if;

  insert into recovery_requests (member_id, officer_id, type, evidence_urls)
  values (p_member_id, auth.uid(), p_type, p_evidence_urls)
  returning * into v_request;

  -- Move member into the "request submitted" holding state so it shows in
  -- HO's approval queue distinctly from a plain at_risk/defaulted member.
  update members set
    status = case when p_type = 'minor' then 'minor_recovery_request' else 'major_recovery_request' end,
    status_changed_at = now(), status_changed_by = auth.uid()
  where id = p_member_id;

  perform _audit('recovery_submitted', 'recovery_requests', v_request.id, null,
    to_jsonb(v_request));

  return v_request;
end;
$$;

-- ------------------------------------------------------------------------
-- fn_review_recovery_request — HO only. Approves/rejects and applies the
-- Portfolio Quality Score restoration points (SRS §6.2 / §6.5).
-- ------------------------------------------------------------------------

create or replace function fn_review_recovery_request(
  p_request_id uuid,
  p_decision recovery_status, -- 'approved' or 'rejected'
  p_note text default null
) returns recovery_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req recovery_requests;
  v_member members;
begin
  if not is_head_office() then
    raise exception 'Only Head Office can review recovery requests';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_req from recovery_requests where id = p_request_id for update;
  if not found or v_req.status <> 'pending_review' then
    raise exception 'Request not found or already reviewed';
  end if;

  if v_req.type = 'major' and p_decision = 'approved' and v_req.cycles_completed < 2 then
    raise exception 'Major recovery requires 2 completed savings cycles before approval';
  end if;

  update recovery_requests set
    status = p_decision, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_request_id
  returning * into v_req;

  if p_decision = 'approved' then
    -- both minor and major recovery land the member back in Active
    perform fn_change_member_status(v_req.member_id,
      case when v_req.type = 'minor' then 'active' else 'active' end, p_note);
  else
    -- send back to the pre-request state
    update members set
      status = case when v_req.type = 'minor' then 'at_risk' else 'defaulted' end,
      status_changed_at = now(), status_changed_by = auth.uid()
    where id = v_req.member_id;
  end if;

  perform _audit('recovery_reviewed', 'recovery_requests', p_request_id, null, to_jsonb(v_req));
  return v_req;
end;
$$;

-- ------------------------------------------------------------------------
-- fn_approve_commission / fn_mark_commission_paid — HO only, enforce the
-- eligibility gate from SRS §6.10 before flipping status.
-- ------------------------------------------------------------------------

create or replace function fn_approve_commission(p_commission_id uuid)
returns commissions
language plpgsql security definer set search_path = public as $$
declare
  v_c commissions;
  v_member members;
  v_quality numeric;
  v_threshold numeric;
  v_open_major boolean;
begin
  if not is_head_office() then
    raise exception 'Only Head Office can approve commissions';
  end if;

  select * into v_c from commissions where id = p_commission_id for update;
  if not found or v_c.status <> 'pending' then
    raise exception 'Commission not found or not pending';
  end if;

  select * into v_member from members where id = v_c.member_id;
  if not v_member.kyc_passed then
    raise exception 'Member has not passed KYC';
  end if;

  select portfolio_quality_score into v_quality from kpi_snapshots
    where officer_id = v_c.officer_id order by period desc limit 1;
  select (value->>'value')::numeric into v_threshold
    from app_config where key = 'commission_min_portfolio_quality';

  if v_quality is not null and v_threshold is not null and v_quality < v_threshold then
    raise exception 'Officer Portfolio Quality Score (%) is below the commission threshold (%)',
      v_quality, v_threshold;
  end if;

  select exists(
    select 1 from compliance_violations
    where officer_id = v_c.officer_id and commission_hold = true
      and created_at > coalesce(
        (select max(paid_at) from commissions where officer_id = v_c.officer_id and paid_at is not null),
        '1970-01-01'
      )
  ) into v_open_major;

  if v_open_major then
    update commissions set status = 'on_hold', hold_reason = 'Open compliance violation'
      where id = p_commission_id returning * into v_c;
    return v_c;
  end if;

  update commissions set status = 'approved', approved_at = now(), approved_by = auth.uid()
    where id = p_commission_id returning * into v_c;

  perform _audit('commission_approved', 'commissions', p_commission_id, null, to_jsonb(v_c));
  return v_c;
end;
$$;

create or replace function fn_mark_commission_paid(p_commission_id uuid)
returns commissions
language plpgsql security definer set search_path = public as $$
declare v_c commissions;
begin
  if not is_head_office() then
    raise exception 'Only Head Office can mark commissions paid';
  end if;
  update commissions set status = 'paid', paid_at = now()
    where id = p_commission_id and status = 'approved'
    returning * into v_c;
  if not found then
    raise exception 'Commission not found or not approved';
  end if;
  perform _audit('commission_paid', 'commissions', p_commission_id, null, to_jsonb(v_c));
  return v_c;
end;
$$;

-- ------------------------------------------------------------------------
-- fn_record_compliance_violation — HO only. Major violations trigger
-- immediate suspension + commission hold (SRS §6.9).
-- ------------------------------------------------------------------------

create or replace function fn_record_compliance_violation(
  p_officer_id uuid,
  p_violation_type_id uuid,
  p_description text default null
) returns compliance_violations
language plpgsql security definer set search_path = public as $$
declare
  v_type compliance_violation_types;
  v_violation compliance_violations;
begin
  if not is_head_office() then
    raise exception 'Only Head Office can record compliance violations';
  end if;

  select * into v_type from compliance_violation_types where id = p_violation_type_id;
  if not found then raise exception 'Unknown violation type'; end if;

  insert into compliance_violations
    (officer_id, violation_type_id, severity, description, points_deducted, commission_hold, reviewed_by)
  values
    (p_officer_id, p_violation_type_id, v_type.severity, p_description,
     v_type.points_deducted, v_type.auto_commission_hold, auth.uid())
  returning * into v_violation;

  update officers set compliance_points = greatest(0, compliance_points - v_type.points_deducted)
    where id = p_officer_id;

  if v_type.severity = 'major' then
    update officers set status = 'suspended' where id = p_officer_id;
    update commissions set status = 'on_hold', hold_reason = 'Major compliance violation'
      where officer_id = p_officer_id and status = 'pending';
  end if;

  perform _audit('compliance_violation', 'compliance_violations', v_violation.id, null, to_jsonb(v_violation));
  return v_violation;
end;
$$;

-- ------------------------------------------------------------------------
-- SCHEDULED JOBS (run by pg_cron as the postgres role — not reachable by
-- authenticated users, so no role check needed inside, but they only ever
-- touch the automatic/system parts of the lifecycle).
-- ------------------------------------------------------------------------

-- Nightly: advance Active members through Due Soon -> Needs Follow-up ->
-- At Risk -> Defaulted based on last_contribution_date + frequency
-- thresholds (SRS §6.7).
create or replace function fn_system_advance_lifecycle()
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := current_date;
begin
  -- Active -> Due Soon: contribution due date reached. Stage 1 has no
  -- explicit "next due date" field, so this treats last_contribution_date
  -- + 1 period as the due date.
  update members m set status = 'due_soon', status_changed_at = now()
  where m.status = 'active' and m.last_contribution_date is not null and (
    (m.savings_frequency = 'daily'   and m.last_contribution_date < v_today) or
    (m.savings_frequency = 'weekly'  and m.last_contribution_date <= v_today - 7) or
    (m.savings_frequency = 'monthly' and m.last_contribution_date <= v_today - 30)
  );

  -- Due Soon -> Needs Follow-up: day after due date, all frequencies
  update members m set status = 'needs_follow_up', status_changed_at = now()
  where m.status = 'due_soon' and m.last_contribution_date is not null and (
    (m.savings_frequency = 'daily'   and m.last_contribution_date <= v_today - 2) or
    (m.savings_frequency = 'weekly'  and m.last_contribution_date <= v_today - 8) or
    (m.savings_frequency = 'monthly' and m.last_contribution_date <= v_today - 31)
  );

  -- Needs Follow-up -> At Risk
  update members m set status = 'at_risk', status_changed_at = now()
  where m.status = 'needs_follow_up' and m.last_contribution_date is not null and (
    (m.savings_frequency = 'daily'   and m.last_contribution_date <= v_today - 3) or   -- misses 2-5 days
    (m.savings_frequency = 'weekly'  and m.last_contribution_date <= v_today - 15) or  -- misses 1-2 weeks
    (m.savings_frequency = 'monthly' and m.last_contribution_date <= v_today - 32)      -- 1-14 days overdue
  );

  -- At Risk -> Defaulted
  update members m set status = 'defaulted', status_changed_at = now()
  where m.status = 'at_risk' and m.last_contribution_date is not null and (
    (m.savings_frequency = 'daily'   and m.last_contribution_date <= v_today - 6) or    -- >5 consecutive days
    (m.savings_frequency = 'weekly'  and m.last_contribution_date <= v_today - 22) or   -- into 3rd missed week
    (m.savings_frequency = 'monthly' and m.last_contribution_date <= v_today - 46)      -- 15+ days overdue
  );
end;
$$;

-- Monthly: write a kpi_snapshots row per officer using the Acquisition
-- Score / Portfolio Quality Score formulas in SRS §6.1-§6.3.
create or replace function fn_generate_kpi_snapshots(p_period date default date_trunc('month', current_date)::date)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int; v_at_risk int; v_defaulted int;
  v_at_risk_rate numeric; v_default_rate numeric;
  v_quality numeric; v_acq_score numeric;
begin
  for r in select id from officers where role = 'portfolio_officer' and status = 'active' loop
    select count(*) into v_total from members
      where officer_id = r.id and is_archived = false
      and status not in ('registration_pending','pending_approval','reassigned');

    select count(*) into v_at_risk from members
      where officer_id = r.id and status in ('at_risk','minor_recovery_request');

    select count(*) into v_defaulted from members
      where officer_id = r.id and status in ('defaulted','major_recovery_request','recovery_pending_review');

    v_at_risk_rate := case when v_total > 0 then (v_at_risk::numeric / v_total) * 100 else 0 end;
    v_default_rate := case when v_total > 0 then (v_defaulted::numeric / v_total) * 100 else 0 end;

    v_quality := 100
      - case
          when v_at_risk_rate >= 15 then 5 when v_at_risk_rate >= 10 then 4
          when v_at_risk_rate >= 5 then 2 else 0 end
      - case
          when v_default_rate >= 10 then 15 when v_default_rate >= 5 then 10
          when v_default_rate >= 2 then 5 else 0 end;
    v_quality := least(100, greatest(0, v_quality));

    select coalesce(sum(
      case
        when event_name = 'approved_acquisition' then (
          select count(*) from audit_log where actor_id is not null
            and table_name = 'members' and action = 'status_change'
            and new_value->>'status' = 'approved_acquisition'
            and record_id in (select id from members where officer_id = r.id)
            and created_at >= p_period and created_at < p_period + interval '1 month'
        ) * points
        when event_name = 'qualified_member' then (
          select count(*) from audit_log where actor_id is not null
            and table_name = 'members' and action = 'status_change'
            and new_value->>'status' = 'qualified_member'
            and record_id in (select id from members where officer_id = r.id)
            and created_at >= p_period and created_at < p_period + interval '1 month'
        ) * points
        else 0
      end
    ), 0) into v_acq_score
    from acquisition_score_config where active = true;

    insert into kpi_snapshots (
      officer_id, period, acquisition_score, portfolio_quality_score,
      overall_performance_score, total_portfolio, at_risk_count, defaulted_count,
      at_risk_rate, default_rate, compliance_points
    ) values (
      r.id, p_period, v_acq_score, v_quality, v_acq_score + v_quality,
      v_total, v_at_risk, v_defaulted, v_at_risk_rate, v_default_rate,
      (select compliance_points from officers where id = r.id)
    )
    on conflict (officer_id, period) do update set
      acquisition_score = excluded.acquisition_score,
      portfolio_quality_score = excluded.portfolio_quality_score,
      overall_performance_score = excluded.overall_performance_score,
      total_portfolio = excluded.total_portfolio,
      at_risk_count = excluded.at_risk_count,
      defaulted_count = excluded.defaulted_count,
      at_risk_rate = excluded.at_risk_rate,
      default_rate = excluded.default_rate,
      compliance_points = excluded.compliance_points;
  end loop;
end;
$$;

-- Wire up pg_cron (Supabase enables the pg_cron extension per-project —
-- turn it on under Database > Extensions first). Wrapped so the migration
-- still succeeds if pg_cron isn't enabled yet; re-run this block manually
-- from the SQL editor once you've enabled it.
do $$
begin
  perform cron.schedule('nightly-lifecycle-advance', '0 1 * * *', $c$select fn_system_advance_lifecycle();$c$);
  perform cron.schedule('monthly-kpi-snapshot', '5 0 1 * *', $c$select fn_generate_kpi_snapshots();$c$);
exception when undefined_table or undefined_function or invalid_schema_name then
  raise notice 'pg_cron not enabled yet — enable it under Database > Extensions, then run the cron.schedule calls at the bottom of 0003_functions.sql manually.';
end;
$$;
