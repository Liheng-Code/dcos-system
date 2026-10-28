"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BoxModeIcon, LayerSelectIcon, PickObjectIcon, PointModeIcon, SameBlockIcon, SameHatchIcon, SmartPickIcon, TraceLayerIcon } from "@/components/qs/qto/takeoff-icons";
import { VOLUME_LABEL, validVolume, type VolumeSpec } from "@/lib/qs/qto/measured-quantity";

/**
 * points / box draw by hand; pick traces the closed area around a click; hatch picks every area with
 * one hatch. CAD drawings add object (one drawn object, exact), layer (every object of that type on
 * its layer), trace (every closed boundary drawn on a chosen layer, joining loose lines) and block
 * (every insert of a block, for counts); there "hatch" matches the HATCH pattern name.
 */
export type DrawMode = "points" | "box" | "pick" | "hatch" | "object" | "layer" | "trace" | "block";

type ModeOption = readonly [DrawMode, string, (p: { size?: number }) => React.ReactElement];

/** Draw modes offered for a tool, on a PDF or a CAD drawing. */
export function drawModesFor(tool: TakeoffTool, cad: boolean): ModeOption[] {
  const areaPdf: ModeOption[] = [
    ["points", "Point to point", PointModeIcon],
    ["box", "Box mode", BoxModeIcon],
    ["pick", "Smart pick: click inside a closed area", SmartPickIcon],
    ["hatch", "Same hatch: every area with the hatch you click", SameHatchIcon],
  ];
  if (!cad) return TOOL_META[tool].boxMode ? areaPdf : [];
  if (tool === "area" || tool === "perimeter") {
    return [
      ["object", "Pick object: click a closed polyline, circle or hatch (exact CAD geometry)", PickObjectIcon],
      ["layer", "All on layer: every object of that type on the layer you click", LayerSelectIcon],
      ["trace", "Trace: pick a line on the drawing, the closed boundary it draws becomes an area (a closed polyline, or lines that meet)", TraceLayerIcon],
      ["hatch", "Same hatch: every hatch with the same pattern on the same layer", SameHatchIcon],
      ...areaPdf.slice(0, 3),
    ];
  }
  if (tool === "length" || tool === "polyline") {
    return [
      ["object", "Pick object: click a line, polyline or arc (exact length)", PickObjectIcon],
      ["layer", "All on layer: total length of that type on the layer you click", LayerSelectIcon],
      ["trace", "Trace: pick a line on the drawing, it is measured with every line joined end to end with it", TraceLayerIcon],
      ["points", "Point to point", PointModeIcon],
    ];
  }
  return [
    ["block", "Same block: click a block to count every insert of it", SameBlockIcon],
    ["points", "Click each element", PointModeIcon],
  ];
}
export type TakeoffTool = "length" | "polyline" | "area" | "perimeter" | "count";

export interface TakeoffConfig {
  tool: TakeoffTool;
  name: string;
  color: string;
  opacity: number;
  unit: string;
  mode: DrawMode;
  /** Set when the item is a volume (unit m3) built from these measurements. */
  volume: VolumeSpec | null;
  /** Create a new take-off item even though one is selected. */
  newItem: boolean;
}

export interface TakeoffTarget {
  /** Item that will receive the measurements, when one is selected and has a compatible unit. */
  existingName: string | null;
  /** Its current total in `unit`. */
  total: number;
  color: string | null;
  opacity: number | null;
  /** Volume dimensions of the existing item, when it is a volume. */
  volume?: VolumeSpec | null;
}

export const TOOL_META: Record<TakeoffTool, { title: string; types: string[]; unit: string; unitLabel: string; measure: string; boxMode: boolean; color: string; volume?: VolumeSpec["mode"] }> = {
  area: { title: "Area", types: ["Flat area"], unit: "m2", unitLabel: "m²", measure: "Area", boxMode: true, color: "#22c55e", volume: "area_depth" },
  perimeter: { title: "Perimeter", types: ["Closed perimeter"], unit: "m", unitLabel: "m", measure: "Length", boxMode: true, color: "#0d9488" },
  length: { title: "Linear", types: ["Straight length"], unit: "m", unitLabel: "m", measure: "Length", boxMode: false, color: "#2563eb", volume: "length_width_depth" },
  polyline: { title: "Segment", types: ["Polyline length"], unit: "m", unitLabel: "m", measure: "Length", boxMode: false, color: "#2563eb", volume: "length_width_depth" },
  count: { title: "Count", types: ["Each"], unit: "No.", unitLabel: "No.", measure: "Count", boxMode: false, color: "#ea580c" },
};

const SWATCHES = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#06b6d4", "#14b8a6", "#64748b"];

export function TakeoffStartPanel({ tool, defaultName, target, onStart, onCancel, cad = false }: {
  tool: TakeoffTool;
  /** Measuring a CAD drawing: offers the CAD selection modes first. */
  cad?: boolean;
  defaultName: string;
  target: TakeoffTarget;
  onStart: (cfg: TakeoffConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const meta = TOOL_META[tool];
  // With an item selected, the panel can add to it or start a new take-off (which unlocks the type).
  const [addToExisting, setAddToExisting] = useState(!!target.existingName);
  const [name, setName] = useState(defaultName);
  const shownName = addToExisting ? target.existingName ?? "" : name;
  const [color, setColor] = useState(target.color ?? meta.color);
  const [opacity, setOpacity] = useState(target.opacity ?? 0.35);
  const modes = drawModesFor(tool, cad);
  const [mode, setMode] = useState<DrawMode>(modes[0]?.[0] ?? "points");
  const [busy, setBusy] = useState(false);
  // Measurement type: the tool's own unit, or a volume built from its measurements.
  const [isVolume, setIsVolume] = useState(!!target.volume);
  const locked = addToExisting;
  const [depth, setDepth] = useState(target.volume?.depth ?? "");
  const [width, setWidth] = useState(target.volume?.mode === "length_width_depth" ? target.volume.width : "");
  const volume: VolumeSpec | null = !isVolume || !meta.volume ? null
    : meta.volume === "area_depth" ? { mode: "area_depth", depth: depth.trim() }
    : { mode: "length_width_depth", width: width.trim(), depth: depth.trim() };
  const volumeOk = !isVolume || validVolume(volume);

  async function start() {
    if (!volumeOk) return;
    setBusy(true);
    try {
      await onStart({
        tool, name: name.trim() || defaultName, color, opacity, unit: isVolume ? "m3" : meta.unit,
        mode: modes.length ? mode : "points", volume, newItem: !addToExisting,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`New ${meta.title}`}
      className="absolute left-3 top-3 z-30 max-h-[calc(100%-1.5rem)] w-[26rem] max-w-[calc(100%-1.5rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-background text-sm shadow-xl"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); void start(); }
      }}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-muted/60 px-3 py-1.5">
        <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
        <span className="font-semibold">{addToExisting ? `Add to ${meta.title}` : `New ${meta.title}`}</span>
        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onCancel} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-3 p-3">
        {target.existingName && (
          <div className="grid grid-cols-2 gap-1 rounded-md border border-input p-0.5 text-xs" role="radiogroup" aria-label="Take-off target">
            {([[true, "Add to selected item"], [false, "New takeoff"]] as const).map(([v, label]) => (
              <button key={label} type="button" role="radio" aria-checked={addToExisting === v}
                onClick={() => { setAddToExisting(v); if (v) setIsVolume(!!target.volume); }}
                className={cn("rounded px-2 py-1", addToExisting === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Name</span>
          <Input autoFocus value={shownName} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} disabled={locked} />
        </label>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Measurement type</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={isVolume ? "volume" : "base"}
              disabled={locked} aria-label="Measurement type"
              title={locked ? "Choose “New takeoff” to pick another measurement type" : undefined}
              onChange={(e) => setIsVolume(e.target.value === "volume")}>
              <option value="base">{meta.types[0]}</option>
              {meta.volume && <option value="volume">{VOLUME_LABEL[meta.volume]}</option>}
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

        {isVolume && meta.volume && (
          <div className="grid grid-cols-2 gap-3">
            {meta.volume === "length_width_depth" && (
              <label className="grid gap-1">
                <span className="text-xs font-semibold">Width (m) *</span>
                <Input inputMode="decimal" value={width} placeholder="e.g. 0.50" onChange={(e) => setWidth(e.target.value)} />
              </label>
            )}
            <label className="grid gap-1">
              <span className="text-xs font-semibold">{meta.volume === "area_depth" ? "Depth / thickness (m) *" : "Depth (m) *"}</span>
              <Input inputMode="decimal" value={depth} placeholder="e.g. 0.30" onChange={(e) => setDepth(e.target.value)} />
            </label>
            <p className="col-span-2 -mt-1 text-[11px] text-muted-foreground">
              {meta.volume === "area_depth" ? "Quantity = Σ measured areas × depth (rule VOL-AT)." : "Quantity = Σ measured lengths × width × depth (rule VOL-LWD)."}
            </p>
          </div>
        )}

        <div className="rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold">Measurements</div>
        <div className="grid grid-cols-[1fr_96px] items-end gap-3">
          <div className="grid gap-1">
            <span className="flex justify-between text-xs font-semibold">Measurement 1 <span className="font-normal tabular-nums text-primary">{(addToExisting ? target.total : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" disabled><option>{isVolume ? "Volume" : meta.measure}</option></select>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Units 1</span>
            <select className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" disabled><option>{isVolume ? "m³" : meta.unitLabel}</option></select>
          </label>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Measurements are saved to the {addToExisting ? "selected" : "new"} take-off item as evidence; the quantity is set by its calculation.
        </p>

        {mode === "trace" && (
          <p className="text-[11px] text-muted-foreground">
            After Start, pick a line on the drawing (hover to preview); only what that line draws is added, and each pick adds one.{" "}
            {tool === "length" || tool === "polyline" ? "The line is measured with every line on its layer joined end to end with it." : "A closed polyline or circle is taken as drawn; loose lines that meet are joined into the area the line encloses; boundaries inside it are openings."}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {modes.length ? (
            <div className="flex rounded-md border border-input p-0.5" role="radiogroup" aria-label="Draw mode">
              {modes.map(([m, label, Icon]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} aria-label={label} title={label} onClick={() => setMode(m)}
                  className={cn("flex h-7 w-8 items-center justify-center rounded", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  <Icon />
                </button>
              ))}
            </div>
          ) : <span />}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={() => void start()} disabled={busy || !volumeOk} title={volumeOk ? undefined : "Enter the volume dimensions"}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Start Takeoff
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
