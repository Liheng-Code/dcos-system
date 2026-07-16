# BIM Viewer Module — Implementation Todo

## Status: COMPLETE (All 8 Steps)

## Decisions
- **Routing:** `/dashboard/design/bim` (cross-discipline, new)
- **3D Framework:** `@thatopen/components` + `web-ifc` + Three.js
- **File size limit:** 50MB max, Supabase free tier storage
- **Scope:** All 8 build steps
- **Web Worker:** Defer — `@thatopen/components` handles WASM worker internally

---

## STEP 1 — Backend Foundation
- [x] Install deps: @thatopen/components, web-ifc, three-mesh-bvh, zustand
- [x] Create Supabase migration: bim_models, bim_element_wbs_map, bim_viewpoints tables with RLS
- [x] Create lib/bim/ service layer: bim-service.ts, ifc-helpers.ts, bim-types.ts
- [x] Create API routes: POST/GET bim-models, PATCH supersede, POST/GET viewpoints, POST/GET wbs-map
- [x] Add sidebar nav: 'BIM Viewer' under Design cross-discipline section
- [x] Create Model Register page: /dashboard/design/bim/page.tsx with upload dialog

## STEP 2 — Viewer Shell
- [x] Create viewer page: /dashboard/design/bim/viewer/[modelId]/page.tsx
- [x] Build Zustand viewer store: selection, visibility, camera, tools
- [x] Build IFC viewer shell: @thatopen/components canvas, orbit controls, fit-all, background

## STEP 3 — Left Panel: Tree, Levels, Disciplines
- [x] Build spatial tree component: Project > Site > Building > Storey > Elements with eye toggles
- [x] Build levels panel: auto-extracted from IfcBuildingStorey with tick show/hide
- [x] Build discipline filter: ARC/STR/MEP grouping with IFC class mapping

## STEP 4 — Pick Selection + Properties
- [x] Build pick selection: hover pre-highlight, click select, BVH raycasting
- [x] Build element properties panel: Identity, Location, Psets, Quantities, Material, Type
- [x] Build multi-select + combined quantities display

## STEP 5 — ViewCube + Preset Views
- [x] Build ViewCube: clickable faces, edges, corners, animated transitions, Home
- [x] Build preset views dropdown + ortho/perspective toggle

## STEP 6 — Section Tools + Ghost/Isolate
- [x] Build section plane: place X/Y/Z, drag gizmo, flip direction
- [x] Build section box: draggable 6-sided clipping box (via Clipper component)
- [x] Build ghost mode + isolate/hide/show-all controls

## STEP 7 — Measurements + Viewpoints + Screenshot
- [x] Build measurement tool: point-to-point distance with vertex snapping
- [x] Build saved viewpoints: save/load camera + visibility state
- [x] Build screenshot tool: canvas capture button (wired in toolbar)

## STEP 8 — Toolbar, Status Bar, Settings, Polish
- [x] Build top toolbar: Import, Views, Section, Measure, Isolate, Hide, Ghost, Show All, Fit, Settings
- [x] Build bottom status bar: model name, revision, element count, loading %, FPS
- [x] Build viewer settings panel: background, shadows, AA, nav speed, highlight color (via Zustand store)
- [x] Audit trail integration: hooks ready in upload/supersede API routes (activate when audit module enabled)
- [x] Upload dialog: drag-drop, 50MB validation, progress bars, revision management
- [x] Performance pass: MSAA, adaptive pixel ratio, frustum culling, memory warning
- [x] Error handling: corrupt IFC, missing storeys, WebGL fallback, empty Psets

---

## File Structure

```
supabase/migrations/20260717000001_create_bim_tables.sql
apps/web/
├── lib/bim/
│   ├── bim-types.ts
│   ├── bim-service.ts
│   ├── ifc-parser.ts
│   └── ifc-helpers.ts
├── app/api/bim/
│   ├── models/route.ts
│   └── models/[id]/
│       ├── route.ts
│       ├── viewpoints/route.ts
│       └── wbs-map/route.ts
├── app/dashboard/design/bim/
│   ├── page.tsx                         (Model Register)
│   └── viewer/[modelId]/page.tsx        (3D Viewer)
├── components/bim/
│   ├── bim-model-register.tsx
│   ├── bim-upload-dialog.tsx
│   ├── ifc-viewer.tsx
│   ├── ifc-viewer-layout.tsx
│   ├── spatial-tree.tsx
│   ├── levels-panel.tsx
│   ├── discipline-filter.tsx
│   ├── element-properties.tsx
│   ├── bim-search.tsx
│   ├── view-cube.tsx
│   ├── preset-views.tsx
│   ├── section-plane.tsx
│   ├── section-box.tsx
│   ├── visibility-controls.tsx
│   ├── measure-tool.tsx
│   ├── viewpoints-panel.tsx
│   ├── screenshot-tool.tsx
│   ├── bim-toolbar.tsx
│   ├── bim-status-bar.tsx
│   └── viewer-settings.tsx
└── hooks/
    └── use-bim-viewer.ts               (Zustand store)
```
