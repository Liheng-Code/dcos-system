# DCOS — Module 04: Task Management
## 04 — Database Schema

| Field | Value |
|---|---|
| Document Code | DCOS-M04-DB-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Platform | PostgreSQL 15+ (Supabase) |
| Isolation | Multi-tenant, single database, Row-Level Security on `tenant_id` |

---

## 1. Entity Relationship Overview

```text
companies (tenant)
 └── projects
      └── wbs_nodes
           └── tasks ──────────────┬── task_assignments
                │                  ├── task_dependencies (pred/succ)
                │                  ├── task_progress_logs ── task_progress_evidence
                │                  ├── task_status_history
                │                  ├── task_holds
                │                  ├── task_checklists ── task_checklist_items
                │                  ├── task_resource_manpower
                │                  ├── task_resource_equipment
                │                  ├── task_resource_material
                │                  ├── task_links (polymorphic → doc/RFI/NCR/IR/PR/BOQ/VO)
                │                  ├── task_comments
                │                  ├── task_watchers
                │                  ├── task_attachments
                │                  └── task_tags
                │
                ├── task_templates ── task_template_items ── task_template_dependencies
                ├── task_types (config)
                ├── task_hold_reasons (config)
                └── task_sync_queue / task_sync_conflicts (mobile)
```

---

## 2. Enumerated Types

```sql
CREATE TYPE task_status AS ENUM (
  'DRAFT','OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','COMPLETED',
  'SUBMITTED_FOR_APPROVAL','APPROVED','REJECTED','CLOSED','CANCELLED'
);

CREATE TYPE task_priority AS ENUM ('LOW','NORMAL','HIGH','CRITICAL');

CREATE TYPE task_class AS ENUM ('ACTIVITY','DELIVERABLE','MILESTONE','CHECKLIST');

CREATE TYPE progress_method AS ENUM ('PERCENTAGE','QUANTITY','CHECKLIST','MILESTONE');

CREATE TYPE dependency_type AS ENUM ('FS','SS','FF','SF');

CREATE TYPE dependency_state AS ENUM ('READY','PARTIALLY_READY','BLOCKED');

CREATE TYPE execution_mode AS ENUM ('OWN_LABOUR','SUBCONTRACT','SUPPLIER','CONSULTANT');

CREATE TYPE work_category AS ENUM (
  'PERMANENT_WORKS','TEMPORARY_WORKS','ENABLING','REWORK','VARIATION','SNAG','INTERNAL'
);

CREATE TYPE constraint_type AS ENUM ('ASAP','SNET','FNLT','MFO','ALAP');

CREATE TYPE assignment_role AS ENUM ('ASSIGNEE','COLLABORATOR','REVIEWER','APPROVER','WATCHER');

CREATE TYPE checklist_item_result AS ENUM ('PENDING','PASS','FAIL','NA');

CREATE TYPE sync_state AS ENUM ('PENDING','SYNCED','FAILED','CONFLICT');
```

---

## 3. Configuration Tables

### 3.1 `task_types`

```sql
CREATE TABLE task_types (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type_code                 text NOT NULL,                 -- TT-CON, TT-DWG ...
  type_name                 text NOT NULL,
  discipline_default        text,
  task_class_default        task_class NOT NULL DEFAULT 'ACTIVITY',
  progress_method_default   progress_method NOT NULL DEFAULT 'PERCENTAGE',
  requires_inspection       boolean NOT NULL DEFAULT false,
  requires_permit           boolean NOT NULL DEFAULT false,
  required_permit_types     text[],
  requires_drawing_link     boolean NOT NULL DEFAULT false,
  block_on_superseded_dwg   boolean NOT NULL DEFAULT false,
  requires_method_statement boolean NOT NULL DEFAULT false,
  min_photos_on_completion  int  NOT NULL DEFAULT 0,
  allow_self_approval       boolean NOT NULL DEFAULT false,
  default_checklist_id      uuid,
  approval_template_code    text,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type_code)
);
```

### 3.2 `task_hold_reasons`

```sql
CREATE TABLE task_hold_reasons (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reason_code                 text NOT NULL,               -- HR-DES, HR-MAT ...
  reason_name                 text NOT NULL,
  default_responsible_party   text NOT NULL,               -- CLIENT, CONSULTANT, CONTRACTOR, SUBCONTRACTOR, SUPPLIER, AUTHORITY, NEUTRAL
  is_delay_claimable          boolean NOT NULL DEFAULT false,
  requires_free_text          boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, reason_code)
);
```

### 3.3 `task_templates`

```sql
CREATE TABLE task_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,  -- null = tenant-wide
  template_code   text NOT NULL,
  template_name   text NOT NULL,
  discipline      text,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_code)
);

CREATE TABLE task_template_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  template_id        uuid NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  seq                int  NOT NULL,
  title_pattern      text NOT NULL,          -- supports {{wbs_name}}, {{level}}, {{zone}}
  description        text,
  task_type_id       uuid REFERENCES task_types(id),
  discipline         text,
  task_class         task_class NOT NULL DEFAULT 'ACTIVITY',
  progress_method    progress_method NOT NULL DEFAULT 'PERCENTAGE',
  planned_duration_d numeric(6,2) NOT NULL DEFAULT 1,
  offset_days        int NOT NULL DEFAULT 0,
  planned_quantity   numeric(18,4),
  unit_of_measure    text,
  default_role_code  text,                   -- resolve assignee by role at generation
  checklist_id       uuid,
  UNIQUE (template_id, seq)
);

CREATE TABLE task_template_dependencies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  template_id        uuid NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  predecessor_seq    int NOT NULL,
  successor_seq      int NOT NULL,
  dep_type           dependency_type NOT NULL DEFAULT 'FS',
  lag_days           int NOT NULL DEFAULT 0,
  cross_node         boolean NOT NULL DEFAULT false,  -- link to previous WBS node instance
  CHECK (predecessor_seq <> successor_seq)
);
```

---

## 4. Core Table — `tasks`

```sql
CREATE TABLE tasks (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  wbs_node_id             uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  wbs_path_snapshot       text,                       -- denormalised for reporting/export
  parent_task_id          uuid REFERENCES tasks(id) ON DELETE RESTRICT,
  depth                   int NOT NULL DEFAULT 0,

  -- identity
  task_code               text NOT NULL,
  title                   text NOT NULL,
  description             text,
  task_type_id            uuid NOT NULL REFERENCES task_types(id),
  discipline              text NOT NULL,              -- ARC, STR, MEP, CIV, PRC, CON, QAQC, HSE, ADM, COM
  task_class              task_class NOT NULL DEFAULT 'ACTIVITY',
  work_category           work_category NOT NULL DEFAULT 'PERMANENT_WORKS',
  execution_mode          execution_mode NOT NULL DEFAULT 'OWN_LABOUR',
  priority                task_priority NOT NULL DEFAULT 'NORMAL',
  tags                    text[] DEFAULT '{}',

  -- responsibility
  assignee_id             uuid REFERENCES users(id),
  crew_id                 uuid REFERENCES crews(id),
  subcontractor_id        uuid REFERENCES stakeholders(id),
  supervisor_id           uuid REFERENCES users(id),
  current_approver_id     uuid REFERENCES users(id),
  approval_instance_id    uuid,                       -- FK to approval engine

  -- schedule
  planned_start           date,
  planned_finish          date,
  planned_duration_d      numeric(6,2),
  baseline_id             uuid,
  baseline_start          date,
  baseline_finish         date,
  actual_start            timestamptz,
  actual_finish           timestamptz,
  forecast_finish         date,
  constraint_type         constraint_type NOT NULL DEFAULT 'ASAP',
  constraint_date         date,
  total_float_d           numeric(6,2),               -- written by Planning/CPM engine
  free_float_d            numeric(6,2),
  is_critical_path        boolean NOT NULL DEFAULT false,
  is_milestone            boolean NOT NULL DEFAULT false,
  dependency_status       dependency_state NOT NULL DEFAULT 'READY',

  -- progress
  progress_method         progress_method NOT NULL DEFAULT 'PERCENTAGE',
  planned_quantity        numeric(18,4),
  actual_quantity         numeric(18,4) NOT NULL DEFAULT 0,
  unit_of_measure         text,
  progress_percent        numeric(5,2) NOT NULL DEFAULT 0
                          CHECK (progress_percent >= 0 AND progress_percent <= 100),
  weight_factor           numeric(12,4),              -- roll-up weight override
  budget_value            numeric(18,2),              -- for cost-weighted roll-up

  -- governance
  status                  task_status NOT NULL DEFAULT 'DRAFT',
  inspection_status       text,                       -- NOT_REQUIRED, REQUIRED, REQUESTED, PASSED, FAILED
  permit_verified_at      timestamptz,
  rejection_count         int NOT NULL DEFAULT 0,
  reopen_count            int NOT NULL DEFAULT 0,
  is_rework               boolean NOT NULL DEFAULT false,
  rework_source_task_id   uuid REFERENCES tasks(id),
  hold_total_days         numeric(8,2) NOT NULL DEFAULT 0,
  cancel_reason           text,

  -- commercial linkage
  boq_item_id             uuid,                       -- activated in Phase 2
  cost_code               text,
  variation_order_id      uuid,

  -- system
  created_by              uuid REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  submitted_at            timestamptz,
  approved_at             timestamptz,
  closed_at               timestamptz,
  archived_at             timestamptz,
  source_channel          text NOT NULL DEFAULT 'WEB',   -- WEB, MOBILE, SYSTEM, API, IMPORT
  origin_module           text,                          -- QAQC, PROC, HSE, DOC ... when system-generated
  origin_record_id        uuid,
  search_vector           tsvector,

  CONSTRAINT uq_task_code_per_project UNIQUE (project_id, task_code),
  CONSTRAINT ck_dates CHECK (planned_finish IS NULL OR planned_start IS NULL OR planned_finish >= planned_start),
  CONSTRAINT ck_qty CHECK (progress_method <> 'QUANTITY' OR (planned_quantity IS NOT NULL AND unit_of_measure IS NOT NULL)),
  CONSTRAINT ck_self_parent CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);
```

### Indexes

```sql
CREATE INDEX idx_tasks_tenant_project        ON tasks (tenant_id, project_id);
CREATE INDEX idx_tasks_wbs                   ON tasks (wbs_node_id) WHERE archived_at IS NULL;
CREATE INDEX idx_tasks_assignee_status       ON tasks (assignee_id, status) WHERE status NOT IN ('CLOSED','CANCELLED');
CREATE INDEX idx_tasks_status_project        ON tasks (project_id, status);
CREATE INDEX idx_tasks_planned_finish        ON tasks (project_id, planned_finish)
                                             WHERE status NOT IN ('APPROVED','CLOSED','CANCELLED');
CREATE INDEX idx_tasks_discipline            ON tasks (project_id, discipline, status);
CREATE INDEX idx_tasks_parent                ON tasks (parent_task_id);
CREATE INDEX idx_tasks_critical              ON tasks (project_id) WHERE is_critical_path = true;
CREATE INDEX idx_tasks_subcontractor         ON tasks (subcontractor_id) WHERE subcontractor_id IS NOT NULL;
CREATE INDEX idx_tasks_search                ON tasks USING GIN (search_vector);
CREATE INDEX idx_tasks_tags                  ON tasks USING GIN (tags);
```

---

## 5. Supporting Tables

### 5.1 `task_assignments` (multi-party responsibility)

```sql
CREATE TABLE task_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id),
  crew_id       uuid REFERENCES crews(id),
  stakeholder_id uuid REFERENCES stakeholders(id),
  role          assignment_role NOT NULL DEFAULT 'COLLABORATOR',
  allocation_pct numeric(5,2) DEFAULT 100,
  assigned_by   uuid REFERENCES users(id),
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  reason        text,
  CHECK (num_nonnulls(user_id, crew_id, stakeholder_id) = 1)
);
CREATE INDEX idx_task_assign_task ON task_assignments (task_id) WHERE removed_at IS NULL;
CREATE INDEX idx_task_assign_user ON task_assignments (user_id) WHERE removed_at IS NULL;
```

### 5.2 `task_dependencies`

```sql
CREATE TABLE task_dependencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  project_id        uuid NOT NULL,
  predecessor_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dep_type          dependency_type NOT NULL DEFAULT 'FS',
  lag_days          int NOT NULL DEFAULT 0,
  is_hard           boolean NOT NULL DEFAULT true,     -- hard = blocks start, soft = advisory
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dependency UNIQUE (predecessor_id, successor_id, dep_type),
  CONSTRAINT ck_not_self CHECK (predecessor_id <> successor_id)
);
CREATE INDEX idx_dep_succ ON task_dependencies (successor_id);
CREATE INDEX idx_dep_pred ON task_dependencies (predecessor_id);
```

**Cycle prevention** — recursive check executed in a `BEFORE INSERT` trigger:

```sql
CREATE OR REPLACE FUNCTION fn_check_dependency_cycle() RETURNS trigger AS $$
DECLARE v_path text;
BEGIN
  WITH RECURSIVE walk(node, path, depth) AS (
    SELECT NEW.predecessor_id, NEW.successor_id::text || '>' || NEW.predecessor_id::text, 1
    UNION ALL
    SELECT d.predecessor_id, w.path || '>' || d.predecessor_id::text, w.depth + 1
    FROM task_dependencies d JOIN walk w ON d.successor_id = w.node
    WHERE w.depth < 100
  )
  SELECT path INTO v_path FROM walk WHERE node = NEW.successor_id LIMIT 1;

  IF v_path IS NOT NULL THEN
    RAISE EXCEPTION 'Dependency creates a cycle: %', v_path
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dep_cycle BEFORE INSERT OR UPDATE ON task_dependencies
FOR EACH ROW EXECUTE FUNCTION fn_check_dependency_cycle();
```

### 5.3 `task_progress_logs` (append-only)

```sql
CREATE TABLE task_progress_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  project_id          uuid NOT NULL,
  task_id             uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress_date       date NOT NULL DEFAULT CURRENT_DATE,
  method              progress_method NOT NULL,
  previous_percent    numeric(5,2),
  new_percent         numeric(5,2),
  quantity_this_entry numeric(18,4),
  cumulative_quantity numeric(18,4),
  unit_of_measure     text,
  note                text,
  is_correction       boolean NOT NULL DEFAULT false,
  correction_reason   text,
  manhours_this_entry numeric(10,2),
  logged_by           uuid NOT NULL REFERENCES users(id),
  logged_at           timestamptz NOT NULL DEFAULT now(),
  source_channel      text NOT NULL DEFAULT 'WEB',
  device_id           text,
  gps_lat             numeric(10,7),
  gps_lng             numeric(10,7),
  client_captured_at  timestamptz,
  idempotency_key     text,
  CONSTRAINT uq_progress_idem UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_prog_task_date ON task_progress_logs (task_id, progress_date DESC);
CREATE INDEX idx_prog_project_date ON task_progress_logs (project_id, progress_date);
```

> **Rule:** No UPDATE or DELETE permitted. Corrections are new rows with `is_correction = true`.

```sql
CREATE RULE no_update_progress AS ON UPDATE TO task_progress_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_progress AS ON DELETE TO task_progress_logs DO INSTEAD NOTHING;
```

### 5.4 `task_status_history`

```sql
CREATE TABLE task_status_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status_from    task_status,
  status_to      task_status NOT NULL,
  comment        text,
  reason_code    text,
  actor_id       uuid REFERENCES users(id),
  actor_role_snapshot text,
  duration_in_previous_status interval,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_hist_task ON task_status_history (task_id, created_at);
```

### 5.5 `task_holds`

```sql
CREATE TABLE task_holds (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  project_id           uuid NOT NULL,
  task_id              uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  hold_reason_id       uuid NOT NULL REFERENCES task_hold_reasons(id),
  responsible_party    text NOT NULL,
  is_delay_claimable   boolean NOT NULL DEFAULT false,
  note                 text,
  linked_entity_type   text,          -- RFI, EI, NCR, PERMIT, PR
  linked_entity_id     uuid,
  expected_resume_date date,
  hold_start           timestamptz NOT NULL DEFAULT now(),
  hold_end             timestamptz,
  duration_days        numeric(8,2) GENERATED ALWAYS AS
                       (EXTRACT(EPOCH FROM (COALESCE(hold_end, now()) - hold_start)) / 86400) STORED,
  held_by              uuid REFERENCES users(id),
  released_by          uuid REFERENCES users(id),
  release_note         text,
  affects_critical_path boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_holds_open ON task_holds (project_id) WHERE hold_end IS NULL;
```

> Note: `duration_days` shown as STORED for illustration; because it references `now()`, implement as a view column or refresh on hold closure. Recommended production form: nullable `duration_days` populated on `hold_end` set, plus a view computing live duration for open holds.

### 5.6 Checklists

```sql
CREATE TABLE task_checklists (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  template_code  text,
  title          text NOT NULL,
  total_weight   numeric(10,2) NOT NULL DEFAULT 0,
  completed_weight numeric(10,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_checklist_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  checklist_id   uuid NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
  seq            int NOT NULL,
  item_text      text NOT NULL,
  is_mandatory   boolean NOT NULL DEFAULT true,
  weight         numeric(10,2) NOT NULL DEFAULT 1,
  responsible_role text,
  result         checklist_item_result NOT NULL DEFAULT 'PENDING',
  comment        text,
  evidence_count int NOT NULL DEFAULT 0,
  linked_ncr_id  uuid,
  responded_by   uuid REFERENCES users(id),
  responded_at   timestamptz,
  UNIQUE (checklist_id, seq)
);
```

### 5.7 Resource Logs

```sql
CREATE TABLE task_resource_manpower (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  wbs_node_id    uuid NOT NULL,
  log_date       date NOT NULL,
  trade_code     text NOT NULL,
  headcount      int NOT NULL CHECK (headcount > 0),
  normal_hours   numeric(6,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  subcontractor_id uuid REFERENCES stakeholders(id),
  is_own_labour  boolean NOT NULL DEFAULT true,
  total_manhours numeric(10,2) GENERATED ALWAYS AS
                 (headcount * (normal_hours + overtime_hours)) STORED,
  logged_by      uuid REFERENCES users(id),
  logged_at      timestamptz NOT NULL DEFAULT now(),
  daily_report_id uuid
);
CREATE INDEX idx_mp_task_date ON task_resource_manpower (task_id, log_date);

CREATE TABLE task_resource_equipment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  project_id      uuid NOT NULL,
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  equipment_id    uuid,                       -- FK to equipment_assets (Phase 3)
  equipment_label text,
  log_date        date NOT NULL,
  working_hours   numeric(6,2) NOT NULL DEFAULT 0,
  idle_hours      numeric(6,2) NOT NULL DEFAULT 0,
  breakdown_hours numeric(6,2) NOT NULL DEFAULT 0,
  operator_id     uuid REFERENCES users(id),
  logged_by       uuid REFERENCES users(id),
  logged_at       timestamptz NOT NULL DEFAULT now(),
  daily_report_id uuid
);

CREATE TABLE task_resource_material (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  project_id      uuid NOT NULL,
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  wbs_node_id     uuid NOT NULL,
  stock_item_id   uuid,
  item_code       text NOT NULL,
  quantity        numeric(18,4) NOT NULL,
  unit_of_measure text NOT NULL,
  batch_no        text,                        -- links to material traceability (Phase 3)
  stock_txn_id    uuid,
  log_date        date NOT NULL,
  logged_by       uuid REFERENCES users(id),
  logged_at       timestamptz NOT NULL DEFAULT now()
);
```

### 5.8 Links, Comments, Watchers, Attachments, Tags

```sql
CREATE TABLE task_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type    text NOT NULL,   -- DOCUMENT, DRAWING_REV, RFI, NCR, INSPECTION_REQUEST,
                                  -- PR, PO, BOQ_ITEM, VARIATION, PERMIT, METHOD_STATEMENT, TASK
  entity_id      uuid NOT NULL,
  link_role      text NOT NULL DEFAULT 'REFERENCE',  -- GOVERNING, EVIDENCE, BLOCKER, OUTPUT, REFERENCE
  revision_snapshot text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,
  UNIQUE (task_id, entity_type, entity_id, link_role)
);
CREATE INDEX idx_links_entity ON task_links (entity_type, entity_id);

CREATE TABLE task_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES task_comments(id),
  body           text NOT NULL,
  mentions       uuid[] DEFAULT '{}',
  is_internal    boolean NOT NULL DEFAULT true,   -- hidden from external stakeholder roles
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  edited_at      timestamptz,
  deleted_at     timestamptz
);
CREATE INDEX idx_comments_task ON task_comments (task_id, created_at);

CREATE TABLE task_watchers (
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  auto_added  boolean NOT NULL DEFAULT false,
  muted       boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  project_id        uuid NOT NULL,
  task_id           uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress_log_id   uuid REFERENCES task_progress_logs(id),
  checklist_item_id uuid REFERENCES task_checklist_items(id),
  file_name         text NOT NULL,
  storage_path      text NOT NULL,
  thumbnail_path    text,
  mime_type         text NOT NULL,
  file_size_bytes   bigint NOT NULL,
  attachment_kind   text NOT NULL DEFAULT 'PHOTO', -- PHOTO, VIDEO, DOCUMENT, SIGNATURE
  captured_at       timestamptz,
  gps_lat           numeric(10,7),
  gps_lng           numeric(10,7),
  is_original_res   boolean NOT NULL DEFAULT false,
  virus_scan_status text NOT NULL DEFAULT 'PENDING', -- PENDING, CLEAN, INFECTED
  uploaded_by       uuid REFERENCES users(id),
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_attach_task ON task_attachments (task_id) WHERE deleted_at IS NULL;
```

### 5.9 Mobile Sync

```sql
CREATE TABLE task_sync_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  device_id         text NOT NULL,
  user_id           uuid NOT NULL REFERENCES users(id),
  task_id           uuid,
  operation         text NOT NULL,       -- START, PROGRESS, COMPLETE, HOLD, COMMENT, CHECKLIST
  payload           jsonb NOT NULL,
  idempotency_key   text NOT NULL,
  client_created_at timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  state             sync_state NOT NULL DEFAULT 'PENDING',
  error_message     text,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE task_sync_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  sync_queue_id  uuid NOT NULL REFERENCES task_sync_queue(id),
  task_id        uuid REFERENCES tasks(id),
  conflict_type  text NOT NULL,   -- STATUS_CONFLICT, TASK_CANCELLED, PERMISSION_LOST, STALE_VERSION
  device_payload jsonb NOT NULL,
  server_state   jsonb NOT NULL,
  resolution     text,            -- DISCARD, APPLY, REPOST_TO_TASK, MANUAL
  resolved_by    uuid REFERENCES users(id),
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

---

## 6. Triggers and Functions

### 6.1 Task code generation

```sql
CREATE OR REPLACE FUNCTION fn_generate_task_code() RETURNS trigger AS $$
DECLARE
  v_pattern text; v_seq int; v_proj text; v_wbs_short text;
BEGIN
  IF NEW.task_code IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(setting_value, '{PROJECT}-{DISCIPLINE}-{WBS_SHORT}-T{SEQ:4}')
    INTO v_pattern FROM project_settings
   WHERE project_id = NEW.project_id AND setting_key = 'task_code_pattern';

  SELECT project_code INTO v_proj FROM projects WHERE id = NEW.project_id;
  SELECT COALESCE(wbs_code,'') INTO v_wbs_short FROM wbs_nodes WHERE id = NEW.wbs_node_id;

  SELECT COALESCE(MAX(SUBSTRING(task_code FROM '[0-9]+$')::int), 0) + 1
    INTO v_seq FROM tasks WHERE project_id = NEW.project_id;

  NEW.task_code := replace(replace(replace(replace(v_pattern,
      '{PROJECT}', v_proj),
      '{DISCIPLINE}', NEW.discipline),
      '{WBS_SHORT}', v_wbs_short),
      '{SEQ:4}', lpad(v_seq::text, 4, '0'));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_code BEFORE INSERT ON tasks
FOR EACH ROW EXECUTE FUNCTION fn_generate_task_code();
```

### 6.2 Progress recalculation and roll-up

```sql
CREATE OR REPLACE FUNCTION fn_recalc_task_progress() RETURNS trigger AS $$
DECLARE v_pct numeric(5,2); v_task tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = NEW.task_id FOR UPDATE;

  IF v_task.progress_method = 'QUANTITY' THEN
     v_pct := LEAST(100, COALESCE(NEW.cumulative_quantity,0) / NULLIF(v_task.planned_quantity,0) * 100);
     UPDATE tasks SET actual_quantity = NEW.cumulative_quantity,
                      progress_percent = v_pct, updated_at = now()
      WHERE id = NEW.task_id;
  ELSE
     UPDATE tasks SET progress_percent = COALESCE(NEW.new_percent, progress_percent),
                      updated_at = now()
      WHERE id = NEW.task_id;
  END IF;

  PERFORM fn_rollup_wbs_progress(v_task.wbs_node_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_progress AFTER INSERT ON task_progress_logs
FOR EACH ROW EXECUTE FUNCTION fn_recalc_task_progress();
```

```sql
-- Weighted roll-up, ascending the WBS tree
CREATE OR REPLACE FUNCTION fn_rollup_wbs_progress(p_node uuid) RETURNS void AS $$
DECLARE
  v_parent uuid; v_project uuid; v_method text; v_pct numeric(5,2);
BEGIN
  SELECT parent_id, project_id INTO v_parent, v_project FROM wbs_nodes WHERE id = p_node;
  SELECT COALESCE(setting_value,'DURATION') INTO v_method
    FROM project_settings WHERE project_id = v_project AND setting_key = 'rollup_weighting';

  SELECT CASE v_method
    WHEN 'EQUAL'    THEN AVG(progress_percent)
    WHEN 'COST'     THEN SUM(progress_percent * COALESCE(budget_value,0))
                          / NULLIF(SUM(COALESCE(budget_value,0)),0)
    WHEN 'QUANTITY' THEN SUM(progress_percent * COALESCE(planned_quantity,0))
                          / NULLIF(SUM(COALESCE(planned_quantity,0)),0)
    ELSE                 SUM(progress_percent * COALESCE(planned_duration_d,1))
                          / NULLIF(SUM(COALESCE(planned_duration_d,1)),0)
  END
  INTO v_pct
  FROM tasks
  WHERE wbs_node_id = p_node
    AND status <> 'CANCELLED'
    AND archived_at IS NULL;

  UPDATE wbs_nodes
     SET progress_percent = COALESCE(v_pct, progress_percent), updated_at = now()
   WHERE id = p_node;

  IF v_parent IS NOT NULL THEN
    PERFORM fn_rollup_wbs_progress(v_parent);
  END IF;
END $$ LANGUAGE plpgsql;
```

### 6.3 Dependency status evaluation

```sql
CREATE OR REPLACE FUNCTION fn_eval_dependency_status(p_task uuid) RETURNS dependency_state AS $$
DECLARE v_total int; v_satisfied int;
BEGIN
  SELECT count(*),
         count(*) FILTER (
           WHERE (d.dep_type = 'FS' AND p.status IN ('APPROVED','CLOSED'))
              OR (d.dep_type = 'SS' AND p.actual_start IS NOT NULL)
              OR (d.dep_type = 'FF' AND p.status IN ('APPROVED','CLOSED'))
              OR (d.dep_type = 'SF' AND p.actual_start IS NOT NULL)
              OR d.is_hard = false
         )
    INTO v_total, v_satisfied
  FROM task_dependencies d JOIN tasks p ON p.id = d.predecessor_id
  WHERE d.successor_id = p_task;

  IF v_total = 0 OR v_satisfied = v_total THEN RETURN 'READY';
  ELSIF v_satisfied = 0 THEN RETURN 'BLOCKED';
  ELSE RETURN 'PARTIALLY_READY';
  END IF;
END $$ LANGUAGE plpgsql;
```

### 6.4 Status transition guard

```sql
CREATE OR REPLACE FUNCTION fn_task_status_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- legality
    IF NOT EXISTS (SELECT 1 FROM task_status_transitions
                    WHERE status_from = OLD.status AND status_to = NEW.status) THEN
      RAISE EXCEPTION 'Illegal task status transition % -> %', OLD.status, NEW.status;
    END IF;

    -- gates
    IF NEW.status = 'IN_PROGRESS' AND OLD.status = 'ASSIGNED' THEN
      IF fn_eval_dependency_status(NEW.id) = 'BLOCKED'
         AND NOT COALESCE(current_setting('dcos.dependency_override', true)::boolean, false) THEN
        RAISE EXCEPTION 'Task is blocked by unsatisfied predecessors';
      END IF;
      NEW.actual_start := COALESCE(NEW.actual_start, now());
    END IF;

    IF NEW.status = 'COMPLETED' THEN
      IF NEW.progress_percent < 100 THEN
        RAISE EXCEPTION 'Progress must be 100%% before completion';
      END IF;
      IF EXISTS (SELECT 1 FROM task_checklist_items ci
                   JOIN task_checklists c ON c.id = ci.checklist_id
                  WHERE c.task_id = NEW.id AND ci.is_mandatory AND ci.result = 'PENDING') THEN
        RAISE EXCEPTION 'Mandatory checklist items are not resolved';
      END IF;
      NEW.actual_finish := COALESCE(NEW.actual_finish, now());
    END IF;

    IF NEW.status = 'APPROVED' THEN
      IF NEW.inspection_status = 'REQUIRED' OR NEW.inspection_status = 'REQUESTED'
         OR NEW.inspection_status = 'FAILED' THEN
        RAISE EXCEPTION 'Inspection must pass before approval';
      END IF;
      NEW.approved_at := now();
    END IF;

    IF NEW.status = 'REJECTED' THEN
      NEW.rejection_count := OLD.rejection_count + 1;
    END IF;

    INSERT INTO task_status_history (tenant_id, task_id, status_from, status_to,
                                     actor_id, created_at)
    VALUES (NEW.tenant_id, NEW.id, OLD.status, NEW.status, NEW.updated_by, now());
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_status_guard BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION fn_task_status_guard();
```

Supporting transition table:

```sql
CREATE TABLE task_status_transitions (
  status_from task_status,
  status_to   task_status NOT NULL,
  PRIMARY KEY (status_from, status_to)
);
INSERT INTO task_status_transitions VALUES
 ('DRAFT','OPEN'),('DRAFT','CANCELLED'),
 ('OPEN','ASSIGNED'),('OPEN','CANCELLED'),
 ('ASSIGNED','IN_PROGRESS'),('ASSIGNED','OPEN'),('ASSIGNED','CANCELLED'),
 ('IN_PROGRESS','ON_HOLD'),('IN_PROGRESS','COMPLETED'),('IN_PROGRESS','CANCELLED'),
 ('ON_HOLD','IN_PROGRESS'),('ON_HOLD','CANCELLED'),
 ('COMPLETED','SUBMITTED_FOR_APPROVAL'),('COMPLETED','IN_PROGRESS'),
 ('SUBMITTED_FOR_APPROVAL','APPROVED'),('SUBMITTED_FOR_APPROVAL','REJECTED'),
 ('REJECTED','IN_PROGRESS'),
 ('APPROVED','CLOSED'),('APPROVED','IN_PROGRESS'),
 ('CLOSED','IN_PROGRESS');
```

### 6.5 Search vector and audit hook

```sql
CREATE OR REPLACE FUNCTION fn_task_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('simple', coalesce(NEW.task_code,'')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW.title,'')), 'B')
    || setweight(to_tsvector('english', coalesce(NEW.description,'')), 'C')
    || setweight(to_tsvector('simple', coalesce(NEW.wbs_path_snapshot,'')), 'C');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_search BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION fn_task_search_vector();

-- Audit: writes to the shared audit_logs table in the same transaction
CREATE TRIGGER trg_task_audit AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION fn_write_audit_log('TASK','task');
```

---

## 7. Row-Level Security

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

-- Tenant isolation (applies to every table in this module)
CREATE POLICY p_tasks_tenant ON tasks
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Project scope: user must be a member of the project
CREATE POLICY p_tasks_project_read ON tasks FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
        AND pm.is_active
    )
  );

-- External stakeholder scope: subcontractor sees only own tasks
CREATE POLICY p_tasks_subcontractor ON tasks FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (auth.jwt() ->> 'user_scope') = 'EXTERNAL'
    AND subcontractor_id = (auth.jwt() ->> 'stakeholder_id')::uuid
  );

-- Write scope: requires task.update permission on the project
CREATE POLICY p_tasks_write ON tasks FOR UPDATE
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND fn_has_permission(auth.uid(), tasks.project_id, 'task.update')
  );
```

> All child tables (`task_progress_logs`, `task_holds`, `task_comments`, …) carry `tenant_id` and apply the equivalent tenant policy plus an EXISTS check against the parent task's visibility.

---

## 8. Reporting Views

```sql
CREATE VIEW v_task_summary AS
SELECT t.id, t.tenant_id, t.project_id, t.task_code, t.title, t.discipline,
       t.status, t.priority, t.progress_percent,
       t.planned_start, t.planned_finish, t.actual_start, t.actual_finish,
       t.baseline_finish,
       GREATEST(0, CURRENT_DATE - t.planned_finish)
         FILTER (WHERE t.status NOT IN ('APPROVED','CLOSED','CANCELLED')) AS overdue_days,
       (t.actual_finish::date - t.baseline_finish)                        AS finish_variance_days,
       t.is_critical_path, t.rejection_count, t.hold_total_days,
       w.full_path AS wbs_path,
       u.full_name AS assignee_name,
       s.organization_name AS subcontractor_name
FROM tasks t
JOIN wbs_nodes w ON w.id = t.wbs_node_id
LEFT JOIN users u ON u.id = t.assignee_id
LEFT JOIN stakeholders s ON s.id = t.subcontractor_id
WHERE t.archived_at IS NULL;

CREATE VIEW v_task_delay_register AS
SELECT h.id, h.tenant_id, h.project_id, t.task_code, t.title, w.full_path AS wbs_path,
       r.reason_code, r.reason_name, h.responsible_party, h.is_delay_claimable,
       h.hold_start, h.hold_end,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(h.hold_end, now()) - h.hold_start))/86400, 2) AS hold_days,
       h.linked_entity_type, h.linked_entity_id, t.is_critical_path, h.note
FROM task_holds h
JOIN tasks t ON t.id = h.task_id
JOIN wbs_nodes w ON w.id = t.wbs_node_id
JOIN task_hold_reasons r ON r.id = h.hold_reason_id;

CREATE VIEW v_task_productivity AS
SELECT t.project_id, t.tenant_id, t.discipline, t.task_code, t.unit_of_measure,
       t.actual_quantity,
       SUM(m.total_manhours) AS total_manhours,
       CASE WHEN SUM(m.total_manhours) > 0
            THEN t.actual_quantity / SUM(m.total_manhours) END AS output_per_manhour
FROM tasks t
LEFT JOIN task_resource_manpower m ON m.task_id = t.id
GROUP BY t.project_id, t.tenant_id, t.discipline, t.task_code, t.unit_of_measure, t.actual_quantity;

CREATE MATERIALIZED VIEW mv_wbs_progress AS
SELECT w.id AS wbs_node_id, w.tenant_id, w.project_id, w.full_path,
       count(t.id) FILTER (WHERE t.status <> 'CANCELLED')            AS task_count,
       count(t.id) FILTER (WHERE t.status IN ('APPROVED','CLOSED'))  AS completed_count,
       count(t.id) FILTER (WHERE t.status = 'ON_HOLD')               AS held_count,
       count(t.id) FILTER (WHERE t.planned_finish < CURRENT_DATE
                             AND t.status NOT IN ('APPROVED','CLOSED','CANCELLED')) AS overdue_count,
       ROUND(SUM(t.progress_percent * COALESCE(t.planned_duration_d,1))
             / NULLIF(SUM(COALESCE(t.planned_duration_d,1)),0), 2)   AS progress_percent
FROM wbs_nodes w
LEFT JOIN tasks t ON t.wbs_node_id = w.id AND t.archived_at IS NULL
GROUP BY w.id, w.tenant_id, w.project_id, w.full_path;

CREATE UNIQUE INDEX ON mv_wbs_progress (wbs_node_id);
```

---

## 9. Data Retention and Archiving

| Data | Active Retention | Archive |
|---|---|---|
| Tasks and status history | Project duration + 2 years hot | 10 years warm |
| Progress logs | Project duration + 2 years | 10 years warm |
| Task photos (original) | Project duration + 3 years | 10 years cold |
| Task photos (thumbnails) | Retained with task | With task |
| Resource logs | Project duration + 7 years (payroll/claim link) | 10 years |
| Sync queue records | 90 days | Purge after resolution |
| Sync conflicts | 2 years | Purge |

Archiving sets `archived_at` and moves rows to partitioned archive tables (`tasks_archive` partitioned by project year). Hard delete is prohibited for any task with status history.

---

## 10. Seed Data (minimum viable configuration)

```sql
INSERT INTO task_types (tenant_id, type_code, type_name, progress_method_default,
                        requires_inspection, min_photos_on_completion) VALUES
 (:tenant,'TT-CON','Construction Activity','QUANTITY',  true, 2),
 (:tenant,'TT-DES','Design Task',          'PERCENTAGE',false,0),
 (:tenant,'TT-DWG','Drawing Production',   'MILESTONE', false,0),
 (:tenant,'TT-INS','Inspection Task',      'MILESTONE', false,1),
 (:tenant,'TT-SNG','Snag / Punch Item',    'MILESTONE', true, 2),
 (:tenant,'TT-HSE','Safety Activity',      'CHECKLIST', false,1),
 (:tenant,'TT-PRC','Procurement Activity', 'MILESTONE', false,0),
 (:tenant,'TT-ADM','Administrative Task',  'MILESTONE', false,0);

INSERT INTO task_hold_reasons (tenant_id, reason_code, reason_name,
                               default_responsible_party, is_delay_claimable) VALUES
 (:tenant,'HR-DES','Design information not available','CONSULTANT', true),
 (:tenant,'HR-RFI','Awaiting RFI response',           'CONSULTANT', true),
 (:tenant,'HR-MAT','Material not delivered',          'SUPPLIER',   false),
 (:tenant,'HR-EQP','Equipment unavailable',           'CONTRACTOR', false),
 (:tenant,'HR-LAB','Manpower shortage',               'CONTRACTOR', false),
 (:tenant,'HR-ACC','Access not available',            'CLIENT',     true),
 (:tenant,'HR-WTH','Weather',                         'NEUTRAL',    true),
 (:tenant,'HR-APP','Awaiting authority approval',     'AUTHORITY',  true),
 (:tenant,'HR-PMT','Permit not issued',               'CONTRACTOR', false),
 (:tenant,'HR-INS','Awaiting inspection',             'CONSULTANT', true),
 (:tenant,'HR-VAR','Awaiting variation instruction',  'CLIENT',     true),
 (:tenant,'HR-SAF','Safety stoppage',                 'CONTRACTOR', false),
 (:tenant,'HR-OTH','Other',                           'CONTRACTOR', false);
```

---

**End of Document — DCOS-M04-DB-001**
