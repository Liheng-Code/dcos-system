"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  Loader2,
  Magnet,
  Moon,
  Sun,
  Maximize,
  Minus,
  Plus,
  SquareDashedMousePointer,
  Undo2,
  X,
} from "lucide-react";
import {
  AreaIcon, CountIcon, LengthIcon, PerimeterIcon, PointIcon, PolylineIcon, ScaleIcon,
} from "@/components/qs/qto/takeoff-icons";
import {
  TOOL_META, TakeoffStartPanel, type DrawMode, type TakeoffConfig, type TakeoffTarget, type TakeoffTool,
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
  SnapIndex,
  drawingScaleFromCalibration,
  extractSegments,
  findSnap,
  orthogonal,
  type Matrix,
  type OpCodes,
  type Snap,
} from "@/lib/qs/qto/pdf-snap";
import { hitTest } from "@/lib/qs/qto/hit-test";

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

export type ViewerTool = QtoMeasureType | "pan" | "calibrate";

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
}

export interface SavedShape {
  id: string;
  /** Take-off item the measurement belongs to (clicking the shape selects it). */
  itemId: string;
  page_no: number | null;
  measure_type: string;
  points: Pt[];
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
  onSelectItem?: (itemId: string | null) => void;
  /** The item being measured into, shown as a chip while a tool is active. */
  activeTakeoff?: { name: string; color: string; total: number; unit: string } | null;
}

const TOOL_OPTIONS: { key: ViewerTool; label: string; icon: (p: { size?: number }) => React.ReactElement; hint: string }[] = [
  { key: "calibrate", label: "Scale", icon: ScaleIcon, hint: "Click both ends of a known dimension (snaps to the dimension line)" },
  { key: "area", label: "Area", icon: AreaIcon, hint: "Click the corners, double-click or Enter to close" },
  { key: "length", label: "Linear", icon: LengthIcon, hint: "Click two points" },
  { key: "polyline", label: "Segment", icon: PolylineIcon, hint: "Click points, double-click or Enter to finish" },
  { key: "perimeter", label: "Perimeter", icon: PerimeterIcon, hint: "Click the corners, double-click or Enter to close" },
  { key: "count", label: "Count", icon: CountIcon, hint: "Click each element, Enter to finish" },
  { key: "point", label: "Point", icon: PointIcon, hint: "Click a location" },
];

const BOX_HINT = "Box mode: click two opposite corners";

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

export function DrawingViewer({
  url,
  pageNo,
  calibration,
  onCalibrationPicked,
  onPresetScale,
  onMeasure,
  onPageChange,
  savedMeasurements,
  readOnly,
  onStartTakeoff,
  takeoffTarget,
  activeTakeoff,
  onSelectItem,
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

  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pageNo ?? 1);
  /** Page size in PDF page units. */
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  /** Zoom (screen px per page unit) and pan (screen px). */
  const [view, setView] = useState({ zoom: 0.6, x: 0, y: 0 });
  const [tool, setTool] = useState<ViewerTool>("pan");
  const [snapOn, setSnapOn] = useState(true);
  const [orthoOn, setOrthoOn] = useState(false);
  // Black sheet (CAD style) by default: the PDF is colour-inverted, so white paper becomes black and
  // black linework white, while coloured lines keep their hue. Remembered per browser.
  const [darkSheet, setDarkSheet] = useState(() => {
    try { return typeof window === "undefined" || window.localStorage.getItem(SHEET_KEY) !== "light"; } catch { return true; }
  });
  const toggleSheet = () => setDarkSheet((d) => {
    try { window.localStorage.setItem(SHEET_KEY, d ? "light" : "dark"); } catch { /* storage unavailable */ }
    return !d;
  });
  const ink = darkSheet ? "#ffffff" : "#0f172a";
  const [vectorCount, setVectorCount] = useState<number | null>(null);

  const [draftPts, setDraftPts] = useState<Pt[]>([]);
  /** Resolved (snapped / ortho) pointer position in page units. */
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hoverSnap, setHoverSnap] = useState<Snap | null>(null);
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
    setVectorCount(null);
    try {
      const ops = await page.getOperatorList();
      const segments = extractSegments(ops.fnArray, ops.argsArray, pdfjsLib.OPS as unknown as OpCodes, unit.transform as Matrix);
      snapIndexRef.current = new SnapIndex(segments);
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
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        // Keep the page point under the cursor fixed.
        const cx = (sx - v.x) / v.zoom;
        const cy = (sy - v.y) / v.zoom;
        return { zoom, x: sx - cx * zoom, y: sy - cy * zoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [url]);

  /** Pointer position → PDF page units (raw, before snapping). */
  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !pageSize) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * pageSize.w, y: ((e.clientY - rect.top) / rect.height) * pageSize.h };
  };

  /** Applies PDF snap (unless Alt is held) and ortho (toggle or Shift) to a pointer position. */
  const resolve = (e: { clientX: number; clientY: number; altKey: boolean; shiftKey: boolean }): { pt: Pt; snap: Snap | null } => {
    const raw = toPage(e);
    let snap: Snap | null = null;
    let pt = raw;
    if (snapOn && !e.altKey && snapIndexRef.current) {
      snap = findSnap(snapIndexRef.current, raw, SNAP_PX / view.zoom);
      if (snap) pt = snap.point;
    }
    const anchor = draftPts[draftPts.length - 1];
    if ((orthoOn || e.shiftKey) && anchor && tool !== "count" && tool !== "point" && !boxMode) {
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

  const emit = useCallback((type: QtoMeasureType, pts: Pt[]) => {
    if (!onMeasure) return;
    const cal = calibration ? { metresPerUnit: calibration.metresPerUnit } : null;
    const base = { measure_type: type, points: pts, length: null, area: null, count: null, unit: null, page_no: currentPage };
    if (type === "count") onMeasure({ ...base, count: pts.length, unit: "No." });
    else if (type === "point") onMeasure(base);
    else if (type === "area") onMeasure({ ...base, area: cal ? areaInSquareMetres(polygonArea(pts), cal) : null, unit: cal ? "m2" : null });
    else {
      const units = type === "perimeter" ? perimeter(pts) : polylineLength(pts);
      onMeasure({ ...base, length: cal ? lengthInMetres(units, cal) : null, unit: cal ? "m" : null });
    }
  }, [onMeasure, calibration, currentPage]);

  const finish = useCallback(() => {
    const pts = draftPts;
    if (tool === "count" && pts.length > 0) emit("count", pts);
    else if ((tool === "polyline") && pts.length >= 2) emit("polyline", pts);
    else if ((tool === "area" || tool === "perimeter") && pts.length >= 3) emit(tool, pts);
    cancelDraft();
  }, [draftPts, tool, emit]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.focus();
    // Pan with the Pan tool, in read-only mode, or with the middle mouse button in any tool.
    if (tool === "pan" || readOnly || e.button === 1) {
      e.preventDefault();
      pressAt.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      dragging.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
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
    if (tool === "point") {
      emit("point", [pt]);
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

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const { pt, snap } = measuring ? resolve(e) : { pt: toPage(e), snap: null };
    setCursor(pt);
    setHoverSnap(snap);
    if (!readOnly) setScreenCursor({ x: PAGE_OFFSET + view.x + pt.x * view.zoom, y: PAGE_OFFSET + view.y + pt.y * view.zoom });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); finish(); }
    else if (e.key === "Escape") {
      // Esc cancels the measurement in progress; with nothing in progress it returns to Pan.
      if (draftPts.length > 0) cancelDraft();
      else { setTool("pan"); setHoverSnap(null); setScreenCursor(null); }
    }
    else if (e.key === "Backspace" && draftPts.length > 0) { e.preventDefault(); setDraftPts((p) => p.slice(0, -1)); }
    else if (e.key.toLowerCase() === "o" && !e.ctrlKey && !e.metaKey) setOrthoOn((o) => !o);
    else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) setSnapOn((s) => !s);
  };

  const goPage = (p: number) => {
    const target = Math.max(1, Math.min(p, numPages));
    setCurrentPage(target);
    cancelDraft();
    void renderPage(target);
    onPageChange?.(target);
  };

  const zoomBy = (factor: number) => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)) }));

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
    else liveText = `Length: ${fmt(lengthInMetres(polylineLength(live), cal))} m`;
  }
  const tools = readOnly ? [] : TOOL_OPTIONS;
  const activeTool = TOOL_OPTIONS.find((t) => t.key === tool);
  const activeHint = panelTool ? "Set the name, colour and draw mode, then Start Takeoff"
    : boxMode ? BOX_HINT
    : activeTool?.hint ?? "No tool: click a shape to select · drag to move · wheel to zoom";
  const drawingScale = calibration ? drawingScaleFromCalibration(calibration.metresPerUnit) : null;
  const marker = 6 / view.zoom;

  if (!url) {
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
                "flex w-[60px] flex-col items-center gap-0.5 rounded-md border px-1 py-1 text-[11px] font-medium transition-colors",
                active ? "border-primary/40 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={22} />
              <span className="leading-none">{opt.label}</span>
            </button>
          );
        })}
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
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomBy(1 / 1.25)} title="Zoom out (or mouse wheel)">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomBy(1.25)} title="Zoom in (or mouse wheel)">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggleSheet} aria-pressed={darkSheet}
            title={darkSheet ? "Show the drawing on a white sheet" : "Show the drawing on a black sheet"}>
            {darkSheet ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setView({ zoom: 0.6, x: 0, y: 0 })} title="Reset view">
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

      <div className={cn("flex flex-wrap items-center gap-2 border-b border-border px-2 py-1 text-xs",
        calibration ? "bg-muted/40 text-muted-foreground" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200")}>
        {calibration
          ? <>Scale (page {currentPage}): {drawingScale && drawingScale >= 1 ? <b>≈ 1:{fmt(drawingScale, drawingScale < 10 ? 2 : 0)}</b> : null} · 1 page unit = {fmt(calibration.metresPerUnit * 1000, 4)} mm · from a {fmt(calibration.knownDistance)} {calibration.knownUnit} reference</>
          : <>Page {currentPage} is not calibrated. Pick a drawing scale, or use <b>Scale</b> on a known dimension.</>}
        {!readOnly && onPresetScale && (
          <select
            className="h-6 rounded border border-input bg-background px-1 text-xs text-foreground"
            value=""
            aria-label="Set drawing scale"
            title="Sets the scale from the drawing scale. Correct only if the PDF is at true paper size; check a known dimension afterwards."
            onChange={(e) => { if (e.target.value) onPresetScale(Number(e.target.value), currentPage); }}
          >
            <option value="">Drawing scale…</option>
            {DRAWING_SCALES.map((n) => <option key={n} value={n}>1:{n}</option>)}
          </select>
        )}
        {activeHint && !readOnly && <span className="ml-auto hidden lg:inline">{activeHint}</span>}
      </div>

      <div
        ref={viewportRef}
        className={cn("relative flex-1 overflow-hidden", darkSheet ? "bg-neutral-900" : "bg-muted/30")}
        style={{ cursor: readOnly ? undefined : "none" }}
        onPointerMove={(e) => {
          // Off the sheet the cross-hair follows the mouse unsnapped (the sheet sets its own position).
          if (readOnly || svgRef.current?.contains(e.target as Node)) return;
          const r = e.currentTarget.getBoundingClientRect();
          setScreenCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
          setHoverSnap(null);
        }}
        onPointerLeave={() => { setScreenCursor(null); setHoverSnap(null); }}
      >
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
          <div className={cn("relative shadow-lg", darkSheet ? "bg-black" : "bg-white")}>
            <canvas ref={canvasRef} className="block" style={darkSheet ? { filter: "invert(1) hue-rotate(180deg)" } : undefined} />
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
                  dragging.current = false;
                  panStart.current = null;
                  const start = pressAt.current;
                  pressAt.current = null;
                  // A click (not a drag) with no tool selects the shape under the cursor.
                  if (!start || !onSelectItem || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
                  const shapes = (savedMeasurements ?? [])
                    .filter((m) => (m.page_no ?? 1) === currentPage && Array.isArray(m.points))
                    .map((m) => ({ id: m.id, itemId: m.itemId, measureType: m.measure_type, points: m.points }));
                  onSelectItem(hitTest(shapes, toPage(e), 6 / view.zoom)?.itemId ?? null);
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
                  .map((m) => {
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
                  .filter((m) => m.highlighted && (m.page_no ?? 1) === currentPage && m.measure_type !== "count" && m.measure_type !== "point")
                  .flatMap((m) => m.points.map((pt, i) => (
                    <rect key={`h-${m.id}-${i}`} x={pt.x - 3.5 / view.zoom} y={pt.y - 3.5 / view.zoom} width={7 / view.zoom} height={7 / view.zoom}
                      fill="#fff" stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  )))}
                {draftPts.length > 0 && tool !== "count" && (
                  <polyline
                    points={live.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={tool === "area" && live.length >= 3 ? "rgba(220,38,38,0.12)" : "none"}
                    stroke={tool === "calibrate" ? "#16a34a" : "#dc2626"}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
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
                {cursor && measuring && hoverSnap && (
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
            {boxMode && <span className="text-muted-foreground">· box</span>}
            <button className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { cancelDraft(); setTool("pan"); }}>Stop (Esc)</button>
          </div>
        )}
        {liveText && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/95 px-2 py-1 text-xs shadow">{liveText}</div>
        )}
      </div>

      {/* Status bar: coordinates, snap and ortho */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {cursor
            ? cal
              ? `X ${fmt(lengthInMetres(cursor.x, cal), 3)} m · Y ${fmt(lengthInMetres(cursor.y, cal), 3)} m`
              : `X ${fmt(cursor.x, 1)} · Y ${fmt(cursor.y, 1)} (page units)`
            : "X — · Y —"}
        </span>
        {measuring && hoverSnap && <span className="font-medium text-emerald-700 dark:text-emerald-400">{SNAP_LABEL[hoverSnap.kind]}</span>}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-pressed={snapOn} onClick={() => setSnapOn((s) => !s)}
              title={vectorCount === 0 ? "This page has no vector lines (scanned PDF?), so there is nothing to snap to" : "Snap to lines in the PDF (S). Hold Alt to place a point freely."}
              className={cn("flex items-center gap-1 rounded px-2 py-0.5", snapOn ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
              <Magnet className="h-3 w-3" /> PDF Snap: {snapOn ? "On" : "Off"}{!measuring && snapOn && <span className="text-muted-foreground"> (pick a tool)</span>}
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
