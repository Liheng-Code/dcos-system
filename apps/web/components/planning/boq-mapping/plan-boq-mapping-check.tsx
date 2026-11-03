"use client";

// Planning > BOQ Mapping Check (doc 35 Phase B): how much of each BOQ line the programme maps (B1), lines counted
// twice or only partly (B2), BOQ quantity changes waiting for a planning decision (B4) and the mapping history (B3).

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import type { MappingIssue, MappingStatus, ReconciledLine, ReconciliationSummary } from "@/lib/planning/boq-mapping/reconcile";
import {
  decideChangeReview,
  listChangeReviews,
  listMappingHistory,
  loadReconciliation,
  nodeLabels,
  taskLabels,
  type BoqChangeReview,
  type ChangeDecisionResult,
  type MappingHistoryRow,
} from "@/lib/planning/boq-mapping/boq-mapping-service";

const fmt = (n: number | null | undefined, dp = 2) =>
  n == null ? "-" : new Intl.NumberFormat(undefined, { maximumFractionDigits: dp }).format(n);

const STATUS: Record<MappingStatus, { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  partial: { label: "Partial", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  over: { label: "Counted twice", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  unmapped: { label: "Unmapped", cls: "bg-muted text-muted-foreground" },
  converted: { label: "Other unit", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
};

const ISSUE: Record<MappingIssue, string> = {
  counted_twice: "Over 100%: the same quantity drives more than one activity",
  multiple_paths: "Mapped by more than one route (Generate from BOQ, library links, Task Work)",
  library_shares: "The BOQ item's activity shares in the library do not add up to 100%",
  stale_programme: "The BOQ quantity changed after Generate from BOQ ran",
  stale_links: "The BOQ quantity changed after the links were confirmed",
  unit_conversion: "Linked in another unit (not compared)",
  other_boq: "Mapped from a BOQ the programme does not use (older tender or other BOQ)",
  zero_quantity: "Mapped, but the BOQ line has no quantity",
};
const ISSUE_SHORT: Record<MappingIssue, string> = {
  counted_twice: "counted twice", multiple_paths: "several routes", library_shares: "library shares",
  stale_programme: "BOQ changed", stale_links: "links stale", unit_conversion: "other unit",
  other_boq: "other BOQ", zero_quantity: "zero qty",
};

type Tab = "reconcile" | "changes" | "history";
type Filter = "issues" | "all" | MappingStatus;
const MAX_ROWS = 500;

export function PlanBoqMappingCheck() {
  const { selectedProjectId: projectId } = useProject();
  const { canEditSchedule } = usePlanningPermissions();
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("reconcile");
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<ReconciledLine[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [open, setOpen] = useState<BoqChangeReview[]>([]);
  const [closed, setClosed] = useState<BoqChangeReview[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map());
  const [filter, setFilter] = useState<Filter>("issues");
  const [search, setSearch] = useState("");
  const [historyItem, setHistoryItem] = useState<string | null>(null);

  // alive(): false once the project changed, so a slow answer for the previous project is dropped
  const reload = useCallback(async (alive: () => boolean = () => true) => {
    if (!projectId) return;
    const [rec, o, c] = await Promise.all([
      loadReconciliation(db, projectId),
      listChangeReviews(db, projectId, "open"),
      listChangeReviews(db, projectId, "closed"),
    ]);
    const names = await taskLabels(db, o.flatMap((r) => r.task_ids));
    if (!alive()) return;
    setLines(rec.lines);
    setSummary(rec.summary);
    setOpen(o);
    setClosed(c);
    setLabels(names);
  }, [db, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the selected project's mapping data
    setLoading(true);
    reload(() => !cancelled)
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [projectId, reload]);

  const refById = useMemo(() => new Map(lines.map((l) => [l.id, l.ref ?? l.description ?? l.id.slice(0, 8)])), [lines]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === "issues" ? l.issues.length === 0 && l.status !== "partial" : filter !== "all" && l.status !== filter) return false;
      return !q || (l.ref ?? "").toLowerCase().includes(q) || (l.description ?? "").toLowerCase().includes(q);
    });
  }, [lines, filter, search]);

  if (!projectId) return <p className="p-6 text-sm text-muted-foreground">Select a project.</p>;
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const s = summary;
  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="BOQ lines" value={s.lines} />
          <Card label="Complete" value={s.byStatus.complete} tone="good" />
          <Card label="Partial" value={s.byStatus.partial} tone={s.byStatus.partial ? "warn" : undefined} />
          <Card label="Counted twice" value={s.byStatus.over} tone={s.byStatus.over ? "bad" : undefined} />
          <Card label="Unmapped" value={s.byStatus.unmapped} />
          <Card label="BOQ changes to review" value={open.length} tone={open.length ? "warn" : undefined} />
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {([["reconcile", "Reconciliation"], ["changes", `BOQ changes${open.length ? ` (${open.length})` : ""}`], ["history", "History"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "reconcile" && s && (
        <div className="space-y-3">
          {s.totals.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">BOQ quantity</th><th className="px-3 py-2 text-right">Mapped</th><th className="px-3 py-2 text-right">Mapped %</th></tr>
                </thead>
                <tbody>
                  {s.totals.map((t) => {
                    const pct = t.boq_quantity > 0 ? (t.mapped_quantity / t.boq_quantity) * 100 : null;
                    return (
                      <tr key={t.unit} className="border-t border-border tabular-nums">
                        <td className="px-3 py-1.5 font-medium">{t.unit}</td>
                        <td className="px-3 py-1.5 text-right">{t.lines}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(t.boq_quantity)}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(t.mapped_quantity)}</td>
                        <td className={cn("px-3 py-1.5 text-right font-semibold", pct != null && pct > 100.5 ? "text-red-600" : pct != null && pct < 99.5 ? "text-amber-600" : "")}>{pct == null ? "-" : `${fmt(pct, 1)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                Lines of the contract main-works BOQ and of the programme&apos;s tender. Lines linked in another unit are not counted in Mapped.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <option value="issues">Lines that need attention</option>
              <option value="all">All lines</option>
              {(Object.keys(STATUS) as MappingStatus[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item code or description" className="w-64 rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs" />
            </div>
            <span className="text-xs text-muted-foreground">{shown.length} lines{shown.length > MAX_ROWS ? `, first ${MAX_ROWS} shown` : ""}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Item</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2 text-right">BOQ qty</th><th className="px-3 py-2 text-right">Mapped</th><th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2">Routes</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Issues</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, MAX_ROWS).map((l) => (
                  <tr key={`${l.source}:${l.id}`} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono">{l.ref ?? "-"}{l.source === "tender_boq" && <span className="ml-1 text-[10px] text-muted-foreground">tender</span>}</td>
                    <td className="max-w-xs truncate px-3 py-1.5" title={l.description ?? ""}>{l.description}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{[l.building, l.level].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(l.quantity)} {l.unit}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(l.mapped_quantity)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.paths ? `${fmt(l.mapped_pct, 1)}%` : "-"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {l.programme && <Route title={`Generate from BOQ: ${fmt(l.programme.share_pct, 2)}% over ${l.programme.tasks} activities`}>BOQ</Route>}
                      {l.links && <Route title={l.links.map((k) => `${k.metric_code}: factor ${fmt(k.factor_sum, 4)} over ${k.nodes} levels (${k.unit ?? "no unit"})`).join("\n")}>Library</Route>}
                      {l.direct && <Route title={`Task Work: ${l.direct.tasks} activities, ${fmt(l.direct.quantity)} ${l.direct.unit ?? ""}`}>Task</Route>}
                    </td>
                    <td className="px-3 py-1.5"><span className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS[l.status].cls)}>{STATUS[l.status].label}</span></td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {l.issues.map((i) => <span key={i} title={ISSUE[i]} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{ISSUE_SHORT[i]}</span>)}
                        {l.issues.includes("library_shares") && <span className="text-[10px] text-muted-foreground">{fmt(l.work_item_share_pct, 1)}% over {l.work_item_masters}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {l.paths > 0 && (
                        <button type="button" title="Mapping history of this line" className="text-muted-foreground hover:text-foreground" onClick={() => { setHistoryItem(l.id); setTab("history"); }}>
                          <History className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">No lines match.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Fix over-mapping at its source: the BOQ item&apos;s activity shares (Activity Database), the location map, or the library links in the Generate run; then generate again.
          </p>
        </div>
      )}

      {tab === "changes" && (
        <ChangeQueue open={open} closed={closed} labels={labels} canDecide={canEditSchedule} onDecided={() => reload()} decide={(id, d, note) => decideChangeReview(db, id, d, note)} />
      )}

      {tab === "history" && (
        <MappingHistory projectId={projectId} itemId={historyItem} refById={refById} onClearItem={() => setHistoryItem(null)} />
      )}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-600", tone === "warn" && "text-amber-600", tone === "bad" && "text-red-600")}>{value}</p>
    </div>
  );
}

function Route({ title, children }: { title: string; children: React.ReactNode }) {
  return <span title={title} className="mr-1 rounded border border-border px-1 py-0.5 text-[10px]">{children}</span>;
}

function ChangeQueue({ open, closed, labels, canDecide, onDecided, decide }: {
  open: BoqChangeReview[];
  closed: BoqChangeReview[];
  labels: Map<string, string>;
  canDecide: boolean;
  onDecided: () => Promise<void>;
  decide: (id: string, decision: "apply" | "keep", note?: string) => Promise<ChangeDecisionResult>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(r: BoqChangeReview, decision: "apply" | "keep") {
    const note = notes[r.id]?.trim();
    if (decision === "keep" && !note) {
      toast.error("Give a reason to keep the current plan");
      return;
    }
    setBusy(r.id);
    try {
      const res = await decide(r.id, decision, note || undefined);
      if (decision === "apply") {
        const n = res.programme_tasks + res.direct_tasks;
        toast.success(`New quantity applied to ${n} ${n === 1 ? "activity" : "activities"}`
          + (res.locked_tasks ? `; ${res.locked_tasks} under a locked WBS node left unchanged` : "")
          + (res.links_to_update_in_generate ? `; ${res.links_to_update_in_generate} library links: update them in the Generate run ("BOQ revised")` : ""));
      } else {
        toast.success("Plan kept");
      }
      await onDecided();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No BOQ changes waiting. A change to the quantity of a BOQ line the programme uses, or its deletion, appears here.
        </p>
      ) : (
        <div className="space-y-2">
          {open.map((r) => {
            const delta = r.old_quantity && r.new_quantity != null ? ((r.new_quantity - r.old_quantity) / r.old_quantity) * 100 : null;
            return (
              <div key={r.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono font-semibold">{r.item_ref ?? "-"}</span>
                  <span className="min-w-0 flex-1 truncate">{r.description}</span>
                  <span className="text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 tabular-nums">
                  {r.change_kind === "removed"
                    ? <span className="font-semibold text-red-600">Line deleted from the BOQ (was {fmt(r.old_quantity)} {r.unit})</span>
                    : <span>{fmt(r.old_quantity)} → <b>{fmt(r.new_quantity)}</b> {r.unit}{delta != null && <span className={cn("ml-1", delta > 0 ? "text-amber-600" : "text-sky-600")}>({delta > 0 ? "+" : ""}{fmt(delta, 1)}%)</span>}</span>}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {r.task_ids.length} {r.task_ids.length === 1 ? "activity" : "activities"}
                  {r.task_ids.length > 0 && `: ${r.task_ids.slice(0, 4).map((id) => labels.get(id) ?? id.slice(0, 8)).join(", ")}${r.task_ids.length > 4 ? ` +${r.task_ids.length - 4}` : ""}`}
                  {r.link_count > 0 && ` · ${r.link_count} library links`}
                </p>
                {canDecide && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder={r.change_kind === "removed" ? "Reason (required)" : "Note (required to keep the plan)"}
                      className="min-w-48 flex-1 rounded-md border border-border bg-background px-2 py-1.5"
                    />
                    {r.change_kind !== "removed" && (
                      <button type="button" disabled={busy === r.id} onClick={() => void run(r, "apply")} className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50">
                        Apply new quantity
                      </button>
                    )}
                    <button type="button" disabled={busy === r.id} onClick={() => void run(r, "keep")} className="rounded-md border border-border px-3 py-1.5 font-semibold disabled:opacity-50">
                      {r.change_kind === "removed" ? "Acknowledge" : "Keep current plan"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Decided ({closed.length})</summary>
          <table className="w-full text-xs">
            <tbody>
              {closed.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{r.decided_at ? new Date(r.decided_at).toLocaleDateString() : "-"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{r.item_ref}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{r.change_kind === "removed" ? "deleted" : `${fmt(r.old_quantity)} → ${fmt(r.new_quantity)} ${r.unit ?? ""}`}</td>
                  <td className="px-3 py-1.5 font-semibold">{r.status}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.decision_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

function MappingHistory({ projectId, itemId, refById, onClearItem }: {
  projectId: string;
  itemId: string | null;
  refById: Map<string, string>;
  onClearItem: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<MappingHistoryRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listMappingHistory(db, projectId, { boqItemId: itemId ?? undefined });
      const [t, n] = await Promise.all([
        taskLabels(db, list.map((r) => r.task_id).filter((x): x is string => !!x)),
        nodeLabels(db, list.map((r) => r.wbs_node_id).filter((x): x is string => !!x)),
      ]);
      if (!cancelled) {
        setRows(list);
        setNames(new Map([...t, ...n]));
      }
    })().catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [db, projectId, itemId]);

  const change = (r: MappingHistoryRow) => {
    const keys = r.mapping === "programme" ? ["share_pct", "quantity"] : ["factor", "boq_quantity_at_link"];
    const label: Record<string, string> = { share_pct: "share %", quantity: "qty", factor: "factor", boq_quantity_at_link: "BOQ qty" };
    return keys
      .map((k) => {
        const o = r.old_values?.[k];
        const n = r.new_values?.[k];
        if (r.action === "update" && String(o) === String(n)) return null;
        return `${label[k]} ${r.action === "insert" ? fmt(Number(n), 4) : r.action === "delete" ? fmt(Number(o), 4) : `${fmt(Number(o), 4)} → ${fmt(Number(n), 4)}`}`;
      })
      .filter(Boolean)
      .join(", ");
  };

  if (!rows) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  return (
    <div className="space-y-2">
      {itemId && (
        <p className="text-xs">
          History of <b className="font-mono">{refById.get(itemId) ?? itemId.slice(0, 8)}</b>{" "}
          <button type="button" className="text-primary underline" onClick={onClearItem}>show all lines</button>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No mapping changes recorded yet. Changes are recorded from Phase B on.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">BOQ item</th><th className="px-3 py-2">Route</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Activity / level</th><th className="px-3 py-2">Change</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{new Date(r.changed_at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{r.boq_item_id ? refById.get(r.boq_item_id) ?? r.boq_item_id.slice(0, 8) : "-"}</td>
                  <td className="px-3 py-1.5">{r.mapping === "programme" ? "Generate from BOQ" : `Library link${r.metric_code ? ` (${r.metric_code})` : ""}`}</td>
                  <td className="px-3 py-1.5">{r.action === "insert" ? "added" : r.action === "delete" ? "removed" : "changed"}</td>
                  <td className="max-w-xs truncate px-3 py-1.5">{names.get(r.task_id ?? r.wbs_node_id ?? "") ?? "-"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{change(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
