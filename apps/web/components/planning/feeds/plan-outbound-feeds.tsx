"use client";

// Doc 35 I3–I7: Planning's outbound feeds. Each tab shows what the programme asks of one module as it is now,
// what changed since the version last published, and publishes the next version (Programme approve). The receiving
// module reads the published version (plan_latest_feed), so mid-edit changes never reach it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Send, Settings2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  FEED_KEYS, FEED_META, diffFeed, rowFlag, weeklyHeadcount,
  type AnyFeedRow, type CostRow, type FeedKey, type FeedSettings, type InspectionRow, type ManpowerRow, type MaterialRow,
  type RowFlag, type SubmissionRow,
} from "@/lib/planning/feeds/feed-model";
import {
  listPublications, previewFeed, publicationRows, publishFeed, saveFeedSettings, type FeedPreview, type FeedPublication,
} from "@/lib/planning/feeds/feed-service";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : "—";
const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));

interface Col { label: string; text: (r: AnyFeedRow) => string | number | null; right?: boolean; mono?: boolean }
const LABEL: Record<string, string> = {
  covered: "Covered", pr_late: "PR needed later", no_pr: "No PR", passed: "Passed", requested: "Requested", ir_late: "IR after due",
  not_requested: "Not requested", approved: "Approved", submitted: "Submitted", planned: "Registered", target_late: "Target too late",
  not_registered: "Not registered", material: "Material", equipment: "Equipment", shop_drawing: "Shop drawing", method_statement: "Method statement",
  labor: "Labour", subcontract: "Subcontract",
};
const L = (s: string | null | undefined) => (s ? LABEL[s] ?? s : "—");

const COLS: Record<FeedKey, Col[]> = {
  materials: [
    { label: "Order by", text: (r) => fmt((r as MaterialRow).order_by) },
    { label: "On site by", text: (r) => fmt((r as MaterialRow).required_on_site) },
    { label: "Activity", text: (r) => `${(r as MaterialRow).task_code ?? ""} ${(r as MaterialRow).task_name ?? ""}` },
    { label: "Resource", text: (r) => `${(r as MaterialRow).resource ?? ""} (${L((r as MaterialRow).kind)})` },
    { label: "Quantity", text: (r) => `${num((r as MaterialRow).quantity, 2)} ${(r as MaterialRow).unit ?? ""}`, right: true },
    { label: "Lead (days)", text: (r) => `${(r as MaterialRow).lead_time_days}${(r as MaterialRow).lead_time_source === "default" ? " (default)" : ""}`, right: true },
    { label: "Purchase request", text: (r) => (r as MaterialRow).pr_numbers ? `${(r as MaterialRow).pr_numbers} · needed ${fmt((r as MaterialRow).pr_required_date)}` : "—" },
    { label: "Status", text: (r) => L((r as MaterialRow).coverage) },
  ],
  manpower: [
    { label: "Week of", text: (r) => fmt((r as ManpowerRow).week) },
    { label: "Trade", text: (r) => (r as ManpowerRow).trade ?? (r as ManpowerRow).trade_code },
    { label: "Hours", text: (r) => num((r as ManpowerRow).hours, 1), right: true },
    { label: "Working days", text: (r) => (r as ManpowerRow).working_days, right: true },
    { label: "Headcount", text: (r) => num((r as ManpowerRow).headcount, 1), right: true },
  ],
  inspections: [
    { label: "Request by", text: (r) => fmt((r as InspectionRow).request_by) },
    { label: "Due", text: (r) => fmt((r as InspectionRow).planned_date) },
    { label: "Activity", text: (r) => `${(r as InspectionRow).task_code ?? ""} ${(r as InspectionRow).task_name ?? ""}` },
    { label: "Test / inspection", text: (r) => `${(r as InspectionRow).item_code} ${(r as InspectionRow).item} (${(r as InspectionRow).tc_type})` },
    { label: "In an ITP", text: (r) => ((r as InspectionRow).in_itp ? "yes" : "no") },
    { label: "Inspection request", text: (r) => (r as InspectionRow).ir_numbers ? `${(r as InspectionRow).ir_numbers} · ${fmt((r as InspectionRow).ir_inspection_date)}` : "—" },
    { label: "Status", text: (r) => L((r as InspectionRow).state) },
  ],
  submissions: [
    { label: "Submit by", text: (r) => fmt((r as SubmissionRow).submit_by) },
    { label: "Approved by", text: (r) => fmt((r as SubmissionRow).approve_by) },
    { label: "Item", text: (r) => `${(r as SubmissionRow).item_code} ${(r as SubmissionRow).item} (${L((r as SubmissionRow).kind)})` },
    { label: "First needed by", text: (r) => `${(r as SubmissionRow).first_task ?? ""} on ${fmt((r as SubmissionRow).first_start)}${(r as SubmissionRow).activities > 1 ? ` (+${(r as SubmissionRow).activities - 1})` : ""}` },
    { label: "Submittal", text: (r) => (r as SubmissionRow).submittal_numbers ? `${(r as SubmissionRow).submittal_numbers} · target ${fmt((r as SubmissionRow).target_submission_date)}` : "—" },
    { label: "Status", text: (r) => L((r as SubmissionRow).state) },
  ],
  cost: [
    { label: "Month", text: (r) => (r as CostRow).month.slice(0, 7) },
    { label: "Cost code", text: (r) => (r as CostRow).cost_code, mono: true },
    { label: "Type", text: (r) => L((r as CostRow).kind) },
    { label: "Amount", text: (r) => `${(r as CostRow).currency ?? ""} ${num((r as CostRow).amount, 2)}`, right: true },
  ],
};

const FLAG_CLS: Record<Exclude<RowFlag, null>, string> = {
  overdue: "bg-red-50/70 dark:bg-red-950/30",
  warn: "bg-amber-50/70 dark:bg-amber-950/30",
  done: "text-muted-foreground",
};

export function PlanOutboundFeeds() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const { canApproveProgramme, canEditSchedule } = usePlanningPermissions();
  const [feed, setFeed] = useState<FeedKey>("materials");
  const [tick, setTick] = useState(0);
  const key = `${projectId}|${feed}|${tick}`;
  const [live, setLive] = useState<{ key: string; data: FeedPreview | null; error: string | null } | null>(null);
  const [pubs, setPubs] = useState<{ projectId: string; list: FeedPublication[] } | null>(null);
  const [published, setPublished] = useState<{ id: string; rows: AnyFeedRow[] } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "attention">("all");

  useEffect(() => {
    if (!projectId) return;
    let ok = true;
    previewFeed(db, projectId, feed)
      .then((data) => { if (ok) setLive({ key, data, error: null }); })
      .catch((e) => { if (ok) setLive({ key, data: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { ok = false; };
  }, [db, projectId, feed, key]);

  const loadPubs = useCallback(() => {
    if (!projectId) return;
    listPublications(db, projectId).then((list) => setPubs({ projectId, list })).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [db, projectId]);
  useEffect(loadPubs, [loadPubs]);

  const feedPubs = useMemo(() => (pubs?.projectId === projectId ? pubs.list : []).filter((p) => p.feed === feed), [pubs, projectId, feed]);
  const latest = feedPubs[0] ?? null;
  useEffect(() => {
    if (!latest) return;
    let ok = true;
    publicationRows(db, latest.id).then((rows) => { if (ok) setPublished({ id: latest.id, rows }); }).catch(() => {});
    return () => { ok = false; };
  }, [db, latest]);

  const current = live?.key === key ? live : null;
  const rows = useMemo(() => current?.data?.rows ?? [], [current]);
  const asAt = current?.data?.as_at ?? new Date().toISOString().slice(0, 10);
  // null until the published rows being compared are loaded
  const diff = useMemo(() => {
    const before = latest ? (published?.id === latest.id ? published.rows : undefined) : [];
    return current?.data && before !== undefined ? diffFeed(before, rows) : null;
  }, [current, latest, published, rows]);
  const changedKeys = useMemo(() => new Set([...(diff?.added ?? []), ...(diff?.changed ?? [])]), [diff]);
  const flags = useMemo(() => rows.map((r) => rowFlag(feed, r, asAt)), [rows, feed, asAt]);
  const attention = flags.filter((f) => f === "overdue" || f === "warn").length;
  const shown = rows.map((r, i) => ({ r, f: flags[i] })).filter((x) => filter === "all" || x.f === "overdue" || x.f === "warn");

  async function publish() {
    if (!projectId) return;
    setPublishing(true);
    try {
      const r = await publishFeed(db, projectId, feed, note.trim() || null);
      toast.success(`${FEED_META[feed].label} published as version ${r.version} (${r.row_count} rows)${r.unchanged ? " — same as the version before" : ""}.`);
      setNote("");
      loadPubs();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Publishing failed"); } finally { setPublishing(false); }
  }

  function exportExcel(list: AnyFeedRow[], name: string) {
    const cols = COLS[feed];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols.map((c) => c.label), ...list.map((r) => cols.map((c) => c.text(r) ?? ""))]), FEED_META[feed].label.slice(0, 31));
    // the raw contract rows as well, for whoever maps them into their own system
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(list as unknown as Record<string, unknown>[]), "Data");
    XLSX.writeFile(wb, `${name}.xlsx`);
  }

  if (!projectId) return <p className="text-sm text-muted-foreground">Select a project.</p>;
  const meta = FEED_META[feed];
  const changes = diff ? diff.added.length + diff.changed.length + diff.removed.length : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {FEED_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => { setFeed(k); setFilter("all"); }}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", k === feed ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {FEED_META[k].label} <span className="text-xs text-muted-foreground">→ {FEED_META[k].receiver}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-muted-foreground">{meta.what} As at the data date {fmt(asAt)}.</p>
        <div className="flex gap-2">
          {canEditSchedule && current?.data && feed !== "cost" && feed !== "manpower" && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1 h-4 w-4" />Lead times</Button>
          )}
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportExcel(rows, `${feed}-live-${asAt}`)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <b>{latest ? `Published version ${latest.version}` : "Not published yet"}</b>
            {latest && <span className="text-muted-foreground"> · {fmt(latest.published_at.slice(0, 10))} {latest.published_at.slice(11, 16)} · data date {fmt(latest.as_at)} · {latest.row_count} rows{latest.note ? ` · “${latest.note}”` : ""}</span>}
            <div className="text-xs text-muted-foreground">
              {!diff ? "…" : !latest ? `${rows.length} rows would be sent to ${meta.receiver}.`
                : changes === 0 ? `The programme's demands are as published. ${meta.receiver} has the current version.`
                  : `Since version ${latest.version}: ${diff.added.length} new, ${diff.changed.length} changed, ${diff.removed.length} no longer needed. ${meta.receiver} still reads version ${latest.version}.`}
            </div>
          </div>
          {canApproveProgramme ? (
            <div className="flex items-center gap-2">
              <Input className="h-8 w-56" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" onClick={() => void publish()} disabled={publishing || !current?.data}>
                {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Publish to {meta.receiver}
              </Button>
            </div>
          ) : <span className="text-xs text-muted-foreground">Publishing needs Programme approve.</span>}
        </div>
      </section>

      {feed === "manpower" && rows.length > 0 && <HeadcountStrip rows={rows as ManpowerRow[]} />}
      {feed === "cost" && rows.length > 0 && <CostTotals rows={rows as CostRow[]} />}

      {!current ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : current.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{current.error}</p>
          : rows.length === 0 ? <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nothing to send: {emptyHint(feed)}</p>
            : (
              <>
                {feed !== "manpower" && feed !== "cost" && (
                  <div className="flex items-center gap-2 text-xs">
                    <button type="button" className={cn("rounded-full border px-2 py-0.5", filter === "all" && "border-primary bg-primary/10")} onClick={() => setFilter("all")}>All {rows.length}</button>
                    <button type="button" className={cn("rounded-full border px-2 py-0.5", filter === "attention" && "border-primary bg-primary/10")} onClick={() => setFilter("attention")}>Needs action {attention}</button>
                    <span className="text-muted-foreground">Red: overdue or too late · amber: due within 14 days · ● changed since the published version</span>
                  </div>
                )}
                <div className="max-h-[560px] overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-left text-muted-foreground">
                      <tr><th className="w-4" />{COLS[feed].map((c) => <th key={c.label} className={cn("px-2 py-1.5 font-medium", c.right && "text-right")}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {shown.slice(0, 1500).map(({ r, f }) => (
                        <tr key={r.key} className={cn("border-t border-border", f && FLAG_CLS[f])}>
                          <td className="pl-1 text-primary" title={changedKeys.has(r.key) ? "Changed since the published version" : undefined}>{latest && changedKeys.has(r.key) ? "●" : ""}</td>
                          {COLS[feed].map((c) => <td key={c.label} className={cn("px-2 py-1", c.right && "text-right tabular-nums whitespace-nowrap", c.mono && "font-mono")}>{c.text(r) ?? "—"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length > 1500 && <p className="px-2 py-1 text-xs text-muted-foreground">Showing 1,500 of {shown.length}; Excel has them all.</p>}
                </div>
              </>
            )}

      {feedPubs.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Published versions</h3>
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Version</th><th>Published</th><th>Data date</th><th>Rows</th><th>Note</th><th /></tr></thead>
            <tbody>
              {feedPubs.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1">v{p.version}</td><td>{fmt(p.published_at.slice(0, 10))} {p.published_at.slice(11, 16)}</td><td>{fmt(p.as_at)}</td>
                  <td>{p.row_count}</td><td>{p.note ?? ""}</td>
                  <td className="text-right">
                    <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => void publicationRows(db, p.id).then((r) => exportExcel(r, `${feed}-v${p.version}`)).catch((e) => toast.error(String(e)))}>
                      <FileSpreadsheet className="h-3.5 w-3.5" />Excel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {settingsOpen && current?.data && (
        <FeedSettingsDialog
          initial={current.data.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (s) => { await saveFeedSettings(db, projectId, s); setSettingsOpen(false); setTick((t) => t + 1); toast.success("Saved"); }}
        />
      )}
    </div>
  );
}

function emptyHint(feed: FeedKey): string {
  switch (feed) {
    case "materials": return "no remaining activity has priced BOQ materials or equipment mapped to it.";
    case "manpower": return "no remaining activity has labour hours (Task Work or BOQ mapping).";
    case "inspections": return "no remaining activity's library entry calls for a test or inspection.";
    case "submissions": return "no activity still to start needs a shop drawing or method statement in its library entry.";
    case "cost": return "no activity has priced cost.";
  }
}

function HeadcountStrip({ rows }: { rows: ManpowerRow[] }) {
  const weeks = weeklyHeadcount(rows);
  const peak = Math.max(1, ...weeks.map((w) => w.headcount));
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-2 text-xs text-muted-foreground">Headcount per week, all trades (peak {num(peak, 1)})</div>
      <div className="flex h-20 items-end gap-px overflow-x-auto">
        {weeks.map((w) => (
          <div key={w.week} className="min-w-[6px] flex-1 rounded-t bg-primary/70" style={{ height: `${(w.headcount / peak) * 100}%` }}
            title={`Week of ${fmt(w.week)}: ${num(w.headcount, 1)} people, ${num(w.hours, 0)} h`} />
        ))}
      </div>
    </section>
  );
}

function CostTotals({ rows }: { rows: CostRow[] }) {
  const byCur = new Map<string, number>();
  for (const r of rows) byCur.set(r.currency ?? "", (byCur.get(r.currency ?? "") ?? 0) + r.amount);
  const months = new Set(rows.map((r) => r.month)).size;
  return (
    <p className="text-xs text-muted-foreground">
      {[...byCur.entries()].map(([c, v]) => `${c} ${num(v, 0)}`).join(" · ")} over {months} month(s), {new Set(rows.map((r) => r.cost_code)).size} cost code(s).
    </p>
  );
}

function FeedSettingsDialog({ initial, onClose, onSave }: { initial: FeedSettings; onClose: () => void; onSave: (s: FeedSettings) => Promise<void> }) {
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof FeedSettings, label: string, hint: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min="0" max="365" value={s[k]} onChange={(e) => setS((p) => ({ ...p, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead times</DialogTitle>
          <DialogDescription>Calendar days used to work back from activity dates. Applies to the next preview and publication.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field("material_lead_days", "Material lead time", "When the price gives none")}
          {field("site_buffer_days", "Site buffer", "On site this long before the activity starts")}
          {field("submission_review_days", "Submission review period", "Consultant review before approval")}
          {field("submission_buffer_days", "Approval buffer", "Approved this long before the first activity starts")}
          {field("inspection_notice_days", "Inspection notice", "Request raised this long before it is due (max 60)")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={() => { setSaving(true); void onSave(s).catch((e) => toast.error(e instanceof Error ? e.message : String(e))).finally(() => setSaving(false)); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
