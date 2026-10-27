"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  Crosshair,
  Loader2,
  Maximize,
  Minus,
  MousePointer2,
  MoveRight,
  Plus,
  RotateCcw,
  Route,
  Ruler,
  Square,
  Undo2,
  X,
} from "lucide-react";
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

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

/** Canvas pixels per PDF page unit. Points are stored in page units, independent of this and the zoom. */
const RENDER_SCALE = 2;

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
  page_no: number | null;
  measure_type: string;
  points: Pt[];
  highlighted?: boolean;
}

interface DrawingViewerProps {
  url: string | null;
  pageNo?: number;
  calibration?: ActiveCalibration | null;
  /** Two points picked with the Scale tool; the parent asks for the known distance and saves it. */
  onCalibrationPicked?: (c: { points: Pt[]; pageUnits: number; page_no: number }) => void;
  onMeasure?: (m: EmittedMeasurement) => void;
  onPageChange?: (page: number) => void;
  savedMeasurements?: SavedShape[];
  readOnly?: boolean;
}

const TOOL_OPTIONS: { key: ViewerTool; label: string; icon: typeof Ruler; hint: string }[] = [
  { key: "pan", label: "Pan", icon: MousePointer2, hint: "Drag to move the drawing" },
  { key: "length", label: "Length", icon: Ruler, hint: "Click two points" },
  { key: "polyline", label: "Polyline", icon: Route, hint: "Click points, double-click or Enter to finish" },
  { key: "area", label: "Area", icon: Square, hint: "Click the corners, double-click or Enter to close" },
  { key: "perimeter", label: "Perimeter", icon: RotateCcw, hint: "Click the corners, double-click or Enter to close" },
  { key: "count", label: "Count", icon: Plus, hint: "Click each element, Enter to finish" },
  { key: "point", label: "Point", icon: Crosshair, hint: "Click a location" },
  { key: "calibrate", label: "Scale", icon: MoveRight, hint: "Click both ends of a known dimension" },
];

const fmt = (n: number, dp = 3) => n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });

export function DrawingViewer({
  url,
  pageNo,
  calibration,
  onCalibrationPicked,
  onMeasure,
  onPageChange,
  savedMeasurements,
  readOnly,
}: DrawingViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pageNo ?? 1);
  /** Page size in PDF page units. */
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<ViewerTool>(readOnly ? "pan" : "length");

  const [draftPts, setDraftPts] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
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

  /** Pointer position → PDF page units. */
  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !pageSize) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * pageSize.w, y: ((e.clientY - rect.top) / rect.height) * pageSize.h };
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
    if (tool === "pan" || readOnly) {
      dragging.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const pt = toPage(e);
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
    setDraftPts((p) => [...p, pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (draftPts.length > 0) setCursor(toPage(e));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); finish(); }
    else if (e.key === "Escape") cancelDraft();
    else if (e.key === "Backspace" && draftPts.length > 0) { e.preventDefault(); setDraftPts((p) => p.slice(0, -1)); }
  };

  const goPage = (p: number) => {
    const target = Math.max(1, Math.min(p, numPages));
    setCurrentPage(target);
    cancelDraft();
    void renderPage(target);
    onPageChange?.(target);
  };

  const cal = calibration ? { metresPerUnit: calibration.metresPerUnit } : null;
  const live = [...draftPts, ...(cursor ? [cursor] : [])];
  let liveText: string | null = null;
  if (draftPts.length > 0) {
    if (tool === "calibrate") liveText = `Reference: ${fmt(polylineLength(live), 1)} page units`;
    else if (tool === "count") liveText = `Count: ${draftPts.length}`;
    else if (!cal) liveText = "Not calibrated — set the scale first for real units";
    else if (tool === "area") liveText = `Area: ${fmt(areaInSquareMetres(polygonArea(live), cal))} m²`;
    else if (tool === "perimeter") liveText = `Perimeter: ${fmt(lengthInMetres(perimeter(live), cal))} m`;
    else liveText = `Length: ${fmt(lengthInMetres(polylineLength(live), cal))} m`;
  }
  const tools = readOnly ? TOOL_OPTIONS.filter((t) => t.key === "pan") : TOOL_OPTIONS;
  const activeTool = TOOL_OPTIONS.find((t) => t.key === tool);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No PDF is attached to this drawing revision.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-background px-2 py-1.5">
        {tools.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              title={`${opt.label}: ${opt.hint}`}
              aria-pressed={tool === opt.key}
              onClick={() => { setTool(opt.key); cancelDraft(); }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                tool === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{opt.label}</span>
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
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(8, z * 1.2))} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setZoom(0.6); setPan({ x: 0, y: 0 }); }} title="Reset view">
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

      <div className={cn("flex items-center gap-2 border-b border-border px-2 py-1 text-xs",
        calibration ? "bg-muted/40 text-muted-foreground" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200")}>
        {calibration
          ? <>Scale (page {currentPage}): 1 page unit = {fmt(calibration.metresPerUnit * 1000, 4)} mm · set from a {fmt(calibration.knownDistance)} {calibration.knownUnit} dimension</>
          : <>Page {currentPage} is not calibrated. Use <b>Scale</b> on a known dimension before measuring lengths or areas.</>}
        {activeTool && !readOnly && <span className="ml-auto hidden md:inline">{activeTool.hint}</span>}
      </div>

      <div className="relative flex-1 overflow-hidden bg-muted/30">
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
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            left: 16,
            top: 16,
          }}
        >
          <div className="relative bg-white shadow-lg">
            <canvas ref={canvasRef} className="block" />
            {pageSize && (
              <svg
                ref={svgRef}
                width={pageSize.w}
                height={pageSize.h}
                viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}
                className="absolute inset-0 outline-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={() => { dragging.current = false; panStart.current = null; }}
                onDoubleClick={finish}
                onKeyDown={handleKey}
                tabIndex={0}
                role="application"
                aria-label="Drawing measurement surface"
                style={{ cursor: tool === "pan" || readOnly ? "grab" : "crosshair" }}
              >
                {(savedMeasurements ?? [])
                  .filter((m) => (m.page_no ?? 1) === currentPage && Array.isArray(m.points) && m.points.length > 0)
                  .map((m) => {
                    const closed = m.measure_type === "area" || m.measure_type === "perimeter";
                    const color = m.highlighted ? "#ea580c" : "#2563eb";
                    if (m.measure_type === "count" || m.measure_type === "point") {
                      return m.points.map((p, i) => (
                        <circle key={`${m.id}-${i}`} cx={p.x} cy={p.y} r={4 / zoom} fill={color} fillOpacity={0.7} pointerEvents="none" />
                      ));
                    }
                    return (
                      <polyline
                        key={m.id}
                        points={(closed ? [...m.points, m.points[0]] : m.points).map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={m.measure_type === "area" ? (m.highlighted ? "rgba(234,88,12,0.18)" : "rgba(37,99,235,0.12)") : "none"}
                        stroke={color}
                        strokeWidth={m.highlighted ? 3 : 2}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray={m.highlighted ? undefined : "6 3"}
                        pointerEvents="none"
                      />
                    );
                  })}
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
                  <circle key={i} cx={p.x} cy={p.y} r={3.5 / zoom} fill={tool === "calibrate" ? "#16a34a" : "#dc2626"} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                ))}
              </svg>
            )}
          </div>
        </div>
        {liveText && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/95 px-2 py-1 text-xs shadow">{liveText}</div>
        )}
      </div>
    </div>
  );
}
