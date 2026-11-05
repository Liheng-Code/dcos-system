// Data for RFQ bidder selection by trade: the source PR's procurement package and the suppliers' approved trades.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovedTrade } from "./rfq-trade-rules";

export interface PrPackage { id: string; code: string; name: string; trade_category: string | null }

/** The procurement package of a PR (procurement_prs.package_id), or null when it has none. */
export async function getPrPackage(db: SupabaseClient, prId: string): Promise<PrPackage | null> {
  const { data: pr, error } = await db.from("procurement_prs").select("package_id").eq("id", prId).maybeSingle();
  if (error) throw new Error(error.message);
  const packageId = (pr as { package_id: string | null } | null)?.package_id;
  if (!packageId) return null;
  const { data, error: pErr } = await db.from("plan_act_procurement_packages").select("id, code, name, trade_category").eq("id", packageId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  return (data as PrPackage | null) ?? null;
}

/** Every active approved trade (filtered to the current date by suppliersMatchingTrade). */
export async function listActiveApprovedTrades(db: SupabaseClient): Promise<ApprovedTrade[]> {
  const { data, error } = await db.from("supplier_approved_trades")
    .select("supplier_id, trade_category, status, approved_from, approved_until").eq("status", "active");
  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovedTrade[];
}
