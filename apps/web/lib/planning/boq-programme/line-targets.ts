// Where a blocking BOQ line leads: its cost-library item (for the BOQ item dialog) and, for tender lines, its tender.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessSource } from "./readiness-service";

export interface LineTarget { workItemId: string | null; tenderId: string | null }

export async function getLineTarget(db: SupabaseClient, source: ReadinessSource, lineId: string): Promise<LineTarget> {
  if (source === "tender") {
    const { data, error } = await db.from("tender_boq_items").select("tender_id, dwl_work_item_id").eq("id", lineId).maybeSingle();
    if (error) throw new Error(error.message);
    const r = data as { tender_id: string | null; dwl_work_item_id: string | null } | null;
    return { workItemId: r?.dwl_work_item_id ?? null, tenderId: r?.tender_id ?? null };
  }
  const { data, error } = await db.from("qs_boq_items").select("dwl_work_item_id").eq("id", lineId).maybeSingle();
  if (error) throw new Error(error.message);
  return { workItemId: (data as { dwl_work_item_id: string | null } | null)?.dwl_work_item_id ?? null, tenderId: null };
}
