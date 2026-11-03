"use client";

// Planned cash flow (doc 35 C4; PRD FR-077): money in (certified value less retention and advance recovery, after
// the payment lag) against money out (cost after the supplier lag), and the cumulative position. Value comes from
// cost loading (activity budgets = BOQ value), cost from Cost by Component; the model is lib/planning/cost-plan/cash-flow.ts.

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";
import { LEGEND_STYLE, TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { compact, money, periodLabel, useRpc } from "@/components/planning/boq-programme/loading-charts";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";
import { getCostLoading } from "@/lib/planning/boq-programme/loading-service";
import { cashFlow } from "@/lib/planning/cost-plan/cash-flow";
import {
  getCashFlowSettings, getCostComponents, saveCashFlowSettings, type CashFlowSettingsState,
} from "@/lib/planning/cost-plan/cost-plan-service";

interface Inputs {
  value: { month: string; amount: number }[];
  cost: { month: string; amount: number }[];
  state: CashFlowSettingsState;
  currency: string | null;
  unpricedLines: number;
}

export function CashFlowCard({ projectId, className }: { projectId: string | null; className?: string }) {
  const { canConfigureSchedule } = usePlanningPermissions();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const { data, error, loading, retry } = useRpc<Inputs>(projectId ? `cf|${projectId}|${version}` : null, async () => {
    const db = createClient();
    const [loadingData, components, state] = await Promise.all([
      getCostLoading(db, projectId as string, "month", "current"),
      getCostComponents(db, projectId as string, "month", "current"),
      getCashFlowSettings(db, projectId as string),
    ]);
    return {
      value: loadingData.periods.map((p) => ({ month: p.period, amount: Number(p.value) })),
      cost: components.periods.map((p) => ({ month: p.period, amount: Number(p.total) })),
      state,
      currency: components.meta.currency,
      unpricedLines: components.meta.unpriced_lines,
    };
  });
  const result = useMemo(() => (data ? cashFlow(data.value, data.cost, data.state.settings) : null), [data]);
  const rows = useMemo(() => (result?.rows ?? []).map((r) => ({ ...r, cashOutNeg: -r.cashOut })), [result]);
  const cur = data?.currency ? ` ${data.currency}` : "";
  const s = data?.state.settings;

  return (
    <>
      <ChartWrapper
        title="Planned Cash Flow"
        description={
          result && result.rows.length > 0
            ? `Money in after ${s!.paymentLagDays} days less ${s!.retentionPct}% retention${s!.advancePct ? ` and advance recovery` : ""}; money out ${s!.costLagDays} days after the cost is incurred`
            : "Money in (certified value) against money out (cost) by month"
        }
        loading={loading}
        error={error}
        onRetry={retry}
        empty={!loading && !error && (!result || result.rows.length === 0)}
        emptyMessage="No activity carries a budget with dates yet. Generate and schedule the programme first."
        height={460}
        className={className}
      >
        <div className="w-full">
          {canConfigureSchedule && data && (
            <div className="flex justify-end px-3 pt-1">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted">
                <Settings2 className="h-3 w-3" /> Payment terms
              </button>
            </div>
          )}
          {result && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 pt-1 text-xs sm:grid-cols-4">
              <Kpi label="Contract value (programme)" value={`${money(result.contractValue)}${cur}`} />
              <Kpi label="Planned cost" value={`${money(result.totalCost)}${cur}`} hint={data!.unpricedLines > 0 ? `${data!.unpricedLines} unpriced lines left out` : undefined} />
              <Kpi
                label="Peak funding need"
                value={result.peakFunding.amount < 0 ? `${money(-result.peakFunding.amount)}${cur}` : "none"}
                hint={result.peakFunding.month ? `in ${periodLabel(result.peakFunding.month, "month")}` : undefined}
                tone={result.peakFunding.amount < 0 ? "warn" : undefined}
              />
              <Kpi
                label="Retention held"
                value={`${money(result.retention)}${cur}`}
                hint={result.retentionRelease.length > 0 ? `back ${result.retentionRelease.map((r) => periodLabel(r.month, "month")).join(" and ")}` : undefined}
              />
            </div>
          )}
          <ResponsiveContainer width="100%" height={330}>
            <ComposedChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%" stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => periodLabel(String(v), "month")} minTickGap={16} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
              <Tooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(v) => periodLabel(String(v), "month")}
                formatter={(v, name) => [`${money(Math.abs(Number(v)))}${cur}`, name]}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="cashIn" name="Money in" stackId="cash" fill="#059669" maxBarSize={26} />
              <Bar dataKey="cashOutNeg" name="Money out" stackId="cash" fill="#e11d48" maxBarSize={26} />
              <Line dataKey="cumulativeNet" name="Cumulative position" stroke="var(--foreground)" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>
      {editing && data && projectId && (
        <PaymentTermsDialog
          projectId={projectId}
          state={data.state}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setVersion((n) => n + 1); }}
        />
      )}
    </>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${tone === "warn" ? "text-red-600" : ""}`}>{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PaymentTermsDialog({ projectId, state, onClose, onSaved }: {
  projectId: string; state: CashFlowSettingsState; onClose: () => void; onSaved: () => void;
}) {
  const s = state.settings;
  const str = (n: number | null) => (n == null ? "" : String(n));
  const [f, setF] = useState({
    paymentLagDays: String(s.paymentLagDays),
    retentionPct: state.retentionSet ? String(s.retentionPct) : "",
    retentionLimitPct: str(s.retentionLimitPct),
    retentionReleasePct: String(s.retentionReleasePct),
    dlpMonths: String(s.dlpMonths),
    advancePct: state.advanceSet ? String(s.advancePct) : "",
    advanceRecoveryPct: str(s.advanceRecoveryPct),
    costLagDays: String(s.costLagDays),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    const opt = (v: string) => (v.trim() === "" ? null : Number(v));
    const req = (v: string) => Number(v);
    const values = {
      paymentLagDays: req(f.paymentLagDays), retentionPct: opt(f.retentionPct), retentionLimitPct: opt(f.retentionLimitPct),
      retentionReleasePct: req(f.retentionReleasePct), dlpMonths: req(f.dlpMonths), advancePct: opt(f.advancePct),
      advanceRecoveryPct: opt(f.advanceRecoveryPct), costLagDays: req(f.costLagDays),
    };
    const bad = Object.entries(values).find(([, v]) => v != null && (Number.isNaN(v) || v < 0));
    if (bad) return toast.error("Every value must be a number of zero or more.");
    if ([values.retentionPct, values.retentionLimitPct, values.retentionReleasePct, values.advancePct, values.advanceRecoveryPct].some((v) => v != null && v > 100)) {
      return toast.error("Percentages cannot be over 100.");
    }
    if (values.paymentLagDays > 365 || values.costLagDays > 365) return toast.error("A payment lag cannot be over 365 days.");
    if (values.dlpMonths > 60) return toast.error("The defects period cannot be over 60 months.");
    setBusy(true);
    try {
      await saveCashFlowSettings(createClient(), projectId, values);
      toast.success("Payment terms saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof f, label: string, hint?: string, placeholder?: string) => (
    <label className="block text-xs">
      <span className="font-medium">{label}</span>
      <input type="number" min={0} value={f[k]} onChange={set(k)} placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none" />
      {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Payment terms for the cash flow</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field("paymentLagDays", "Client pays after (days)", "from each month-end certificate")}
          {field("costLagDays", "We pay suppliers after (days)", "from the month the cost is incurred")}
          {field("retentionPct", "Retention %", state.projectRetentionPct != null ? `blank = the project's ${state.projectRetentionPct}%` : "blank = none", state.projectRetentionPct != null ? String(state.projectRetentionPct) : "0")}
          {field("retentionLimitPct", "Retention limit % of contract", "blank = no limit")}
          {field("retentionReleasePct", "Released at completion %", "the rest after the defects period")}
          {field("dlpMonths", "Defects period (months)")}
          {field("advancePct", "Advance payment %", state.projectAdvancePct != null ? `blank = the project's ${state.projectAdvancePct}%` : "blank = none", state.projectAdvancePct != null ? String(state.projectAdvancePct) : "0")}
          {field("advanceRecoveryPct", "Advance recovered per certificate %", "blank = the advance %")}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
