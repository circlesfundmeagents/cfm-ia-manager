# CirclesFundMe Ops — Stage 1 MVP

Field-force operations app: member lifecycle, KPIs, commissions, compliance,
promotions. Static frontend (Vite + React) on GitHub Pages, all business
logic in Supabase (Postgres + RLS + SECURITY DEFINER functions + pg_cron).

Nothing money- or status-sensitive is ever computed in the browser — see
`supabase/migrations/0003_functions.sql` for the functions that own every
state transition, score, and commission amount.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project. Pick a region
   close to your officers (e.g. an EU or nearest available region for
   Nigeria-based users), set a strong database password, save it somewhere
   safe.
2. Once it's provisioned, go to **Database → Extensions** and enable
   `pg_cron` (needed for the nightly lifecycle job and monthly KPI
   snapshots — the migration runs fine without it, but the two scheduled
   jobs at the bottom of `0003_functions.sql` need it).
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Run the database migrations

In the Supabase dashboard, open **SQL Editor** and run these files **in
order**, pasting each one's contents and clicking Run:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions.sql`
4. `supabase/migrations/0004_auth_trigger.sql`
5. `supabase/seed.sql`

(If you'd rather use the Supabase CLI: `supabase link` then
`supabase db push` will apply everything in `supabase/migrations/` in
order automatically.)

If `0003` prints a notice that pg_cron isn't enabled, go back and enable it
under Extensions, then re-run just the `do $$ ... $$;` block at the bottom
of that file.

## 3. Create your first Head Office Administrator

Officers can't self-register into privileged roles — every new signup
starts as an unranked Portfolio Officer (`0004_auth_trigger.sql`). To
bootstrap:

1. Run the app locally (steps below) and sign up with your own email —
   this creates your login **and** a matching `officers` row.

   Actually — for Stage 1, officer accounts are provisioned by HO, not
   self-serve signup. The simplest path for your very first HO account:
   in the Supabase dashboard go to **Authentication → Users → Add user**,
   create yourself with an email + password, which fires the same trigger
   and creates your `officers` row.
2. In the **SQL Editor**, run:
   ```sql
   update officers set role = 'head_office_admin', rank = 'area_manager'
   where email = 'you@example.com';
   ```
3. Log in — you'll land on the Head Office Dashboard.

For every officer after that, add them the same way (Authentication → Add
user), then as HO use Supabase's table editor (or a future "Manage
Officers" screen — not yet built, see Roadmap below) to set their `role`,
`rank`, `team_id`, and `branch_id`.

## 4. Run the frontend locally

```bash
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev
```

## 5. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set Source to "GitHub Actions".
3. In **Settings → Secrets and variables → Actions**:
   - Add secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Add a repository **variable** `BASE_PATH` set to `/<your-repo-name>/`
     (e.g. `/circlesfundme-ops/`). This has to match your repo name so
     asset paths resolve correctly on Pages.
4. Push to `main` — `.github/workflows/deploy.yml` builds and deploys
   automatically. Your app will be live at
   `https://<your-username>.github.io/<your-repo-name>/`.

## What's built vs. what's scaffolded

**Fully built, matches the spec:**
- Complete schema (§5): all tables, enums, config tables.
- RLS policies (§5.10) for every role/scope combination in §2.
- The full state machine (§3) enforced server-side — `fn_change_member_status`
  is the *only* way status changes, validated against an explicit
  transition table.
- Commission lifecycle (§6.10): auto-created on reaching Qualified Member,
  gated on Portfolio Quality Score threshold + KYC + compliance holds
  before approval.
- Compliance violations (§6.9): major violations auto-suspend the officer
  and hold their pending commissions.
- Recovery workflow (§7.3): minor/major, with the 2-cycle proof gate on
  major recovery enforced in the function, not the UI.
- Nightly lifecycle advancement + monthly KPI snapshot generation
  (§6.2, §9) as pg_cron jobs.
- Frontend: login, Portfolio Officer dashboard, daily report form,
  earnings, leaderboard (scope handled entirely by RLS — same query works
  for every role), performance history, HO dashboard, and the full HO
  approvals workflow (acquisitions, recovery requests, commission runs).

**Stubbed or not yet built** — these don't touch the security-sensitive
core, so they're safe to build incrementally:
- Team Leader / Branch Manager / GAM dashboards currently reuse the PO
  view. They need their own aggregate queries (RLS already scopes the
  underlying data correctly for these roles — see `kpi_snapshots` and
  `members` policies — the work left is purely UI).
- A "Manage Officers" screen for HO (currently done via Supabase table
  editor — see step 3 above).
- Training records, Suggestions, and Promotions screens (tables + RLS
  exist; no UI yet).
- Recovery evidence file upload to Supabase Storage (the `evidence_urls`
  column and RLS-ready private bucket pattern are there; wiring up
  `supabase.storage.upload()` from the Daily Report form is the remaining
  step).

## Open items from the SRS (§10) — defaults used here

These don't block using the app; all are one-line changes in
`supabase/seed.sql` or the `acquisition_score_config` / `app_config`
tables, no redeploy needed:
- Acquisition Score points: 1/approved acquisition, 3/qualified member,
  +10 bonus at 20 qualified members/month.
- Compliance violation points: seeded with a few example minor/major
  types — add your real list in `compliance_violation_types`.
- Commission-run Portfolio Quality threshold: set to 70.
- "Registered" and "Pending Approval" are kept as two separate states in
  the schema, so you can split their HO review steps later without a
  migration.
- Weekly saver cycle: implemented as "4 completed contributions" per the
  SRS, tracked via `members.cycles_completed`.
