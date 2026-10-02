"use client";

import { useState } from "react";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { useBimComponents } from "./ifc-viewer";
import { Hider } from "@thatopen/components";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCIPLINE_COLORS } from "@/lib/design/bim/bim-types";
import type { DisciplineInfo } from "@/lib/design/bim/bim-types";

export function DisciplineFilter() {
  const {
    disciplines, toggleDiscipline, hiddenByDiscipline,
    disciplineElementIds, setHiddenItems,
  } = useBimViewer();
  const components = useBimComponents();
  const [expanded, setExpanded] = useState(true);

  if (disciplines.length === 0) return null;

  // Hides/shows every element in this discipline via Hider.set() (same
  // mechanism the toolbar's Hide/Show All buttons use), then keeps
  // hiddenItems in sync so the spatial tree's eye icons and box-select's
  // hidden-element filter stay accurate.
  const handleToggle = async (disc: DisciplineInfo) => {
    const willHide = !hiddenByDiscipline.has(disc.name);
    toggleDiscipline(disc.name);

    if (!components) return;
    const idsByModel = disciplineElementIds.get(disc.name);
    if (!idsByModel || idsByModel.size === 0) return;

    const modelIdMap: Record<string, Set<number>> = {};
    for (const [modelId, ids] of idsByModel) {
      if (ids.length > 0) modelIdMap[modelId] = new Set(ids);
    }
    if (Object.keys(modelIdMap).length === 0) return;

    const hider = components.get(Hider);
    await hider.set(!willHide, modelIdMap);

    const nextHidden = new Map(useBimViewer.getState().hiddenItems);
    for (const [modelId, ids] of idsByModel) {
      const set = new Set(nextHidden.get(modelId) ?? []);
      for (const id of ids) {
        if (willHide) set.add(id);
        else set.delete(id);
      }
      if (set.size > 0) nextHidden.set(modelId, [...set]);
      else nextHidden.delete(modelId);
    }
    setHiddenItems(nextHidden);
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold text-gray-200 hover:text-white"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Layers className="h-4 w-4" />
        Disciplines
      </button>
      {expanded && (
        <div className="mt-2 ml-2 space-y-1 text-xs">
          {disciplines.filter((d) => d.elementCount > 0).map((disc) => {
            const isHidden = hiddenByDiscipline.has(disc.name);
            const color = DISCIPLINE_COLORS[disc.name] ?? "#6b7280";
            return (
              <div
                key={disc.name}
                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-700 cursor-pointer"
                onClick={() => handleToggle(disc)}
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggle(disc)}
                  className="h-3 w-3 rounded border-gray-600"
                />
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className={cn("truncate", isHidden ? "text-gray-500" : "text-gray-300")}>
                  {disc.label}
                </span>
                <span className="ml-auto text-gray-600">
                  {disc.elementCount.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
