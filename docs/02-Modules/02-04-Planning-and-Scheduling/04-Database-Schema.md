# 04 — Database Schema
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/04-Database-Schema.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## Architecture Decision

PLN creates its own `pln_activities` table. The existing `wbs_tasks` table is NOT reused for
scheduling. Both tables share `wbs_node_id` as the join key. `wbs_tasks` remains for
execution-level task tracking; `pln_activities` is the scheduling backbone (ADR-PLN-001).

---

## Table Definitions

---

### pln_programmes

The programme header record. One project may have multiple programmes; exactly one may be
`is_master = true` at a time.

```sql
create table public.pln_programmes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  project_id          uuid not null references public.projects(id) on delete restrict,
  programme_name      text not null,
  description         text,
  programme_type      text not null default 'master'
                        check (programme_type in ('master','sub','commissioning','fitout','other')),
  status              text not null default 'draft'
                        check (status in (
                          'draft','submitted_internal','approved_internal',
                          'submitted_client','approved_client','rejected_client',
                          'active','superseded','archived'
                        )),
  is_master           boolean not null default false,
  data_date           date,
  contract_start_date date,
  contract_end_date   date,
  revision_number     integer not null default 0,
  rejection_reason    text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id)
);

-- Indexes
create index pln_programmes_tenant_id_idx   on public.pln_programmes(tenant_id);
create index pln_programmes_project_id_idx  on public.pln_programmes(project_id);
create index pln_programmes_status_idx      on public.pln_programmes(status) where deleted_at is null;

-- Enforce one master programme per project
create unique index pln_programmes_master_unique
  on public.pln_programmes(project_id)
  where is_master = true and deleted_at is null;
```

**RLS Policy:**
- SELECT: `tenant_id = auth.jwt()->>'tenant_id'` AND `project_id` is accessible to the user's project membership
- INSERT/UPDATE: requires Planner or PM role on the project
- DELETE: not permitted (use deleted_at)

---

### pln_activities

Individual programme activities. Optionally linked to a WBS node. CPM results are stored here.

```sql
create table public.pln_activities (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null,
  project_id              uuid not null references public.projects(id) on delete restrict,
  programme_id            uuid not null references public.pln_programmes(id) on delete restrict,
  wbs_node_id             uuid references public.wbs_nodes(id) on delete set null,
  parent_activity_id      uuid references public.pln_activities(id) on delete set null,
  activity_code           text not null,
  activity_name           text not null,
  is_summary_band         boolean not null default false,
  activity_type           text not null default 'normal'
                            check (activity_type in ('normal','milestone','summary','buffer')),
  status                  text not null default 'not_started'
                            check (status in (
                              'not_started','in_progress','completed','on_hold','cancelled'
                            )),
  planned_start_date      date,
  planned_finish_date     date,
  planned_duration_days   integer,
  actual_start_date       date,
  actual_finish_date      date,
  actual_progress_pct     numeric(5,2) not null default 0
                            check (actual_progress_pct between 0 and 100),
  remaining_duration_days integer,
  remaining_duration_override boolean not null default false,
  responsible_party       text,
  on_hold_reason          text,
  -- CPM results (read-only, computed by server)
  cpm_early_start         date,
  cpm_early_finish        date,
  cpm_late_start          date,
  cpm_late_finish         date,
  total_float_days        integer,
  is_critical             boolean not null default false,
  cpm_calculated_at       timestamptz,
  sort_order              integer not null default 0,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id)
);

-- Indexes
create index pln_activities_tenant_id_idx    on public.pln_activities(tenant_id);
create index pln_activities_project_id_idx   on public.pln_activities(project_id);
create index pln_activities_programme_id_idx on public.pln_activities(programme_id);
create index pln_activities_wbs_node_id_idx  on public.pln_activities(wbs_node_id) where wbs_node_id is not null;
create index pln_activities_status_idx       on public.pln_activities(status) where deleted_at is null;
create index pln_activities_critical_idx     on public.pln_activities(programme_id, is_critical) where deleted_at is null;

-- Uniqueness: activity_code must be unique within a programme
create unique index pln_activities_code_unique
  on public.pln_activities(programme_id, activity_code)
  where deleted_at is null;

-- Constraint: start must be before finish
alter table public.pln_activities
  add constraint pln_activities_dates_check
  check (planned_start_date is null or planned_finish_date is null
         or planned_start_date <= planned_finish_date);
```

**RLS Policy:**
- SELECT: `tenant_id = auth.jwt()->>'tenant_id'` AND programme is accessible
- INSERT/UPDATE on planning fields: Planner role on project
- UPDATE on actual_progress_pct/actual_start_date: Planner or Site Engineer role
- UPDATE on CPM result columns: service role only (set by server-side RPC)
- DELETE: not permitted (use deleted_at; status → 'cancelled' instead)

---

### pln_activity_links

Dependency graph. Each record is one directed edge: predecessor → successor.

```sql
create table public.pln_activity_links (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  programme_id          uuid not null references public.pln_programmes(id) on delete cascade,
  predecessor_id        uuid not null references public.pln_activities(id) on delete cascade,
  successor_id          uuid not null references public.pln_activities(id) on delete cascade,
  dependency_type       text not null default 'FS'
                          check (dependency_type in ('FS','SS','FF','SF')),
  lag_days              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),

  constraint pln_activity_links_no_self_link check (predecessor_id <> successor_id)
);

-- Indexes
create index pln_activity_links_programme_id_idx   on public.pln_activity_links(programme_id);
create index pln_activity_links_predecessor_id_idx on public.pln_activity_links(predecessor_id);
create index pln_activity_links_successor_id_idx   on public.pln_activity_links(successor_id);

-- Uniqueness: only one link of each type between same pair
create unique index pln_activity_links_pair_unique
  on public.pln_activity_links(predecessor_id, successor_id, dependency_type);
```

**RLS Policy:**
- SELECT: `tenant_id = auth.jwt()->>'tenant_id'`
- INSERT/UPDATE/DELETE: Planner role on project

**Note:** Circular dependency detection is enforced by the server-side RPC `check_pln_dependency_cycle(programme_id, new_predecessor_id, new_successor_id)` before INSERT. The DB constraint does not enforce this — cycle detection requires graph traversal in application logic.

---

### pln_baselines

Point-in-time snapshot of a programme's activities and links. Contract baseline is immutable.

```sql
create table public.pln_baselines (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  programme_id          uuid not null references public.pln_programmes(id) on delete restrict,
  baseline_name         text not null,
  baseline_type         text not null
                          check (baseline_type in ('contract','revised')),
  status                text not null default 'draft'
                          check (status in ('draft','active','superseded','client_accepted')),
  reason_for_revision   text,
  snapshot_data         jsonb not null,
  snapshot_activity_count integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id)
);

-- Indexes
create index pln_baselines_programme_id_idx on public.pln_baselines(programme_id);
create index pln_baselines_status_idx       on public.pln_baselines(status);

-- Enforce one active baseline per programme
create unique index pln_baselines_active_unique
  on public.pln_baselines(programme_id)
  where status = 'active';

-- Enforce one contract baseline per programme
create unique index pln_baselines_contract_unique
  on public.pln_baselines(programme_id)
  where baseline_type = 'contract';
```

**Business Rule Enforcement:**
- `reason_for_revision` must be >= 50 characters when `baseline_type = 'revised'` — enforced at API layer (BR4.02).
- Contract baseline fields are immutable after creation — enforced by RLS: UPDATE is blocked when `baseline_type = 'contract'` for non-service-role callers.

**RLS Policy:**
- SELECT: `tenant_id = auth.jwt()->>'tenant_id'`
- INSERT: Planner or PM role
- UPDATE: Planner or PM role; blocked for contract baselines (checked at API layer)
- DELETE: not permitted

---

### pln_progress_updates

Individual progress submissions from Site Engineers. Pending until Planner confirms.

```sql
create table public.pln_progress_updates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  programme_id          uuid not null references public.pln_programmes(id) on delete restrict,
  activity_id           uuid not null references public.pln_activities(id) on delete restrict,
  data_date             date not null,
  submitted_progress_pct numeric(5,2) not null
                          check (submitted_progress_pct between 0 and 100),
  actual_start_date     date,
  actual_finish_date    date,
  notes                 text,
  status                text not null default 'pending'
                          check (status in ('pending','confirmed','rejected')),
  rejection_reason      text,
  reviewed_by           uuid references auth.users(id),
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id)
);

-- Indexes
create index pln_progress_updates_programme_id_idx on public.pln_progress_updates(programme_id);
create index pln_progress_updates_activity_id_idx  on public.pln_progress_updates(activity_id);
create index pln_progress_updates_data_date_idx    on public.pln_progress_updates(data_date);
create index pln_progress_updates_status_idx       on public.pln_progress_updates(status) where status = 'pending';
```

**RLS Policy:**
- SELECT: `tenant_id = auth.jwt()->>'tenant_id'`
- INSERT: Site Engineer or Planner role
- UPDATE (confirm/reject): Planner role only; `reviewed_by` and `reviewed_at` set by server

---

### pln_lookaheads

Lookahead schedule snapshot header.

```sql
create table public.pln_lookaheads (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  programme_id          uuid not null references public.pln_programmes(id) on delete restrict,
  lookahead_type        text not null
                          check (lookahead_type in ('2_week','4_week')),
  window_start_date     date not null,
  window_end_date       date not null,
  data_date             date not null,
  status                text not null default 'draft'
                          check (status in ('draft','published','closed')),
  plan_completion_rate  numeric(5,2),
  document_id           uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id)
);

-- Indexes
create index pln_lookaheads_programme_id_idx on public.pln_lookaheads(programme_id);
create index pln_lookaheads_data_date_idx    on public.pln_lookaheads(data_date);
```

---

### pln_lookahead_items

Activities included in a lookahead window. Records completion status at window close.

```sql
create table public.pln_lookahead_items (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  lookahead_id          uuid not null references public.pln_lookaheads(id) on delete cascade,
  activity_id           uuid not null references public.pln_activities(id) on delete restrict,
  planned_start_date    date,
  planned_finish_date   date,
  responsible_party     text,
  was_completed         boolean,
  actual_finish_date    date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes
create index pln_lookahead_items_lookahead_id_idx on public.pln_lookahead_items(lookahead_id);
create index pln_lookahead_items_activity_id_idx  on public.pln_lookahead_items(activity_id);
```

---

### pln_delay_events

Delay event records for EOT claims support.

```sql
create table public.pln_delay_events (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  project_id            uuid not null references public.projects(id) on delete restrict,
  programme_id          uuid not null references public.pln_programmes(id) on delete restrict,
  delay_reference       text not null,
  delay_type            text not null
                          check (delay_type in (
                            'employer_caused','force_majeure','weather',
                            'utility_disruption','design_change','instruction',
                            'contractor_caused','concurrent'
                          )),
  responsible_party     text not null,
  delay_start_date      date not null,
  delay_end_date        date,
  delay_duration_days   integer,
  description           text not null,
  status                text not null default 'open'
                          check (status in ('open','under_review','agreed','disputed')),
  eot_claim_id          uuid,
  eot_locked            boolean not null default false,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id)
);

-- Indexes
create index pln_delay_events_project_id_idx   on public.pln_delay_events(project_id);
create index pln_delay_events_programme_id_idx on public.pln_delay_events(programme_id);
create index pln_delay_events_status_idx       on public.pln_delay_events(status) where deleted_at is null;
```

**Note:** `delay_reference` is a human-readable reference code (e.g., "DE-001"). Auto-generated by the API on INSERT using project sequence.

---

### pln_delay_event_activities

Junction table: which activities are impacted by a delay event. Records float at time of link.

```sql
create table public.pln_delay_event_activities (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null,
  delay_event_id          uuid not null references public.pln_delay_events(id) on delete cascade,
  activity_id             uuid not null references public.pln_activities(id) on delete restrict,
  float_at_event_open     integer,
  float_at_event_close    integer,
  created_at              timestamptz not null default now(),

  constraint pln_delay_event_activities_unique unique (delay_event_id, activity_id)
);

-- Indexes
create index pln_delay_event_activities_delay_id_idx    on public.pln_delay_event_activities(delay_event_id);
create index pln_delay_event_activities_activity_id_idx on public.pln_delay_event_activities(activity_id);
```

---

### pln_scurve_snapshots

Materialised S-curve data. One row per programme per date per curve type. Populated after each
data date advance.

```sql
create table public.pln_scurve_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  programme_id        uuid not null references public.pln_programmes(id) on delete cascade,
  baseline_id         uuid references public.pln_baselines(id) on delete set null,
  snapshot_date       date not null,
  data_date           date not null,
  cumulative_planned_pct  numeric(8,4) not null default 0,
  cumulative_actual_pct   numeric(8,4) not null default 0,
  created_at          timestamptz not null default now()
);

-- Indexes
create index pln_scurve_snapshots_programme_id_idx on public.pln_scurve_snapshots(programme_id);
create index pln_scurve_snapshots_date_idx         on public.pln_scurve_snapshots(programme_id, snapshot_date);

-- Uniqueness: one row per programme per snapshot_date per data_date
create unique index pln_scurve_snapshots_unique
  on public.pln_scurve_snapshots(programme_id, snapshot_date, data_date);
```

**Note:** `cumulative_planned_pct` and `cumulative_actual_pct` are cumulative values (0.00–100.00 range as percentage of total). Written by the server-side RPC `materialise_pln_scurve(programme_id, data_date)`.

---

## Entity Relationship Summary

```
projects
  └── pln_programmes (many per project, one is_master)
        ├── pln_activities (many per programme)
        │     ├── pln_activity_links (predecessor → successor)
        │     ├── pln_lookahead_items (via pln_lookaheads)
        │     ├── pln_progress_updates (pending/confirmed/rejected)
        │     └── pln_delay_event_activities (via pln_delay_events)
        ├── pln_baselines (contract + revised snapshots)
        ├── pln_lookaheads (2-week / 4-week windows)
        ├── pln_delay_events (delay events linked to programme)
        └── pln_scurve_snapshots (materialised curve data)

wbs_nodes
  └── pln_activities.wbs_node_id (optional FK — planning-only activities have null)
```

---

## Index Summary

| Table | Indexes |
|---|---|
| pln_programmes | tenant_id, project_id, status (partial), master unique (partial) |
| pln_activities | tenant_id, project_id, programme_id, wbs_node_id, status, is_critical, code unique |
| pln_activity_links | programme_id, predecessor_id, successor_id, pair unique |
| pln_baselines | programme_id, status, active unique (partial), contract unique (partial) |
| pln_progress_updates | programme_id, activity_id, data_date, status (partial) |
| pln_lookaheads | programme_id, data_date |
| pln_lookahead_items | lookahead_id, activity_id |
| pln_delay_events | project_id, programme_id, status (partial) |
| pln_delay_event_activities | delay_event_id, activity_id |
| pln_scurve_snapshots | programme_id, programme_id+snapshot_date, unique per programme+date+data_date |

---

## Server-Side RPC Functions Required

The following Supabase RPC functions must be implemented by the database-engineer:

| Function | Purpose |
|---|---|
| `run_pln_cpm(programme_id uuid)` | Forward/backward pass CPM. Updates ES, EF, LS, LF, total_float_days, is_critical on all activities. Runs async via pg_cron or triggered from API. |
| `check_pln_dependency_cycle(programme_id, pred_id, succ_id)` | Returns boolean — true if adding this link would create a cycle. Call before INSERT on pln_activity_links. |
| `materialise_pln_scurve(programme_id, data_date)` | Computes daily planned and actual cumulative progress and upserts into pln_scurve_snapshots. |
| `get_pln_activity_progress(project_id, data_date)` | Returns confirmed actual_progress_pct per wbs_node_id as of the given data_date. Used by IPC module (pull integration). |
| `snapshot_pln_baseline(programme_id, baseline_name, baseline_type, reason)` | Creates a pln_baselines record with snapshot_data JSONB of all current pln_activities. |
| `advance_pln_data_date(programme_id, new_data_date)` | Validates new_date > current data_date, advances the programme data date, triggers S-curve materialisation. |

---

## Open Questions (carried forward and new)

**From Docs 01/02 (unresolved):**

OQ-4. **Client representative access level** — In-app read-only portal (UC11) vs. PDF transmittals only. The schema supports this (no structural change needed for either option) but the RBAC matrix (Doc 07) must specify the client_viewer role scope. Recommendation: in-app, scoped to approved_client revisions only.

OQ-6. **responsible_party on import** — Free-text on pln_activities.responsible_party (chosen). No FK to HR/users in Phase 2. Future enhancement: link to project_team_members.

**New from Doc 04:**

OQ-12. **CPM execution strategy** — `run_pln_cpm` must handle programmes with 2,000+ activities efficiently. Options: (A) Pure PL/pgSQL iterative forward/backward pass in a single RPC call (simple, may be slow > 5,000 activities). (B) Background job via pg_cron every 5 minutes if programme is dirty. (C) Edge Function for CPM logic (JavaScript, callable asynchronously). Recommendation: A for Phase 2 (construction projects rarely exceed 2,000 activities in DCOS at this stage). Flag for review at 500+ activity threshold.

OQ-13. **Progress regression correction flow** — BR5.02 blocks decreasing progress. The correction request flow (UC06 alternate path) needs its own table (`pln_progress_corrections`) or can reuse `pln_progress_updates` with a `correction_of_id` FK. Decision needed before Doc 05 API design. Recommendation: add `correction_of_id uuid references pln_progress_updates(id)` to the existing `pln_progress_updates` table.

OQ-14. **pln_scurve_snapshots data volume** — For a 3-year project with daily snapshots: ~1,095 rows per programme per data date advance. Over 36 data date advances, ~39,420 rows per programme. Acceptable for Supabase at this scale. No partitioning needed in Phase 2.

OQ-15. **`eot_claim_id` foreign key on pln_delay_events** — The EOT module (Module 39) is not yet designed. The FK is left as `uuid` with no references constraint for now. When Module 39 is designed, add `references eot_claims(id)`.

OQ-16. **`document_id` FK on pln_lookaheads** — References the Document Control module (Module 09). Left as bare `uuid` for now (same pattern as OQ-15).

---

## Hand-off Checklist

- [ ] Doc 01 approved by human
- [ ] Doc 02 approved by human
- [ ] Doc 03 approved by human
- [ ] Doc 04 approved by human
- [ ] OQ-2 resolved: Option A (pln_activities) confirmed — this doc implements that decision
- [ ] OQ-4 resolved: client portal scope confirmed (affects RBAC Doc 07)
- [ ] OQ-13 resolved: progress correction approach before Doc 05 API design
- [ ] OQ-12 noted: CPM execution strategy — Phase 2 uses pure PL/pgSQL; revisit at 500+ activities
- [ ] All 10 tables reviewed: tenant_id on every table — confirmed
- [ ] All FK relationships reviewed and explicit
- [ ] Status CHECK constraints match Doc 02 status lists exactly
- [ ] Money columns: none in PLN — confirmed
- [ ] Progress columns: numeric(5,2) — confirmed
- [ ] Duration columns: integer (days) — confirmed
- [ ] All rejection paths from Doc 02 §3 have supporting columns in schema (rejection_reason, reviewed_by, reviewed_at) — confirmed
- [ ] RPC function list handed to database-engineer
- [ ] commercial-qs review: not required (no money columns in this module)
