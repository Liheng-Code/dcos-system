"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ListPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  emptyLevelItem,
  generateLevelRange,
  inferLevelType,
  LEVEL_TYPES,
  sortLevels,
  type LevelItem,
  type LevelType,
} from "@/lib/level-library";

const cell = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-hidden focus:border-primary disabled:opacity-60";

interface LevelItemsEditorProps {
  items: LevelItem[];
  onChange: (items: LevelItem[]) => void;
  /** Codes to mark as "already in building" (apply preview). */
  existingCodes?: string[];
  disabled?: boolean;
}

/** Editable ordered list of levels (code, name, type, height, GFA) with range generator. */
export function LevelItemsEditor({ items, onChange, existingCodes = [], disabled }: LevelItemsEditorProps) {
  const [showRange, setShowRange] = useState(false);
  const [range, setRange] = useState({ prefix: "L", from: "1", to: "10", pad: "2", nameFormat: "Level {n}", height: "", gfa: "" });
  const existing = new Set(existingCodes.map((c) => c.trim().toUpperCase()));

  function update(index: number, patch: Partial<LevelItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  function addRange() {
    const generated = generateLevelRange({
      prefix: range.prefix,
      from: Number(range.from),
      to: Number(range.to),
      pad: Number(range.pad) || 0,
      nameFormat: range.nameFormat,
      floorHeight: range.height ? Number(range.height) : null,
      gfa: range.gfa ? Number(range.gfa) : null,
    });
    const have = new Set(items.map((i) => i.level_code.trim().toUpperCase()));
    onChange([...items, ...generated.filter((g) => !have.has(g.level_code))]);
    setShowRange(false);
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...items, emptyLevelItem()])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add level
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setShowRange((v) => !v)}>
          <ListPlus className="mr-1 h-3.5 w-3.5" /> Generate range
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || items.length < 2} onClick={() => onChange(sortLevels(items))}>
          <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Sort bottom-up
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} level{items.length === 1 ? "" : "s"}</span>
      </div>

      {showRange && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-7">
          {([
            ["prefix", "Prefix"], ["from", "From"], ["to", "To"], ["pad", "Digits"],
            ["nameFormat", "Name ({n} = number)"], ["height", "Height (m)"], ["gfa", "GFA (m²)"],
          ] as const).map(([key, label]) => (
            <label key={key} className={cn("space-y-1 text-xs text-muted-foreground", key === "nameFormat" && "col-span-2 sm:col-span-1")}>
              {label}
              <input
                value={range[key]}
                type={["from", "to", "pad", "height", "gfa"].includes(key) ? "number" : "text"}
                onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value }))}
                className={cell}
              />
            </label>
          ))}
          <div className="col-span-2 flex items-end gap-2 sm:col-span-7">
            <Button type="button" size="sm" onClick={addRange}>Add levels</Button>
            <span className="text-xs text-muted-foreground">
              e.g. {generateLevelRange({ prefix: range.prefix, from: Number(range.from), to: Number(range.to), pad: Number(range.pad) || 0, nameFormat: range.nameFormat })
                .slice(0, 3).map((g) => g.level_code).join(", ")}…
            </span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-left">#</th>
              <th className="w-28 px-2 py-2 text-left">Code *</th>
              <th className="px-2 py-2 text-left">Name *</th>
              <th className="w-32 px-2 py-2 text-left">Type</th>
              <th className="w-24 px-2 py-2 text-left">Height (m)</th>
              <th className="w-28 px-2 py-2 text-left">GFA (m²)</th>
              <th className="w-24 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">No levels yet. Add a level or generate a range.</td></tr>
            )}
            {items.map((it, i) => {
              const inBuilding = existing.has(it.level_code.trim().toUpperCase());
              return (
                <tr key={i} className={cn("border-t border-border", inBuilding && "bg-amber-50/60 dark:bg-amber-950/20")}>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1">
                    <input
                      value={it.level_code}
                      disabled={disabled}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase();
                        update(i, { level_code: code, level_type: it.level_code ? it.level_type : inferLevelType(code) });
                      }}
                      className={cn(cell, "font-mono")}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input value={it.level_name} disabled={disabled} onChange={(e) => update(i, { level_name: e.target.value })} className={cell} />
                    {inBuilding && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">Already in this building — will be skipped</p>}
                  </td>
                  <td className="px-2 py-1">
                    <select value={it.level_type} disabled={disabled} onChange={(e) => update(i, { level_type: e.target.value as LevelType })} className={cell}>
                      {LEVEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" value={it.floor_height_m ?? ""} disabled={disabled} onChange={(e) => update(i, { floor_height_m: num(e.target.value) })} className={cell} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" step="0.01" value={it.typical_gfa_m2 ?? ""} disabled={disabled} onChange={(e) => update(i, { typical_gfa_m2: num(e.target.value) })} className={cell} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
