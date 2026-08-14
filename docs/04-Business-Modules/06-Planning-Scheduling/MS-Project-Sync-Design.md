# MS Project Sync — Design (Phase 0 + 1)

Two-way schedule sync between Microsoft Project Desktop and the DCOS Planning
module, implemented as a **file-based round-trip using MSPDI XML** (`.xml` /
`.mspd`), **two-way with import-first MVP**, scoped to **Level 3 tasks**
(`schedule_level = 3`).

> Scope note: native `.mpp`/`.xer` binary import remains out of scope (see
> `docs/04-Business-Modules/06-Planning-Scheduling/05-Integration-Specification.md`,
> lines 95–97). The round-trip relies on the user exporting the MSP schedule as
> XML (MSPDI) from Project Desktop: `File > Save As > XML Format (*.xml)`.

---

## 1. Architecture

```
+-------------------+   upload   +--------------------+   query    +------------------+
| MS Project Desktop| ---------> | /api/planning/sync | ---------> |  Supabase        |
|  (MSPDI XML)      | <--------- |  {preview,commit,  | <--------- |  wbs_projects_sync|
+-------------------+   export   |   export,status}   |   realtime |  wbs_sync_*      |
                                 +--------------------+   channel  |  wbs_tasks (+msp)|
                                          ^                       +------------------+
                                          | POST schedule (normalized JSON)
                                          |
                                 +--------------------+
                                 | Sync Engine (lib/planning/sync) |
                                 |  mspd-parser · mapping ·       |
                                 |  change-detection · commit     |
                                 +--------------------+
```

- **Sync Connector v1 (MVP)**: the planning user uploads the MSPDI XML in the
  Web UI. The browser parses the XML to a normalized schedule and the engine
  does the rest.
- **Sync Connector v2 (future)**: a folder-watch agent on a shared drive or the
  Planner workstation that posts new/updated XML files automatically (same API).
- **Realtime**: after a commit, the server broadcasts on
  `planning-sync:project:{projectId}`; the Gantt / look-ahead pages re-fetch.

## 2. Data model

`wbs_tasks` gains sync provenance columns (see
`20260806000002_create_msp_sync_tables.sql`):

| column | purpose |
| --- | --- |
| `msp_uid` | MSP `<UID>` (stable across saves; the sync key) |
| `msp_outline_number` | last imported `<OutlineNumber>` (e.g. `1.2.3`) |
| `sync_source` | `ms_project` / `manual` / `library` / `template` |
| `last_synced_at` | timestamp of last import that touched the row |
| `sync_hash` | canonical hash of the synced fields at last import |

New tables:

- `wbs_projects_sync` — one row per project; the sync config
  (`mode`, `sync_level`, `sync_progress`, `default_wbs_node_id`, `status`,
  `last_sync_hash`, `source_identifier`, `source_name`).
- `wbs_sync_sessions` — one row per import/export attempt; stores the parsed
  payload and summary, and moves `preview → committed`.
- `wbs_sync_events` — one row per task op within a session
  (`create / update / unchanged / orphan / skip`), status `pending → applied
  | failed`, plus the field-level `changes` diff.

## 3. Field mapping (import)

MSP is the source of truth for **schedule** fields; DCOS stays owner of
**execution** fields.

| MSPDI `<Task>` | `wbs_tasks` | direction |
| --- | --- | --- |
| `UID` | `msp_uid` | import + export |
| `Name` | `task_name` | import |
| `OutlineNumber` | `msp_outline_number` | import + export |
| `WBS` | (preview label only) | import |
| `Start` / `Finish` | `start_date` / `end_date` | import |
| `Notes` | `description` | import |
| `Work` | `planned_hours` | import |
| `PredecessorLink` (`PredecessorUID`, `Type`) | `dependency_task_id`, `dependency_type` | import |
| `PercentComplete` | — (see 3.1) | export only (reference) |
| `Status / Priority / Delay / Owner / Progress / Costs` | — | never overwritten |

Dependency `Type` values (MSPDI): `0=FF`, `1=FS`, `2=SF`, `3=SS`. Dependencies
are resolved against the imported task set by `UID`; predecessors outside the
sync scope are recorded as text in `dependency_text`.

### 3.1 Summary tasks at the sync level
MSP marks a task `Summary=1` when it has sub-tasks at a deeper outline level.
Because only the sync level is imported, a level-3 summary (e.g. a design
package with level-4 activities under it) is a real work package here: it is
imported as a normal task using MSP's rolled-up `<Start>` / `<Finish>`. Only
tasks outside the sync level are excluded (their content is rolled into the
level-3 package). The summary flag itself is not persisted yet (see Phase 3).

### 3.1 Progress ownership
`PercentComplete` is *not* imported by default — progress is tracked in the
field by DCOS crews. Flip `sync_progress = true` on the config to let MSP
overwrite `progress` on import. Export always includes it as reference.

## 4. Import flow (merge, default)

1. **Parse** — client converts MSPDI XML → normalized `MspSchedule` (Level 3
   tasks only retained for sync).
2. **Preview** (`POST /api/planning/sync/{projectId}/preview`) — engine loads
   existing linked tasks, computes `sync_hash` on both sides, and produces a
   diff: `create`, `update`, `unchanged`, `orphan`. A `wbs_sync_sessions` row
   (`preview`) + `wbs_sync_events` rows are persisted. **No writes to
   `wbs_tasks`.**
3. **Review** — the UI shows a diff table; the user sees exactly what will
   change and confirms.
4. **Commit** (`POST /api/planning/sync/{projectId}/commit`) — the engine
   creates/updates `wbs_tasks`, resolves dependencies, marks events `applied`,
   flips the session to `committed`, updates config `last_synced_at` /
   `last_sync_hash`, and broadcasts the realtime event.

Merge semantics: rows matched by `msp_uid` are upserted; DCOS tasks linked to
MSP but absent from the new file are flagged `orphan` (visible in preview, not
deleted). `replace` mode is reserved for Phase 4 (deactivate L3 tasks not
present in the file after an approved preview).

New tasks are created under `wbs_projects_sync.default_wbs_node_id` (falls back
to the project root node) with a deterministic `task_code` derived from the MSP
outline number (`MSP-1.2.3`), uniquified on collision. Phase 3 will add
MSP-outline → `wbs_nodes` hierarchy mapping.

## 5. Export flow

`POST /api/planning/sync/{projectId}/export` produces an MSPDI XML document of
the project's Level 3 tasks (`sync_source = 'ms_project'`, or all L3 tasks when
none are linked yet) with `UID`, `Name`, `OutlineNumber`, `Start`, `Finish`,
`Duration`, `PercentComplete`, and `PredecessorLink`. The browser downloads it
and the user opens it in Project Desktop.

## 6. API surface

| method & route | body / query | result |
| --- | --- | --- |
| `GET …/status` | — | config row + counts + last session |
| `GET …/config` / `PUT …/config` | settings | read/update `wbs_projects_sync` |
| `POST …/preview` | `{ schedule }` | `{ sessionId, summary, ops[] }` |
| `POST …/commit` | `{ sessionId }` | applied summary |
| `POST …/export` | `{ level? }` | XML text |
| `GET …/sessions` | — | recent import/export sessions |

All routes authenticate via the user client first (401 otherwise), then use the
service-role admin client for DB access (existing pattern in `api/hr/overtime`).

## 7. Realtime

On commit, `lib/planning/sync/realtime.ts` broadcasts
`{ type: 'schedule_synced', sessionId }` on `planning-sync:project:{projectId}`.
The Gantt / look-ahead views may subscribe to refetch; the sync dashboard
refetches its session list on the broadcast.

## 8. Implementation phases

| phase | scope |
| --- | --- |
| **0** | Schema: migration `20260806000002_create_msp_sync_tables.sql` |
| **1** | Import engine + API + UI (this deliverable) |
| 2 | Export engine + UI (this deliverable) |
| 3 | MSP outline → `wbs_nodes` hierarchy mapping; summary/level filtering |
| 4 | `replace` mode + conflict review workflow; sync_progress toggle UI |
| 5 | Connector v2 (folder-watch agent), baseline push (MSP baselines → `wbs_baselines`) |

## 9. Open items
- `wbs_nodes` mapping table (Phase 3): how MSP outline level 1/2 maps to DCOS
  building/level nodes.
- `.mspd` file detection: if Project Desktop produces a compressed MSPD variant
  (PK header), it must be decompressed before parsing — detect and report.
