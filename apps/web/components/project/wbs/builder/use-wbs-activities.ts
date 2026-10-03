"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MASK, maskFromRow, type WbsCodeMask, type WbsMaskRow } from "@/lib/planning/wbs-code-mask";
import { getWbsCodeMaskByProjectId, listWbsTaskSummariesPage } from "@/lib/project/wbs/wbs-queries";
import { loadProjectCalendar } from "@/lib/planning/project-schedule";
import type { WorkCalendar } from "@/lib/planning/work-calendar";
import type { WbsActivitySummary } from "./wbs-builder-types";

/** The project's working calendar (Planning › Working time); Mon–Sat until it loads or when none. */
export function useProjectCalendar(projectId: string): WorkCalendar | undefined {
  const [cal, setCal] = useState<WorkCalendar | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadProjectCalendar(projectId).then((c) => { if (!cancelled) setCal(c); });
    return () => { cancelled = true; };
  }, [projectId]);
  return cal;
}

/** The project's WBS Code Definition (Planning), or the default mask (2-digit numbers, "."). */
export function useWbsCodeMask(projectId: string): WbsCodeMask {
  const [mask, setMask] = useState<WbsCodeMask>(DEFAULT_MASK);
  useEffect(() => {
    let cancelled = false;
    getWbsCodeMaskByProjectId(projectId).then(({ data }) => {
      if (!cancelled) setMask(maskFromRow((data as WbsMaskRow | null) ?? null));
    });
    return () => { cancelled = true; };
  }, [projectId]);
  return mask;
}

const PAGE = 1000;

/**
 * The project's activities (summary fields) for the WBS builder: the Activities column roll-up
 * and the optional read-only activity rows. Reloads when `reloadKey` changes (the node set).
 */
export function useWbsActivities(projectId: string, reloadKey: string): WbsActivitySummary[] {
  const [activities, setActivities] = useState<WbsActivitySummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows: WbsActivitySummary[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await listWbsTaskSummariesPage(projectId, from, from + PAGE - 1);
        if (error || !data) break;
        rows.push(...(data as WbsActivitySummary[]));
        if (data.length < PAGE) break;
      }
      if (!cancelled) setActivities(rows);
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  return activities;
}
