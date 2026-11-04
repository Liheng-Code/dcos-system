// Link counts per activity master for the Activity Library list: BOQ items, method statements, T&C items and
// procurement packages (Construction Work Library link tables). One batched read per table.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "./in-chunks";

export interface MasterLinkCounts { boq: number; ms: number; tc: number; pkg: number }

const TABLES: [keyof MasterLinkCounts, string][] = [
  ["boq", "plan_act_master_work_items"],
  ["ms", "plan_act_master_method_statements"],
  ["tc", "plan_act_master_tc_items"],
  ["pkg", "plan_act_master_procurement_packages"],
];

export async function listMasterLinkCounts(db: SupabaseClient, masterIds: readonly string[]): Promise<Map<string, MasterLinkCounts>> {
  const ids = [...new Set(masterIds)];
  const out = new Map<string, MasterLinkCounts>(ids.map((id) => [id, { boq: 0, ms: 0, tc: 0, pkg: 0 }]));
  await Promise.all(TABLES.map(async ([key, table]) => {
    const rows = await inChunks<{ master_id: string }>(ids, (p) => db.from(table).select("master_id").in("master_id", p));
    for (const r of rows) { const c = out.get(r.master_id); if (c) c[key] += 1; }
  }));
  return out;
}
