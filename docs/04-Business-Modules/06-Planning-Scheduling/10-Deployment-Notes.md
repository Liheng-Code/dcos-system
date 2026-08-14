# 10 — Deployment Notes
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/10-Deployment-Notes.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## 1. Migration Order

PLN migrations must run after the following modules are fully migrated:

1. Core auth and tenant tables (Phase 1, migrations 001–010)
2. `projects` table — PLN references `projects(id)`
3. `wbs_nodes` table — PLN references `wbs_nodes(id)` on pln_activities
4. `project_calendars` table — required for working-day CPM calculation
5. `auth.users` — referenced by created_by on all PLN tables

**Migration file naming convention:**
```
20260701000001_create_pln_programmes.sql
20260701000002_create_pln_activities.sql
20260701000003_create_pln_activity_links.sql
20260701000004_create_pln_baselines.sql
20260701000005_create_pln_progress_updates.sql
20260701000006_create_pln_lookaheads.sql
20260701000007_create_pln_delay_events.sql
20260701000008_create_pln_scurve_snapshots.sql
20260701000009_create_pln_rpc_functions.sql
20260701000010_create_pln_rls_policies.sql
```

Each migration is atomic — do not combine table creation with RPC function creation in the same file. This enables individual rollback if needed.

---

## 2. RLS Policies Deployment

All RLS policies must be applied after the `project_team_members` table exists (it provides the role-to-project mapping). RLS policies reference:

```sql
auth.jwt()->>'tenant_id'   -- for tenant isolation
auth.uid()                  -- for created_by comparisons
```

The database-engineer must verify that the Supabase JWT includes `tenant_id` in the claims before deploying PLN RLS. If tenant_id is not in the JWT, RLS SELECT will return empty results for all users.

**CLIENT role RLS:** The CLIENT role is a special JWT claim value. The `pln_programmes` RLS policy for CLIENT role must filter `status IN ('approved_client', 'active')`. Test this with a CLIENT-role JWT in a staging environment before production deployment.

---

## 3. pg_cron / Async CPM

The CPM function `run_pln_cpm` is called from the Next.js API route after progress confirmation and data date advancement. For Phase 2, this is a synchronous RPC call — the API awaits the result before returning. This is acceptable for programmes up to ~500 activities.

If a pg_cron-based async approach is added in a later phase:

```sql
-- Install pg_cron extension (if not already enabled)
select cron.schedule(
  'pln_cpm_dirty_check',
  '*/5 * * * *',  -- every 5 minutes
  $$
    select run_pln_cpm(id)
    from pln_programmes
    where cpm_dirty = true
      and deleted_at is null;
  $$
);
```

This requires adding a `cpm_dirty boolean default false` column to `pln_programmes` and a trigger that sets it on insert/update of pln_activities and pln_activity_links. **This is a Phase 3 enhancement.** Do not implement in Phase 2.

---

## 4. Supabase Storage Buckets

PLN requires the following Supabase Storage bucket (create if not already exists):

```
bucket: pln-documents
policy: authenticated read for project members; planner/pm write
path pattern: {tenant_id}/{project_id}/pln/{programme_id}/{filename}
```

This bucket stores:
- Lookahead PDFs exported by the Planner
- Programme Gantt PDF exports
- Monthly progress report PDFs (auto-generated on data date advance)

If Document Control module already created a general `project-documents` bucket, PLN files may be stored there with the same path pattern rather than a dedicated bucket. Coordinate with the database-engineer.

---

## 5. Environment Variables

No new environment variables are required for PLN. It uses the existing:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY  (for server-side RPC calls and materialisation)
```

The `SUPABASE_SERVICE_ROLE_KEY` is used in the `advance-date` API route to call `materialise_pln_scurve` as a service role (bypassing RLS for the write to pln_scurve_snapshots). Ensure this key is in the Vercel environment variables and is never exposed to the client bundle.

---

## 6. Seed Data

PLN has no required seed data. However, for development and testing, the database-engineer should provide a seed script that creates:

- 1 test project with a contract end date 18 months from now
- 1 master programme with 20 activities in a realistic construction sequence (site clearing → foundations → structure → MEP → finishes)
- 1 contract baseline
- Dependency links creating a valid CPM network
- A published 2-week lookahead

Seed script location: `supabase/seed/seed_pln_demo.sql`

---

## 7. Rollback Plan

If a PLN migration must be rolled back:

1. Drop PLN tables in reverse order (pln_scurve_snapshots → pln_delay_event_activities → pln_delay_events → pln_lookahead_items → pln_lookaheads → pln_progress_updates → pln_baselines → pln_activity_links → pln_activities → pln_programmes).
2. Drop all RPC functions with `drop function if exists run_pln_cpm, check_pln_dependency_cycle, materialise_pln_scurve, get_pln_activity_progress, snapshot_pln_baseline, advance_pln_data_date`.
3. Remove PLN API routes from the Next.js deployment.

**Data loss warning:** Rolling back PLN after any data has been entered will permanently destroy all programme, activity, baseline, and progress data. A Supabase point-in-time restore is preferable to a rollback after go-live.

---

## 8. Feature Flag

PLN should be gated behind a feature flag in the DCOS sidebar navigation until the database migrations and RLS policies are verified in staging:

```typescript
// apps/web/components/dashboard/sidebar.tsx
const PLN_ENABLED = process.env.NEXT_PUBLIC_PLN_ENABLED === 'true';
```

Set `NEXT_PUBLIC_PLN_ENABLED=true` in Vercel environment variables once the module passes the regression checklist (Doc 09).

---

## 9. Post-Deployment Verification

After deploying to production, verify:

- [ ] `pln_programmes` table exists with correct columns and constraints
- [ ] All RLS policies active: `select * from pg_policies where tablename like 'pln_%'`
- [ ] `run_pln_cpm` function callable via Supabase dashboard SQL editor with a test programme_id
- [ ] Supabase Storage bucket `pln-documents` exists and is accessible
- [ ] Feature flag `NEXT_PUBLIC_PLN_ENABLED=true` set in Vercel
- [ ] At least one planner role assignment exists in a test project for smoke testing
- [ ] PLN-01 (Programme List) loads without errors for authenticated user
- [ ] CPM runs successfully after creating 3 test activities with FS dependency
