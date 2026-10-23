"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { choicesFor, suggestedValue, type PlanningChoice } from "@/lib/planning/activity-library/planning-choices";
import { listPlanningChoices } from "@/lib/planning/activity-library/planning-choices-service";
import { buildingTypeLabel, sectorLabel } from "@/lib/project-categories";
import type { ProjectKind } from "@/lib/template-fit";

let cached: Promise<PlanningChoice[]> | null = null;

/** The planning-choices catalogue (plan_act_attributes), loaded once per page visit. */
export function usePlanningChoices(): PlanningChoice[] {
  const [catalogue, setCatalogue] = useState<PlanningChoice[]>([]);
  useEffect(() => {
    let live = true;
    cached ??= listPlanningChoices(createClient()).catch((e) => { cached = null; throw e; });
    cached.then((c) => { if (live) setCatalogue(c); }).catch(() => { if (live) setCatalogue([]); });
    return () => { live = false; };
  }, []);
  return catalogue;
}

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/**
 * The choices Generate asks for the project's category. A suggested value is filled in (and marked) until the
 * planner picks another; "Not set" clears it.
 */
export function PlanningChoicesFields({ catalogue, kind, picks, onChange }: {
  catalogue: PlanningChoice[];
  kind: ProjectKind;
  picks: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const choices = choicesFor(catalogue, kind);
  const who = kind.buildingType ? buildingTypeLabel(kind.buildingType) : kind.sector ? sectorLabel(kind.sector) : null;
  if (choices.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">Planning choices{who ? ` for ${who}` : ""}</div>
      {choices.map((c) => {
        const suggested = suggestedValue(c, kind);
        const value = c.key in picks ? picks[c.key] : suggested ?? "";
        const isSuggestion = !(c.key in picks) && !!suggested;
        return (
          <label key={c.key} className="block space-y-0.5" title={c.description ?? undefined}>
            <span className="flex items-center justify-between text-[11px] text-muted-foreground">
              {c.label}
              {isSuggestion && <span className="rounded bg-muted px-1 text-[10px]">suggested</span>}
            </span>
            <select className={selectCls} value={value} onChange={(e) => onChange({ ...picks, [c.key]: e.target.value })}>
              <option value="">Not set</option>
              {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}
