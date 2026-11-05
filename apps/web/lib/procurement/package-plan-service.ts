// Data access for the Procurement Package Plan: proc_project_package_plan (migration 20261104171124_procurement_package_plan.sql).
// Access: project member with Planning schedule view or Procurement PR view (plan_feed_reader 'materials').

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackageCoverage } from "./package-plan-rules";

export interface PackagePlanRow {
  package_id: string; package_code: string; package_name: string; package_type: string; trade_category: string | null; is_long_lead: boolean;
  lead_time_days: number; lead_time_source: "package" | "default";
  activity_count: number; task_count: number;
  first_task_id: string | null; first_task_code: string | null; first_task_name: string | null; first_start: string; last_finish: string | null;
  required_on_site: string; order_by: string;
  pr_count: number; pr_numbers: string | null; pr_required_date: string | null; coverage: PackageCoverage;
}

export async function getPackagePlan(db: SupabaseClient, projectId: string): Promise<PackagePlanRow[]> {
  const { data, error } = await db.rpc("proc_project_package_plan", { p_project_id: projectId });
  if (error) throw new Error(/access/i.test(error.message) ? "You need Planning schedule or Procurement PR view on this project to see its package plan." : error.message);
  return (data ?? []) as PackagePlanRow[];
}
