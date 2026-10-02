"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  MousePointer2,
  Ruler,
  Route,
  Square,
  RotateCcw,
  Plus,
  Minus,
  Maximize,
  Crosshair,
  Type,
  Loader2,
  MoveRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QtoMeasureType, QtoMeasurement } from "@/lib/qs/qto-service";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

export type ViewerTool = QtoMeasureType | "pan" | "calibrate";

export interface Calibration {
  pxLength: number;
  realLength: number;
  unit: string;
}

export interface EmittedMeasurement {
  measure_type: QtoMeasureType;
  points: { x: number; y: number }[];
  length: number | null;
  area: number | null;
  count: number | null;
  unit: string | null;
  page_no: number | null;
}

interface DrawingViewerProps {
  url: string;
  pageNo?: number;
  calibration?: Calibration | null;
  onCalibrationChange?: (c: Calibration | null) => void;
  onMeasure?: (m: EmittedMeasurement) => void;
  savedMeasurements?: QtoMeasurement[];
  compact?: boolean;
}

const TOOL_OPTIONS: { key: ViewerTool; label: string; icon: typeof Ruler }[] = [
  { key: "pan", label: "Pan", icon: MousePointer2 },
  { key: "length", label: "Length", icon: Ruler },
  { key: "polyline", label: "Polyline", icon: Route },
  { key: "area", label: "Area", icon: Square },
  { key: "perimeter", label: "Perimeter", icon: RotateCcw },
  { key: "count", label: "Count", icon: Plus },
  { key: "point", label: "Point", icon: Crosshair },
  { key: "calibrate", label: "Scale", icon: MoveRight },
];

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polygonArea(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += distance(pts[i], pts[(i + 1) % pts.length]);
  }
  return sum;
}

function toUnits(px: number, calibration: Calibration | null | undefined) {
  if (!calibration || calibration.pxLength <= 0) return null;
  return Math.round((px / calibration.pxLength) * calibration.realLength * 1000) / 1000;
}

export function DrawingViewer({
  url,
  pageNo,
  calibration,
  onCalibrationChange,
  onMeasure,
  savedMeasurements,
  compact,
}: DrawingViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(pageNo ?? 1);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<ViewerTool>("length");

  const [draftPts, setDraftPts] = useState<{ x: number; y: number }[]>([]);
  const [draftCursor, setDraftCursor] = useState<{ x: number; y: number } | null>(null);
  const [calibPts, setCalibPts] = useState<{ x: number; y: number }[]>([]);
  const [count, setCount] = useState(0);
  const dragging = useRef(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);

  const renderPage = useCallback(async (pageNumber: number) => {
    const doc = pdfRef.current;
    if (!doc) return;
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 2 });
    setPageSize({ w: base.width, h: base.height });
    const viewport = page.getViewport({ scale: 2 });
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport }).promise;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load drawing file");
        const buf = await res.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        const target = Math.min(pageNo ?? 1, doc.numPages);
        setCurrentPage(target);
        await renderPage(target);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to open drawing");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (pageNo && pageNo !== currentPage && pdfRef.current) {
      setCurrentPage(pageNo);
      renderPage(pageNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNo]);

  const toNatural = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const finishMeasure = useCallback(() => {
    if (!onMeasure) return;
    if (tool === "count") {
      if (count > 0) {
        onMeasure({
          measure_type: "count",
          points: [],
          length: null,
          area: null,
          count,
          unit: "No.",
          page_no: currentPage,
        });
        setCount(0);
      }
      return;
    }
    if (tool === "length") {
      if (draftPts.length === 2) {
        const px = distance(draftPts[0], draftPts[1]);
        onMeasure({
          measure_type: "length",
          points: draftPts,
          length: calibration ? toUnits(px, calibration) : null,
          area: null,
          count: null,
          unit: calibration ? calibration.unit : null,
          page_no: currentPage,
        });
      }
      setDraftPts([]);
      return;
    }
    if (tool === "polyline") {
      if (draftPts.length >= 2) {
        const px = draftPts.reduce((acc, p, i) => (i === 0 ? 0 : acc + distance(draftPts[i - 1], p)), 0);
        onMeasure({
          measure_type: "polyline",
          points: draftPts,
          length: calibration ? toUnits(px, calibration) : null,
          area: null,
          count: null,
          unit: calibration ? calibration.unit : null,
          page_no: currentPage,
        });
      }
      setDraftPts([]);
      return;
    }
    if (tool === "area" || tool === "perimeter") {
      if (draftPts.length >= 3) {
        onMeasure({
          measure_type: tool,
          points: draftPts,
          length: tool === "perimeter" ? (calibration ? toUnits(polygonPerimeter(draftPts), calibration) : null) : null,
          area: tool === "area" ? (calibration ? toUnits(polygonArea(draftPts), calibration) : null) : null,
          count: null,
          unit: calibration ? (tool === "area" ? calibration.unit : calibration.unit) : null,
          page_no: currentPage,
        });
      }
      setDraftPts([]);
      return;
    }
    if (tool === "point") {
      if (draftPts.length === 1) {
        onMeasure({
          measure_type: "point",
          points: draftPts,
          length: null,
          area: null,
          count: null,
          unit: null,
          page_no: currentPage,
        });
      }
      setDraftPts([]);
      return;
    }
    if (tool === "calibrate") {
      if (calibPts.length === 2) {
        const px = distance(calibPts[0], calibPts[1]);
        onCalibrationChange?.({ pxLength: px, realLength: 1, unit: "m" });
      }
      setCalibPts([]);
    }
  }, [tool, draftPts, calibPts, count, calibration, currentPage, onMeasure, onCalibrationChange]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = toNatural(e);
    if (tool === "pan") {
      dragging.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "calibrate") {
      setCalibPts((p) => (p.length >= 2 ? [pt] : [...p, pt]));
      return;
    }
    if (tool === "count") {
      setCount((c) => c + 1);
      return;
    }
    if (tool === "length") {
      if (draftPts.length === 0) {
        setDraftPts([pt]);
      } else {
        const complete = [draftPts[0], pt];
        const px = distance(complete[0], complete[1]);
        onMeasure?.({
          measure_type: "length",
          points: complete,
          length: calibration ? toUnits(px, calibration) : null,
          area: null,
          count: null,
          unit: calibration ? calibration.unit : null,
          page_no: currentPage,
        });
        setDraftPts([]);
      }
      return;
    }
    if (tool === "polyline" || tool === "area" || tool === "perimeter") {
      setDraftPts((p) => [...p, pt]);
      return;
    }
    if (tool === "point") {
      setDraftPts([pt]);
      setTimeout(finishMeasure, 0);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "pan" && dragging.current && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "polyline" || tool === "area" || tool === "perimeter" || tool === "length") {
      setDraftCursor(toNatural(e));
    }
  };

  const handlePointerUp = () => {
    dragging.current = false;
    panStart.current = null;
  };

  const goPage = (p: number) => {
    const target = Math.max(1, Math.min(p, numPages));
    setCurrentPage(target);
    renderPage(target);
  };

  const fit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const liveLength = draftCursor && draftPts.length === 1 ? distance(draftPts[0], draftCursor) : null;
  const livePolyLength = draftCursor && draftPts.length >= 1
    ? draftPts.reduce((acc, p, i) => (i === 0 ? 0 : acc + distance(draftPts[i - 1], p)), 0) + distance(draftPts[draftPts.length - 1], draftCursor)
    : null;
  const liveArea = draftCursor && draftPts.length >= 2
    ? polygonArea([...draftPts, draftCursor])
    : null;

  const activeMeasurement = draftPts.length > 0;

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-background px-2 py-1.5">
        {TOOL_OPTIONS.slice(0, compact ? 4 : 8).map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              title={opt.label}
              onClick={() => {
                setTool(opt.key);
                setDraftPts([]);
                setCalibPts([]);
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                tool === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(5, z + 0.15))} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fit} title="Fit drawing">
            <Maximize className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)}>
              Prev
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {currentPage} / {numPages}
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= numPages} onClick={() => goPage(currentPage + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {calibration && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <Type className="h-3.5 w-3.5" />
          Scale: {calibration.pxLength.toFixed(1)}px = {calibration.realLength} {calibration.unit}
          <button className="underline hover:text-foreground" onClick={() => onCalibrationChange?.(null)}>
            Clear
          </button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-muted/30">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading drawing...
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
            left: "50%",
            top: "50%",
            marginLeft: -(pageSize?.w ?? 0) / 2,
            marginTop: -(pageSize?.h ?? 0) / 2,
          }}
        >
          <div ref={pageBoxRef} className="relative shadow-lg">
            <canvas ref={canvasRef} className="block" />
            <svg
              width={pageSize?.w ?? 0}
              height={pageSize?.h ?? 0}
              className="absolute inset-0"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={finishMeasure}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishMeasure();
                if (e.key === "Escape") {
                  setDraftPts([]);
                  setCalibPts([]);
                }
              }}
              tabIndex={0}
              style={{ cursor: tool === "pan" ? "grab" : tool === "calibrate" ? "crosshair" : "crosshair" }}
            >
              {/* saved measurements */}
              {(savedMeasurements ?? [])
                .filter((m) => m.page_no === currentPage && Array.isArray(m.points))
                .map((m, i) => {
                  const pts = (m.points ?? []) as { x: number; y: number }[];
                  if (pts.length === 0) return null;
                  const isClosed = m.measure_type === "area" || m.measure_type === "perimeter";
                  const ptsForShape = isClosed && pts.length >= 2 ? [...pts, pts[0]] : pts;
                  return (
                    <polyline
                      key={m.id ?? i}
                      points={ptsForShape.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={m.measure_type === "area" ? "rgba(37,99,235,0.12)" : "none"}
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      pointerEvents="none"
                    />
                  );
                })}

              {/* draft measurement */}
              {tool === "length" && draftPts.length === 1 && draftCursor && (
                <line x1={draftPts[0].x} y1={draftPts[0].y} x2={draftCursor.x} y2={draftCursor.y} stroke="#dc2626" strokeWidth={2} />
              )}
              {tool === "length" && draftPts.length === 2 && (
                <line x1={draftPts[0].x} y1={draftPts[0].y} x2={draftPts[1].x} y2={draftPts[1].y} stroke="#dc2626" strokeWidth={2} />
              )}
              {(tool === "polyline" || tool === "area" || tool === "perimeter") && draftPts.length > 0 && (
                <polyline
                  points={[...draftPts, ...(draftCursor ? [draftCursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={tool === "area" && draftPts.length >= 2 ? "rgba(220,38,38,0.12)" : "none"}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray={draftCursor ? "6 3" : undefined}
                />
              )}
              {(tool === "area" || tool === "perimeter") && draftPts.length >= 3 && draftCursor && (
                <line x1={draftPts[draftPts.length - 1].x} y1={draftPts[draftPts.length - 1].y} x2={draftPts[0].x} y2={draftPts[0].y} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" />
              )}
              {draftPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#dc2626" stroke="#fff" strokeWidth={1} />
              ))}
              {tool === "calibrate" && calibPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#16a34a" stroke="#fff" strokeWidth={1} />
              ))}
              {tool === "calibrate" && calibPts.length === 2 && (
                <line x1={calibPts[0].x} y1={calibPts[0].y} x2={calibPts[1].x} y2={calibPts[1].y} stroke="#16a34a" strokeWidth={2} strokeDasharray="6 3" />
              )}
              {tool === "count" && count > 0 && (
                <text x={pageSize ? pageSize.w - 12 : 0} y={pageSize ? pageSize.h - 12 : 0} textAnchor="end" fill="#dc2626" fontSize={16} fontWeight={700}>
                  Count: {count}
                </text>
              )}
            </svg>

            {(activeMeasurement || (tool === "count" && count > 0)) && (
              <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs shadow">
                {tool === "length" && liveLength !== null && calibration && `Length: ${toUnits(liveLength, calibration)} ${calibration.unit}`}
                {tool === "polyline" && livePolyLength !== null && calibration && `Length: ${toUnits(livePolyLength, calibration)} ${calibration.unit}`}
                {tool === "area" && liveArea !== null && calibration && `Area: ${toUnits(liveArea, calibration)} ${calibration.unit}²`}
                {tool === "perimeter" && livePolyLength !== null && calibration && `Perimeter: ${toUnits(livePolyLength, calibration)} ${calibration.unit}`}
                {tool === "calibrate" && calibPts.length === 2 && `Reference: ${distance(calibPts[0], calibPts[1]).toFixed(1)}px`}
                {tool === "count" && `Count: ${count}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
