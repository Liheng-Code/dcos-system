# DCOS — BIM Viewer Module (Phase 1: IFC Import & 3D View)
## Full Build Prompt / Module Specification

**Document Type:** Module Build Prompt
**Module Code:** BIM-VIEW
**Parent System:** Digital Construction Operating System (DCOS)
**Version:** R0
**Scope:** IFC import, 3D viewing, navigation, visibility control, pick selection with instance properties panel

---

## 1. MODULE IDENTITY (VERY IMPORTANT)

**Module Name:**
BIM Viewer — IFC Import & 3D Visualization

**Module Type:**
In-browser 3D model viewer integrated into DCOS project workspace

**Core Principle:**
Every BIM model belongs to a project, carries a revision, and every element (GlobalId) is mappable to the DCOS WBS spine. The viewer is not a standalone tool — it is a window into project data.

**Position in DCOS:**
Module under Design workspace. Shares Document Control revision philosophy, Audit Trail engine, RBAC, and multi-tenant isolation.

**Target Users:**
BIM Coordinator, Discipline Managers (ARC/STR/MEP), Project Manager, Engineers, QA/QC Inspectors, Client/Consultant (view-only).

---

## 2. BUSINESS GOAL

Replace external IFC viewers (Navisworks freeware, BIMvision, desktop Revit) for day-to-day model review. Users export IFC from Revit, upload into DCOS, and the whole project team views the same current revision in the browser — with full traceability of who uploaded, who viewed, and which revision is current.

**Success criteria:**
- A Revit-exported IFC (2x3 or IFC4) loads and renders correctly in the browser.
- Navigation is smooth (target 60 FPS on a 50–150MB model, minimum 30 FPS).
- Any element can be picked and its full instance data displayed instantly.
- Levels/storeys can be shown/hidden by tick selection.
- Model revisions are controlled like drawings: Current / Superseded.

---

## 3. TECH STACK (MANDATORY)

| Layer | Technology | Notes |
|---|---|---|
| IFC Parsing | **web-ifc** (WebAssembly) | Client-side parse, no server conversion for MVP |
| 3D Engine | **Three.js** (via @thatopen/components or direct) | WebGL2 rendering |
| Frontend | Next.js 14 + React + TypeScript + Tailwind | Match DCOS stack |
| State | Zustand or React context for viewer state | Selection, visibility, camera |
| Backend | Supabase (MVP) → NestJS later | Model register, WBS mapping |
| Storage | Supabase Storage / S3 | IFC files, chunked upload for large files |
| Auth | DCOS JWT + RBAC + tenant RLS | tenant_id enforced on all tables |

**Rendering quality requirements:**
- Anti-aliasing (MSAA or SMAA post-process)
- Damped/inertial camera controls (smooth stop, no snapping)
- Frustum culling + BVH raycasting (three-mesh-bvh) for fast pick on large models
- Instanced/merged geometry from web-ifc for performance
- Adaptive pixel ratio (cap devicePixelRatio at 2)
- Optional shadows and ambient occlusion toggle (off by default on large models)

---

## 4. SCREEN LAYOUT

```text
┌────────────────────────────────────────────────────────────────────┐
│ TOP TOOLBAR                                                        │
│ [Import IFC] [Views ▾] [Section] [Measure] [Isolate] [Hide]        │
│ [Ghost] [Show All] [Fit] [Settings ⚙]                              │
├──────────────┬──────────────────────────────────┬──────────────────┤
│ LEFT PANEL   │ 3D CANVAS                        │ RIGHT PANEL      │
│              │                        [ViewCube]│                  │
│ ▸ Model Tree │                                  │ Element          │
│   (Spatial)  │                                  │ Properties       │
│ ▸ Levels     │                                  │ (opens on pick)  │
│   ☑ L01      │                                  │                  │
│   ☑ L02      │                                  │ ▸ Identity       │
│   ☐ L03      │                                  │ ▸ Location       │
│ ▸ Disciplines│                                  │ ▸ Property Sets  │
│   ☑ ARC      │                                  │ ▸ Quantities     │
│   ☑ STR      │                                  │ ▸ Material       │
│   ☑ MEP      │                                  │ ▸ Type Props     │
├──────────────┴──────────────────────────────────┴──────────────────┤
│ BOTTOM BAR: Model name | Revision R2 (Current) | 48,210 elements   │
│ | Loading 84% | FPS 60                                             │
└────────────────────────────────────────────────────────────────────┘
```

Panels are collapsible. On smaller screens, left/right panels become slide-over drawers.

---

## 5. FEATURE SPECIFICATION

### 5.1 IFC Import

- **Import IFC button** + drag-and-drop zone on empty viewer state.
- Accept `.ifc` (IFC 2x3 TC1 and IFC4). Reject other formats with clear message.
- File size validation: warn above 150MB, hard limit 500MB (configurable per tenant).
- Chunked/resumable upload with progress bar (upload %) and separate parse progress bar (geometry %).
- On upload, create a **model revision record**:
  - First upload of a model = R0.
  - Re-upload with same model name = new revision (R1, R2…), previous revision auto-marked **Superseded**.
- Model register screen (list view): Project, Model Name, Discipline, Revision, Schema, File Size, Element Count, Uploaded By, Date, Status (Current/Superseded), Actions (Open / Download / Supersede history).
- All import actions logged to Audit Trail engine (`module_code = BIM`, action = UPLOAD / SUPERSEDE).

### 5.2 3D Navigation

| Control | Input |
|---|---|
| Orbit | Left mouse drag / one-finger drag |
| Pan | Right mouse drag or middle drag / two-finger drag |
| Zoom | Scroll wheel / pinch |
| Zoom to element | Double-click element |
| Fit all | Fit button / Home on ViewCube / keyboard `F` |
| First-person walk (optional Phase 1.5) | Toggle mode, WASD + mouse look |

- **ViewCube** top-right: clickable faces (Top/Bottom/Front/Back/Left/Right), edges, and corners; animated camera transition; Home button.
- Preset views dropdown: Top, Front, Back, Left, Right, Isometric NE/NW/SE/SW.
- Orthographic / Perspective toggle.
- Smooth damped controls; camera never gimbal-locks; rotation pivot = point under cursor or selection center.

### 5.3 Visibility Control

- **Levels panel with tick boxes** — auto-extracted from IfcBuildingStorey. Ticking/unticking instantly shows/hides all elements on that storey. "Only this level" shortcut on hover.
- **Discipline filter** — group by IFC class mapped to disciplines:
  - ARC: IfcWall, IfcDoor, IfcWindow, IfcCovering, IfcFurnishingElement, IfcRailing, IfcStair
  - STR: IfcColumn, IfcBeam, IfcSlab, IfcFooting, IfcPile, IfcReinforcingBar, IfcWallStandardCase (structural)
  - MEP: IfcFlowSegment, IfcFlowFitting, IfcFlowTerminal, IfcDuctSegment, IfcPipeSegment, IfcCableCarrierSegment, IfcEnergyConversionDevice
- **Spatial tree** (Project → Site → Building → Storey → Element type → Element) with per-node visibility eye icon and click-to-select sync with 3D view.
- Hide Selected / Isolate Selected / Show All.
- **Ghost mode**: unselected context becomes transparent grey; selection stays solid.
- **Section plane**: place along X/Y/Z or pick a face; drag gizmo to move; flip direction.
- **Section box**: draggable 6-sided clipping box for room/zone inspection.

### 5.4 Pick Selection + Right-Side Properties Panel (CRITICAL)

- **Hover**: pre-highlight (light outline) with tooltip showing element name + IFC class.
- **Click**: select → strong highlight color (configurable, default DCOS accent) → right panel opens automatically.
- **Right panel displays FULL instance information**, grouped in collapsible sections:

| Section | Content |
|---|---|
| Identity | GlobalId, IFC Class, Name, Tag/Mark, Object Type, Description |
| Location | Site → Building → Storey → (Space/Zone if present); future: linked WBS node with breadcrumb |
| Property Sets (Psets) | ALL property sets exported from Revit (Pset_WallCommon, custom Revit parameters, etc.) — each Pset is a collapsible group, properties as name/value rows with units |
| Quantities | Length, Width, Height, Area, Volume, Weight (from IfcElementQuantity) |
| Material | Material name(s), layer set with thicknesses if present |
| Type Properties | Properties from the element's IfcType object |

- **Search within panel** (filter properties by name).
- **Copy value** on click; **Copy GlobalId** button.
- **Multi-select** with Ctrl/Cmd+click: panel shows selection count + combined quantity totals (sum of volume, area, count) — foundation for future QS take-off.
- **Element search** box (top of left panel): search by Name, Tag, or GlobalId → zoom to result.
- Deselect: Esc key or click empty space.

### 5.5 Measurement Tools

- Point-to-point distance (snaps to vertices/edges).
- Edge length, angle between two edges (Phase 1.5).
- Measurements displayed in model units with unit label; clear-all button.

### 5.6 Viewer Settings

- Background color (light/dark to match DCOS theme).
- Shadows on/off, ambient occlusion on/off, anti-aliasing quality.
- Navigation speed / zoom sensitivity.
- Selection highlight color.
- Settings persist per user (localStorage on web app is acceptable here — this is the production Next.js app, not an artifact).

---

## 6. DCOS INTEGRATION HOOKS (design now, activate later)

| Hook | Phase 1 Behavior | Future Use |
|---|---|---|
| Element ↔ WBS mapping table | Table exists; manual mapping UI stub | 4D progress coloring, cost roll-up per element |
| Create RFI from element | Button in properties panel → opens RFI form pre-filled with GlobalId, model, revision, screenshot | Full RFI module link |
| Create NCR from element | Same pattern | QA/QC module link |
| Saved viewpoints | Save camera + visibility state, named, per user/project | BCF exchange in later phase |
| Screenshot/snapshot | Capture current canvas to PNG, attach to records | Daily reports, RFIs, inspections |
| Audit Trail | UPLOAD, SUPERSEDE, EXPORT, VIEW (model open) logged | Compliance reporting |

---

## 7. DATA MODEL

### `bim_models`

| Field | Type | Description |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS enforced |
| project_id | uuid | FK projects |
| model_name | text | Logical model name (e.g. "Tower A - STR") |
| discipline | text | ARC / STR / MEP / CIVIL / FED |
| revision | text | R0, R1, R2… |
| ifc_schema | text | IFC2X3 / IFC4 |
| file_url | text | Storage path (tenant-partitioned bucket) |
| file_size_mb | numeric | For quota tracking |
| element_count | integer | Populated after first parse |
| status | text | CURRENT / SUPERSEDED / ARCHIVED |
| uploaded_by | uuid | FK users |
| created_at | timestamptz | |

### `bim_element_wbs_map`

| Field | Type | Description |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS |
| model_id | uuid | FK bim_models |
| global_id | text | IFC GlobalId (survives revisions if Revit GUID stable) |
| wbs_node_id | uuid | FK wbs_nodes |
| mapped_by | uuid | FK users |
| created_at | timestamptz | |

### `bim_viewpoints`

| Field | Type | Description |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | RLS |
| model_id | uuid | FK bim_models |
| name | text | Viewpoint name |
| camera_state | jsonb | Position, target, projection |
| visibility_state | jsonb | Hidden storeys, hidden classes, section planes |
| created_by | uuid | FK users |
| created_at | timestamptz | |

---

## 8. API ENDPOINTS

```text
POST   /api/projects/:projectId/bim-models            (init upload, returns signed upload URL)
POST   /api/bim-models/:id/complete                   (finalize upload, trigger metadata extraction)
GET    /api/projects/:projectId/bim-models            (model register list)
GET    /api/bim-models/:id                            (model detail + signed download URL)
PATCH  /api/bim-models/:id/supersede
GET    /api/bim-models/:id/revisions
POST   /api/bim-models/:id/viewpoints
GET    /api/bim-models/:id/viewpoints
POST   /api/bim-models/:id/wbs-map                    (bulk map GlobalIds to WBS nodes)
GET    /api/bim-models/:id/wbs-map
```

All endpoints validate tenant_id from JWT — never from request body.

---

## 9. WORKFLOW

```text
User exports IFC from Revit
→ Opens DCOS Design > BIM Viewer > Import IFC
→ Selects/drops file → validation → chunked upload with progress
→ System creates bim_models record (revision assigned)
→ Browser parses IFC via web-ifc (parse progress shown)
→ Model renders; spatial tree, levels, disciplines auto-populated
→ User navigates, ticks levels, picks elements, reads properties
→ Optional: saves viewpoints, takes measurements, maps elements to WBS
→ Re-upload of updated model → new revision → old revision Superseded
→ All actions logged to Audit Trail
```

---

## 10. PERMISSIONS

| Role | Import | View | Supersede | WBS Map | Delete/Archive |
|---|---|---|---|---|---|
| BIM Coordinator | ✔ | ✔ | ✔ | ✔ | ✔ |
| Discipline Manager | ✔ | ✔ | ✔ (own discipline) | ✔ | — |
| Project Manager | ✔ | ✔ | ✔ | ✔ | ✔ |
| Engineer | — | ✔ | — | — | — |
| QA/QC / HSE | — | ✔ | — | — | — |
| Client / Consultant | — | ✔ (issued models only) | — | — | — |
| Viewer | — | ✔ | — | — | — |

---

## 11. PERFORMANCE TARGETS

| Operation | Target |
|---|---|
| 50MB IFC parse + first render | < 15 seconds on mid-range laptop |
| 150MB IFC parse + first render | < 45 seconds |
| Navigation frame rate | 60 FPS target, 30 FPS minimum |
| Pick selection response | < 100 ms (BVH raycast) |
| Level tick show/hide | < 200 ms |
| Properties panel populate | < 300 ms |
| Memory ceiling | Graceful warning above ~1.5GB tab memory; suggest discipline filtering |

**Large-model strategy (Phase 2):** server-side conversion to tiled fragments/streamed geometry for models above 300MB. Do not block MVP on this.

---

## 12. ERROR HANDLING & EDGE CASES

- Corrupt/invalid IFC → clear error with line reference if available; upload not saved as Current.
- IFC with no IfcBuildingStorey → viewer still loads; levels panel shows "No storeys found."
- Elements without Psets → panel shows Identity + Geometry only, no crash.
- Duplicate GlobalIds → log warning, render both, flag in model info.
- Upload interrupted → resumable; incomplete uploads auto-cleaned after 24h.
- WebGL unsupported browser → friendly fallback message with requirements.
- Very large single meshes → progressive rendering, never freeze UI thread (parse in Web Worker).

---

## 13. ACCEPTANCE CRITERIA (DEFINITION OF DONE)

1. Upload a Revit-exported IFC4 sample (~80MB) → model visible in browser within performance target.
2. ViewCube, orbit, pan, zoom, fit-all, preset views all functional and smooth.
3. Levels panel lists all storeys; ticking hides/shows correctly.
4. Discipline filters hide/show correct IFC classes.
5. Clicking any element highlights it and populates the right panel with ALL Psets, quantities, material, and identity fields matching the source Revit data.
6. Multi-select shows combined quantities.
7. Section plane and section box cut the model correctly.
8. Re-upload creates R1 and marks R0 Superseded; register shows both.
9. Audit log records upload, supersede, and model-open events with user, tenant, project.
10. Tenant isolation verified: user from Tenant A cannot list or fetch Tenant B models (automated test).

---

## 14. BUILD ORDER

1. Model register (table, upload, revisioning, RLS) — backend first.
2. Viewer shell: canvas, web-ifc loading, orbit controls, fit-all.
3. Spatial tree + level ticks + discipline filters.
4. Pick selection + BVH raycasting + properties panel.
5. ViewCube + preset views + ortho/perspective.
6. Section plane/box + ghost/isolate/hide.
7. Measurements + viewpoints + screenshots.
8. Audit integration + permissions + polish + performance pass.

---

**End of Build Prompt**
