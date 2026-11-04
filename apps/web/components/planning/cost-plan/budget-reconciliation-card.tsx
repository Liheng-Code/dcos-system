"use client";

// Cost loading against the QS approved budget (doc 35 C5): approved BOQ + approved VOs against the activity budgets
// the programme spreads, and per BOQ line what the activities carry for it. Data: plan_budget_reconciliation; rules:
// lib/planning/cost-plan/budget-reconciliation.ts.

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, useRpc } from "@/components/planning/boq-programme/loading-charts";
import { createClient } from "@/lib/supabase/client";
import { reconcileBudget, type BudgetLineStatus } from "@/lib/planning/cost-plan/budget-reconciliation";
import { getBudgetReconciliation } from "@/lib/planning/cost-plan/cost-plan-service";

const STATUS: Record<BudgetLineStatus, { label: string; cls: string }> = {
  not_loaded: { label: "Not in the programme", cls: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  under: { label: "Partly in the programme", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  over: { label: "More than the BOQ", cls: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  matched: { label: "Matches", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  unapproved: { label: "Not approved yet", cls: "bg-muted text-muted-foreground" },
};
const ISSUES: BudgetLineStatus[] = ["not_loaded", "under", "over", "unapproved"];

export function BudgetReconciliationCard({ projectId }: { projectId: string | null }) {
  const { data, error, loading, retry } = useRpc(projectId ? `budget|${projectId}` : null, () => getBudgetReconciliation(createClient(), projectId as string));
  const result = useMemo(() => (data ? reconcileBudget(data) : null), [data]);
  const [filter, setFilter] = useState<BudgetLineStatus | "issues">("issues");

  if (!projectId) return null;
  if (loading) return <div className="flex justify-center rounded-xl border border-border py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-border p-4 text-sm">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={retry} className="mt-1 text-xs underline">Retry</button>
      </div>
    );
  }
  if (!result || !data) return null;

  const { summary: s, lines } = result;
  const cur = data.meta.currency ? ` ${data.meta.currency}` : "";
  const shown = lines.filter((l) => (filter === "issues" ? ISSUES.includes(l.status_check) : l.status_check === filter));
  const ok = s.approvedBudget > 0 && Math.abs(s.gap) < 0.5 && s.counts.not_loaded + s.counts.under + s.counts.over === 0;

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Budget check</h3>
          <p className="text-xs text-muted-foreground">
            The QS approved budget (approved contract BOQ + approved variations) against the activity budgets the programme spreads.
          </p>
        </div>
        {s.approvedBudget > 0 && (
          ok
            ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> The programme carries the whole approved budget</span>
            : <span className="flex items-center gap-1 text-xs font-medium text-amber-600"><AlertTriangle className="h-4 w-4" /> {money(Math.abs(s.gap))}{cur} {s.gap > 0 ? "of the approved budget is not in the programme" : "more in the programme than approved"}</span>
        )}
      </div>

      {s.approvedBudget === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {s.fromTender > 0
            ? `No approved contract BOQ yet. The programme carries ${money(s.fromTender)}${cur} from the tender BOQ; it can be checked once QS approves the contract BOQ.`
            : "No approved contract BOQ yet. Approve the BOQ in QS › Contract BOQ to check the programme against it."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs sm:grid-cols-4">
            <Figure label="Approved budget" value={`${money(s.approvedBudget)}${cur}`} hint={`BOQ ${money(Number(data.meta.approved_boq))} + VOs ${money(s.vosNotInProgramme)}`} />
            <Figure label="In the programme" value={`${money(s.programmeBudget)}${cur}`} hint={s.coveragePct != null ? `${s.coveragePct}% of the approved budget` : undefined} />
            <Figure label="Approved BOQ not in the programme" value={`${money(s.missing)}${cur}`} tone={s.missing > 0 ? "warn" : undefined}
              hint={`${s.counts.not_loaded} lines not loaded, ${s.counts.under} partly`} />
            <Figure label="Other differences" value={`${money(s.overLoaded + Math.abs(s.handAdjusted))}${cur}`}
              hint={[
                s.overLoaded > 0 ? `${money(s.overLoaded)} over BOQ lines` : null,
                s.handAdjusted !== 0 ? `${money(s.handAdjusted)} typed on activities` : null,
                s.vosNotInProgramme > 0 ? `VOs are not mapped to activities` : null,
              ].filter(Boolean).join(" · ") || "none"} />
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2">
            <Chip active={filter === "issues"} onClick={() => setFilter("issues")} label={`Needs a look (${lines.filter((l) => ISSUES.includes(l.status_check)).length})`} />
            {(["not_loaded", "under", "over", "unapproved", "matched"] as BudgetLineStatus[]).map((k) => (
              s.counts[k] > 0 && <Chip key={k} active={filter === k} onClick={() => setFilter(k)} label={`${STATUS[k].label} (${s.counts[k]})`} />
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto border-t border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">BOQ line</th>
                    <th className="px-3 py-1.5 text-left font-medium">Status</th>
                    <th className="px-3 py-1.5 text-right font-medium">BOQ amount</th>
                    <th className="px-3 py-1.5 text-right font-medium">In the programme</th>
                    <th className="px-3 py-1.5 text-right font-medium">Difference</th>
                    <th className="px-3 py-1.5 text-right font-medium">Activities</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id} className="border-t border-border/60">
                      <td className="max-w-[360px] truncate px-3 py-1" title={`${l.item_no ?? ""} ${l.description ?? ""}`}>
                        <span className="font-mono text-muted-foreground">{l.item_no ?? "–"}</span> {l.description}
                        {l.section && <span className="ml-1 text-muted-foreground">· {l.section}</span>}
                      </td>
                      <td className="px-3 py-1"><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS[l.status_check].cls)}>{STATUS[l.status_check].label}</span></td>
                      <td className="px-3 py-1 text-right tabular-nums">{money(l.amount)}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{money(l.loaded)}</td>
                      <td className={cn("px-3 py-1 text-right tabular-nums", l.difference < 0 ? "text-red-600" : l.difference > 0 ? "text-violet-600" : "")}>
                        {l.difference === 0 ? "–" : `${l.difference > 0 ? "+" : ""}${money(l.difference)}`}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">{l.tasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.adjusted_tasks.length > 0 && (
            <details className="border-t border-border px-4 py-2 text-xs">
              <summary className="cursor-pointer font-medium">{data.adjusted_tasks.length} activities with a budget that is not the sum of their BOQ lines</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                {data.adjusted_tasks.map((t) => (
                  <li key={t.task_id} className="flex justify-between gap-2">
                    <span className="truncate"><span className="font-mono text-muted-foreground">{t.code}</span> {t.name}</span>
                    <span className="shrink-0 tabular-nums">{money(t.budget)} vs {money(t.from_lines)} from BOQ lines</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", tone === "warn" && "text-amber-600")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
      {label}
    </button>
  );
}
