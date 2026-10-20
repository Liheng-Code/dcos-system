// BOQ quantity provider (Phase 3.2): the QuantityProvider "boq". Kept apart from boq-quantity-service.ts so the generation
// service can use it without a circular import.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateBoqLinks, type BoqLinkRow, type BoqLiveItem } from "./boq-quantity";
import type { QuantityProvider } from "./quantity-resolver";

type Db = SupabaseClient;

const key = (source: string, id: string) => `${source}:${id}`;

export async function liveItems(db: Db, links: BoqLinkRow[]): Promise<Map<string, BoqLiveItem>> {
  const out = new Map<string, BoqLiveItem>();
  for (const [source, table] of [["qs_boq", "qs_boq_items"], ["tender_boq", "tender_boq_items"]] as const) {
    const ids = [...new Set(links.filter((l) => l.boq_source === source).map((l) => l.boq_item_id))];
    if (!ids.length) continue;
    const { data, error } = await db.from(table).select("id, quantity, unit").in("id", ids);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; quantity: number; unit: string | null }[]) {
      out.set(key(source, r.id), { quantity: Number(r.quantity), unit: r.unit });
    }
  }
  return out;
}

/** QuantityProvider "boq": sums the confirmed links of a node/metric against the live BOQ quantities. */
export function boqLinkProvider(db: Db, projectId: string): QuantityProvider {
  const cache = new Map<string, Promise<BoqLinkRow[]>>();
  const linksFor = (nodeId: string, metric: string) => {
    const k = `${nodeId}|${metric}`;
    if (!cache.has(k)) {
      cache.set(k, (async () => {
        const { data, error } = await db.from("plan_act_quantity_links")
          .select("id, boq_source, boq_item_id, boq_item_ref, boq_unit, boq_quantity_at_link, factor, metric_unit")
          .eq("project_id", projectId).eq("wbs_node_id", nodeId).eq("metric_code", metric);
        if (error) throw new Error(error.message);
        return ((data ?? []) as BoqLinkRow[]).map((l) => ({ ...l, factor: Number(l.factor), boq_quantity_at_link: l.boq_quantity_at_link == null ? null : Number(l.boq_quantity_at_link) }));
      })());
    }
    return cache.get(k)!;
  };
  return {
    key: "boq",
    get: async (nodeId, metric) => {
      const links = await linksFor(nodeId, metric);
      const agg = aggregateBoqLinks(links, await liveItems(db, links));
      if (!agg || agg.unitConflict) return null;
      return { value: agg.value, unit: agg.unit, source_ref: agg.ref };
    },
  };
}
