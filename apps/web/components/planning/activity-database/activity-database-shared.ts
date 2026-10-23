// Shared small types and class strings for the Activity Database screens (doc 23, section 3).

import type { MasterRow } from "@/lib/planning/activity-library/activity-database-service";

/** One row in the activity list (division list or search result). */
export type ActivityListItem = Pick<MasterRow, "id" | "visible_code" | "code" | "name"> & { default_unit: string | null };

export const SELECT_CLS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";

export const COST_LIBRARY_HREF = "/dashboard/qs/dwl-work-items";

export const PAGE_SIZE = 50;

export function activityLabel(a: Pick<ActivityListItem, "visible_code" | "code" | "name" | "default_unit">): string {
  return `${a.name}${a.default_unit ? ` (${a.default_unit})` : ""}`;
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
