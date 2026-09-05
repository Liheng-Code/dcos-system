"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  activeTierKeys,
  LABEL_FORMATS,
  resolveDayWidth,
  UNIT_LABELS,
  type TierKey,
  type TimescaleAlign,
  type TimescaleConfig,
  type TimescaleTier,
  type TimescaleUnit,
} from "@/lib/planning/timescale";
import { GanttHeader } from "./gantt-header";
import { addDays } from "./gantt-utils";

interface Props {
  projectId: string;
  config: TimescaleConfig;
  onClose: () => void;
  onSaved: (next: TimescaleConfig) => void;
}

type Tab = TierKey | "nonworking";

const TAB_LABELS: Record<Tab, string> = {
  top: "Top Tier",
  middle: "Middle Tier",
  bottom: "Bottom Tier",
  nonworking: "Non-working time",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHOW_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "One tier (Bottom)" },
  { value: 2, label: "Two tiers (Middle, Bottom)" },
  { value: 3, label: "Three tiers (Top, Middle, Bottom)" },
];

export function PlanTimescaleDialog({ projectId, config, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<TimescaleConfig>(config);
  const [tab, setTab] = useState<Tab>("bottom");
  const [saving, setSaving] = useState(false);

  const active = activeTierKeys(draft.tierCount);
  const anyFiscal =
    draft.tiers.top.fiscalYear || draft.tiers.middle.fiscalYear || draft.tiers.bottom.fiscalYear;

  const setTier = (key: TierKey, patch: Partial<TimescaleTier>) =>
    setDraft((d) => ({ ...d, tiers: { ...d.tiers, [key]: { ...d.tiers[key], ...patch } } }));

  const setUnit = (key: TierKey, unit: TimescaleUnit) =>
    setTier(key, { unit, labelFormat: LABEL_FORMATS[unit][0].key });

  // Live preview — the real header over a fixed 4-month sample range.
  const preview = useMemo(() => {
    const rangeMin = new Date();
    rangeMin.setHours(0, 0, 0, 0);
    const rangeMax = addDays(rangeMin, 120);
    return { rangeMin, rangeMax, totalDays: 121, dayWidth: resolveDayWidth(draft, 1) };
  }, [draft]);

  async function handleSave() {
    setSaving(true);
    const { error } = await createClient()
      .from("plan_timescale")
      .upsert(
        { project_id: projectId, config: draft, updated_at: new Date().toISOString() },
        { onConflict: "project_id" },
      );
    if (error) {
      setSaving(false);
      toast.error("Failed to save timescale: " + error.message);
      return;
    }
    setSaving(false);
    onSaved(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <CalendarRange className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Timescale</h2>
            <p className="text-[11px] text-white/70">
              Up to three tiers of time bands over the Gantt chart (MS-Project style)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {/* Tabs — every tier is editable even when it isn't currently shown
              (matches MS Project); a hidden tier just carries a hint. */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
              const hidden = t !== "nonworking" && !active.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                    tab === t
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {TAB_LABELS[t]}
                  {hidden && <span className="ml-1 text-muted-foreground/60">·hidden</span>}
                </button>
              );
            })}
          </div>

          {/* Tier tab */}
          {tab !== "nonworking" && (
            <div className="space-y-2">
              {!active.includes(tab) && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  This tier is not shown yet — set <strong>Show</strong> below to{" "}
                  {tab === "top" ? "“Three tiers”" : "“Two tiers” or “Three tiers”"} to display it.
                </p>
              )}
              <TierEditor
                tier={draft.tiers[tab]}
                onUnit={(u) => setUnit(tab, u)}
                onPatch={(p) => setTier(tab, p)}
              />
            </div>
          )}

          {/* Non-working time tab */}
          {tab === "nonworking" && (
            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="font-semibold">Draw</span>
                <select
                  value={draft.nonworking.draw}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      nonworking: { ...d.nonworking, draw: e.target.value as "behind" | "front" | "none" },
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="none">Do not draw</option>
                  <option value="behind">Behind task bars</option>
                  <option value="front">In front of task bars</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="font-semibold">Colour</span>
                <input
                  type="color"
                  value={draft.nonworking.color}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, nonworking: { ...d.nonworking, color: e.target.value } }))
                  }
                  className="h-7 w-12 cursor-pointer rounded border border-border bg-background"
                />
                <span className="font-mono text-muted-foreground">{draft.nonworking.color}</span>
              </label>
              <p className="text-[10px] text-muted-foreground">
                Working days come from the project calendar — edit them under Project ▸ Change
                Working Time.
              </p>
            </div>
          )}

          {/* Timescale options — always visible */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">
              Timescale options
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="font-semibold">Show</span>
              <select
                value={draft.tierCount}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tierCount: Number(e.target.value) as 1 | 2 | 3 }))
                }
                className="w-56 rounded border border-border bg-background px-1.5 py-1 outline-none"
              >
                {SHOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="font-semibold">Size</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={25}
                  max={400}
                  value={draft.sizePct}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      sizePct: Math.max(25, Math.min(400, Number(e.target.value) || 100)),
                    }))
                  }
                  className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right outline-none"
                />
                <span className="text-muted-foreground">%</span>
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.scaleSeparator}
                onChange={(e) => setDraft((d) => ({ ...d, scaleSeparator: e.target.checked }))}
              />
              Scale separator
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className={cn("font-semibold", !anyFiscal && "text-muted-foreground/50")}>
                Fiscal year starts
              </span>
              <select
                value={draft.fiscalYearStartMonth}
                disabled={!anyFiscal}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, fiscalYearStartMonth: Number(e.target.value) }))
                }
                className="w-40 rounded border border-border bg-background px-1.5 py-1 outline-none disabled:opacity-40"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              Preview
            </div>
            <div className="overflow-x-auto rounded border border-border bg-background">
              <div style={{ width: preview.totalDays * preview.dayWidth }}>
                <GanttHeader
                  config={draft}
                  rangeMin={preview.rangeMin}
                  rangeMax={preview.rangeMax}
                  totalDays={preview.totalDays}
                  dayWidth={preview.dayWidth}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function TierEditor({
  tier,
  onUnit,
  onPatch,
}: {
  tier: TimescaleTier;
  onUnit: (u: TimescaleUnit) => void;
  onPatch: (p: Partial<TimescaleTier>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <label className="block">
        <span className="font-semibold">Units</span>
        <select
          value={tier.unit}
          onChange={(e) => onUnit(e.target.value as TimescaleUnit)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
        >
          {(Object.keys(UNIT_LABELS) as TimescaleUnit[]).map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Label</span>
        <select
          value={tier.labelFormat}
          onChange={(e) => onPatch({ labelFormat: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
        >
          {LABEL_FORMATS[tier.unit].map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Count</span>
        <input
          type="number"
          min={1}
          max={99}
          value={tier.count}
          onChange={(e) => onPatch({ count: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
        />
      </label>
      <label className="block">
        <span className="font-semibold">Align</span>
        <select
          value={tier.align}
          onChange={(e) => onPatch({ align: e.target.value as TimescaleAlign })}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={tier.tickLines}
          onChange={(e) => onPatch({ tickLines: e.target.checked })}
        />
        Tick lines
      </label>
      <label className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={tier.fiscalYear}
          onChange={(e) => onPatch({ fiscalYear: e.target.checked })}
        />
        Use fiscal year
      </label>
    </div>
  );
}
