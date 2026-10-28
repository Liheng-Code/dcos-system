"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  Loader2,
  Magnet,
  Moon,
  FileImage,
  FileX2,
  Sun,
  Maximize,
  Minus,
  Plus,
  SquareDashedMousePointer,
  Undo2,
  X,
} from "lucide-react";
import {
  AreaIcon, CountIcon, DimensionIcon, LengthIcon, PerimeterIcon, PointIcon, PolylineIcon, ScaleIcon,
} from "@/components/qs/qto/takeoff-icons";
import {
  TOOL_META, TakeoffStartPanel, drawModesFor, type DrawMode, type TakeoffConfig, type TakeoffTarget, type TakeoffTool,
} from "@/components/qs/qto/takeoff-start-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QtoMeasureType } from "@/lib/qs/qto-service";
import {
  type Pt,
  areaInSquareMetres,
  distance,
  lengthInMetres,
  perimeter,
  polygonArea,
  polylineLength,
} from "@/lib/qs/qto/geometry";
import {
  decodeDimensionPoints,
  dimensionGeometry,
  encodeDimensionPoints,
  type DimensionAnnotation,
  type DimensionMode,
} from "@/lib/qs/qto/dimension-geometry";
import {
  SnapIndex,
  drawingScaleFromCalibration,
  extractSegments,
  orthogonal,
  type Matrix,
  type OpCodes,
  type Segment,
  type Snap,
} from "@/lib/qs/qto/pdf-snap";
import { drawSheet, toModel, type CadSheet, type SheetObject } from "@/lib/qs/qto/cad/cad-sheet";
import { insertBoxes, mainLoop, objectAt, similarTo, type CadPickKind, type CadSimilar } from "@/lib/qs/qto/cad/cad-select";
import { CadLayersButton } from "@/components/qs/qto/cad-layers-panel";
import { detectHatches, hatchAt, hatchInside, pickRegion, sameHatchRegions, type HatchInfo } from "@/lib/qs/qto/smart-pick";
import { hitTest } from "@/lib/qs/qto/hit-test";
import { bestSnap, gripsOf, moveGrip, shapeSegments, type Grip } from "@/lib/qs/qto/grips";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

/** Canvas pixels per PDF page unit. Points are stored in page units, independent of this and the zoom. */
const RENDER_SCALE = 2;
/** Snap radius in screen pixels. */
const SNAP_PX = 10;
/** Offset of the page inside the viewport (left/top). */
const PAGE_OFFSET = 16;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 12;

const SHEET_KEY = "dcos.qto.sheet";

/** Common drawing scales offered as presets (1:N). */
export const DRAWING_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 1250, 2500];

export type ViewerTool = QtoMeasureType | "pan" | "calibrate" | "dimension";

export interface ActiveCalibration {
  id: string;
  /** Metres per PDF page unit. */
  metresPerUnit: number;
  knownDistance: number;
  knownUnit: string;
}

export interface EmittedMeasurement {
  measure_type: QtoMeasureType;
  points: Pt[];
  /** Metres (length, polyline, perimeter); null when the page is not calibrated. */
  length: number | null;
  /** Square metres (area); null when the page is not calibrated. */
  area: number | null;
  count: number | null;
  unit: string | null;
  page_no: number;
  /** CAD evidence: the drawing objects measured and how they were selected. */
  source?: { format: "dxf"; handles: string[]; layer: string | null; block: string | null; selection: Record<string, unknown> };
}

type DimensionEndpointPair = [Pt, Pt];

export interface SavedShape {
  id: string;
  /** Take-off item the measurement belongs to (clicking the shape selects it). */
  itemId: string;
  page_no: number | null;
  measure_type: string;
  points: Pt[];
  length?: number | null;
  dimension?: DimensionAnnotation | null;
  highlighted?: boolean;
  /** Item display colour and fill opacity. */
  color?: string | null;
  opacity?: number | null;
}

interface DrawingViewerProps {
  url: string | null;
  pageNo?: number;
  calibration?: ActiveCalibration | null;
  /** Two points picked with the Scale tool; the parent asks for the known distance and saves it. */
  onCalibrationPicked?: (c: { points: Pt[]; pageUnits: number; page_no: number }) => void;
  /** A drawing scale chosen from the presets (1:N), for the current page. */
  onPresetScale?: (scale: number, page_no: number) => void;
  onMeasure?: (m: EmittedMeasurement) => void;
  /** Several measurements at once (Same hatch picks); falls back to onMeasure per measurement. */
  onMeasureMany?: (ms: EmittedMeasurement[]) => void;
  onPageChange?: (page: number) => void;
  savedMeasurements?: SavedShape[];
  readOnly?: boolean;
  /**
   * Called from the "New Area / New Linear…" panel of a measuring tool. The parent creates or
   * selects the take-off item; measuring starts once it resolves.
   */
  onStartTakeoff?: (cfg: TakeoffConfig) => Promise<void>;
  /** Default name and target item for the panel, per tool. */
  takeoffTarget?: (tool: TakeoffTool) => TakeoffTarget & { defaultName: string };
  /** A shape was clicked with no tool selected (null = empty space). */
  onSelectItem?: (itemId: string | null, shapeId?: string | null) => void;
  /** A selected shape was reshaped with its grips (points in page units). */
  onEditShape?: (shapeId: string, points: Pt[]) => void;
  /** The item being measured into, shown as a chip while a tool is active. */
  activeTakeoff?: { name: string; color: string; total: number; unit: string } | null;
  /** A CAD drawing (DXF) to measure instead of a PDF; `url` is then null. */
  cad?: CadSheet | null;
  /** Remembers hidden CAD layers per drawing (e.g. the revision id). */
  cadKey?: string | null;
}

const TOOL_OPTIONS: { key: ViewerTool; label: string; icon: (p: { size?: number }) => React.ReactElement; hint: string }[] = [
  { key: "calibrate", label: "Scale", icon: ScaleIcon, hint: "Click both ends of a known dimension (snaps to the dimension line)" },
  { key: "area", label: "Area", icon: AreaIcon, hint: "Click the corners, double-click or Enter to close" },
  { key: "length", label: "Linear", icon: LengthIcon, hint: "Click two points" },
  { key: "dimension", label: "Dimension", icon: DimensionIcon, hint: "Click the first and second extension points, then click to place the dimension" },
  { key: "polyline", label: "Segment", icon: PolylineIcon, hint: "Click points, double-click or Enter to finish" },
  { key: "perimeter", label: "Perimeter", icon: PerimeterIcon, hint: "Click the corners, double-click or Enter to close" },
  { key: "count", label: "Count", icon: CountIcon, hint: "Click each element, Enter to finish" },
  { key: "point", label: "Point", icon: PointIcon, hint: "Click a location" },
];

const BOX_HINT = "Box mode: click two opposite corners";
const PICK_HINT = "Smart pick: click inside a closed area (hatch lines are ignored) · Ctrl+click picks every area with the same hatch";
const HATCH_HINT = "Same hatch: click a hatched area to pick every area on this page with the same hatch pattern";

/** The four corners of the axis-aligned rectangle spanned by two opposite corners. */
function boxCorners(a: Pt, b: Pt): Pt[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

const SNAP_LABEL: Record<Snap["kind"], string> = {
  endpoint: "Endpoint",
  intersection: "Intersection",
  midpoint: "Midpoint",
  "on-line": "On line",
};

const fmt = (n: number, dp = 3) => n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });
const dimensionLabel = (metres: number) => `${fmt(metres * 1000, 0)} mm`;

function DimensionDrawing({
  points,
  annotation,
  value,
  color,
  zoom,
  darkSheet,
}: {
  points: DimensionEndpointPair;
  annotation: DimensionAnnotation;
  value: string;
  color: string;
  zoom: number;
  darkSheet: boolean;
}) {
  const geometry = dimensionGeometry(points[0], points[1], annotation.location, annotation.mode);
  const dx = geometry.end.x - geometry.start.x;
  const dy = geometry.end.y - geometry.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const tickSize = 7 / zoom;

  const extension = (anchor: Pt, end: Pt) => {
    const ex = end.x - anchor.x;
    const ey = end.y - anchor.y;
    const extensionLength = Math.hypot(ex, ey);
    if (extensionLength === 0) return null;
    const gap = 3 / zoom;
    const overshoot = tickSize;
    return {
      x1: anchor.x + (ex / extensionLength) * gap,
      y1: anchor.y + (ey / extensionLength) * gap,
      x2: end.x + (ex / extensionLength) * overshoot,
      y2: end.y + (ey / extensionLength) * overshoot,
    };
  };
  const firstExtension = extension(points[0], geometry.start);
  const secondExtension = extension(points[1], geometry.end);
  const midpoint = { x: (geometry.start.x + geometry.end.x) / 2, y: (geometry.start.y + geometry.end.y) / 2 };
  const angle = geometry.orientation === "aligned"
    ? Math.atan2(dy, dx) * 180 / Math.PI
    : geometry.orientation === "vertical" ? -90 : 0;
  const normalizedAngle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
  const textOffset = 12 / zoom;
  const textPosition = geometry.orientation === "horizontal"
    ? { x: midpoint.x, y: midpoint.y - textOffset }
    : geometry.orientation === "vertical"
      ? { x: midpoint.x - textOffset, y: midpoint.y }
      : (() => {
        let nx = -dy / length;
        let ny = dx / length;
        if (ny > 0 || (Math.abs(ny) < 0.1 && nx > 0)) {
          nx = -nx;
          ny = -ny;
        }
        return { x: midpoint.x + nx * textOffset, y: midpoint.y + ny * textOffset };
      })();
  const textColor = darkSheet ? "#fff" : "#0f172a";

  return (
    <g pointerEvents="none">
      {firstExtension && <line {...firstExtension} stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />}
      {secondExtension && <line {...secondExtension} stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />}
      <line x1={geometry.start.x} y1={geometry.start.y} x2={geometry.end.x} y2={geometry.end.y}
        stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />
      <path
        d={`M${geometry.start.x - tickSize},${geometry.start.y + tickSize}L${geometry.start.x + tickSize},${geometry.start.y - tickSize}M${geometry.end.x - tickSize},${geometry.end.y + tickSize}L${geometry.end.x + tickSize},${geometry.end.y - tickSize}`}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={textPosition.x}
        y={textPosition.y}
        transform={`rotate(${normalizedAngle} ${textPosition.x} ${textPosition.y})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14 / zoom}
        fontWeight={600}
        fill={textColor}
      >
        {value}
      </text>
    </g>
  );
}

export function DrawingViewer({
  url,
  pageNo,
  calibration,
  onCalibrationPicked,
  onPresetScale,
  onMeasure,
  onMeasureMany,
  onPageChange,
  savedMeasurements,
  readOnly,
  onStartTakeoff,
  takeoffTarget,
  activeTakeoff,
  onSelectItem,
  onEditShape,
  cad,
  cadKey,
}: DrawingViewerProps) {
  /** Where a no-tool press started; a release close to it is a click (select), otherwise a pan. */
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  /** Tool whose "New …" panel is open. */
  const [panelTool, setPanelTool] = useState<TakeoffTool | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("points");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const snapIndexRef = useRef<SnapIndex | null>(null);
  /** Page lines with curves flattened, for Smart pick; hatch detection is built on the first pick. */
  const areaSegsRef = useRef<Segment[] | null>(null);
  const hatchRef = useRef<HatchInfo | null>(null);
  /** Smart pick: the area(s) under the cursor, and a message when nothing closed was found. */
  const [pickPreview, setPickPreview] = useState<Pt[][] | null>(null);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pageNo ?? 1);
  /** Page size in PDF page units. */
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  /** Zoom (screen px per page unit) and pan (screen px). */
  const [view, setView] = useState({ zoom: 0.6, x: 0, y: 0 });
  const [tool, setTool] = useState<ViewerTool>("pan");
  const [dimensionMode, setDimensionMode] = useState<DimensionMode>("linear");
  const [snapOn, setSnapOn] = useState(true);
  const [orthoOn, setOrthoOn] = useState(false);
  // Black sheet (CAD style) by default: the PDF is colour-inverted, so white paper becomes black and
  // black linework white, while coloured lines keep their hue. Remembered per browser.
  /** Hides the PDF / DXF underneath so only the take-off shapes show (view only; snapping still works). */
  const [sourceHidden, setSourceHidden] = useState(false);
  const [darkSheet, setDarkSheet] = useState(() => {
    try { return typeof window === "undefined" || window.localStorage.getItem(SHEET_KEY) !== "light"; } catch { return true; }
  });
  const toggleSheet = () => setDarkSheet((d) => {
    try { window.localStorage.setItem(SHEET_KEY, d ? "light" : "dark"); } catch { /* storage unavailable */ }
    return !d;
  });
  const ink = darkSheet ? "#ffffff" : "#0f172a";
  const [vectorCount, setVectorCount] = useState<number | null>(null);
  /** CAD: layers hidden in the view (and in snapping), remembered per drawing. */
  const layersKey = cadKey ? `dcos.qto.cadlayers:${cadKey}` : null;
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const cadCanvasRef = useRef<HTMLCanvasElement>(null);
  /** The CAD sheet last fitted to the viewport (a new sheet is fitted once the viewport has its size). */
  const fittedCad = useRef<CadSheet | null>(null);
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const maxZoom = cad ? 400 : MAX_ZOOM;
  const minZoom = cad ? 0.02 : MIN_ZOOM;

  const [draftPts, setDraftPts] = useState<Pt[]>([]);
  /** Resolved (snapped / ortho) pointer position in page units. */
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hoverSnap, setHoverSnap] = useState<Snap | null>(null);
  /** Grip being dragged on a selected shape, and the shape's live points while dragging. */
  const gripDrag = useRef<{
    shapeId: string; grip: Grip; start: Pt[]; measureType: string; objects: SnapIndex;
    /** Screen position of the press that picked the grip; a release far from it ends a drag. */
    pressedAt: { x: number; y: number } | null;
  } | null>(null);
  const [editPreview, setEditPreview] = useState<{ shapeId: string; points: Pt[]; grip?: Grip } | null>(null);
  /** Cross-hair position in viewport pixels (follows the snapped point while over the sheet). */
  const [screenCursor, setScreenCursor] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);

  const renderPage = useCallback(async (pageNumber: number) => {
    const doc = pdfRef.current;
    if (!doc) return;
    const page = await doc.getPage(pageNumber);
    const unit = page.getViewport({ scale: 1 });
    setPageSize({ w: unit.width, h: unit.height });
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${unit.width}px`;
    canvas.style.height = `${unit.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Vector geometry for snapping (scanned PDFs have none; snapping then simply does nothing).
    snapIndexRef.current = null;
    areaSegsRef.current = null;
    hatchRef.current = null;
    setVectorCount(null);
    try {
      const ops = await page.getOperatorList();
      const segments = extractSegments(ops.fnArray, ops.argsArray, pdfjsLib.OPS as unknown as OpCodes, unit.transform as Matrix);
      snapIndexRef.current = new SnapIndex(segments);
      areaSegsRef.current = extractSegments(ops.fnArray, ops.argsArray, pdfjsLib.OPS as unknown as OpCodes, unit.transform as Matrix, 0.01, 8);
      setVectorCount(segments.length);
    } catch {
      setVectorCount(0);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("The drawing file could not be loaded");
        const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer() }).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        const target = Math.min(pageNo ?? 1, doc.numPages);
        setCurrentPage(target);
        await renderPage(target);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to open the drawing");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!layersKey) return;
    let saved: string[] = [];
    try { saved = JSON.parse(window.localStorage.getItem(layersKey) ?? "[]"); } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHiddenLayers(new Set(Array.isArray(saved) ? saved : []));
  }, [layersKey]);
  const setHidden = (next: Set<string>) => {
    setHiddenLayers(next);
    try { if (layersKey) window.localStorage.setItem(layersKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    if (!cad) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageSize(cad.size);
    setNumPages(1);
    setCurrentPage(1);
    setLoading(false);
    setError(null);
  }, [cad]);
  useEffect(() => {
    if (!cad || fittedCad.current === cad || !vpSize.w || !vpSize.h) return;
    fittedCad.current = cad;
    const zoom = Math.min((vpSize.w - 2 * PAGE_OFFSET) / cad.size.w, (vpSize.h - 2 * PAGE_OFFSET) / cad.size.h) * 0.95;
    setView({ zoom, x: ((vpSize.w - 2 * PAGE_OFFSET) - cad.size.w * zoom) / 2, y: ((vpSize.h - 2 * PAGE_OFFSET) - cad.size.h * zoom) / 2 });
  }, [cad, vpSize]);

  useEffect(() => {
    if (!cad) return;
    const segs = cad.segments.filter((_, i) => !hiddenLayers.has(cad.segmentLayers[i]));
    snapIndexRef.current = new SnapIndex(segs);
    areaSegsRef.current = segs;
    // CAD hatches are entities, not line patterns: no line-pattern detection.
    hatchRef.current = detectHatches([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVectorCount(segs.length);
  }, [cad, hiddenLayers]);

  // CAD is drawn on a viewport-sized canvas at every view change (crisp at any zoom).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !cad) return;
    const ro = new ResizeObserver(() => setVpSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cad]);
  useEffect(() => {
    const canvas = cadCanvasRef.current;
    if (!cad || !canvas || !vpSize.w) return;
    const frame = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(vpSize.w * dpr) || canvas.height !== Math.round(vpSize.h * dpr)) {
        canvas.width = Math.round(vpSize.w * dpr);
        canvas.height = Math.round(vpSize.h * dpr);
        canvas.style.width = `${vpSize.w}px`;
        canvas.style.height = `${vpSize.h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawSheet(ctx, cad, { ...view, offset: PAGE_OFFSET }, { width: vpSize.w, height: vpSize.h, dpr, ink: ink, hidden: hiddenLayers });
    });
    return () => cancelAnimationFrame(frame);
  }, [cad, view, vpSize, ink, hiddenLayers]);

  useEffect(() => {
    if (pageNo && pageNo !== currentPage && pdfRef.current) {
      setCurrentPage(pageNo);
      void renderPage(pageNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNo]);

  // Wheel zooms around the cursor. Registered by hand: React's wheel listener is passive.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left - PAGE_OFFSET;
      const sy = e.clientY - rect.top - PAGE_OFFSET;
      setView((v) => {
        const zoom = Math.min(maxZoom, Math.max(minZoom, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        // Keep the page point under the cursor fixed.
        const cx = (sx - v.x) / v.zoom;
        const cy = (sy - v.y) / v.zoom;
        return { zoom, x: sx - cx * zoom, y: sy - cy * zoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [url, cad, maxZoom, minZoom]);

  /** Pointer position → PDF page units (raw, before snapping). */
  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !pageSize) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * pageSize.w, y: ((e.clientY - rect.top) / rect.height) * pageSize.h };
  };

  useEffect(() => {
    if (!gripDrag.current) setEditPreview(null);
  }, [savedMeasurements]);

  /** Drawn take-off shapes on this page, as object-snap targets while measuring. */
  const objectIndex = useMemo(() => {
    const shapes = (savedMeasurements ?? []).filter((m) => (m.page_no ?? 1) === currentPage);
    return shapes.length ? new SnapIndex(shapeSegments(shapes)) : null;
  }, [savedMeasurements, currentPage]);

  /** Applies PDF snap (unless Alt is held) and ortho (toggle or Shift) to a pointer position. */
  const resolve = (
    e: { clientX: number; clientY: number; altKey: boolean; shiftKey: boolean },
    objects: SnapIndex | null = objectIndex,
    anchorOverride?: Pt,
  ): { pt: Pt; snap: Snap | null } => {
    const raw = toPage(e);
    let snap: Snap | null = null;
    let pt = raw;
    if (snapOn && !e.altKey) {
      snap = bestSnap([snapIndexRef.current, objects], raw, SNAP_PX / view.zoom);
      if (snap) pt = snap.point;
    }
    const anchor = anchorOverride ?? draftPts[draftPts.length - 1];
    const placingDimension = tool === "dimension" && draftPts.length >= 2 && !anchorOverride;
    if ((orthoOn || e.shiftKey) && anchor && !placingDimension && (anchorOverride || (tool !== "count" && tool !== "point" && !boxMode))) {
      const o = orthogonal(anchor, pt);
      if (o.x !== pt.x || o.y !== pt.y) snap = null;
      pt = o;
    }
    return { pt, snap };
  };

  const cancelDraft = () => {
    setDraftPts([]);
    setCursor(null);
  };

  const toMeasurement = useCallback((type: QtoMeasureType, pts: Pt[]): EmittedMeasurement => {
    const cal = calibration ? { metresPerUnit: calibration.metresPerUnit } : null;
    const base = { measure_type: type, points: pts, length: null, area: null, count: null, unit: null, page_no: currentPage };
    if (type === "count") return { ...base, count: pts.length, unit: "No." };
    if (type === "point") return base;
    if (type === "area") return { ...base, area: cal ? areaInSquareMetres(polygonArea(pts), cal) : null, unit: cal ? "m2" : null };
    const units = type === "perimeter" ? perimeter(pts) : polylineLength(pts);
    return { ...base, length: cal ? lengthInMetres(units, cal) : null, unit: cal ? "m" : null };
  }, [calibration, currentPage]);

  const emit = useCallback((type: QtoMeasureType, pts: Pt[]) => {
    onMeasure?.(toMeasurement(type, pts));
  }, [onMeasure, toMeasurement]);

  const emitMany = (type: QtoMeasureType, shapes: Pt[][]) => {
    if (onMeasureMany) onMeasureMany(shapes.map((pts) => toMeasurement(type, pts)));
    else shapes.forEach((pts) => emit(type, pts));
  };

  /**
   * Smart pick at p: the closed area around it, or (all) every area with the same hatch pattern as
   * the hatch under or inside it. Gaps up to about 2 screen pixels are closed.
   */
  const runPick = (p: Pt, all: boolean): Pt[][] => {
    const segs = areaSegsRef.current;
    if (!segs?.length) return [];
    hatchRef.current ??= detectHatches(segs);
    const hatches = hatchRef.current;
    const gap = Math.min(3, Math.max(0.25, 2 / view.zoom));
    const one = pickRegion(segs, p, { gap, hatches });
    if (!all) return one ? [one] : [];
    const cluster = hatchAt(segs, hatches, p, 6 / view.zoom) ?? (one ? hatchInside(segs, hatches, one) : null);
    if (cluster === null) return [];
    return sameHatchRegions(segs, hatches, cluster, { gap });
  };

  const emitDimension = useCallback((points: DimensionEndpointPair, location: Pt) => {
    if (!onMeasure) return;
    const geometry = dimensionGeometry(points[0], points[1], location, dimensionMode);
    if (geometry.measuredPageUnits === 0) return;
    const cal = calibration ? { metresPerUnit: calibration.metresPerUnit } : null;
    onMeasure({
      measure_type: "length",
      points: encodeDimensionPoints(points, { mode: dimensionMode, location }),
      length: cal ? lengthInMetres(geometry.measuredPageUnits, cal) : null,
      area: null,
      count: null,
      unit: cal ? "m" : null,
      page_no: currentPage,
    });
  }, [onMeasure, dimensionMode, calibration, currentPage]);

  const finish = useCallback(() => {
    const pts = draftPts;
    if (tool === "dimension") return;
    if (tool === "count" && pts.length > 0) emit("count", pts);
    else if ((tool === "polyline") && pts.length >= 2) emit("polyline", pts);
    else if ((tool === "area" || tool === "perimeter") && pts.length >= 3) emit(tool, pts);
    cancelDraft();
  }, [draftPts, tool, emit]);

  /** Places the hot grip at the pointer (snapped) and saves the shape. */
  const placeGrip = (e: { clientX: number; clientY: number; altKey: boolean; shiftKey: boolean }) => {
    const g = gripDrag.current;
    if (!g) return;
    gripDrag.current = null;
    const { pt } = resolve(e, g.objects, g.grip.at);
    const points = moveGrip(g.start, g.grip, pt, g.measureType);
    const moved = points.some((q, i) => q.x !== g.start[i].x || q.y !== g.start[i].y);
    setEditPreview(moved ? { shapeId: g.shapeId, points } : null);
    setHoverSnap(null);
    if (moved) onEditShape?.(g.shapeId, points);
  };
  const cancelGrip = () => {
    gripDrag.current = null;
    setEditPreview(null);
    setHoverSnap(null);
  };

  const startPan = (e: React.PointerEvent) => {
    e.preventDefault();
    pressAt.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    dragging.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  /** Pointer position inside the viewport (for the cross-hair). */
  const toViewport = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.focus();
    if (gripDrag.current) {
      e.preventDefault();
      if (e.button === 2) cancelGrip();
      else if (e.button === 0) placeGrip(e);
      return;
    }
    // Pan with the Pan tool, in read-only mode, or with the middle mouse button in any tool.
    if (tool === "pan" || readOnly || e.button === 1) {
      e.stopPropagation();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const { pt } = resolve(e);
    if (tool === "calibrate") {
      const next = draftPts.length >= 2 ? [pt] : [...draftPts, pt];
      setDraftPts(next);
      if (next.length === 2) {
        onCalibrationPicked?.({ points: next, pageUnits: distance(next[0], next[1]), page_no: currentPage });
        setTimeout(cancelDraft, 0);
      }
      return;
    }
    if (tool === "length") {
      if (draftPts.length === 0) setDraftPts([pt]);
      else {
        emit("length", [draftPts[0], pt]);
        cancelDraft();
      }
      return;
    }
    if (tool === "dimension") {
      if (draftPts.length < 2) {
        if (draftPts.length === 1 && distance(draftPts[0], pt) === 0) return;
        setDraftPts((points) => [...points, pt]);
      } else {
        emitDimension([draftPts[0], draftPts[1]], pt);
        cancelDraft();
      }
      return;
    }
    if (tool === "point") {
      emit("point", [pt]);
      return;
    }
    if (cadMode && cad) {
      const o = cadObjectAt(toPage(e));
      if (!o) {
        setPickMsg(cadKind === "count" ? "No block here. Click on a block (e.g. a door or a column symbol)."
          : cadKind === "length" ? "No line here. Click on a line, polyline or arc." : drawMode === "hatch" ? "No hatch here. Click inside a hatched area." : "No closed object here. Click inside a closed polyline, circle or hatch.");
        return;
      }
      setPickMsg(null);
      if (drawMode === "object") { emitCad([o], o, "object"); return; }
      const by: CadSimilar = drawMode === "block" ? "block" : drawMode === "hatch" ? "hatch" : "layer";
      setCadPending({ objs: similarTo(cad, o, by, cadKind, hiddenLayers), ref: o, by });
      return;
    }
    if (pickMode) {
      const all = drawMode === "hatch" || e.ctrlKey || e.metaKey;
      const shapes = runPick(toPage(e), all);
      if (!shapes.length) {
        setPickMsg(!areaSegsRef.current?.length ? "This page has no vector lines (scanned PDF?), so Smart pick cannot find areas"
          : all ? "No hatch pattern found here. Click inside a hatched area." : "No closed boundary around this point. Zoom in or draw it point to point.");
        return;
      }
      emitMany(tool as QtoMeasureType, shapes);
      setPickPreview(null);
      setPickMsg(shapes.length > 1 ? `${shapes.length} areas with the same hatch picked` : null);
      return;
    }
    if (boxMode) {
      if (draftPts.length === 0) setDraftPts([pt]);
      else {
        emit(tool as QtoMeasureType, boxCorners(draftPts[0], pt));
        cancelDraft();
      }
      return;
    }
    setDraftPts((p) => [...p, pt]);
  };

  /** A measuring tool is active: only then do snap, ortho and the cross-hair apply. */
  const measuring = tool !== "pan" && !readOnly;
  const boxMode = drawMode === "box" && (tool === "area" || tool === "perimeter");
  const pickMode = (drawMode === "pick" || (drawMode === "hatch" && !cad)) && (tool === "area" || tool === "perimeter") && !readOnly;
  /** CAD-native take-off: pick an object, or select similar (layer, hatch pattern, block). */
  const cadKind: CadPickKind = tool === "count" ? "count" : tool === "length" || tool === "polyline" ? "length" : "area";
  const cadMode = !!cad && !readOnly && tool !== "pan" && tool !== "calibrate" && tool !== "dimension" && tool !== "point"
    && (drawMode === "object" || drawMode === "layer" || drawMode === "block" || (drawMode === "hatch" && cadKind === "area"));
  const cadBoxes = useMemo(() => (cad ? insertBoxes(cad) : new Map()), [cad]);
  const [cadHover, setCadHover] = useState<SheetObject | null>(null);
  const [cadPending, setCadPending] = useState<{ objs: SheetObject[]; ref: SheetObject; by: CadSimilar } | null>(null);
  const cadObjectAt = (pt: Pt) => cad
    ? objectAt(drawMode === "hatch" ? { ...cad, objects: cad.objects.filter((o) => o.type === "HATCH") } : cad, pt, cadKind, 6 / view.zoom, hiddenLayers, cadBoxes)
    : null;
  /** Metres per model unit (from the page scale, so a corrected scale applies too). */
  const modelMetres = cad && calibration ? calibration.metresPerUnit * cad.frame.k : null;
  const cadQty = (o: SheetObject) => (cadKind === "count" ? 1
    : !modelMetres ? 0
    : cadKind === "area" && tool !== "perimeter" ? (o.area ?? 0) * modelMetres * modelMetres
    : (o.length ?? 0) * modelMetres);
  const cadUnit = cadKind === "count" ? "No." : cadKind === "area" && tool !== "perimeter" ? "m²" : "m";
  const describe = (o: SheetObject) => (o.type === "INSERT" ? `block ${o.block}` : o.type === "HATCH" ? `hatch ${o.pattern}` : o.type.toLowerCase()) + ` · ${o.layer}`;

  /** Saves CAD objects as measurements with their handles and how they were selected. */
  const emitCad = (objs: SheetObject[], ref: SheetObject, by: CadSimilar | "object") => {
    if (!cad || !objs.length) return;
    const selection = { by, layer: ref.layer, ...(ref.pattern ? { pattern: ref.pattern } : {}), ...(ref.block ? { block: ref.block } : {}), scope: "model" };
    const source = (list: SheetObject[]) => ({ format: "dxf" as const, handles: list.map((o) => o.handle), layer: ref.layer, block: ref.block ?? null, selection });
    if (cadKind === "count") {
      const pts = objs.map((o) => o.at ?? mainLoop(o)[0]);
      const m = toMeasurement("count", pts);
      (onMeasureMany ? (ms: EmittedMeasurement[]) => onMeasureMany(ms) : (ms: EmittedMeasurement[]) => ms.forEach((x) => onMeasure?.(x)))([{ ...m, source: source(objs) }]);
      return;
    }
    const ms = objs.map((o) => {
      const pts = cadKind === "area" ? mainLoop(o) : o.outline[0];
      const type: QtoMeasureType = cadKind === "area" ? (tool === "perimeter" ? "perimeter" : "area") : pts.length === 2 ? "length" : "polyline";
      const base = toMeasurement(type, pts);
      // Exact quantities from the CAD geometry (arcs, hatch islands), not the drawn outline.
      const exact = modelMetres === null ? base
        : type === "area" ? { ...base, area: (o.area ?? 0) * modelMetres * modelMetres }
        : { ...base, length: (o.length ?? 0) * modelMetres };
      return { ...exact, source: source([o]) };
    });
    if (onMeasureMany) onMeasureMany(ms); else ms.forEach((x) => onMeasure?.(x));
  };

  // Leaving the CAD modes clears their preview and pending selection.
  useEffect(() => {
    if (cadMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCadHover(null);
    setCadPending(null);
  }, [cadMode]);

  // Leaving Smart pick clears its preview.
  useEffect(() => {
    if (pickMode) return;
    if (pickTimer.current) clearTimeout(pickTimer.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickPreview(null);
    setPickMsg(null);
  }, [pickMode]);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gripDrag.current;
    if (g) {
      const { pt, snap } = resolve(e, g.objects, g.grip.at);
      setEditPreview({ shapeId: g.shapeId, points: moveGrip(g.start, g.grip, pt, g.measureType), grip: g.grip });
      setCursor(pt);
      setHoverSnap(snap);
      setScreenCursor({ x: PAGE_OFFSET + view.x + pt.x * view.zoom, y: PAGE_OFFSET + view.y + pt.y * view.zoom });
      return;
    }
    if (cadMode) {
      const pt = toPage(e);
      setCursor(pt);
      setHoverSnap(null);
      setScreenCursor({ x: PAGE_OFFSET + view.x + pt.x * view.zoom, y: PAGE_OFFSET + view.y + pt.y * view.zoom });
      const o = cadObjectAt(pt);
      setCadHover(o);
      if (o) setPickMsg(null);
      return;
    }
    if (pickMode) {
      // Smart pick needs no snap; the area under the cursor is previewed once the mouse rests.
      const pt = toPage(e);
      setCursor(pt);
      setHoverSnap(null);
      setScreenCursor({ x: PAGE_OFFSET + view.x + pt.x * view.zoom, y: PAGE_OFFSET + view.y + pt.y * view.zoom });
      if (pickTimer.current) clearTimeout(pickTimer.current);
      pickTimer.current = setTimeout(() => {
        const shapes = runPick(pt, false);
        setPickPreview(shapes.length ? shapes : null);
        // A "nothing found" message stays until the cursor finds an area.
        if (shapes.length) setPickMsg(null);
      }, 120);
      return;
    }
    const { pt, snap } = measuring ? resolve(e) : { pt: toPage(e), snap: null };
    setCursor(pt);
    setHoverSnap(snap);
    if (!readOnly) setScreenCursor({ x: PAGE_OFFSET + view.x + pt.x * view.zoom, y: PAGE_OFFSET + view.y + pt.y * view.zoom });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); finish(); }
    else if (e.key === "Escape" && gripDrag.current) cancelGrip();
    else if ((e.key === "Delete" || e.key === "Backspace") && (gripDrag.current || draftPts.length > 0)) { e.stopPropagation(); }
    else if (e.key === "Escape") {
      // Esc cancels the measurement in progress; with nothing in progress it returns to Pan.
      if (cadPending) setCadPending(null);
      else if (draftPts.length > 0) cancelDraft();
      else if (tool !== "pan") { setTool("pan"); setHoverSnap(null); setScreenCursor(null); }
      else onSelectItem?.(null);
    }
    else if (e.key === "Backspace" && draftPts.length > 0) { e.preventDefault(); setDraftPts((p) => p.slice(0, -1)); }
    else if (e.key.toLowerCase() === "o" && !e.ctrlKey && !e.metaKey) setOrthoOn((o) => !o);
    else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) setSnapOn((s) => !s);
    else if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) setSourceHidden((h) => !h);
  };

  const goPage = (p: number) => {
    const target = Math.max(1, Math.min(p, numPages));
    setCurrentPage(target);
    cancelDraft();
    void renderPage(target);
    onPageChange?.(target);
  };

  const zoomBy = (factor: number) => setView((v) => ({ ...v, zoom: Math.min(maxZoom, Math.max(minZoom, v.zoom * factor)) }));
  /** Fits the whole sheet in the viewport (CAD), or the default PDF view. */
  const resetView = () => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!cad || !r || !pageSize) { setView({ zoom: 0.6, x: 0, y: 0 }); return; }
    const zoom = Math.min((r.width - 2 * PAGE_OFFSET) / pageSize.w, (r.height - 2 * PAGE_OFFSET) / pageSize.h) * 0.95;
    setView({ zoom, x: ((r.width - 2 * PAGE_OFFSET) - pageSize.w * zoom) / 2, y: ((r.height - 2 * PAGE_OFFSET) - pageSize.h * zoom) / 2 });
  };

  const cal = calibration ? { metresPerUnit: calibration.metresPerUnit } : null;
  const live = draftPts.length === 0 ? []
    : boxMode ? (cursor ? boxCorners(draftPts[0], cursor) : draftPts)
    : [...draftPts, ...(cursor ? [cursor] : [])];
  let liveText: string | null = null;
  if (draftPts.length > 0) {
    if (tool === "calibrate") liveText = `Reference: ${fmt(polylineLength(live), 2)} page units${cal ? ` (now reads ${fmt(lengthInMetres(polylineLength(live), cal) * 1000, 0)} mm)` : ""}`;
    else if (tool === "count") liveText = `Count: ${draftPts.length}`;
    else if (!cal) liveText = "Not calibrated — set the scale first for real units";
    else if (tool === "area") liveText = `Area: ${fmt(areaInSquareMetres(polygonArea(live), cal))} m²`;
    else if (tool === "perimeter") liveText = `Perimeter: ${fmt(lengthInMetres(perimeter(live), cal))} m`;
    else if (tool === "dimension" && draftPts.length >= 2 && cursor) {
      const dimension = dimensionGeometry(draftPts[0], draftPts[1], cursor, dimensionMode);
      liveText = `${dimensionMode === "aligned" ? "Aligned" : "Linear"} dimension: ${dimensionLabel(lengthInMetres(dimension.measuredPageUnits, cal))}`;
    }
    else if (tool === "dimension") liveText = `Dimension ${dimensionMode}: select the first and second extension points, then place the dimension`;
    else liveText = `Length: ${fmt(lengthInMetres(polylineLength(live), cal))} m`;
  }
  if (cadMode) {
    liveText = pickMsg
      ?? (cadPending ? `${cadPending.objs.length} objects selected: confirm below`
      : cadHover ? `${describe(cadHover)}: ${fmt(cadQty(cadHover), cadKind === "count" ? 0 : 3)} ${cadUnit}${drawMode === "object" ? " · click to add" : " · click to select all like it"}`
      : drawMode === "block" ? "Same block: hover over a block" : drawMode === "layer" ? "All on layer: hover over an object" : drawMode === "hatch" ? "Same hatch: hover over a hatch" : "Pick object: hover over a CAD object");
  }
  if (pickMode && draftPts.length === 0) {
    const shape = pickPreview?.[0];
    liveText = pickMsg
      ?? (!shape ? (drawMode === "hatch" ? "Same hatch: hover inside a hatched area" : "Smart pick: hover inside a closed area")
      : !cal ? "Not calibrated — set the scale first for real units"
      : tool === "perimeter" ? `Perimeter: ${fmt(lengthInMetres(perimeter(shape), cal))} m · click to add`
      : `Area: ${fmt(areaInSquareMetres(polygonArea(shape), cal))} m² · click to add${drawMode === "hatch" ? " every area with this hatch" : ""}`);
  }
  const tools = readOnly ? [] : TOOL_OPTIONS;
  const activeTool = TOOL_OPTIONS.find((t) => t.key === tool);
  const activeHint = editPreview?.grip ? "Grip is hot: move the mouse, click to place · Esc or right-click cancels"
    : panelTool ? "Set the name, colour and draw mode, then Start Takeoff"
    : boxMode ? BOX_HINT
    : cadMode ? (drawMode === "object" ? "Pick object: click a CAD object to add its exact quantity" : "Click an object to select every one like it, then confirm · Esc cancels")
    : pickMode ? (drawMode === "hatch" ? HATCH_HINT : PICK_HINT)
    : tool === "dimension"
      ? draftPts.length === 0
        ? "Click the first extension point"
        : draftPts.length === 1
          ? "Click the second extension point"
          : "Move the cursor to position the dimension, then click to place"
    : activeTool?.hint ?? "No tool: click a shape to select · drag to move · wheel to zoom";
  const drawingScale = calibration ? drawingScaleFromCalibration(calibration.metresPerUnit) : null;
  const marker = 6 / view.zoom;
  const dimensionPreview: {
    points: DimensionEndpointPair;
    annotation: DimensionAnnotation;
    value: string;
  } | null = tool === "dimension" && draftPts.length > 0 && cursor
    ? (() => {
    const points: DimensionEndpointPair = draftPts.length === 1
      ? [draftPts[0], cursor]
      : [draftPts[0], draftPts[1]];
    const location = cursor;
    const geometry = dimensionGeometry(points[0], points[1], location, dimensionMode);
      return {
        points,
        annotation: { mode: dimensionMode, location },
        value: cal ? dimensionLabel(lengthInMetres(geometry.measuredPageUnits, cal)) : `${fmt(geometry.measuredPageUnits, 1)} u`,
      };
    })()
    : null;

  if (!url && !cad) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No PDF is attached to this drawing revision.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-1.5 py-1">
        {tools.map((opt) => {
          const Icon = opt.icon;
          const active = panelTool ? panelTool === opt.key : tool === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              title={`${opt.label}: ${opt.hint}`}
              aria-pressed={active}
              onClick={() => {
                cancelDraft();
                if (active) { setPanelTool(null); setDrawMode("points"); setTool("pan"); setHoverSnap(null); return; }
                if (onStartTakeoff && opt.key in TOOL_META) { setPanelTool(opt.key as TakeoffTool); return; }
                setPanelTool(null);
                setDrawMode("points");
                setTool(opt.key);
              }}
              className={cn(
                "flex w-[54px] flex-col items-center rounded-md border px-1 py-0.5 text-[10px] font-medium leading-tight transition-colors",
                active ? "border-primary/40 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={18} />
              <span className="leading-none">{opt.label}</span>
            </button>
          );
        })}
        {tool === "dimension" && (
          <div className="ml-1 flex items-center gap-1 border-l border-border pl-1" role="group" aria-label="Dimension type">
            <span className="px-1 text-[10px] text-muted-foreground">Type</span>
            {(["linear", "aligned"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={dimensionMode === mode}
                onClick={() => {
                  setDimensionMode(mode);
                  cancelDraft();
                }}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-medium",
                  dimensionMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {mode === "aligned" ? "Align" : "Linear"}
              </button>
            ))}
          </div>
        )}
        {draftPts.length > 0 && (
          <div className="flex items-center gap-1 border-l border-border pl-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDraftPts((p) => p.slice(0, -1))} title="Undo last point (Backspace)">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            {(tool === "polyline" || tool === "area" || tool === "perimeter" || tool === "count") && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={finish} title="Finish (Enter)">Finish</Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelDraft} title="Cancel (Esc)">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span
            className={cn("mr-1 hidden max-w-[16rem] truncate rounded px-1.5 py-0.5 text-[11px] md:inline",
              calibration ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200")}
            title={calibration
              ? `Scale (page ${currentPage}): 1 page unit = ${fmt(calibration.metresPerUnit * 1000, 4)} mm, from a ${fmt(calibration.knownDistance)} ${calibration.knownUnit} reference`
              : `Page ${currentPage} is not calibrated. Pick a drawing scale, or use Scale on a known dimension.`}
          >
            {cad ? (calibration ? <>CAD · <b>true scale</b>{cad.model.insUnits ? "" : " (units set at upload)"}</> : <>CAD · no units: set the scale</>)
              : calibration ? <>Scale {drawingScale && drawingScale >= 1 ? <b>≈ 1:{fmt(drawingScale, drawingScale < 10 ? 2 : 0)}</b> : null} · p.{currentPage}</> : <>Not calibrated · p.{currentPage}</>}
          </span>
          {cad && <CadLayersButton layers={cad.model.layers} hidden={hiddenLayers} onChange={setHidden} />}
          {!readOnly && onPresetScale && !cad && (
            <select
              className="mr-1 h-7 rounded border border-input bg-background px-1 text-xs text-foreground"
              value=""
              aria-label="Set drawing scale"
              title="Sets the scale from the drawing scale. Correct only if the PDF is at true paper size; check a known dimension afterwards."
              onChange={(e) => { if (e.target.value) onPresetScale(Number(e.target.value), currentPage); }}
            >
              <option value="">Drawing scale…</option>
              {DRAWING_SCALES.map((n) => <option key={n} value={n}>1:{n}</option>)}
            </select>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomBy(1 / 1.25)} title="Zoom out (or mouse wheel)">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomBy(1.25)} title="Zoom in (or mouse wheel)">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className={cn("h-7 gap-1 px-2 text-xs", sourceHidden && "bg-primary/10 text-primary")} aria-pressed={sourceHidden}
            title={sourceHidden ? `Show the ${cad ? "DXF" : "PDF"} drawing (H)` : `Hide the ${cad ? "DXF" : "PDF"} drawing: show only the take-offs (H)`}
            onClick={() => setSourceHidden((h) => !h)}>
            {sourceHidden ? <FileX2 className="h-3.5 w-3.5" /> : <FileImage className="h-3.5 w-3.5" />} {cad ? "DXF" : "PDF"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggleSheet} aria-pressed={darkSheet}
            title={darkSheet ? "Show the drawing on a white sheet" : "Show the drawing on a black sheet"}>
            {darkSheet ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetView} title={cad ? "Zoom to the whole drawing" : "Reset view"}>
            <Maximize className="h-3.5 w-3.5" />
          </Button>
          {numPages > 1 && (
            <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)}>Prev</Button>
              <span className="text-xs tabular-nums text-muted-foreground">{currentPage} / {numPages}</span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= numPages} onClick={() => goPage(currentPage + 1)}>Next</Button>
            </div>
          )}
        </div>
      </div>


      <div
        ref={viewportRef}
        className={cn("relative flex-1 overflow-hidden", cad ? (darkSheet ? "bg-black" : "bg-white") : darkSheet ? "bg-neutral-900" : "bg-muted/30")}
        style={{ cursor: readOnly ? undefined : "none" }}
        onPointerDown={(e) => {
          // Off the sheet: middle button pans in any tool; with no tool the left button pans (and a click unselects).
          if (svgRef.current?.contains(e.target as Node) || gripDrag.current) return;
          // Never pan from controls floating over the drawing (tool panel, chip, buttons).
          if ((e.target as HTMLElement).closest("button, input, select, textarea, a, [role=\"dialog\"]")) return;
          if (e.button === 1 || (e.button === 0 && (tool === "pan" || readOnly))) startPan(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current && panStart.current) {
            // Panning: the sheet moves and the cross-hair stays on the mouse.
            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
            panStart.current = { x: e.clientX, y: e.clientY };
            if (!readOnly) setScreenCursor(toViewport(e));
            setCursor(toPage(e));
            setHoverSnap(null);
            return;
          }
          // Off the sheet the cross-hair follows the mouse unsnapped (the sheet sets its own position).
          if (readOnly || svgRef.current?.contains(e.target as Node)) return;
          setScreenCursor(toViewport(e));
          setHoverSnap(null);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          panStart.current = null;
          if (viewportRef.current?.hasPointerCapture(e.pointerId)) viewportRef.current.releasePointerCapture(e.pointerId);
          const start = pressAt.current;
          pressAt.current = null;
          // A click (not a drag) with no tool selects the shape under the cursor; empty space unselects.
          if (!start || !onSelectItem || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
          const shapes = (savedMeasurements ?? [])
            .filter((m) => (m.page_no ?? 1) === currentPage && Array.isArray(m.points))
            .map((m) => {
              const dimension = m.dimension ?? decodeDimensionPoints(m.points);
              const points = dimension && m.points.length >= 2
                ? dimensionGeometry(m.points[0], m.points[1], dimension.location, dimension.mode)
                : null;
              return {
                id: m.id,
                itemId: m.itemId,
                measureType: m.measure_type,
                points: points ? [points.start, points.end] : m.points,
                segments: points ? [[points.start, points.end] as [Pt, Pt]] : undefined,
              };
            });
          const hit = hitTest(shapes, toPage(e), 6 / view.zoom);
          onSelectItem(hit?.itemId ?? null, hit?.id ?? null);
        }}
        onAuxClick={(e) => e.preventDefault()}
        onPointerLeave={() => { setScreenCursor(null); setHoverSnap(null); }}
      >
        {cad && <canvas ref={cadCanvasRef} className={cn("pointer-events-none absolute left-0 top-0", sourceHidden && "invisible")} aria-hidden />}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading drawing…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        <div
          className="absolute"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
            left: PAGE_OFFSET,
            top: PAGE_OFFSET,
          }}
        >
          <div className={cn("relative", !cad && "shadow-lg", !cad && (darkSheet ? "bg-black" : "bg-white"))}
            style={cad && pageSize ? { width: pageSize.w, height: pageSize.h } : undefined}>
            <canvas ref={canvasRef} className={cad ? "hidden" : cn("block", sourceHidden && "invisible")} style={darkSheet ? { filter: "invert(1) hue-rotate(180deg)" } : undefined} />
            {pageSize && (
              <svg
                ref={svgRef}
                width={pageSize.w}
                height={pageSize.h}
                viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}
                className="absolute inset-0 outline-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => {
                  const g = gripDrag.current;
                  if (g) {
                    const press = g.pressedAt;
                    g.pressedAt = null;
                    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) placeGrip(e);
                    return;
                  }
                }}
                onPointerLeave={() => setHoverSnap(null)}
                onDoubleClick={finish}
                onKeyDown={handleKey}
                onContextMenu={(e) => e.preventDefault()}
                tabIndex={0}
                role="application"
                aria-label="Drawing measurement surface"
                style={{ cursor: readOnly ? "grab" : "none" }}
              >
                {(savedMeasurements ?? [])
                  .filter((m) => (m.page_no ?? 1) === currentPage && Array.isArray(m.points) && m.points.length > 0)
                  .map((m) => (editPreview?.shapeId === m.id ? { ...m, points: editPreview.points } : m))
                  .map((m) => {
                    const dimension = m.dimension ?? decodeDimensionPoints(m.points);
                    if (dimension && m.points.length >= 2) {
                      return (
                        <DimensionDrawing
                          key={m.id}
                          points={[m.points[0], m.points[1]]}
                          annotation={dimension}
                          value={m.length === null || m.length === undefined ? "—" : dimensionLabel(m.length)}
                          color={m.color ?? "#2563eb"}
                          zoom={view.zoom}
                          darkSheet={darkSheet}
                        />
                      );
                    }
                    const closed = m.measure_type === "area" || m.measure_type === "perimeter";
                    const color = m.color ?? (m.highlighted ? "#ea580c" : "#2563eb");
                    const fillOpacity = m.opacity ?? (m.highlighted ? 0.18 : 0.12);
                    if (m.measure_type === "count" || m.measure_type === "point") {
                      return m.points.map((p, i) => (
                        <circle key={`${m.id}-${i}`} cx={p.x} cy={p.y} r={4 / view.zoom} fill={color} fillOpacity={0.7} pointerEvents="none" />
                      ));
                    }
                    return (
                      <polyline
                        key={m.id}
                        points={(closed ? [...m.points, m.points[0]] : m.points).map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={m.measure_type === "area" ? color : "none"}
                        fillOpacity={fillOpacity}
                        stroke={color}
                        strokeWidth={m.highlighted ? 3 : 2}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray={m.highlighted ? undefined : "6 3"}
                        pointerEvents="none"
                      />
                    );
                  })}
                {(savedMeasurements ?? [])
                  .filter((m) => m.highlighted && !m.dimension && !decodeDimensionPoints(m.points) && (m.page_no ?? 1) === currentPage && m.points.length > 0)
                  .map((m) => (editPreview?.shapeId === m.id ? { ...m, points: editPreview.points } : m))
                  .flatMap((m) => {
                    const canEdit = !readOnly && !!onEditShape && !measuring;
                    const active = editPreview?.shapeId === m.id ? editPreview.grip ?? null : null;
                    return gripsOf(m.points, m.measure_type).map((g) => {
                      const hot = active?.kind === g.kind && active.index === g.index;
                      const size = (g.kind === "vertex" ? 10 : 6) / view.zoom;
                      const len = 16 / view.zoom;
                      const start = (ev: React.PointerEvent) => {
                        // While a grip is hot, let the sheet handle the click (it places the grip).
                        if (!canEdit || ev.button !== 0 || gripDrag.current) return;
                        ev.stopPropagation();
                        ev.preventDefault();
                        svgRef.current?.focus();
                        // Snap to other shapes and the PDF, never to the shape being edited.
                        const others = (savedMeasurements ?? []).filter((x) => (x.page_no ?? 1) === currentPage && x.id !== m.id);
                        gripDrag.current = {
                          shapeId: m.id, grip: g, start: m.points, measureType: m.measure_type,
                          objects: new SnapIndex(shapeSegments(others)), pressedAt: { x: ev.clientX, y: ev.clientY },
                        };
                        setEditPreview({ shapeId: m.id, points: m.points, grip: g });
                      };
                      const common = {
                        fill: hot ? "#ef4444" : "#2563eb",
                        stroke: "#ffffff",
                        strokeWidth: 1,
                        vectorEffect: "non-scaling-stroke" as const,
                        pointerEvents: canEdit ? ("all" as const) : ("none" as const),
                        onPointerDown: start,
                        className: canEdit ? "cursor-move hover:fill-red-500" : undefined,
                      };
                      return g.kind === "vertex" ? (
                        <rect key={`g-${m.id}-v${g.index}`} x={g.at.x - size / 2} y={g.at.y - size / 2} width={size} height={size} {...common}>
                          <title>Drag to move this point</title>
                        </rect>
                      ) : (
                        <rect key={`g-${m.id}-m${g.index}`} x={g.at.x - len / 2} y={g.at.y - size / 2} width={len} height={size}
                          transform={`rotate(${g.angle} ${g.at.x} ${g.at.y})`} {...common}>
                          <title>Drag to move this edge</title>
                        </rect>
                      );
                    });
                  })}
                {cadMode && (cadPending?.objs ?? (cadHover ? [cadHover] : [])).map((o) => (
                  cadKind === "count" ? (
                    <circle key={`cad-${o.handle}`} cx={o.at?.x ?? 0} cy={o.at?.y ?? 0} r={7 / view.zoom} fill="rgba(234,88,12,0.35)" stroke="#ea580c" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  ) : (
                    <path key={`cad-${o.handle}`} d={o.outline.map((l) => "M" + l.map((q) => `${q.x},${q.y}`).join("L") + (cadKind === "area" ? "Z" : "")).join(" ")}
                      fillRule="evenodd" fill={cadKind === "area" ? (cadPending ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.25)") : "none"}
                      stroke={cadPending ? "#16a34a" : "#f59e0b"} strokeWidth={cadKind === "area" ? 2 : 3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  )
                ))}
                {pickMode && pickPreview?.map((shape, i) => (
                  <polygon key={`pick-${i}`} points={shape.map((q) => `${q.x},${q.y}`).join(" ")}
                    fill={tool === "area" ? "rgba(34,197,94,0.22)" : "none"} stroke="#16a34a" strokeWidth={2}
                    strokeDasharray="6 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                ))}
                {draftPts.length > 0 && tool !== "count" && (
                  tool !== "dimension" &&
                  <polyline
                    points={live.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={tool === "area" && live.length >= 3 ? "rgba(220,38,38,0.12)" : "none"}
                    stroke={tool === "calibrate" ? "#16a34a" : "#dc2626"}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                {dimensionPreview && (
                  <DimensionDrawing
                    points={dimensionPreview.points}
                    annotation={dimensionPreview.annotation}
                    value={dimensionPreview.value}
                    color="#ef4444"
                    zoom={view.zoom}
                    darkSheet={darkSheet}
                  />
                )}
                {(tool === "area" || tool === "perimeter") && live.length >= 3 && (
                  <line x1={live[live.length - 1].x} y1={live[live.length - 1].y} x2={live[0].x} y2={live[0].y}
                    stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                )}
                {draftPts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3.5 / view.zoom} fill={tool === "calibrate" ? "#16a34a" : "#dc2626"} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                ))}

                {/* Snap marker (the cross-hair is drawn across the whole viewport below) */}
                {editPreview?.grip && cursor && (
                  <line x1={editPreview.grip.at.x} y1={editPreview.grip.at.y} x2={cursor.x} y2={cursor.y}
                    stroke="#fbbf24" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                )}
                {cursor && (measuring || !!editPreview) && hoverSnap && (
                  <g pointerEvents="none">
                    {hoverSnap?.kind === "endpoint" && (
                      <rect x={cursor.x - marker} y={cursor.y - marker} width={marker * 2} height={marker * 2} fill="none" stroke="#16a34a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    )}
                    {hoverSnap?.kind === "intersection" && (
                      <path d={`M${cursor.x - marker},${cursor.y - marker}L${cursor.x + marker},${cursor.y + marker}M${cursor.x + marker},${cursor.y - marker}L${cursor.x - marker},${cursor.y + marker}`} stroke="#16a34a" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                    )}
                    {hoverSnap?.kind === "midpoint" && (
                      <path d={`M${cursor.x},${cursor.y - marker}L${cursor.x + marker},${cursor.y + marker}L${cursor.x - marker},${cursor.y + marker}Z`} fill="none" stroke="#16a34a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    )}
                    {hoverSnap?.kind === "on-line" && (
                      <circle cx={cursor.x} cy={cursor.y} r={marker * 0.8} fill="none" stroke="#16a34a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    )}
                  </g>
                )}
              </svg>
            )}
          </div>
        </div>
        {!readOnly && screenCursor && !panelTool && (measuring || !!editPreview) && cursor && (() => {
          const base = editPreview?.grip?.at ?? draftPts[draftPts.length - 1] ?? null;
          let text: string | null = hoverSnap ? SNAP_LABEL[hoverSnap.kind] : null;
          if (!hoverSnap && orthoOn && base) {
            const d = distance(base, cursor);
            const ang = (((Math.atan2(-(cursor.y - base.y), cursor.x - base.x) * 180) / Math.PI) + 360) % 360;
            text = `Ortho: ${cal ? `${fmt(lengthInMetres(d, cal), 3)} m` : `${fmt(d, 1)} u`} < ${Math.round(ang)}°`;
          }
          return text ? (
            <div className="pointer-events-none absolute z-30 rounded-sm bg-neutral-700/90 px-1.5 py-0.5 text-[11px] text-white"
              style={{ left: screenCursor.x + 16, top: screenCursor.y + 14 }}>{text}</div>
          ) : null;
        })()}
        {!readOnly && screenCursor && !panelTool && (
          <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
            <div className="absolute inset-x-0" style={{ top: screenCursor.y, height: 1, background: ink }} />
            <div className="absolute inset-y-0" style={{ left: screenCursor.x, width: 1, background: ink }} />
            <div className="absolute rounded-full" style={{ left: screenCursor.x - 12, top: screenCursor.y - 12, width: 25, height: 25, border: `1.5px solid ${hoverSnap ? "#16a34a" : ink}` }} />
          </div>
        )}
        {panelTool && takeoffTarget && onStartTakeoff && (() => {
          const t = takeoffTarget(panelTool);
          return (
            <TakeoffStartPanel
              key={panelTool}
              tool={panelTool}
              cad={!!cad}
              defaultName={t.defaultName}
              target={t}
              onCancel={() => setPanelTool(null)}
              onStart={async (cfg) => {
                await onStartTakeoff(cfg);
                setPanelTool(null);
                setDrawMode(cfg.mode);
                setTool(cfg.tool);
                svgRef.current?.focus();
              }}
            />
          );
        })()}
        {measuring && activeTakeoff && tool !== "calibrate" && tool !== "point" && !panelTool && (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/95 px-2 py-1 text-xs shadow">
            <span className="h-3 w-3 rounded-sm" style={{ background: activeTakeoff.color }} />
            <span className="max-w-[14rem] truncate font-medium">{activeTakeoff.name}</span>
            <span className="tabular-nums text-primary">{activeTakeoff.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeTakeoff.unit}</span>
            {(() => {
              // Switch the draw mode without reopening the tool (a half-drawn shape is dropped).
              const modes = tool in TOOL_META ? drawModesFor(tool as TakeoffTool, !!cad) : [];
              if (modes.length < 2) return null;
              return (
                <div className="flex rounded-md border border-input p-0.5" role="radiogroup" aria-label="Draw mode">
                  {modes.map(([m, label, Icon]) => (
                    <button key={m} type="button" role="radio" aria-checked={drawMode === m} aria-label={label} title={label}
                      onClick={() => { cancelDraft(); setPickMsg(null); setPickPreview(null); setCadPending(null); setDrawMode(m); svgRef.current?.focus(); }}
                      className={cn("flex h-6 w-7 items-center justify-center rounded", drawMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              );
            })()}
            <button className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { cancelDraft(); setTool("pan"); }}>Stop (Esc)</button>
          </div>
        )}
        {cadPending && (
          <div role="dialog" aria-label="Add CAD selection" className="absolute bottom-3 left-1/2 z-30 w-[min(28rem,90%)] -translate-x-1/2 rounded-md border border-border bg-background p-3 text-xs shadow-lg">
            <p className="font-semibold">
              {cadPending.objs.length} {cadPending.by === "block" ? `× block ${cadPending.ref.block}` : cadPending.by === "hatch" ? `hatches ${cadPending.ref.pattern}` : `${cadPending.ref.type.toLowerCase()} objects`} on {cadPending.ref.layer}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Total {fmt(cadPending.objs.reduce((t, o) => t + cadQty(o), 0), cadKind === "count" ? 0 : 3)} {cadUnit}
              {cadKind === "count" ? "" : ` in ${cadPending.objs.length} measurement${cadPending.objs.length === 1 ? "" : "s"}`} · whole drawing, visible layers only
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCadPending(null)}>Cancel</Button>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { emitCad(cadPending.objs, cadPending.ref, cadPending.by); setCadPending(null); }}>
                Add {cadPending.objs.length}
              </Button>
            </div>
          </div>
        )}
        {liveText && tool !== "dimension" && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[42%] truncate rounded-md bg-background/95 px-2 py-1 text-xs shadow" title={liveText}>{liveText}</div>
        )}
      </div>

      {/* Status bar: coordinates, snap and ortho */}
      <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap border-t border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {cursor && cad
            ? (() => { const m = toModel(cad.frame, cursor); return `X ${fmt(m.x, 1)} · Y ${fmt(m.y, 1)}${cad.model.insUnits === 4 ? " mm" : ""}`; })()
            : cursor
            ? cal
              ? `X ${fmt(lengthInMetres(cursor.x, cal), 3)} m · Y ${fmt(lengthInMetres(cursor.y, cal), 3)} m`
              : `X ${fmt(cursor.x, 1)} · Y ${fmt(cursor.y, 1)} (page units)`
            : "X — · Y —"}
        </span>
        {measuring && hoverSnap && <span className="font-medium text-emerald-700 dark:text-emerald-400">{SNAP_LABEL[hoverSnap.kind]}</span>}
        {activeHint && !readOnly && <span className="hidden min-w-0 flex-1 truncate lg:inline">{activeHint}</span>}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-pressed={snapOn} onClick={() => setSnapOn((s) => !s)}
              title={vectorCount === 0 ? "This page has no vector lines (scanned PDF?), so there is nothing to snap to" : "Snap to lines in the PDF (S). Hold Alt to place a point freely."}
              className={cn("flex items-center gap-1 rounded px-2 py-0.5", snapOn ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
              <Magnet className="h-3 w-3" /> {cad ? "Snap" : "PDF Snap"}: {snapOn ? "On" : "Off"}{!measuring && snapOn && <span className="text-muted-foreground"> (pick a tool)</span>}
              {snapOn && vectorCount !== null && <span className="text-muted-foreground">({vectorCount === 0 ? "no vectors" : `${fmt(vectorCount, 0)} lines`})</span>}
            </button>
            <button type="button" aria-pressed={orthoOn} onClick={() => setOrthoOn((o) => !o)}
              title="Keep segments horizontal or vertical (O). Hold Shift for one segment."
              className={cn("flex items-center gap-1 rounded px-2 py-0.5", orthoOn ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
              <SquareDashedMousePointer className="h-3 w-3" /> Ortho: {orthoOn ? "On" : "Off"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
