"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BoxModeIcon, PointModeIcon } from "@/components/qs/qto/takeoff-icons";

export type DrawMode = "points" | "box";
export type TakeoffTool = "length" | "polyline" | "area" | "perimeter" | "count";

export interface TakeoffConfig {
  tool: TakeoffTool;
  name: string;
  color: string;
  opacity: number;
  unit: string;
  mode: DrawMode;
}

export interface TakeoffTarget {
  /** Item that will receive the measurements, when one is selected and has a compatible unit. */
  existingName: string | null;
  /** Its current total in `unit`. */
  total: number;
  color: string | null;
  opacity: number | null;
}

export const TOOL_META: Record<TakeoffTool, { title: string; types: string[]; unit: string; unitLabel: string; measure: string; boxMode: boolean; color: string }> = {
  area: { title: "Area", types: ["Flat area"], unit: "m2", unitLabel: "m²", measure: "Area", boxMode: true, color: "#22c55e" },
  perimeter: { title: "Perimeter", types: ["Closed perimeter"], unit: "m", unitLabel: "m", measure: "Length", boxMode: true, color: "#0d9488" },
  length: { title: "Linear", types: ["Straight length"], unit: "m", unitLabel: "m", measure: "Length", boxMode: false, color: "#2563eb" },
  polyline: { title: "Segment", types: ["Polyline length"], unit: "m", unitLabel: "m", measure: "Length", boxMode: false, color: "#2563eb" },
  count: { title: "Count", types: ["Each"], unit: "No.", unitLabel: "No.", measure: "Count", boxMode: false, color: "#ea580c" },
};

const SWATCHES = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#06b6d4", "#14b8a6", "#64748b"];

export function TakeoffStartPanel({ tool, defaultName, target, onStart, onCancel }: {
  tool: TakeoffTool;
  defaultName: string;
  target: TakeoffTarget;
  onStart: (cfg: TakeoffConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const meta = TOOL_META[tool];
  const [name, setName] = useState(target.existingName ?? defaultName);
  const [color, setColor] = useState(target.color ?? meta.color);
  const [opacity, setOpacity] = useState(target.opacity ?? 0.35);
  const [mode, setMode] = useState<DrawMode>("points");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await onStart({ tool, name: name.trim() || defaultName, color, opacity, unit: meta.unit, mode: meta.boxMode ? mode : "points" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`New ${meta.title}`}
      className="absolute left-3 top-3 z-30 w-[22rem] rounded-lg border border-border bg-background text-sm shadow-xl"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); void start(); }
      }}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
        <span className="font-semibold">{target.existingName ? `Add to ${meta.title}` : `New ${meta.title}`}</span>
        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onCancel} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-3 p-3">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Name</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} disabled={!!target.existingName} />
        </label>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Measurement type</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" defaultValue={meta.types[0]}>
              {meta.types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <div className="grid gap-1">
            <span className="text-xs font-semibold">Colour</span>
            <div className="flex items-center gap-1">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5" aria-label="Colour" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
              className={cn("h-5 w-5 rounded-sm border", color.toLowerCase() === c ? "ring-2 ring-primary ring-offset-1" : "border-black/10")} style={{ background: c }} />
          ))}
        </div>

        {tool !== "length" && tool !== "polyline" && tool !== "count" && (
          <label className="grid gap-1">
            <span className="flex justify-between text-xs font-semibold">Fill opacity <span className="font-normal text-muted-foreground">{Math.round(opacity * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="accent-primary" />
          </label>
        )}

        <div className="rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold">Measurements</div>
        <div className="grid grid-cols-[1fr_96px] items-end gap-3">
          <div className="grid gap-1">
            <span className="flex justify-between text-xs font-semibold">Measurement 1 <span className="font-normal tabular-nums text-primary">{target.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" disabled><option>{meta.measure}</option></select>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Units 1</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" disabled><option>{meta.unitLabel}</option></select>
          </label>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Measurements are saved to the {target.existingName ? "selected" : "new"} take-off item as evidence; the quantity is set by its calculation.
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          {meta.boxMode ? (
            <div className="flex rounded-md border border-input p-0.5" role="radiogroup" aria-label="Draw mode">
              {([["points", "Point to point", PointModeIcon], ["box", "Box mode", BoxModeIcon]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} aria-label={label} title={label} onClick={() => setMode(m)}
                  className={cn("flex h-7 w-8 items-center justify-center rounded", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  <Icon />
                </button>
              ))}
            </div>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={() => void start()} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Start Takeoff
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
