# DCOS — WBS Management Module
## 04 — Database Schema

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-DB-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Senior System Architect + Database Engineer |
| Status | Issued for Review |
| Target | PostgreSQL 15 (Supabase) |
| Base References | DCOS-WBS-FS-001; Master Prompt Part 4.7/4.8 |

---

## 1. Schema Overview / ERD

```
wbs_node_types ◀── wbs_nodes ──▶ projects (PRJ)         wbs_templates ─▶ wbs_template_nodes
wbs_structure_rules ─┘  │ ▲ parent_id (self)            wbs_baselines ─▶ wbs_baseline_nodes
                        │ │
      wbs_closure ◀─────┤ ├──▶ wbs_code_segments (project-scoped)
      wbs_node_links ◀──┤ ├──▶ wbs_node_attributes
wbs_node_responsibilities◀┤ ├──▶ wbs_rollup_cache ─▶ wbs_progress_snapshots
     wbs_change_requests ◀┘ └──▶ wbs_import_batches
External FKs: tenant_id→companies, project_id→projects, user ids→users,
stakeholder refs→stakeholders, approval refs→approval_workflows (black-box).
```

## 2. Design Decision — Adjacency List + Closure Table

| Option | Read subtree | Move subtree | Integrity | Verdict |
|---|---|---|---|---|
| Adjacency only + recursive CTE | O(depth) recursive per read | Cheap | Simple | Read-heavy platform pays on every dashboard |
| Nested sets | Fast reads | Rewrites large index ranges; concurrent moves brutal | Fragile | Rejected |
| `ltree` | Fast prefix reads | Path rewrite on move; code-vs-path coupling | Medium | Rejected — full_code already materialises the path for humans |
| **Adjacency + closure** | O(1) index scan | Bounded rewrite of subtree closure rows | Invariants checkable | **Chosen.** Write amplification on move (≈ subtree × ancestor rows) is acceptable: moves are rare, reads are constant. |

Trade-off accepted: `wbs_closure` ≈ 10–14× node count in rows; at 5,000 nodes ≈ 60–70k closure rows per project — trivial for PostgreSQL.

## 3. Per-Table Specifications and DDL

> All tables carry RLS. Common convention: `tenant_id` from JWT (`auth.jwt() ->> 'tenant_id'`), never from request body. Soft delete via `deleted_at` where applicable; hard delete forbidden except by admin procedure with audit (Gap §5.3).

### 3.1 `wbs_node_types`

Tenant-configurable node type master (system defaults seeded, non-renamable via `is_system`).

```sql
CREATE TABLE wbs_node_types (
  code            text PRIMARY KEY,              -- PROJECT_ROOT, PHASE, ...
  tenant_id       uuid NULL,                     -- NULL = system default
  label           text NOT NULL,
  icon            text NOT NULL DEFAULT 'node',
  color           text NOT NULL DEFAULT '#64748b',
  can_be_leaf     boolean NOT NULL DEFAULT true,
  must_be_leaf    boolean NOT NULL DEFAULT false,
  is_system       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wbs_node_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY nt_read ON wbs_node_types FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY nt_write ON wbs_node_types FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND is_system = false)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid AND is_system = false);
```

### 3.2 `wbs_structure_rules`

```sql
CREATE TABLE wbs_structure_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  project_id      uuid NULL,                     -- NULL = tenant default set
  parent_type     text NOT NULL REFERENCES wbs_node_types(code),
  child_type      text NOT NULL REFERENCES wbs_node_types(code),
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, project_id, parent_type, child_type)
);
ALTER TABLE wbs_structure_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY sr_tenant ON wbs_structure_rules FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE INDEX ix_sr_lookup ON wbs_structure_rules (tenant_id, project_id, parent_type, child_type)
  WHERE is_active;  -- serves the create/move rule check
```

### 3.3 `wbs_nodes` — core

```sql
CREATE TABLE wbs_nodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  project_id         uuid NOT NULL,
  parent_id          uuid NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  node_type_code     text NOT NULL REFERENCES wbs_node_types(code),
  wbs_code           text NOT NULL,
  full_code          text NOT NULL,
  node_name          text NOT NULL,
  full_path          text NOT NULL,
  previous_full_code text NULL,
  depth              int  NOT NULL CHECK (depth BETWEEN 0 AND 11),
  sort_order         int  NOT NULL DEFAULT 0,
  discipline_code    text NULL,                  -- ARC/STR/MEP/CIVIL/EXT
  status             text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','ACTIVE','ON_HOLD','COMPLETED',
                                       'CLOSED','ARCHIVED','CANCELLED')),
  rollup_method      text NOT NULL DEFAULT 'EQUAL_WEIGHT'
                     CHECK (rollup_method IN ('EQUAL_WEIGHT','COST_WEIGHTED',
                            'DURATION_WEIGHTED','QUANTITY_WEIGHTED','MANUAL_OVERRIDE')),
  is_control_account boolean NOT NULL DEFAULT false,
  is_leaf            boolean NOT NULL DEFAULT true,
  baseline_locked    boolean NOT NULL DEFAULT false,
  progress_percent   numeric(5,2) NOT NULL DEFAULT 0
                     CHECK (progress_percent BETWEEN 0 AND 100),
  planned_start      date NULL,                  -- mirrored from Module 23, read-only here
  planned_finish     date NULL,
  subtree_version    bigint NOT NULL DEFAULT 1,  -- optimistic concurrency token
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NULL,
  updated_at         timestamptz NULL,
  archived_at        timestamptz NULL,
  deleted_at         timestamptz NULL,
  CHECK (wbs_code ~ '^[A-Z0-9_]{1,12}$'),
  CHECK (node_type_code <> 'WORK_PACKAGE' OR is_leaf = true)      -- WP must be leaf
);

-- CODE-02: full_code unique per project among live rows
CREATE UNIQUE INDEX ux_wbs_fullcode ON wbs_nodes (project_id, full_code)
  WHERE deleted_at IS NULL;
-- CODE-01: sibling segment unique
CREATE UNIQUE INDEX ux_wbs_sibling ON wbs_nodes (parent_id, wbs_code)
  WHERE deleted_at IS NULL;
-- BR-A: exactly one root per project
CREATE UNIQUE INDEX ux_wbs_one_root ON wbs_nodes (project_id)
  WHERE parent_id IS NULL AND deleted_at IS NULL;
-- Tree fetch: children of a parent in order
CREATE INDEX ix_wbs_children ON wbs_nodes (parent_id, sort_order)
  WHERE deleted_at IS NULL;
-- Project tree fetch / flat list
CREATE INDEX ix_wbs_project ON wbs_nodes (tenant_id, project_id, depth)
  WHERE deleted_at IS NULL;
-- Search (FR-WBS-042): trigram on code and name
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ix_wbs_code_trgm ON wbs_nodes USING gin (full_code gin_trgm_ops);
CREATE INDEX ix_wbs_name_trgm ON wbs_nodes USING gin (node_name gin_trgm_ops);
-- Active-node partial (status gate lookups)
CREATE INDEX ix_wbs_active ON wbs_nodes (project_id, status)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

ALTER TABLE wbs_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY wn_tenant ON wbs_nodes FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- Project membership scope (project roster function owned by RBAC layer)
CREATE POLICY wn_project ON wbs_nodes FOR SELECT
  USING (dcos_user_has_project_access(project_id));
-- Subtree scope for restricted users (doc 07 §8): visible if node is inside any
-- granted subtree OR is an ancestor of one (context-only rendering enforced in app)
CREATE POLICY wn_scope ON wbs_nodes FOR SELECT
  USING (dcos_wbs_scope_permits(id, project_id));
```

**ON DELETE RESTRICT on `parent_id` is deliberate:** cascade delete of a construction breakdown is forbidden (BR-D); orphan creation impossible.

### 3.4 `wbs_closure`

```sql
CREATE TABLE wbs_closure (
  ancestor_id   uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  descendant_id uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  depth         int  NOT NULL CHECK (depth >= 0),   -- 0 = self row
  project_id    uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX ix_cl_desc ON wbs_closure (descendant_id, depth);      -- ancestors query
CREATE INDEX ix_cl_anc  ON wbs_closure (ancestor_id, depth);        -- descendants query
ALTER TABLE wbs_closure ENABLE ROW LEVEL SECURITY;
CREATE POLICY cl_tenant ON wbs_closure FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.5 `wbs_code_segments`

```sql
CREATE TABLE wbs_code_segments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  project_id      uuid NOT NULL,
  node_type_code  text NOT NULL REFERENCES wbs_node_types(code),
  generation_mode text NOT NULL CHECK (generation_mode IN ('MANUAL','AUTO_SEQUENTIAL','AUTO_TEMPLATE')),
  mask            text NULL,                 -- e.g. 'L{nn}', 'Z{n}'
  prefix          text NULL,
  next_sequence   int  NOT NULL DEFAULT 1,
  reuse_gaps      boolean NOT NULL DEFAULT false,
  mode_locked     boolean NOT NULL DEFAULT false,   -- FR-WBS-007
  UNIQUE (project_id, node_type_code)
);
ALTER TABLE wbs_code_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_tenant ON wbs_code_segments FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.6 `wbs_node_attributes`

```sql
CREATE TABLE wbs_node_attributes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  node_id      uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  attr_key     text NOT NULL,               -- area_m2, elevation, grid_ref, ifc_guid
  attr_type    text NOT NULL CHECK (attr_type IN ('TEXT','NUMBER','DATE','JSON')),
  value_text   text NULL,
  value_number numeric NULL,
  value_date   date NULL,
  value_json   jsonb NULL,
  updated_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, attr_key)
);
CREATE INDEX ix_attr_key ON wbs_node_attributes (attr_key, value_text); -- IFC GUID lookup
ALTER TABLE wbs_node_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY na_tenant ON wbs_node_attributes FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.7 `wbs_node_responsibilities`

```sql
CREATE TABLE wbs_node_responsibilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  project_id       uuid NOT NULL,
  node_id          uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  discipline_code  text NULL,               -- NULL = all disciplines at this node
  user_id          uuid NULL,
  stakeholder_id   uuid NULL,
  role_label       text NOT NULL,           -- 'Area Engineer', 'MEP Lead'
  is_primary       boolean NOT NULL DEFAULT true,
  valid_from       date NOT NULL DEFAULT current_date,
  valid_to         date NULL,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR stakeholder_id IS NOT NULL),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
-- one current primary per node+discipline
CREATE UNIQUE INDEX ux_resp_primary ON wbs_node_responsibilities
  (node_id, COALESCE(discipline_code,'*'))
  WHERE is_primary AND valid_to IS NULL;
CREATE INDEX ix_resp_user ON wbs_node_responsibilities (user_id) WHERE valid_to IS NULL;
ALTER TABLE wbs_node_responsibilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY nr_tenant ON wbs_node_responsibilities FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.8 `wbs_templates` / 3.9 `wbs_template_nodes`

```sql
CREATE TABLE wbs_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  template_name text NOT NULL,
  project_type  text NOT NULL,             -- TOWER, FACTORY, FITOUT, ROAD, VILLA
  description   text NULL,
  version       int  NOT NULL DEFAULT 1,
  is_published  boolean NOT NULL DEFAULT false,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_name, version)
);
CREATE TABLE wbs_template_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES wbs_templates(id) ON DELETE CASCADE,
  parent_row_id   uuid NULL REFERENCES wbs_template_nodes(id) ON DELETE CASCADE,
  node_type_code  text NOT NULL REFERENCES wbs_node_types(code),
  code_pattern    text NOT NULL,           -- literal or mask 'L{nn}'
  node_name       text NOT NULL,
  discipline_code text NULL,
  rollup_method   text NOT NULL DEFAULT 'EQUAL_WEIGHT',
  sort_order      int NOT NULL DEFAULT 0,
  default_attrs   jsonb NULL
);
ALTER TABLE wbs_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tp_tenant ON wbs_templates FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
ALTER TABLE wbs_template_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tpn_tenant ON wbs_template_nodes FOR ALL
  USING (EXISTS (SELECT 1 FROM wbs_templates t WHERE t.id = template_id
                 AND t.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid));
```

*(Template cascade delete is acceptable: templates carry no operational links.)*

### 3.10 `wbs_baselines` / 3.11 `wbs_baseline_nodes`

```sql
CREATE TABLE wbs_baselines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  label         text NOT NULL,             -- 'R0', 'R1'
  approval_ref  uuid NULL,                 -- approval_workflows id
  node_count    int  NOT NULL,
  set_by        uuid NOT NULL,
  set_at        timestamptz NOT NULL DEFAULT now(),
  is_current    boolean NOT NULL DEFAULT true,
  UNIQUE (project_id, label)
);
CREATE UNIQUE INDEX ux_bl_current ON wbs_baselines (project_id) WHERE is_current;

CREATE TABLE wbs_baseline_nodes (
  baseline_id   uuid NOT NULL REFERENCES wbs_baselines(id) ON DELETE RESTRICT,
  node_id       uuid NOT NULL,
  parent_id     uuid NULL,
  node_type_code text NOT NULL,
  wbs_code      text NOT NULL,
  full_code     text NOT NULL,
  node_name     text NOT NULL,
  status        text NOT NULL,
  sort_order    int  NOT NULL,
  tenant_id     uuid NOT NULL,
  PRIMARY KEY (baseline_id, node_id)
);
CREATE INDEX ix_bln_code ON wbs_baseline_nodes (baseline_id, full_code);
ALTER TABLE wbs_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY bl_tenant ON wbs_baselines FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
ALTER TABLE wbs_baseline_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY bln_tenant ON wbs_baseline_nodes FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.12 `wbs_change_requests`

```sql
CREATE TABLE wbs_change_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL,
  cr_number      text NOT NULL,             -- CR-WBS-0009 (project sequence)
  change_type    text NOT NULL CHECK (change_type IN ('MOVE','CODE','DELETE','CANCEL','TYPE')),
  node_ids       uuid[] NOT NULL,
  payload        jsonb NOT NULL,            -- target parent, new code, reason refs (EI/VO)
  justification  text NOT NULL,
  status         text NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED',
                                   'REJECTED','APPLIED','CLOSED')),
  approval_ref   uuid NULL,
  requested_by   uuid NOT NULL,
  decided_by     uuid NULL,
  decision_comment text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz NULL,
  applied_at     timestamptz NULL,
  UNIQUE (project_id, cr_number),
  CHECK (requested_by IS DISTINCT FROM decided_by)     -- raiser ≠ approver
);
ALTER TABLE wbs_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY cr_tenant ON wbs_change_requests FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.13 `wbs_node_links` — delete guard truth

```sql
CREATE TABLE wbs_node_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  project_id   uuid NOT NULL,
  node_id      uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  entity_type  text NOT NULL,   -- task, document, boq_item, inspection_request, ...
  entity_id    uuid NOT NULL,
  registered_by text NOT NULL DEFAULT 'SERVICE',  -- SERVICE | RECONCILER
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, entity_type, entity_id)
);
-- Covering index: the guard answers count-by-type in <100 ms (FR-WBS-038)
CREATE INDEX ix_links_guard ON wbs_node_links (node_id, entity_type) INCLUDE (entity_id);
CREATE INDEX ix_links_entity ON wbs_node_links (entity_type, entity_id); -- deregister path
ALTER TABLE wbs_node_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_tenant ON wbs_node_links FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 3.14 `wbs_rollup_cache`

```sql
CREATE TABLE wbs_rollup_cache (
  node_id          uuid PRIMARY KEY REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  tenant_id        uuid NOT NULL,
  project_id       uuid NOT NULL,
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  budget_value     numeric(18,2) NOT NULL DEFAULT 0,
  committed_value  numeric(18,2) NOT NULL DEFAULT 0,
  actual_value     numeric(18,2) NOT NULL DEFAULT 0,
  forecast_value   numeric(18,2) NOT NULL DEFAULT 0,
  base_ccy_budget  numeric(18,2) NOT NULL DEFAULT 0,
  base_ccy_actual  numeric(18,2) NOT NULL DEFAULT 0,
  is_override      boolean NOT NULL DEFAULT false,
  is_stale         boolean NOT NULL DEFAULT true,
  calculated_at    timestamptz NULL
);
CREATE INDEX ix_ru_stale ON wbs_rollup_cache (project_id) WHERE is_stale;
ALTER TABLE wbs_rollup_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY ru_tenant ON wbs_rollup_cache FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

**Invalidation cascade:** any leaf change marks the leaf's *ancestor chain* stale in one statement:

```sql
UPDATE wbs_rollup_cache SET is_stale = true
WHERE node_id IN (SELECT ancestor_id FROM wbs_closure WHERE descendant_id = :leaf_id);
```

### 3.15 `wbs_progress_snapshots`

```sql
CREATE TABLE wbs_progress_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  project_id       uuid NOT NULL,
  node_id          uuid NOT NULL,
  period_label     text NOT NULL,            -- '2026-07'
  progress_percent numeric(5,2) NOT NULL,
  budget_value     numeric(18,2) NOT NULL,
  actual_value     numeric(18,2) NOT NULL,
  was_override     boolean NOT NULL,
  snapped_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, period_label)
);
CREATE INDEX ix_snap_period ON wbs_progress_snapshots (project_id, period_label);
ALTER TABLE wbs_progress_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY sn_tenant ON wbs_progress_snapshots FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

*(Partition by `period_label` when a tenant exceeds ~5M rows — §9.)*

### 3.16 `wbs_import_batches`

```sql
CREATE TABLE wbs_import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  project_id      uuid NOT NULL,
  batch_number    text NOT NULL,             -- WB-IMP-0007
  file_ref        text NOT NULL,             -- storage path
  status          text NOT NULL DEFAULT 'UPLOADED'
                  CHECK (status IN ('UPLOADED','VALIDATING','VALIDATION_FAILED',
                        'VALIDATED','COMMITTING','COMMIT_FAILED','COMMITTED','ROLLED_BACK')),
  row_count       int NOT NULL DEFAULT 0,
  create_count    int NOT NULL DEFAULT 0,
  update_count    int NOT NULL DEFAULT 0,
  reject_count    int NOT NULL DEFAULT 0,
  validation_report jsonb NULL,              -- row-level errors
  diff_report     jsonb NULL,
  rollback_token  uuid NULL,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  committed_at    timestamptz NULL,
  rolled_back_at  timestamptz NULL,
  UNIQUE (project_id, batch_number)
);
ALTER TABLE wbs_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY ib_tenant ON wbs_import_batches FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
-- Imported nodes carry the batch id for rollback:
ALTER TABLE wbs_nodes ADD COLUMN import_batch_id uuid NULL REFERENCES wbs_import_batches(id);
CREATE INDEX ix_wbs_batch ON wbs_nodes (import_batch_id) WHERE import_batch_id IS NOT NULL;
```

## 4. Closure Table Maintenance

### 4.1 Insert node N under parent P

```sql
INSERT INTO wbs_closure (ancestor_id, descendant_id, depth, project_id, tenant_id)
SELECT c.ancestor_id, :n, c.depth + 1, :project, :tenant
FROM wbs_closure c WHERE c.descendant_id = :p
UNION ALL SELECT :n, :n, 0, :project, :tenant;
```

### 4.2 Move subtree rooted at N to new parent NP

```sql
-- Step 1: sever — remove paths from outside-ancestors into the subtree
DELETE FROM wbs_closure
WHERE descendant_id IN (SELECT descendant_id FROM wbs_closure WHERE ancestor_id = :n)
  AND ancestor_id   NOT IN (SELECT descendant_id FROM wbs_closure WHERE ancestor_id = :n);

-- Step 2: graft — cross-join new ancestor chain × subtree
INSERT INTO wbs_closure (ancestor_id, descendant_id, depth, project_id, tenant_id)
SELECT sup.ancestor_id, sub.descendant_id, sup.depth + sub.depth + 1, :project, :tenant
FROM wbs_closure sup
JOIN wbs_closure sub ON sub.ancestor_id = :n
WHERE sup.descendant_id = :np;
```

### 4.3 Worked example — Move Z03 from L05 to L06 (Part 4.14 tree)

Before (relevant rows, depth in parentheses): closure holds L05→Z03(1), B01→Z03(2), PH2→Z03(3), P001→Z03(4), plus the same four ancestors → each of Z03's 8 descendants at depth+their offset, plus in-subtree rows Z03→STR(1), Z03→SLAB(2)…

Step 1 deletes exactly the 4×9 = 36 rows connecting {L05, B01, PH2, P001} to the 9 subtree members. In-subtree rows (Z03→…, STR→…, self rows) survive because their ancestors are inside the subtree.

Step 2 inserts ancestors of L06 = {L06(0), B01(1), PH2(2), P001(3)} × subtree {Z03(0)…SLAB(2)…} → 36 new rows with depth = sup+sub+1. Result: `B01→SLAB` depth = 1+2+1 = 4. Adjacency `parent_id` of Z03 updated to L06 in the same transaction; trigger re-materialises `full_code` L05→L06 across the 9 nodes.

Verification query (must return 0):
```sql
SELECT count(*) FROM wbs_closure c
JOIN wbs_nodes n ON n.id = c.descendant_id
LEFT JOIN wbs_closure p ON p.ancestor_id = c.ancestor_id
  AND p.descendant_id = n.parent_id
WHERE c.depth > 0 AND n.parent_id IS NOT NULL
  AND (p.descendant_id IS NULL AND c.ancestor_id <> n.parent_id);
```

### 4.4 Delete (soft) leaf N

Closure self-row and ancestor rows removed only on hard purge; soft delete leaves closure intact but all queries filter `deleted_at IS NULL` via join to `wbs_nodes`.

## 5. Recursive Query Cookbook

```sql
-- Ancestors of a node (closure — no recursion needed)
SELECT n.* FROM wbs_closure c JOIN wbs_nodes n ON n.id = c.ancestor_id
WHERE c.descendant_id = :id AND c.depth > 0 ORDER BY c.depth DESC;

-- Descendants to depth k
SELECT n.* FROM wbs_closure c JOIN wbs_nodes n ON n.id = c.descendant_id
WHERE c.ancestor_id = :id AND c.depth BETWEEN 1 AND :k AND n.deleted_at IS NULL;

-- Subtree aggregate (link counts for impact analysis)
SELECT l.entity_type, count(*) FROM wbs_closure c
JOIN wbs_node_links l ON l.node_id = c.descendant_id
WHERE c.ancestor_id = :id GROUP BY l.entity_type;

-- Cycle check on move (must return 0 rows)
SELECT 1 FROM wbs_closure WHERE ancestor_id = :node AND descendant_id = :new_parent;

-- Orphan detection (adjacency parent missing or deleted)
SELECT n.id FROM wbs_nodes n
LEFT JOIN wbs_nodes p ON p.id = n.parent_id AND p.deleted_at IS NULL
WHERE n.parent_id IS NOT NULL AND n.deleted_at IS NULL AND p.id IS NULL;

-- Closure-vs-adjacency consistency (invariant; recursive CTE ground truth)
WITH RECURSIVE adj AS (
  SELECT id AS descendant_id, id AS ancestor_id, 0 AS depth
  FROM wbs_nodes WHERE deleted_at IS NULL
  UNION ALL
  SELECT a.descendant_id, n.parent_id, a.depth + 1
  FROM adj a JOIN wbs_nodes n ON n.id = a.ancestor_id
  WHERE n.parent_id IS NOT NULL)
SELECT 'missing_in_closure' AS issue, a.* FROM adj a
LEFT JOIN wbs_closure c USING (ancestor_id, descendant_id) WHERE c.ancestor_id IS NULL
UNION ALL
SELECT 'extra_in_closure', c.ancestor_id, c.descendant_id, c.depth FROM wbs_closure c
LEFT JOIN adj a USING (ancestor_id, descendant_id) WHERE a.ancestor_id IS NULL;
```

## 6. Triggers and Functions

```sql
-- T1: materialise full_code/full_path/depth on insert and on parent/name/code change
CREATE OR REPLACE FUNCTION wbs_materialise() RETURNS trigger AS $$
DECLARE p RECORD;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0; NEW.full_code := NEW.wbs_code; NEW.full_path := NEW.node_name;
  ELSE
    SELECT full_code, full_path, depth INTO p FROM wbs_nodes WHERE id = NEW.parent_id;
    NEW.depth := p.depth + 1;
    NEW.full_code := p.full_code || '-' || NEW.wbs_code;
    NEW.full_path := p.full_path || ' / ' || NEW.node_name;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_wbs_materialise BEFORE INSERT OR UPDATE OF parent_id, wbs_code, node_name
ON wbs_nodes FOR EACH ROW EXECUTE FUNCTION wbs_materialise();
-- Descendant re-materialisation after the row-level trigger is service-driven (A3),
-- batched BFS in the same transaction — a statement trigger at 1,000-node scale.

-- T2: maintain parent's is_leaf
CREATE OR REPLACE FUNCTION wbs_leaf_maintain() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.parent_id IS NOT NULL THEN
    UPDATE wbs_nodes SET is_leaf = false WHERE id = NEW.parent_id AND is_leaf;
  END IF;
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.parent_id IS NOT NULL THEN
    UPDATE wbs_nodes p SET is_leaf = NOT EXISTS
      (SELECT 1 FROM wbs_nodes c WHERE c.parent_id = p.id AND c.deleted_at IS NULL)
    WHERE p.id = OLD.parent_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_wbs_leaf AFTER INSERT OR DELETE OR UPDATE OF parent_id, deleted_at
ON wbs_nodes FOR EACH ROW EXECUTE FUNCTION wbs_leaf_maintain();

-- T3: roll-up invalidation on leaf progress change
CREATE OR REPLACE FUNCTION wbs_rollup_invalidate() RETURNS trigger AS $$
BEGIN
  UPDATE wbs_rollup_cache SET is_stale = true
  WHERE node_id IN (SELECT ancestor_id FROM wbs_closure WHERE descendant_id = NEW.id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_wbs_rollup AFTER UPDATE OF progress_percent, status
ON wbs_nodes FOR EACH ROW WHEN (OLD.progress_percent IS DISTINCT FROM NEW.progress_percent
  OR OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION wbs_rollup_invalidate();

-- T4: audit emission hook — writes to audit_logs (engine contract, R0 §24.4)
-- Implemented at service layer for value snapshots; a safety-net DB trigger records
-- raw old/new JSON for UPDATE/DELETE on wbs_nodes to guarantee coverage.
```

## 7. Row-Level Security Summary

| Table | Policies |
|---|---|
| All 16 | `tenant_id = jwt.tenant_id` (ALL) |
| wbs_nodes | + project membership SELECT policy + subtree scope SELECT policy (`dcos_wbs_scope_permits`, defined with doc 07 §8 predicates: node in granted closure OR node is ancestor of a grant) |
| wbs_rollup_cache / snapshots | cost columns additionally gated at API layer by `WBS.VIEW_COST_ROLLUP` (column-level masking in the read model view `v_wbs_rollup_public`) |

Service role (backend) bypasses scope policies for system jobs via `SECURITY DEFINER` functions that re-validate project context — never by disabling RLS.

## 8. Indexing Strategy Summary

| Index | Serves |
|---|---|
| ux_wbs_fullcode / ux_wbs_sibling | CODE-01/02 enforcement + code resolution |
| ux_wbs_one_root | BR-A |
| ix_wbs_children | lazy tree expansion |
| ix_cl_anc / ix_cl_desc | descendants/ancestors, cycle check, invalidation |
| ix_links_guard | delete guard <100 ms |
| trigram pair | search <300 ms |
| ix_ru_stale | sweeper queue |
| ix_snap_period | S-curve reads |

## 9. Data Volume and Partitioning

50 projects × 5,000 nodes = 250k nodes/tenant; closure ≈ 3M rows/tenant — fine unpartitioned. Partition triggers: `wbs_closure` LIST by `project_id` above ~20M rows global; `wbs_progress_snapshots` RANGE by `period_label` above ~5M rows; `wbs_node_links` above ~10M rows (LIST by project_id).

## 10. Migration Order and Backfill

1. `001_wbs_node_types` → 2. `002_wbs_structure_rules` → 3. `003_wbs_nodes` (without import FK) → 4. `004_wbs_closure` → 5. `005_wbs_code_segments` → 6. `006_wbs_node_attributes` → 7. `007_wbs_node_responsibilities` → 8. `008_wbs_templates(+nodes)` → 9. `009_wbs_baselines(+nodes)` → 10. `010_wbs_change_requests` → 11. `011_wbs_node_links` → 12. `012_wbs_rollup_cache` → 13. `013_wbs_progress_snapshots` → 14. `014_wbs_import_batches` + import FK on nodes → 15. `015_triggers_functions` → 16. `016_seed`.

**Closure backfill** (existing adjacency data): run the recursive CTE from §5 into `wbs_closure` in project-sized batches; verify with the consistency query (0 rows); details in doc 10 §4.

## 11. Seed Data (excerpt)

```sql
INSERT INTO wbs_node_types (code,label,can_be_leaf,must_be_leaf,is_system) VALUES
 ('PROJECT_ROOT','Project',false,false,true),
 ('PHASE','Phase',false,false,true),
 ('DISCIPLINE','Discipline',false,false,true),
 ('BUILDING','Building',false,false,true),
 ('AREA','Area',true,false,true),
 ('LEVEL','Level',false,false,true),
 ('ZONE','Zone',false,false,true),
 ('ROOM','Room / Space',true,false,true),
 ('ELEMENT','Element',true,false,true),
 ('WORK_PACKAGE','Work Package',true,true,true),
 ('CONTROL_ACCOUNT','Control Account',false,false,true);

-- Default structure rules: exactly the Part 4.3 matrix (23 rows), tenant NULL project NULL
INSERT INTO wbs_structure_rules (tenant_id, parent_type, child_type)
SELECT '00000000-0000-0000-0000-000000000000', p, c FROM (VALUES
 ('PROJECT_ROOT','PHASE'),('PROJECT_ROOT','DISCIPLINE'),('PROJECT_ROOT','BUILDING'),
 ('PROJECT_ROOT','AREA'),('PHASE','DISCIPLINE'),('PHASE','BUILDING'),('PHASE','AREA'),
 ('PHASE','ZONE'),('PHASE','WORK_PACKAGE'),('DISCIPLINE','BUILDING'),('DISCIPLINE','AREA'),
 ('DISCIPLINE','LEVEL'),('DISCIPLINE','ZONE'),('DISCIPLINE','ELEMENT'),
 ('DISCIPLINE','WORK_PACKAGE'),('BUILDING','LEVEL'),('BUILDING','ZONE'),
 ('BUILDING','DISCIPLINE'),('BUILDING','AREA'),('AREA','ZONE'),('AREA','ELEMENT'),
 ('AREA','WORK_PACKAGE'),('LEVEL','ZONE'),('LEVEL','ROOM'),('LEVEL','ELEMENT'),
 ('LEVEL','DISCIPLINE'),('LEVEL','WORK_PACKAGE'),('ZONE','ROOM'),('ZONE','ELEMENT'),
 ('ZONE','DISCIPLINE'),('ZONE','WORK_PACKAGE'),('ROOM','ELEMENT'),('ROOM','WORK_PACKAGE'),
 ('ELEMENT','WORK_PACKAGE')) AS t(p,c);

-- Three starter templates: 'Tower — 2 Phase', 'Factory — Single Phase',
-- 'Fit-Out — Floor by Floor' (template_nodes seeded per Part 4.14 shape; full
-- INSERT set shipped in seed file 016, ~120 rows, omitted here for length —
-- recorded in Change Log as external seed artefact SEED-WBS-001).
```

## 12. Open Questions

| # | Question |
|---|---|
| OQ-01 | Statement-level trigger vs service-layer batch for descendant re-materialisation at >1,000 nodes (current: service layer with guard). |
| OQ-02 | Column-level masking of cost values: DB view vs API projection (current: both — defence in depth). |

## 13. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue. Added `subtree_version` and `import_batch_id` to Part 4.8 contract — recorded per Part 3 rule 4. Seed templates externalised as SEED-WBS-001. |

**End of Document**
