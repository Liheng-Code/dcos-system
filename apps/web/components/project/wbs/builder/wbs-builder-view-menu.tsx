"use client";

import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  COLUMN_PRESETS,
  DEFAULT_VIEW,
  FIXED_COLUMNS,
  WBS_BUILDER_COLUMNS,
  type WbsColumnKey,
  type WbsDepth,
  type WbsViewPrefs,
} from "./wbs-builder-types";

const DEPTHS: { value: WbsDepth; label: string }[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: "all", label: "All" },
];

const LABELS: Partial<Record<WbsColumnKey, string>> = { wbs_name: "Name" };

const sameSet = (a: WbsColumnKey[], b: WbsColumnKey[]) => a.length === b.length && a.every((x) => b.includes(x));

/** View settings for the WBS builder: depth, activity rows, columns (remembered per user). */
export function WbsBuilderViewMenu({ view, onChange }: { view: WbsViewPrefs; onChange: (view: WbsViewPrefs) => void }) {
  const optional = WBS_BUILDER_COLUMNS.filter((c) => !FIXED_COLUMNS.includes(c.field));
  const preset = COLUMN_PRESETS.find((p) => sameSet(p.columns, view.columns));

  const toggleColumn = (field: WbsColumnKey) =>
    onChange({ ...view, columns: view.columns.includes(field) ? view.columns.filter((c) => c !== field) : [...view.columns, field] });

  const chip = (active: boolean) =>
    cn("rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted");

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted">
        <SlidersHorizontal className="h-3.5 w-3.5" /> View
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <section className="space-y-1.5">
          <p className="text-xs font-semibold">Show levels</p>
          <div className="flex gap-1">
            {DEPTHS.map((d) => (
              <button key={String(d.value)} type="button" onClick={() => onChange({ ...view, depth: d.value })} className={cn(chip(view.depth === d.value), "flex-1")}>
                {d.label}
              </button>
            ))}
          </div>
        </section>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span>
            <span className="font-semibold">Show activities</span>
            <span className="block text-[11px] text-muted-foreground">Read-only, under each package</span>
          </span>
          <input
            type="checkbox"
            checked={view.showActivities}
            onChange={(e) => onChange({ ...view, showActivities: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
        </label>

        <section className="space-y-1.5">
          <p className="text-xs font-semibold">Columns</p>
          <div className="flex flex-wrap gap-1">
            {COLUMN_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => onChange({ ...view, columns: p.columns })} className={chip(preset?.id === p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
            {optional.map((c) => (
              <label key={c.field} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={view.columns.includes(c.field)} onChange={() => toggleColumn(c.field)} className="h-3.5 w-3.5 accent-primary" />
                {LABELS[c.field] ?? c.label}
              </label>
            ))}
          </div>
        </section>

        <button type="button" onClick={() => onChange(DEFAULT_VIEW)} className="text-[11px] text-muted-foreground hover:underline">
          Reset view
        </button>
      </PopoverContent>
    </Popover>
  );
}
