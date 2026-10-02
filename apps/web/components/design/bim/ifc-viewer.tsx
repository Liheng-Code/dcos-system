"use client";

import { useEffect, useRef, useCallback, createContext, useContext, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  Components, Worlds, IfcLoader, FragmentsManager, Raycasters, Clipper, Grids,
  SimpleScene, SimpleCamera, SimpleRenderer, OrthoPerspectiveCamera,
} from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import { useBimViewer, useBimFps } from "@/hooks/use-bim-viewer";
import {
  extractStoreysFromData, countElementsPerClass, buildDisciplineInfo, buildSpatialTree,
  extractPropertiesFromItemData, mapIfcClassToDiscipline, getItemCategory,
  buildStoryMapFromBoundingBox,
} from "@/lib/design/bim/ifc-helpers";
import type { LevelInfo, DisciplineInfo, SpatialTreeNode } from "@/lib/design/bim/bim-types";
import type { ColorMode, ColorLegendEntry } from "@/lib/design/bim/bim-types";
import { COLOR_PALETTES } from "@/lib/design/bim/bim-types";

// Hover feedback uses a warm amber tint, deliberately distinct from the
// indigo selection color, so users can tell "what's under my cursor" apart
// from "what's actually selected" at a glance.
const HOVER_COLOR = "#fbbf24";

// Measure tool visuals reuse the same amber as hover/section-plane accents
// for a consistent "tool overlay" color across the viewer.
const MEASURE_COLOR = 0xfbbf24;

// Live snap-preview colors while aiming the Measure tool, so the exact point
// that will be placed on click is obvious before you click it: green means
// "locked onto a vertex", cyan means "locked onto an edge" (the whole edge
// is highlighted too), white means "free point on a surface, no snap".
const SNAP_VERTEX_COLOR = 0x22c55e;
const SNAP_EDGE_COLOR = 0x06b6d4;
const SNAP_FACE_COLOR = 0xffffff;

// Priority order matches the SnapResolver's own: vertex first, then edge,
// then face — a nearby vertex always wins over a nearby edge/face.
const MEASURE_SNAP_CLASSES = [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE, FRAGS.SnappingClass.FACE];

function makeMeasureMarker(point: THREE.Vector3): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshBasicMaterial({ color: MEASURE_COLOR, depthTest: false }),
  );
  marker.renderOrder = 999;
  marker.position.copy(point);
  return marker;
}

function makeMeasureLine(a: THREE.Vector3, b: THREE.Vector3): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: MEASURE_COLOR, depthTest: false }));
  line.renderOrder = 999;
  return line;
}

// Distance label as a camera-facing sprite (not an HTML overlay) so it stays
// correctly positioned in 3D space and scales with zoom without needing a
// per-frame screen-space projection loop.
function makeMeasureLabel(distanceMeters: number, a: THREE.Vector3, b: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(4, 4, 248, 56, 10);
  else ctx.rect(4, 4, 248, 56);
  ctx.fill();
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${distanceMeters.toFixed(2)} m`, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  const scale = THREE.MathUtils.clamp(distanceMeters * 0.15, 0.4, 2.5);
  sprite.scale.set(scale * 3.2, scale * 0.8, 1);
  sprite.position.lerpVectors(a, b, 0.5);
  return sprite;
}

function disposeObject3D(obj: THREE.Object3D) {
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
    obj.geometry?.dispose?.();
    const mat = obj.material;
    const materials = Array.isArray(mat) ? mat : [mat];
    for (const m of materials) {
      const withMap = m as THREE.Material & { map?: THREE.Texture | null };
      withMap.map?.dispose?.();
      m.dispose();
    }
  }
}

export const BimComponentsContext = createContext<Components | null>(null);
export const BimWorldContext = createContext<ReturnType<InstanceType<typeof Worlds>["create"]> | null>(null);
export const BimFragmentsContext = createContext<FragmentsManager | null>(null);
// Ref (not state) so the bulk-loaded item data — set once per model load — can be
// read imperatively (e.g. by an "Extract for Takeoff" button) without re-rendering
// every consumer whenever a model reloads.
export const BimItemDataContext = createContext<MutableRefObject<Record<string, unknown>[]> | null>(null);

export function useBimComponents() {
  return useContext(BimComponentsContext);
}
export function useBimWorld() {
  return useContext(BimWorldContext);
}
export function useBimFragments() {
  return useContext(BimFragmentsContext);
}
export function useBimItemData() {
  return useContext(BimItemDataContext);
}

export interface BimHandles {
  components: Components;
  world: ReturnType<InstanceType<typeof Worlds>["create"]>;
  fragments: FragmentsManager;
  itemDataRef: MutableRefObject<Record<string, unknown>[]>;
}

interface IfcViewerProps {
  fileUrl: string;
  modelId: string;
  onModelLoaded?: (elementCount: number) => void;
  // Toolbar/panel components (ViewCube, PresetViews, SectionControls, etc.) are
  // rendered as page-level siblings of IfcViewer, not as its children, so the
  // BimWorldContext/BimComponentsContext providers below — scoped to IfcViewer's
  // own returned JSX — never reach them. The page must lift these handles into a
  // provider that wraps the whole layout; onReady is how it gets them.
  onReady?: (handles: BimHandles | null) => void;
}

export function IfcViewer({ fileUrl, modelId, onModelLoaded, onReady }: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<Components | null>(null);
  const worldRef = useRef<ReturnType<InstanceType<typeof Worlds>["create"]> | null>(null);
  const fragmentsRef = useRef<FragmentsManager | null>(null);
  const itemDataRef = useRef<Record<string, unknown>[]>([]);
  const fpsFrames = useRef<number[]>([]);
  const hoveredRef = useRef<{ fragModel: FRAGS.FragmentsModel; localId: number } | null>(null);
  const hoverBusyRef = useRef(false);
  const ghostAppliedRef = useRef(false);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const measureFirstPointRef = useRef<THREE.Vector3 | null>(null);
  const measurePreviewMarkerRef = useRef<THREE.Mesh | null>(null);
  const measurePreviewEdgeRef = useRef<THREE.Line | null>(null);

  const [ready, setReady] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [modifierBadge, setModifierBadge] = useState<{ x: number; y: number; symbol: "+" | "−" } | null>(null);
  const [dragBox, setDragBox] = useState<{ x: number; y: number; width: number; height: number; mode: "window" | "crossing" } | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const {
    setLevels,
    setDisciplines,
    setDisciplineElementIds,
    setSpatialTree,
    setElementCount,
    setLoadingProgress,
    setIsLoading,
    backgroundColor,
    activeTool,
    selectedItems,
    setSelectedItems,
    setElementProperties,
    setHoveredItem,
    selectionColor,
    ghostMode,
    showGrid,
    projectionMode,
    colorMode,
    colorPalette,
    setColorLegend,
    setElementStoryMap,
    setElementClassMap,
  } = useBimViewer();

  // Fallback: when the IFC file has no IFCBUILDINGSTOREY elements, infer
  // storeys from the vertical distribution of element bounding boxes.
  // Quantizes Y coordinates into ~3 m bins and creates a synthetic LevelInfo
  // for each bin that contains elements.
  const inferStoreysFromBoxes = useCallback(async (
    fragments: FragmentsManager,
    localIdsByModel: Map<string, number[]>,
  ): Promise<LevelInfo[]> => {
    const allBoxes: { min: { y: number }; max: { y: number } }[] = [];
    for (const [, fragModel] of fragments.list) {
      const ids = localIdsByModel.get(fragModel.modelId);
      if (!ids || ids.length === 0) continue;
      const boxes = await fragModel.getBoxes(ids);
      allBoxes.push(...boxes);
    }
    if (allBoxes.length === 0) return [];

    let minY = Infinity, maxY = -Infinity;
    for (const b of allBoxes) {
      if (b.min.y < minY) minY = b.min.y;
      if (b.max.y > maxY) maxY = b.max.y;
    }

    const BIN_SIZE = 3; // meters — approximate story height
    const bins = new Map<number, number>(); // bin index -> element count
    for (const b of allBoxes) {
      const cy = (b.min.y + b.max.y) / 2;
      const binIdx = Math.floor((cy - minY) / BIN_SIZE);
      bins.set(binIdx, (bins.get(binIdx) ?? 0) + 1);
    }

    const storeys: LevelInfo[] = [];
    let levelNum = 1;
    for (const [binIdx, count] of Array.from(bins.entries()).sort((a, b) => a[0] - b[0])) {
      const elevation = minY + binIdx * BIN_SIZE + BIN_SIZE / 2;
      storeys.push({
        expressId: -(binIdx + 1),
        name: `Level ${levelNum}`,
        elevation: Math.round(elevation * 10) / 10,
        modelId: "inferred",
        visible: true,
        elementCount: count,
      });
      levelNum++;
    }
    return storeys;
  }, []);

  const initializeViewer = useCallback(async () => {
    if (!containerRef.current || componentsRef.current) return;

    const container = containerRef.current;

    // Create components
    const components = new Components();
    componentsRef.current = components;

    // Initialize components (starts animation loop)
    components.init();

    // Create world
    const worlds = components.get(Worlds);
    const world = worlds.create();
    worldRef.current = world;

    // Create scene
    const scene = new SimpleScene(components);
    scene.setup({ backgroundColor: new THREE.Color(backgroundColor) });
    world.scene = scene;

    // Create renderer (must be before camera)
    const renderer = new SimpleRenderer(components, container);
    renderer.three.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.three.toneMappingExposure = 1;
    renderer.showLogo = false; // Hide the built-in "That Open Company" attribution overlay
    world.renderer = renderer;

    // Create camera (requires renderer to be set first). OrthoPerspectiveCamera
    // is a strict superset of SimpleCamera (extends it, adds .projection for
    // Perspective/Orthographic switching) — everything elsewhere in this file
    // that expects a SimpleCamera (fitToItems, .controls, etc.) still works
    // unchanged. Assigning it to world.camera below is what triggers this
    // class's internal navigation-mode setup (Orbit/FirstPerson/Plan), via
    // the same currentWorld-setter mechanism SimpleCamera already relies on
    // for wiring up CameraControls — so construction order here is unchanged
    // from before, only the class itself is upgraded.
    const camera = new OrthoPerspectiveCamera(components);
    world.camera = camera;

    // Ground grid, shown/hidden via the showGrid effect below.
    const grids = components.get(Grids);
    grids.create(world);

    // Setup IfcLoader — serve WASM from public/. Note: ifcLoader.load() builds its
    // own FRAGS.IfcImporter internally and resolves the WASM path from
    // settings.wasm.path/absolute directly — it does NOT use customLocateFileHandler,
    // so that must be set (not just the locate handler) or the WASM fetch 404s.
    const ifcLoader = components.get(IfcLoader);
    ifcLoader.settings.autoSetWasm = false;
    ifcLoader.settings.wasm.path = "/";
    ifcLoader.settings.wasm.absolute = true;
    ifcLoader.settings.customLocateFileHandler = (path: string) => {
      const name = path.split("/").pop() || "web-ifc.wasm";
      return new URL(`/${name}`, window.location.origin).href;
    };
    await ifcLoader.setup();

    // In React Strict Mode (dev), effects mount -> cleanup -> mount again, which
    // disposes this `components` instance and replaces componentsRef.current before
    // these awaits resolve. Bail out if a newer invocation has taken over, otherwise
    // we'd mark a disposed instance ready or call fragments.init() out of order.
    if (componentsRef.current !== components) return;

    // Initialize FragmentsManager (required before loading IFC)
    const fragments = components.get(FragmentsManager);
    const workerUrl = await FragmentsManager.getWorker();

    if (componentsRef.current !== components) return;
    fragments.init(workerUrl);

    setReady(true);
    onReady?.({ components, world, fragments, itemDataRef });

    // FPS counter. Frame timestamps are tracked every rAF, but the displayed
    // number is only refreshed once a second — recomputing a trailing-1s
    // frame count every single frame made the readout flicker between two
    // adjacent values (e.g. 60/61) as frames crossed the window's edge every
    // ~16ms. Sampling it once/sec (like most engine FPS HUDs) reads stable.
    // Written via getState() (no hook subscription) so this doesn't force
    // IfcViewer to re-render every frame too.
    let lastFpsUpdate = performance.now();
    const measureFps = () => {
      const now = performance.now();
      fpsFrames.current.push(now);
      while (fpsFrames.current.length > 0 && fpsFrames.current[0] < now - 1000) {
        fpsFrames.current.shift();
      }
      if (now - lastFpsUpdate >= 1000) {
        useBimFps.getState().setFps(fpsFrames.current.length);
        lastFpsUpdate = now;
      }
      requestAnimationFrame(measureFps);
    };
    const fpsRaf = requestAnimationFrame(measureFps);

    return () => {
      cancelAnimationFrame(fpsRaf);
    };
  }, [backgroundColor, onReady]);

  const loadModel = useCallback(async (url: string) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return;

    // A React Strict Mode double-mount (or Fast Refresh, or the user
    // navigating away mid-load) can dispose this exact `components` instance
    // — tearing down its FragmentsManager worker and the "bim-model" it
    // holds — while this async function is still awaiting further worker
    // round-trips below. Without bailing out, those later calls keep hitting
    // the now-torn-down worker and throw "Fragments: Model not found:
    // bim-model". Mirrors the same staleness guard initializeViewer already
    // uses for the same reason.
    const isStale = () => componentsRef.current !== components || worldRef.current !== world;

    try {
      setLoadingProgress(0);
      setIsLoading(true);

      // Fetch IFC data via proxy (handles auth + CORS)
      const response = await fetch(`/api/bim/models/${modelId}/file`);
      if (!response.ok) throw new Error(`Failed to fetch IFC file: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const ifcData = new Uint8Array(arrayBuffer);
      if (isStale()) return;

      setLoadingProgress(10);

      // Load with IfcLoader
      const ifcLoader = components.get(IfcLoader);
      const model = await ifcLoader.load(ifcData, true, "bim-model", {
        instanceCallback: (importer) => {
          importer.addAllAttributes();
          importer.addAllRelations();
          // The importer silently drops any element whose origin-relative position
          // exceeds this (default 100,000 units/meters) and only logs a console.log.
          // Structural/foundation exports (pile caps, bore piles, and some columns/
          // beams) are frequently authored in absolute site/survey coordinates, which
          // routinely exceed that default and were vanishing from the scene entirely.
          importer.distanceThreshold = null;
        },
      });
      if (isStale()) return;

      setLoadingProgress(70);

      // Add model to scene — the loader returns a FragmentsModel wrapper;
      // the actual THREE.Object3D lives on its `.object` property.
      world.scene.three.add(model.object);

      // Fit camera to model
      const camera = world.camera as SimpleCamera;
      await camera.fitToItems();
      if (isStale()) return;

      setLoadingProgress(85);

      // Get element count, full item data, and spatial tree per model. Fetched via a
      // single batched getItemsData() call per model rather than one round-trip per
      // item — the previous per-item loop also passed getItems() an object instead of
      // an iterable of ids, which isn't a valid argument and threw immediately.
      const fragments = components.get(FragmentsManager);
      fragmentsRef.current = fragments;

      let totalElements = 0;
      const allData: Record<string, unknown>[] = [];
      const spatialNodes: SpatialTreeNode[] = [];
      // discipline code -> modelId -> localIds, so the Disciplines panel can
      // hide/show a whole discipline via Hider.set() without re-deriving
      // which elements belong to it on every checkbox click.
      const disciplineIds = new Map<string, Map<string, number[]>>();
      // modelId -> localId -> IFC class, for color-by-element mode
      const classMap = new Map<string, Map<number, string>>();
      // Store localIds per model for bounding box story mapping after the loop
      const localIdsByModel = new Map<string, number[]>();

      for (const [fragModelId, fragModel] of fragments.list) {
        const localIds = await fragModel.getLocalIds();
        if (isStale()) return;
        totalElements += localIds.length;
        localIdsByModel.set(fragModel.modelId, localIds);

        const itemsData = (await fragModel.getItemsData(localIds, {
          attributesDefault: true,
          relationsDefault: { attributes: true, relations: true },
        })) as Record<string, unknown>[];
        if (isStale()) return;
        allData.push(...itemsData);

        const dataByLocalId = new Map<number, Record<string, unknown>>();
        localIds.forEach((id, i) => dataByLocalId.set(id, itemsData[i]));

        const modelClassMap = new Map<number, string>();

        localIds.forEach((id, i) => {
          const item = itemsData[i] as Record<string, unknown>;
          const cls = getItemCategory(item);
          const code = mapIfcClassToDiscipline(cls);
          if (!disciplineIds.has(code)) disciplineIds.set(code, new Map());
          const byModel = disciplineIds.get(code)!;
          const ids = byModel.get(fragModel.modelId) ?? [];
          ids.push(id);
          byModel.set(fragModel.modelId, ids);

          // Build class map: IFC class name (e.g. "IFCWALL")
          if (cls && cls !== "UNKNOWN") modelClassMap.set(id, cls);
        });

        classMap.set(fragModel.modelId, modelClassMap);

        const structure = await fragModel.getSpatialStructure();
        if (isStale()) return;
        spatialNodes.push(buildSpatialTree(structure, dataByLocalId, fragModelId));
      }

      itemDataRef.current = allData;
      setElementCount(totalElements);
      setSpatialTree(spatialNodes);
      setDisciplineElementIds(disciplineIds);
      setElementClassMap(classMap);

      // Extract levels/disciplines from model data
      let storeys = extractStoreysFromData(allData, "loaded-model");
      try {
        // If IFC spatial extraction found no storeys, infer them from element bounding boxes
        if (storeys.length === 0 && localIdsByModel.size > 0) {
          storeys = await inferStoreysFromBoxes(fragments, localIdsByModel);
        }
        setLevels(storeys);

        const classCounts = countElementsPerClass(allData);
        const disciplines = buildDisciplineInfo(classCounts, "loaded-model");
        setDisciplines(disciplines);
      } catch {
        // Non-critical: continue without levels/disciplines
      }

      // Build story map using bounding-box proximity to storey elevations.
      // This works even when the IFC spatial hierarchy lacks IFCBUILDINGSTOREY
      // nodes — each element's center Y is matched to its nearest storey.
      const storyMap = new Map<string, Map<number, string>>();
      if (storeys.length > 0) {
        for (const [mid, ids] of localIdsByModel) {
          if (ids.length === 0) continue;
          let fm: FRAGS.FragmentsModel | undefined;
          for (const [key, candidate] of fragments.list) {
            if (candidate.modelId === mid || key === mid) { fm = candidate; break; }
          }
          if (!fm) continue;
          const boxes = await fm.getBoxes(ids);
          if (isStale()) return;
          storyMap.set(mid, buildStoryMapFromBoundingBox(ids, boxes, storeys));
        }
      }
      setElementStoryMap(storyMap);

      setLoadingProgress(100);
      setIsLoading(false);
      onModelLoaded?.(totalElements);
    } catch (err) {
      if (isStale()) return; // torn down mid-load — not a real failure, nothing to report
      console.error("[BIM] Failed to load IFC:", err);
      setIsLoading(false);
      setLoadingProgress(0);
    }
  }, [modelId, setLoadingProgress, setIsLoading, setElementCount, setSpatialTree, setLevels, setDisciplines, setDisciplineElementIds, setElementStoryMap, setElementClassMap, inferStoreysFromBoxes, onModelLoaded]);

  // Raycast helper built on the Raycasters component. Its TypeScript signature
  // claims castRay() returns a plain THREE.Intersection, but at runtime it
  // routes through FastModelPickers and actually resolves a full
  // FRAGS.RaycastResult (localId + owning fragments model included directly).
  // That's the only reliable way to identify a hit item here: fragments
  // renders batched meshes where one mesh covers many items via a per-vertex
  // id attribute, so a raw mesh's userData can't be decoded back into a
  // localId at the app level (confirmed by reading the fragments source —
  // mesh.userData only carries {tileId, itemId}, not a per-hit localId).
  // castRay() reads the cursor position from its own internal pointer
  // listener on the renderer's canvas, so no manual NDC math is needed.
  const raycastAtPointer = useCallback(async (): Promise<{ fragModel: FRAGS.FragmentsModel; localId: number; distance: number } | null> => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return null;

    const fragments = components.get(FragmentsManager);
    if (!fragments.initialized) return null;

    const caster = components.get(Raycasters).get(world);
    const hit = (await caster.castRay()) as unknown as FRAGS.RaycastResult | null;
    if (!hit || hit.localId === null || hit.localId === undefined || !hit.fragments) return null;

    return { fragModel: hit.fragments, localId: hit.localId, distance: hit.distance };
  }, []);

  // Measure tool: click two points to draw a distance annotation between
  // them. There's no built-in interactive measurement widget in
  // @thatopen/components (unlike Clipper's SimplePlane) — MeasurementUtils is
  // math-only — so this builds the marker/line/label directly in the scene.
  // Measurements accumulate in a dedicated group; toggling the tool off
  // clears them (they're a transient view aid, not a saved annotation).
  const handleMeasureClick = useCallback(async () => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return;

    const caster = components.get(Raycasters).get(world);
    const hit = (await caster.castRay({ snappingClasses: MEASURE_SNAP_CLASSES })) as unknown as { point?: THREE.Vector3 } | null;
    if (!hit?.point) return;
    const point = hit.point.clone();

    if (!measureGroupRef.current) {
      const group = new THREE.Group();
      world.scene.three.add(group);
      measureGroupRef.current = group;
    }
    const group = measureGroupRef.current;

    if (!measureFirstPointRef.current) {
      measureFirstPointRef.current = point;
      group.add(makeMeasureMarker(point));
      return;
    }

    const start = measureFirstPointRef.current;
    measureFirstPointRef.current = null;
    const distance = start.distanceTo(point);

    group.add(makeMeasureMarker(point));
    group.add(makeMeasureLine(start, point));
    group.add(makeMeasureLabel(distance, start, point));
  }, []);

  const clearMeasurements = useCallback(() => {
    const world = worldRef.current;
    const group = measureGroupRef.current;
    if (group) {
      world?.scene.three.remove(group);
      group.traverse(disposeObject3D);
      measureGroupRef.current = null;
    }
    measureFirstPointRef.current = null;
  }, []);

  // Live snap preview for the Measure tool: raycasts with snapping enabled
  // on every pointer move and shows exactly where the next click will land
  // (vertex/edge/free-surface), reusing the same marker/edge-line objects
  // across frames rather than allocating new ones on every mouse move.
  const updateMeasurePreview = useCallback(async () => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return;

    const caster = components.get(Raycasters).get(world);
    const hit = (await caster.castRay({ snappingClasses: MEASURE_SNAP_CLASSES })) as unknown as
      | (Partial<FRAGS.RaycastResult> & { point?: THREE.Vector3 })
      | null;

    if (!measurePreviewMarkerRef.current) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 12),
        new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }),
      );
      marker.renderOrder = 1000;
      measurePreviewMarkerRef.current = marker;
    }
    if (!measurePreviewEdgeRef.current) {
      const edge = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: SNAP_EDGE_COLOR, depthTest: false }),
      );
      edge.renderOrder = 1000;
      edge.visible = false;
      measurePreviewEdgeRef.current = edge;
    }

    const marker = measurePreviewMarkerRef.current;
    const edge = measurePreviewEdgeRef.current;
    if (!marker.parent) world.scene.three.add(marker);
    if (!edge.parent) world.scene.three.add(edge);

    if (!hit?.point) {
      marker.visible = false;
      edge.visible = false;
      return;
    }

    marker.visible = true;
    marker.position.copy(hit.point);

    const material = marker.material as THREE.MeshBasicMaterial;
    if (hit.snappingClass === FRAGS.SnappingClass.POINT) {
      material.color.setHex(SNAP_VERTEX_COLOR);
    } else if (hit.snappingClass === FRAGS.SnappingClass.LINE) {
      material.color.setHex(SNAP_EDGE_COLOR);
    } else {
      material.color.setHex(SNAP_FACE_COLOR);
    }

    if (hit.snappingClass === FRAGS.SnappingClass.LINE && hit.snappedEdgeP1 && hit.snappedEdgeP2) {
      edge.geometry.dispose();
      edge.geometry = new THREE.BufferGeometry().setFromPoints([hit.snappedEdgeP1, hit.snappedEdgeP2]);
      edge.visible = true;
    } else {
      edge.visible = false;
    }
  }, []);

  const clearMeasurePreview = useCallback(() => {
    const world = worldRef.current;
    if (measurePreviewMarkerRef.current) {
      world?.scene.three.remove(measurePreviewMarkerRef.current);
      disposeObject3D(measurePreviewMarkerRef.current);
      measurePreviewMarkerRef.current = null;
    }
    if (measurePreviewEdgeRef.current) {
      world?.scene.three.remove(measurePreviewEdgeRef.current);
      disposeObject3D(measurePreviewEdgeRef.current);
      measurePreviewEdgeRef.current = null;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initializeViewer().then((cleanupFn) => {
      cleanup = cleanupFn;
    });
    return () => {
      cleanup?.();
      clearMeasurements();
      clearMeasurePreview();
      if (componentsRef.current) {
        componentsRef.current.dispose();
        componentsRef.current = null;
      }
      onReady?.(null);
    };
  }, [initializeViewer, onReady, clearMeasurements, clearMeasurePreview]);

  // Load model when URL changes and viewer is ready
  useEffect(() => {
    if (ready && fileUrl && componentsRef.current && worldRef.current) {
      loadModel(fileUrl);
    }
  }, [ready, fileUrl, loadModel]);

  // Update background color
  useEffect(() => {
    if (worldRef.current && ready) {
      try {
        (worldRef.current.scene.three as THREE.Scene).background = new THREE.Color(backgroundColor);
      } catch {
        // Scene not ready yet
      }
    }
  }, [backgroundColor, ready]);

  // Toggle Grid
  useEffect(() => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world || !ready) return;
    try {
      const grids = components.get(Grids);
      const grid = grids.list.get(world.uuid);
      if (grid) grid.visible = showGrid;
    } catch {
      // Grid not ready yet
    }
  }, [showGrid, ready]);

  // Perspective/Orthographic projection toggle
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !ready) return;
    try {
      const camera = world.camera as OrthoPerspectiveCamera;
      camera.projection.set(projectionMode);
    } catch {
      // Camera not ready yet
    }
  }, [projectionMode, ready]);

  // Pick the element under the cursor: raycast, highlight it, and populate the
  // properties panel. Runs on every plain click regardless of the active tool
  // (orbit/pan/select) — only camera dragging differs between tools.
  //
  // Supports multi-select so Isolate/Hide can act on a whole group: plain
  // click replaces the selection with just this element, Ctrl (or Cmd on
  // Mac) adds it to the current selection, Shift removes it. Isolate/Hide in
  // the toolbar then just act on whatever's in selectedItems — no separate
  // armed "tool" needed for them.
  const handleCanvasClick = useCallback(async (modifiers?: { ctrl: boolean; shift: boolean }) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world) return;

    const fragments = components.get(FragmentsManager);
    if (!fragments.initialized) return;

    const hit = await raycastAtPointer();
    const ctrl = modifiers?.ctrl ?? false;
    const shift = modifiers?.shift ?? false;

    if (!hit) {
      // A plain click on empty space clears the selection; Ctrl/Shift on
      // empty space is a no-op so an accidental miss doesn't wipe a
      // multi-selection being built up.
      if (!ctrl && !shift) {
        for (const [, fragModel] of fragments.list) {
          await fragModel.resetHighlight();
        }
        hoveredRef.current = null;
        setHoverTooltip(null);
        setHoveredItem(null);
        setSelectedItems(new Map());
        setElementProperties(null);
      }
      return;
    }

    const { fragModel, localId } = hit;
    const current = useBimViewer.getState().selectedItems;
    const next = new Map(current);

    if (ctrl) {
      const ids = new Set(next.get(fragModel.modelId) ?? []);
      ids.add(localId);
      next.set(fragModel.modelId, [...ids]);
    } else if (shift) {
      const ids = new Set(next.get(fragModel.modelId) ?? []);
      ids.delete(localId);
      if (ids.size > 0) next.set(fragModel.modelId, [...ids]);
      else next.delete(fragModel.modelId);
    } else {
      next.clear();
      next.set(fragModel.modelId, [localId]);
    }

    // Reset every highlight and re-apply across the whole (possibly
    // multi-model) selection, since add/remove can touch elements beyond
    // the one just clicked.
    for (const [, fm] of fragments.list) {
      await fm.resetHighlight();
    }
    hoveredRef.current = null;
    setHoverTooltip(null);
    setHoveredItem(null);

    for (const [modelId, ids] of next) {
      if (ids.length === 0) continue;
      let fm: FRAGS.FragmentsModel | undefined;
      for (const [key, candidate] of fragments.list) {
        if (candidate.modelId === modelId || key === modelId) {
          fm = candidate;
          break;
        }
      }
      if (!fm) continue;
      await fm.highlight(ids, {
        color: new THREE.Color(selectionColor),
        renderedFaces: FRAGS.RenderedFaces.TWO,
        opacity: 1,
        transparent: false,
      });
    }

    setSelectedItems(next);

    if (shift || next.size === 0) {
      // After a removal (or if nothing's left selected), there's no single
      // unambiguous element to show properties for.
      setElementProperties(null);
      return;
    }

    const [itemData] = await fragModel.getItemsData([localId], {
      attributesDefault: true,
      relationsDefault: { attributes: true, relations: true },
    });
    setElementProperties(extractPropertiesFromItemData(itemData as Record<string, unknown>));
  }, [raycastAtPointer, setSelectedItems, setElementProperties, setHoveredItem, selectionColor]);

  // Revit-style rubber-band multi-select. Only active while the Select tool
  // is armed (mouseButtons.left = NONE there — see the effect below — so a
  // left-drag doesn't fight camera orbit/pan). Direction of the drag decides
  // the mode, matching Revit's own convention:
  //   left-to-right ("window")  -> solid box, only fully-enclosed elements
  //   right-to-left ("crossing") -> dashed box, anything the box touches
  // Since fragments has no screen-space query, this projects each visible
  // element's world-space bounding box corners to screen pixels via the
  // active camera and tests that projected rect against the drag box.
  const handleBoxSelect = useCallback(async (
    start: { x: number; y: number },
    end: { x: number; y: number },
    modifiers: { ctrl: boolean; shift: boolean },
  ) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    const container = containerRef.current;
    if (!components || !world || !container) return;

    const fragments = components.get(FragmentsManager);
    if (!fragments.initialized) return;

    const rect = container.getBoundingClientRect();
    const boxMinX = Math.min(start.x, end.x) - rect.left;
    const boxMaxX = Math.max(start.x, end.x) - rect.left;
    const boxMinY = Math.min(start.y, end.y) - rect.top;
    const boxMaxY = Math.max(start.y, end.y) - rect.top;
    const mode: "window" | "crossing" = end.x >= start.x ? "window" : "crossing";

    const camera = (world.camera as SimpleCamera).three;
    const width = rect.width;
    const height = rect.height;
    const hiddenItems = useBimViewer.getState().hiddenItems;

    const matches = new Map<string, number[]>();

    for (const [, fragModel] of fragments.list) {
      const allIds = await fragModel.getLocalIds();
      const hiddenIds = new Set(hiddenItems.get(fragModel.modelId) ?? []);
      const visibleIds = allIds.filter((id) => !hiddenIds.has(id));
      if (visibleIds.length === 0) continue;

      const boxes = await fragModel.getBoxes(visibleIds);
      const picked: number[] = [];

      for (let i = 0; i < visibleIds.length; i++) {
        const box = boxes[i];
        if (!box) continue;

        const corners = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];

        let elMinX = Infinity, elMinY = Infinity, elMaxX = -Infinity, elMaxY = -Infinity;
        let anyInFront = false;

        for (const corner of corners) {
          const view = corner.clone().applyMatrix4(camera.matrixWorldInverse);
          if (view.z > 0) continue; // behind the camera — projecting it would mirror the point
          anyInFront = true;
          const ndc = corner.clone().project(camera);
          const sx = (ndc.x * 0.5 + 0.5) * width;
          const sy = (-ndc.y * 0.5 + 0.5) * height;
          if (sx < elMinX) elMinX = sx;
          if (sx > elMaxX) elMaxX = sx;
          if (sy < elMinY) elMinY = sy;
          if (sy > elMaxY) elMaxY = sy;
        }
        if (!anyInFront) continue;

        const intersects = elMinX <= boxMaxX && elMaxX >= boxMinX && elMinY <= boxMaxY && elMaxY >= boxMinY;
        if (!intersects) continue;

        if (mode === "window") {
          const fullyInside = elMinX >= boxMinX && elMaxX <= boxMaxX && elMinY >= boxMinY && elMaxY <= boxMaxY;
          if (fullyInside) picked.push(visibleIds[i]);
        } else {
          picked.push(visibleIds[i]);
        }
      }

      if (picked.length > 0) matches.set(fragModel.modelId, picked);
    }

    const current = useBimViewer.getState().selectedItems;
    const next = new Map(current);

    if (modifiers.shift) {
      for (const [modelId, ids] of matches) {
        const remaining = new Set(next.get(modelId) ?? []);
        for (const id of ids) remaining.delete(id);
        if (remaining.size > 0) next.set(modelId, [...remaining]);
        else next.delete(modelId);
      }
    } else if (modifiers.ctrl) {
      for (const [modelId, ids] of matches) {
        const combined = new Set(next.get(modelId) ?? []);
        for (const id of ids) combined.add(id);
        next.set(modelId, [...combined]);
      }
    } else {
      next.clear();
      for (const [modelId, ids] of matches) next.set(modelId, ids);
    }

    for (const [, fm] of fragments.list) {
      await fm.resetHighlight();
    }
    hoveredRef.current = null;
    setHoverTooltip(null);
    setHoveredItem(null);

    for (const [modelId, ids] of next) {
      if (ids.length === 0) continue;
      let fm: FRAGS.FragmentsModel | undefined;
      for (const [key, candidate] of fragments.list) {
        if (candidate.modelId === modelId || key === modelId) {
          fm = candidate;
          break;
        }
      }
      if (!fm) continue;
      await fm.highlight(ids, {
        color: new THREE.Color(selectionColor),
        renderedFaces: FRAGS.RenderedFaces.TWO,
        opacity: 1,
        transparent: false,
      });
    }

    setSelectedItems(next);

    if (next.size === 1) {
      const [[modelId, ids]] = next;
      if (ids.length === 1) {
        let fm: FRAGS.FragmentsModel | undefined;
        for (const [key, candidate] of fragments.list) {
          if (candidate.modelId === modelId || key === modelId) {
            fm = candidate;
            break;
          }
        }
        if (fm) {
          const [itemData] = await fm.getItemsData([ids[0]], {
            attributesDefault: true,
            relationsDefault: { attributes: true, relations: true },
          });
          setElementProperties(extractPropertiesFromItemData(itemData as Record<string, unknown>));
          return;
        }
      }
    }
    setElementProperties(null);
  }, [setSelectedItems, setElementProperties, setHoveredItem, selectionColor]);

  // Distinguish a click (select) from a drag (orbit/pan) by movement distance
  // between pointerdown and pointerup, since camera-controls consumes the drag
  // itself and never tells us whether the gesture was a click.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    let downPos: { x: number; y: number } | null = null;
    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downPos = { x: e.clientX, y: e.clientY };
      dragging = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      // Rubber-band box only while the Select tool is armed — Orbit/Pan
      // already consume left-drag for camera movement (see the
      // mouseButtons.left effect below), so dragging elsewhere would fight
      // the camera instead of drawing a box.
      if (!downPos || useBimViewer.getState().activeTool !== "select") return;
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true;

      const mode: "window" | "crossing" = dx >= 0 ? "window" : "crossing";
      setDragBox({
        x: Math.min(downPos.x, e.clientX),
        y: Math.min(downPos.y, e.clientY),
        width: Math.abs(dx),
        height: Math.abs(dy),
        mode,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      const startPos = downPos;
      const wasDragging = dragging;
      downPos = null;
      dragging = false;

      if (wasDragging) {
        setDragBox(null);
        if (useBimViewer.getState().activeTool === "select") {
          handleBoxSelect(startPos, { x: e.clientX, y: e.clientY }, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
        }
        return;
      }

      if (Math.hypot(dx, dy) >= 5) return;

      const tool = useBimViewer.getState().activeTool;
      if (tool === "measure") {
        // Two clicks place a distance annotation; picking elements is
        // suspended so clicks aren't ambiguous between "select" and "measure".
        handleMeasureClick();
      } else if (tool !== "section-plane") {
        // While the section-plane tool is armed, clicks are for placing/
        // reading clipping planes (handled by the dblclick handler below).
        handleCanvasClick({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
    };
  }, [ready, handleCanvasClick, handleMeasureClick, handleBoxSelect]);

  // Cursor badge: shows a "+" while Ctrl (or Cmd) is held and "−" while
  // Shift is held, so the add/remove modifier for multi-select is obvious
  // before you click, not just something you have to remember. Tracks the
  // cursor position separately from the (throttled, async) hover-highlight
  // handler so the badge stays snappy, and also reacts to key up/down alone
  // (no mouse movement needed) via the last known cursor position.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    const updateBadge = (x: number, y: number, ctrl: boolean, shift: boolean) => {
      lastMousePosRef.current = { x, y };
      if (ctrl) setModifierBadge({ x, y, symbol: "+" });
      else if (shift) setModifierBadge({ x, y, symbol: "−" });
      else setModifierBadge(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      updateBadge(e.clientX, e.clientY, e.ctrlKey || e.metaKey, e.shiftKey);
    };
    const onPointerLeave = () => setModifierBadge(null);
    const onKeyChange = (e: KeyboardEvent) => {
      if (e.key !== "Control" && e.key !== "Shift" && e.key !== "Meta") return;
      const pos = lastMousePosRef.current;
      if (!pos) return;
      updateBadge(pos.x, pos.y, e.ctrlKey || e.metaKey, e.shiftKey);
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("keydown", onKeyChange);
    window.addEventListener("keyup", onKeyChange);
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyChange);
    };
  }, [ready]);

  // Measurements are a transient view aid, not a saved annotation — clear
  // them whenever the Measure tool is turned off (mirrors Ghost Mode's
  // opacity reset when it's disabled) so stale markers don't linger.
  useEffect(() => {
    if (activeTool !== "measure") {
      clearMeasurements();
      clearMeasurePreview();
    }
  }, [activeTool, clearMeasurements, clearMeasurePreview]);

  // Section Plane tool: double-click a surface to slice the model there. The
  // Clipper component from @thatopen/components only exposes create()/delete()
  // methods — it doesn't wire up any pointer listener itself, so the app has
  // to call create() in response to its own dblclick handler. create() raycasts
  // under the current cursor and builds a plane oriented to the hit surface's
  // normal, cutting away geometry on one side of it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    const onDoubleClick = async () => {
      if (useBimViewer.getState().activeTool !== "section-plane") return;
      const components = componentsRef.current;
      const world = worldRef.current;
      if (!components || !world) return;
      const clipper = components.get(Clipper);
      await clipper.create(world);
    };

    container.addEventListener("dblclick", onDoubleClick);
    return () => {
      container.removeEventListener("dblclick", onDoubleClick);
    };
  }, [ready]);

  // Hover feedback: raycast under the cursor and tint whatever it's over so
  // users get instant "what's this" feedback without clicking. Throttled to
  // one in-flight raycast at a time (rapid mouse movement can't pile up async
  // calls) and skipped entirely while a mouse button is held, so it doesn't
  // fight with orbit/pan dragging.
  const handlePointerMove = useCallback(async (e: PointerEvent) => {
    const components = componentsRef.current;
    const world = worldRef.current;
    if (!components || !world || hoverBusyRef.current || e.buttons !== 0) return;

    const fragments = components.get(FragmentsManager);
    if (!fragments.initialized) return;

    hoverBusyRef.current = true;
    try {
      if (useBimViewer.getState().activeTool === "measure") {
        // Element hover highlighting doesn't apply while aiming the Measure
        // tool — drop any leftover highlight from before it was armed, and
        // show the snap preview instead.
        const prev = hoveredRef.current;
        if (prev) {
          const stillSelected = (useBimViewer.getState().selectedItems.get(prev.fragModel.modelId) ?? []).includes(prev.localId);
          if (!stillSelected) await prev.fragModel.resetHighlight([prev.localId]);
          hoveredRef.current = null;
          setHoverTooltip(null);
          setHoveredItem(null);
        }
        await updateMeasurePreview();
        return;
      }

      const hit = await raycastAtPointer();
      const prev = hoveredRef.current;

      if (hit) {
        const { fragModel, localId } = hit;

        if (prev && prev.fragModel === fragModel && prev.localId === localId) {
          // Same element still under the cursor — just keep the tooltip tracking it.
          setHoverTooltip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur));
          return;
        }

        // Cursor moved off the previous hover target — restore it, unless it's
        // the active selection (which keeps its own highlight color).
        if (prev) {
          const stillSelected = (useBimViewer.getState().selectedItems.get(prev.fragModel.modelId) ?? []).includes(prev.localId);
          if (!stillSelected) await prev.fragModel.resetHighlight([prev.localId]);
          hoveredRef.current = null;
        }

        const isSelected = (useBimViewer.getState().selectedItems.get(fragModel.modelId) ?? []).includes(localId);
        if (isSelected) {
          setHoverTooltip(null);
          setHoveredItem(null);
          return;
        }

        await fragModel.highlight([localId], {
          color: new THREE.Color(HOVER_COLOR),
          renderedFaces: FRAGS.RenderedFaces.TWO,
          opacity: 0.55,
          transparent: true,
        });
        hoveredRef.current = { fragModel, localId };
        setHoveredItem({ modelId: fragModel.modelId, expressId: localId });

        let label = `Element #${localId}`;
        try {
          const [itemData] = await fragModel.getItemsData([localId], { attributesDefault: true });
          const props = extractPropertiesFromItemData(itemData as Record<string, unknown>);
          label = props.name || props.ifcClass || label;
        } catch {
          // Keep the fallback label
        }
        setHoverTooltip({ x: e.clientX, y: e.clientY, label });
      } else {
        // Nothing under cursor — restore previous hover target
        if (prev) {
          const stillSelected = (useBimViewer.getState().selectedItems.get(prev.fragModel.modelId) ?? []).includes(prev.localId);
          if (!stillSelected) await prev.fragModel.resetHighlight([prev.localId]);
          hoveredRef.current = null;
        }
        setHoverTooltip(null);
        setHoveredItem(null);
      }
    } finally {
      hoverBusyRef.current = false;
    }
  }, [raycastAtPointer, updateMeasurePreview, setHoveredItem]);

  const handlePointerLeave = useCallback(async () => {
    if (measurePreviewMarkerRef.current) measurePreviewMarkerRef.current.visible = false;
    if (measurePreviewEdgeRef.current) measurePreviewEdgeRef.current.visible = false;
    const prev = hoveredRef.current;
    if (prev) {
      const stillSelected = (useBimViewer.getState().selectedItems.get(prev.fragModel.modelId) ?? []).includes(prev.localId);
      if (!stillSelected) await prev.fragModel.resetHighlight([prev.localId]);
      hoveredRef.current = null;
    }
    setHoverTooltip(null);
    setHoveredItem(null);
  }, [setHoveredItem]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) return;

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [ready, handlePointerMove, handlePointerLeave]);

  // Ghost Mode: when active and an element is selected, dim all non-selected
  // elements to 15% opacity so the selection "pops" like an X-ray view.
  // Only touches the model when ghosting is actually on/off-ing — a plain
  // selection change with ghost mode untouched shouldn't trigger a global
  // resetOpacity() sweep across every item on every click.
  useEffect(() => {
    const fragments = fragmentsRef.current;
    if (!fragments?.initialized) return;

    const applyGhost = async () => {
      const hasSelection = selectedItems.size > 0;

      if (ghostMode && hasSelection) {
        for (const [, fragModel] of fragments.list) {
          const allIds = await fragModel.getLocalIds();
          const selectedIds = selectedItems.get(fragModel.modelId) ?? [];
          const selectedSet = new Set(selectedIds);
          const ghostIds = allIds.filter((id) => !selectedSet.has(id));
          if (ghostIds.length > 0) {
            await fragModel.setOpacity(ghostIds, 0.15);
          }
          if (selectedIds.length > 0) {
            await fragModel.setOpacity(selectedIds, 1);
          }
        }
        ghostAppliedRef.current = true;
      } else if (ghostAppliedRef.current) {
        for (const [, fragModel] of fragments.list) {
          await fragModel.resetOpacity(undefined);
        }
        ghostAppliedRef.current = false;
      }
    };

    applyGhost();
  }, [ghostMode, selectedItems]);

  // Color Mode: applies a persistent color overlay to all elements based on
  // their story (level) or IFC class. Uses the same highlight() API as
  // selection/hover, so this acts as a "base layer" — selection and hover
  // highlights layer on top, and on deselect the base color is re-applied.
  const applyColorMode = useCallback(async (mode: ColorMode) => {
    const fragments = fragmentsRef.current;
    if (!fragments?.initialized) return;

    if (mode === "none") {
      for (const [, fragModel] of fragments.list) {
        await fragModel.resetHighlight();
      }
      setColorLegend([]);
      return;
    }

    const state = useBimViewer.getState();
    const storyMaps = state.elementStoryMap;
    const classMaps = state.elementClassMap;
    const sel = state.selectedItems;
    const palette = COLOR_PALETTES[state.colorPalette];

    // For by-story: use the levels array to determine elevation order
    const levels = state.levels;
    const levelsByName = new Map(levels.map((l) => [l.name, l.elevation]));

    // category name -> hex color (stable across models)
    const categoryColors = new Map<string, string>();
    const categoryCount = new Map<string, number>();
    // Stories in elevation order (built from levels array or from first-seen order)
    const storyOrder: string[] = [];

    for (const [, fragModel] of fragments.list) {
      const allIds = await fragModel.getLocalIds();
      const sourceMap = mode === "by-story" ? storyMaps : classMaps;
      const perModel = sourceMap.get(fragModel.modelId);

      // Group element IDs by category
      const groups = new Map<string, number[]>();
      for (const id of allIds) {
        const cat = perModel?.get(id) ?? (mode === "by-story" ? "Unclassified" : "UNKNOWN");
        const arr = groups.get(cat) ?? [];
        arr.push(id);
        groups.set(cat, arr);
      }

      // Assign colors to new categories using the selected palette
      let colorIdx = categoryColors.size;
      for (const cat of groups.keys()) {
        if (!categoryColors.has(cat)) {
          if (mode === "by-story") {
            storyOrder.push(cat);
          }
          categoryColors.set(cat, palette[colorIdx % palette.length]);
          colorIdx++;
        }
        categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + (groups.get(cat)?.length ?? 0));
      }

      // Apply highlights per group, skip selected elements (they keep selection color)
      for (const [cat, ids] of groups) {
        const color = categoryColors.get(cat) ?? "#6b7280";
        const selectedIds = new Set(sel.get(fragModel.modelId) ?? []);
        const idsToColor = ids.filter((id) => !selectedIds.has(id));
        if (idsToColor.length === 0) continue;
        await fragModel.highlight(idsToColor, {
          color: new THREE.Color(color),
          renderedFaces: FRAGS.RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        });
      }
    }

    // Build legend: sort stories by elevation, classes alphabetically
    const sortedStories = storyOrder.sort((a, b) => {
      const ea = levelsByName.get(a) ?? 0;
      const eb = levelsByName.get(b) ?? 0;
      return ea - eb;
    });

    const legend: ColorLegendEntry[] = mode === "by-story"
      ? sortedStories.map((name) => ({
          name,
          color: categoryColors.get(name) ?? "#6b7280",
          count: categoryCount.get(name) ?? 0,
        }))
      : Array.from(categoryColors.entries())
          .map(([name, color]) => ({
            name,
            color,
            count: categoryCount.get(name) ?? 0,
          }))
          .sort((a, b) => b.count - a.count); // Most common first

    setColorLegend(legend);
  }, [setColorLegend]);

  // Re-apply base coloring to elements that lost their selection highlight.
  // When a user deselects an element while color mode is active, the
  // selection highlight is cleared (resetHighlight), which also removes the
  // base color. This restores it.
  const reapplyBaseColors = useCallback(async () => {
    const mode = useBimViewer.getState().colorMode;
    if (mode === "none") return;
    await applyColorMode(mode);
  }, [applyColorMode]);

  // Apply / remove color overlay when mode or palette changes
  useEffect(() => {
    if (!ready) return;
    applyColorMode(colorMode);
  }, [colorMode, colorPalette, ready, applyColorMode]);

  // When selection changes and color mode is active, re-apply base colors
  // so deselected elements get their category color back.
  useEffect(() => {
    if (!ready || colorMode === "none") return;
    reapplyBaseColors();
  }, [selectedItems, colorMode, ready, reapplyBaseColors]);

  // Orbit/Pan/Select toolbar buttons map to the left mouse button's action:
  // rotate the camera, truck (pan) it, or leave it alone so clicks are precise.
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !ready) return;
    const controls = world.camera.controls as CameraControls;
    if (activeTool === "pan") {
      controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
    } else if (activeTool === "select") {
      controls.mouseButtons.left = CameraControls.ACTION.NONE;
    } else {
      controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    }
  }, [activeTool, ready]);

  // Walkthrough mode: arrow keys move the camera first-person style — Up/Down
  // walk forward/backward along the current view direction, Left/Right strafe
  // sideways — while mouse-drag still looks around via the ACTION.ROTATE mapping
  // set above. Movement runs on its own rAF loop keyed off which arrows are
  // currently held (not one jump per keydown) so holding a key walks smoothly at
  // a constant speed regardless of frame rate.
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !ready || activeTool !== "walkthrough") return;
    const controls = world.camera.controls as CameraControls;

    const WALK_SPEED = 8; // scene units per second
    const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const pressed = new Set<string>();

    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.has(e.key) || isTypingTarget(e.target)) return;
      e.preventDefault();
      pressed.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressed.delete(e.key);
    };
    const onBlur = () => pressed.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let lastTime = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const distance = WALK_SPEED * ((now - lastTime) / 1000);
      lastTime = now;

      if (pressed.has("ArrowUp")) controls.forward(distance, false);
      if (pressed.has("ArrowDown")) controls.forward(-distance, false);
      if (pressed.has("ArrowLeft")) controls.truck(-distance, 0, false);
      if (pressed.has("ArrowRight")) controls.truck(distance, 0, false);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [activeTool, ready]);

  // Note: no context Provider here — the toolbar/panels that need `components`/
  // `world`/`fragments` are siblings of IfcViewer at the page level, not children,
  // so the providers live there (fed by onReady) instead of around this div.
  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {hoverTooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs truncate rounded-md border px-2 py-1 text-xs font-medium text-gray-900 shadow-lg"
          style={{
            left: hoverTooltip.x + 14,
            top: hoverTooltip.y + 14,
            backgroundColor: `${HOVER_COLOR}e6`,
            borderColor: HOVER_COLOR,
          }}
        >
          {hoverTooltip.label}
        </div>
      )}
      {dragBox && (
        <div
          className="pointer-events-none fixed z-40"
          style={{
            left: dragBox.x,
            top: dragBox.y,
            width: dragBox.width,
            height: dragBox.height,
            border: `1.5px ${dragBox.mode === "window" ? "solid" : "dashed"} ${dragBox.mode === "window" ? "#3b82f6" : "#22c55e"}`,
            backgroundColor: dragBox.mode === "window" ? "rgba(59, 130, 246, 0.15)" : "rgba(34, 197, 94, 0.15)",
          }}
        />
      )}
      {modifierBadge && (
        <div
          className="pointer-events-none fixed z-50 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg"
          style={{
            left: modifierBadge.x + 12,
            top: modifierBadge.y - 20,
            backgroundColor: modifierBadge.symbol === "+" ? "#22c55e" : "#ef4444",
          }}
        >
          {modifierBadge.symbol}
        </div>
      )}
    </>
  );
}
