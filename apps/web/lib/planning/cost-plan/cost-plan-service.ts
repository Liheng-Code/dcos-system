// I/O for Planning's cost side (doc 35 C2-C5): the RPCs of migration 20261103080455_planning_c_resources_cost.sql
// and the cash-flow settings on plan_schedule_settings. The rules are pure: cash-flow.ts, budget-reconciliation.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupe } from "@/lib/request-dedup";
import type { LoadingBasis, LoadingPeriod } from "../boq-programme/loading-service";
import { DEFAULT_CASH_FLOW, type CashFlowSettings } from "./cash-flow";
import type { BudgetReconciliationFacts } from "./budget-reconciliation";

type Db = SupabaseClient;

export type CostKind = "labor" | "material" | "equipment" | "subcontract";
export const COST_KINDS: CostKind[] = ["labor", "material", "equipment", "subcontract"];
export const COST_KIND_LABEL: Record<CostKind, string> = {
  labor: "Labour", material: "Material", equipment: "Equipment", subcontract: "Subcontract",
};

export interface CostComponents {
  meta: {
    period: LoadingPeriod;
    basis: LoadingBasis;
    currency: string | null;
    total_cost: number;
    scheduled_cost: number;
    /** activity budgets (BOQ value) */
    boq_value: number;
    task_count: number;
    unpriced_lines: number;
    /** hours on BOQ lines mapped over 100 %, counted once in the cost (the programme still carries them) */
    hours_counted_once: number;
    tasks_counted_once: number;
  };
  kinds: { kind: CostKind; cost: number; lines: number; unpriced_lines: number; unpriced_hours: number }[];
  periods: ({ period: string; total: number; cumulative: number } & Record<CostKind, number>)[];
  tasks: ({ task_id: string; code: string; name: string; budget: number; total: number; unpriced: number } & Record<CostKind, number>)[];
}

export interface MaterialHistogram {
  meta: {
    period: LoadingPeriod;
    basis: LoadingBasis;
    start: string | null;
    finish: string | null;
    material_cost: number;
    materials: number;
    unpriced_materials: number;
    currency: string | null;
  };
  periods: { period: string; cost: number }[];
  materials: {
    resource_id: string; code: string; description: string; unit: string | null;
    quantity: number; cost: number | null; priced: boolean; unscheduled_quantity: number;
  }[];
  cells: { period: string; resource_id: string; quantity: number; cost: number | null }[];
}

/** Concurrent calls for the same inputs share one request (the cost page shows it in three places). */
export function getCostComponents(db: Db, projectId: string, period: LoadingPeriod = "month", basis: LoadingBasis = "current"): Promise<CostComponents> {
  return dedupe(`plan_cost_components:${projectId}:${period}:${basis}`, async () => {
    const { data, error } = await db.rpc("plan_cost_components", { p_project_id: projectId, p_period: period, p_basis: basis });
    if (error) throw new Error(error.message);
    return data as CostComponents;
  });
}

export async function getMaterialHistogram(db: Db, projectId: string, period: LoadingPeriod = "month", basis: LoadingBasis = "current"): Promise<MaterialHistogram> {
  const { data, error } = await db.rpc("plan_material_histogram", { p_project_id: projectId, p_period: period, p_basis: basis });
  if (error) throw new Error(error.message);
  return data as MaterialHistogram;
}

export async function getBudgetReconciliation(db: Db, projectId: string): Promise<BudgetReconciliationFacts> {
  const { data, error } = await db.rpc("plan_budget_reconciliation", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data as BudgetReconciliationFacts;
}

// ---------------------------------------------------------------- cash-flow settings

export interface CashFlowSettingsState {
  settings: CashFlowSettings;
  /** the project's own terms (projects.retention / advance_payment), used when the schedule setting is blank */
  projectRetentionPct: number | null;
  projectAdvancePct: number | null;
  /** schedule settings stored for retention / advance (false = taken from the project) */
  retentionSet: boolean;
  advanceSet: boolean;
}

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export async function getCashFlowSettings(db: Db, projectId: string): Promise<CashFlowSettingsState> {
  const [{ data: row, error }, { data: project }] = await Promise.all([
    db.from("plan_schedule_settings")
      .select("cashflow_payment_lag_days, cashflow_retention_pct, cashflow_retention_limit_pct, cashflow_retention_release_pct, cashflow_dlp_months, cashflow_advance_pct, cashflow_advance_recovery_pct, cashflow_cost_lag_days")
      .eq("project_id", projectId).maybeSingle(),
    db.from("projects").select("retention, advance_payment").eq("id", projectId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const r = (row ?? {}) as Record<string, unknown>;
  const projectRetentionPct = num(project?.retention);
  const projectAdvancePct = num(project?.advance_payment);
  const d = DEFAULT_CASH_FLOW;
  return {
    settings: {
      paymentLagDays: num(r.cashflow_payment_lag_days) ?? d.paymentLagDays,
      retentionPct: num(r.cashflow_retention_pct) ?? projectRetentionPct ?? d.retentionPct,
      retentionLimitPct: num(r.cashflow_retention_limit_pct),
      retentionReleasePct: num(r.cashflow_retention_release_pct) ?? d.retentionReleasePct,
      dlpMonths: num(r.cashflow_dlp_months) ?? d.dlpMonths,
      advancePct: num(r.cashflow_advance_pct) ?? projectAdvancePct ?? d.advancePct,
      advanceRecoveryPct: num(r.cashflow_advance_recovery_pct),
      costLagDays: num(r.cashflow_cost_lag_days) ?? d.costLagDays,
    },
    projectRetentionPct,
    projectAdvancePct,
    retentionSet: num(r.cashflow_retention_pct) != null,
    advanceSet: num(r.cashflow_advance_pct) != null,
  };
}

/** retentionPct / advancePct null = follow the project's terms. Needs Schedule configure permission (RLS). */
export async function saveCashFlowSettings(
  db: Db, projectId: string,
  s: Omit<CashFlowSettings, "retentionPct" | "advancePct"> & { retentionPct: number | null; advancePct: number | null },
): Promise<void> {
  const { error } = await db.from("plan_schedule_settings").upsert({
    project_id: projectId,
    cashflow_payment_lag_days: s.paymentLagDays,
    cashflow_retention_pct: s.retentionPct,
    cashflow_retention_limit_pct: s.retentionLimitPct,
    cashflow_retention_release_pct: s.retentionReleasePct,
    cashflow_dlp_months: s.dlpMonths,
    cashflow_advance_pct: s.advancePct,
    cashflow_advance_recovery_pct: s.advanceRecoveryPct,
    cashflow_cost_lag_days: s.costLagDays,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}
