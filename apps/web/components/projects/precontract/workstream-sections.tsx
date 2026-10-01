"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, ExternalLink, GanttChartSquare, Loader2, MessageSquarePlus, Plus, ShieldAlert, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COMMERCIAL_TOPICS, setWorkstreamRequired, type WorkstreamCode } from "@/lib/qs/tender-lifecycle";
import {
  canPrepare,
  Card,
  EmptyState,
  Field,
  fieldClass,
  formatDate,
  formatMoney,
  nextNumber,
  Pill,
  pricingLocked,
  smallFieldClass,
  StageNotice,
  staffName,
  WorkstreamStrip,
  type PrecontractCtx,
} from "./shared";

const supabase = () => createClient();
const nowIso = () => new Date().toISOString();

/** Loads rows for a tender register; `reload()` refetches. */
function useTenderRows<T>(table: string, tenderId: string | undefined, order: { column: string; ascending?: boolean }[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!tenderId);
  const [key, setKey] = useState(0);
  const orderKey = JSON.stringify(order);
  useEffect(() => {
    if (!tenderId) return;
    let cancelled = false;
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase().from(table as never).select("*").eq("tender_id", tenderId);
      for (const o of JSON.parse(orderKey) as { column: string; ascending?: boolean }[]) q = q.order(o.column, { ascending: o.ascending ?? true });
      const { data, error } = await q;
      if (cancelled) return;
      if (error) toast.error(error.message);
      setRows((data ?? []) as T[]);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [table, tenderId, orderKey, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  /** Shows a row change at once; call reload() only if the save fails. */
  const patchRow = useCallback((id: string, fields: Partial<T>) =>
    setRows((prev) => prev.map((r) => ((r as { id: string }).id === id ? { ...r, ...fields } : r))), []);
  return { rows, loading, reload, patchRow };
}

/** Optimistic update of one row: shown immediately, saved, and reverted by a reload on error. */
async function saveRow<T>(
  table: string,
  id: string,
  fields: Record<string, unknown>,
  hook: { patchRow: (id: string, f: Partial<T>) => void; reload: () => void },
) {
  hook.patchRow(id, fields as Partial<T>);
  const { error } = await supabase().from(table as never).update(fields as never).eq("id", id);
  if (error) {
    toast.error(error.message);
    hook.reload();
  }
}

function NoTender() {
  return <EmptyState>Link a tender register to this project (Registration → Edit) to use this workstream.</EmptyState>;
}

function Loading() {
  return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}

function SectionShell({ ctx, codes, what, children }: { ctx: PrecontractCtx; codes: WorkstreamCode[]; what: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <WorkstreamStrip ctx={ctx} codes={codes} />
      <StageNotice ctx={ctx} what={what} />
      {children}
    </div>
  );
}

// ─── 04 Tender Documents ─────────────────────────────────────────────────────

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "invitation_to_tender", label: "Invitation to Tender" },
  { value: "tender_instruction", label: "Instructions to Tenderers" },
  { value: "employer_requirements", label: "Employer Requirements" },
  { value: "conditions_of_contract", label: "Conditions of Contract" },
  { value: "specification", label: "Specification" },
  { value: "dwg", label: "Drawing" },
  { value: "boq", label: "BOQ" },
  { value: "schedule_of_rates", label: "Schedule of Rates" },
  { value: "forms", label: "Forms" },
  { value: "site_information", label: "Site Information" },
  { value: "geotechnical", label: "Geotechnical Information" },
  { value: "appendix", label: "Appendix" },
  { value: "addendum", label: "Addendum" },
  { value: "clarification", label: "Clarification" },
  { value: "pdf", label: "PDF (other)" },
  { value: "other", label: "Other" },
];
const docTypeLabel = (v: string) => DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v;
const DISCIPLINES = ["ARC", "STR", "MEP", "BIM", "CIV", "GEN"];

interface TenderDocument {
  id: string;
  document_no: string;
  title: string;
  document_type: string;
  discipline: string | null;
  revision: string | null;
  issue_date: string | null;
  received_date: string | null;
  source: string | null;
  status: string;
}

export function DocumentsSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading, reload, patchRow } = useTenderRows<TenderDocument>("qto_document_register", tenderId, [{ column: "document_type" }, { column: "document_no" }]);
  const empty = { document_no: "", title: "", document_type: "tender_instruction", discipline: "GEN", revision: "0", issue_date: "", received_date: new Date().toISOString().slice(0, 10), source: "" };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const editable = !!tenderId && ctx.can("tender_register", "edit") && !["awarded", "unsuccessful", "closed"].includes(ctx.details.tender_stage);

  async function add() {
    // One register entry per document number and revision; a new revision is a new entry.
    const no = form.document_no.trim().toUpperCase();
    const rev = (form.revision.trim() || "").toUpperCase();
    if (rows.some((d) => d.document_no.trim().toUpperCase() === no && (d.revision ?? "").trim().toUpperCase() === rev)) {
      toast.error(`${form.document_no.trim()} rev ${form.revision.trim() || "—"} is already registered.`);
      return;
    }
    const { data: { user } } = await supabase().auth.getUser();
    const { error } = await supabase().from("qto_document_register").insert({
      tender_id: tenderId!,
      document_no: form.document_no.trim(),
      title: form.title.trim(),
      document_type: form.document_type,
      discipline: form.discipline,
      revision: form.revision.trim() || null,
      issue_date: form.issue_date || null,
      received_date: form.received_date || null,
      source: form.source.trim() || null,
      status: "received",
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    setForm(empty);
    setShowForm(false);
    reload();
  }

  const setStatus = (d: TenderDocument, status: string) =>
    saveRow<TenderDocument>("qto_document_register", d.id, { status, updated_at: nowIso() }, { patchRow, reload });

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["documents"]} what="The document register">
      <Card
        title="Tender Document Register"
        description="Every document received from the client, with its revision — take-off, technical review, pricing and clarifications trace back to these."
        actions={<>
          {editable && <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3.5 w-3.5 mr-1" /> Register Document</Button>}
          <Button size="sm" variant="ghost" onClick={() => ctx.openInModule("/dashboard/qto?tab=documents")}><ExternalLink className="h-3.5 w-3.5 mr-1" /> QTO Documents</Button>
        </>}
      >
        {showForm && (
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <input className={fieldClass} placeholder="Document No." value={form.document_no} onChange={(e) => setForm({ ...form, document_no: e.target.value })} />
            <input className={cn(fieldClass, "sm:col-span-3")} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className={fieldClass} value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
              {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className={fieldClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
              {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input className={fieldClass} placeholder="Revision" value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
            <input className={fieldClass} placeholder="Source (e.g. client portal)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <label className="text-xs text-muted-foreground">Issue date<input type="date" className={fieldClass} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Received<input type="date" className={fieldClass} value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} /></label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" disabled={!form.document_no.trim() || !form.title.trim()} onClick={add}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <Loading /> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tender documents registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Document</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Disc.</th>
                  <th className="py-2 pr-3 font-medium">Rev</th>
                  <th className="py-2 pr-3 font-medium">Received</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3"><span className="font-medium">{d.document_no}</span> <span className="text-muted-foreground">· {d.title}</span></td>
                    <td className="py-2 pr-3 text-xs">{docTypeLabel(d.document_type)}</td>
                    <td className="py-2 pr-3 text-xs">{d.discipline ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{d.revision ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{formatDate(d.received_date)}</td>
                    <td className="py-2 pr-3 text-xs">{d.source ?? "—"}</td>
                    <td className="py-2">
                      <select className={cn(smallFieldClass, "text-xs")} value={d.status} disabled={!editable} onChange={(e) => setStatus(d, e.target.value)}>
                        <option value="received">Received</option>
                        <option value="registered">Registered</option>
                        <option value="superseded">Superseded</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}

// ─── 05 Technical Review ─────────────────────────────────────────────────────

const TECH_TYPES: { value: string; label: string }[] = [
  { value: "scope", label: "Scope Understanding" },
  { value: "design_issue", label: "Design Issue" },
  { value: "missing_info", label: "Missing Information" },
  { value: "constructability", label: "Constructability Issue" },
  { value: "assumption", label: "Design Assumption" },
  { value: "technical_risk", label: "Technical Risk" },
  { value: "alternative", label: "Proposed Alternative" },
];
const techTypeLabel = (v: string) => TECH_TYPES.find((t) => t.value === v)?.label ?? v;

interface TechnicalItem {
  id: string;
  discipline: "ARC" | "STR" | "MEP" | "BIM";
  item_type: string;
  description: string;
  source_document_id: string | null;
  status: string;
  owner_id: string | null;
  clarification_id: string | null;
  risk_id: string | null;
}

export function TechnicalSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading, reload, patchRow } = useTenderRows<TechnicalItem>("tender_technical_items", tenderId, [{ column: "created_at" }]);
  const { rows: docs } = useTenderRows<TenderDocument>("qto_document_register", tenderId, [{ column: "document_no" }]);
  const [filter, setFilter] = useState<"ALL" | TechnicalItem["discipline"]>("ALL");
  const [form, setForm] = useState({ discipline: "ARC", item_type: "scope", description: "", source_document_id: "" });
  const editable = canPrepare(ctx) && ctx.can("tender_technical", "edit");
  const visible = filter === "ALL" ? rows : rows.filter((r) => r.discipline === filter);

  async function add() {
    const { data: { user } } = await supabase().auth.getUser();
    const { error } = await supabase().from("tender_technical_items").insert({
      tender_id: tenderId!,
      discipline: form.discipline,
      item_type: form.item_type,
      description: form.description.trim(),
      source_document_id: form.source_document_id || null,
      owner_id: user?.id ?? null,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    setForm({ ...form, description: "" });
    reload();
  }

  const update = (item: TechnicalItem, patch: Partial<TechnicalItem>) =>
    saveRow<TechnicalItem>("tender_technical_items", item.id, { ...patch, updated_at: nowIso() }, { patchRow, reload });

  async function raiseClarification(item: TechnicalItem) {
    const { data: { user } } = await supabase().auth.getUser();
    const queryNo = await nextNumber("tender_clarifications", "query_no", tenderId!, "Q");
    const { data, error } = await supabase().from("tender_clarifications").insert({
      tender_id: tenderId!, query_no: queryNo, category: "technical",
      question: `[${item.discipline}] ${item.description}`, raised_by: user?.id ?? null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await update(item, { clarification_id: data.id });
    toast.success(`Raised as ${queryNo}`);
  }

  async function addRisk(item: TechnicalItem) {
    const riskNo = await nextNumber("tender_risk_items", "risk_no", tenderId!, "R");
    const { data, error } = await supabase().from("tender_risk_items").insert({
      tender_id: tenderId!, risk_no: riskNo, description: `[${item.discipline}] ${item.description}`,
      category: item.discipline === "STR" || item.discipline === "ARC" ? "design" : "technical",
      likelihood: "medium", impact: "medium",
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await update(item, { risk_id: data.id });
    toast.success(`Added to the risk register as ${riskNo}`);
  }

  async function remove(id: string) {
    const { error } = await supabase().from("tender_technical_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    reload();
  }

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["technical_arc", "technical_str", "technical_mep", "technical_bim"]} what="The technical review">
      <Card
        title="Technical Review Register"
        description="What must actually be built: scope, design issues, missing information, constructability, assumptions, risks and alternatives."
        actions={<div className="flex gap-1">
          {(["ALL", "ARC", "STR", "MEP", "BIM"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setFilter(d)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium", filter === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
              {d}{d !== "ALL" && ` (${rows.filter((r) => r.discipline === d).length})`}
            </button>
          ))}
        </div>}
      >
        {editable && (
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[90px_190px_1fr]">
            <select className={fieldClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
              {["ARC", "STR", "MEP", "BIM"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={fieldClass} value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
              {TECH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className={fieldClass} value={form.source_document_id} onChange={(e) => setForm({ ...form, source_document_id: e.target.value })}>
              <option value="">— Source document / revision —</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.document_no} rev {d.revision ?? "—"} · {d.title}</option>)}
            </select>
            <textarea className={cn(fieldClass, "sm:col-span-3")} rows={2} placeholder="Description" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div><Button size="sm" disabled={!form.description.trim()} onClick={add}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button></div>
          </div>
        )}
        {loading ? <Loading /> : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">No technical review items.</p>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((item) => {
              const doc = docs.find((d) => d.id === item.source_document_id);
              return (
                <div key={item.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{item.discipline}</span> · {techTypeLabel(item.item_type)}
                        {doc && <> · {doc.document_no} rev {doc.revision ?? "—"}</>} · {staffName(ctx, item.owner_id)}
                      </p>
                      <p className="text-sm mt-0.5">{item.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.clarification_id && <Pill tone="blue">clarification raised</Pill>}
                        {item.risk_id && <Pill tone="amber">in risk register</Pill>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select className={cn(smallFieldClass, "text-xs")} value={item.status} disabled={!editable}
                        onChange={(e) => update(item, { status: e.target.value })}>
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                      {editable && !item.clarification_id && ctx.can("tender_clarifications", "can_create") && (
                        <Button size="sm" variant="ghost" className="h-8 px-2" title="Raise as clarification to client" onClick={() => raiseClarification(item)}>
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && !item.risk_id && (
                        <Button size="sm" variant="ghost" className="h-8 px-2" title="Add to risk register" onClick={() => addRisk(item)}>
                          <ShieldAlert className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {editable && ctx.can("tender_technical", "delete") && (
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-red-600" onClick={() => remove(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </SectionShell>
  );
}

// ─── 06 QS Tendering ─────────────────────────────────────────────────────────

interface BidSummary {
  id: string;
  revision_no: number;
  direct_cost: number;
  preliminaries: number | null;
  subcontract_cost: number | null;
  overhead_amount: number | null;
  profit_amount: number | null;
  contingency: number | null;
  risk_allowance: number | null;
  vat_amount: number | null;
  total_bid_price: number | null;
  status: string;
}

export function QsSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading } = useTenderRows<BidSummary>("tender_bid_summaries", tenderId, [{ column: "revision_no", ascending: false }]);
  const latest = rows[0];
  const money = (v: number | null | undefined) => formatMoney(v, ctx.details.bid_currency);

  if (!tenderId) return <NoTender />;
  return (
    <div className="space-y-4">
      <WorkstreamStrip ctx={ctx} codes={["qs_tendering"]} />
      {pricingLocked(ctx) && <StageNotice ctx={ctx} what="Pricing" />}
      <Card
        title={latest ? `Bid Summary · Rev ${latest.revision_no}` : "Bid Summary"}
        description="Take-off → tender BOQ → cost estimate → quotations → pricing → bid price."
        actions={<>
          <Button size="sm" variant="outline" onClick={() => ctx.openInModule(`/dashboard/tenders/cost-estimation?tender=${tenderId}`)}><Calculator className="h-3.5 w-3.5 mr-1.5" /> Cost Estimation</Button>
          <Button size="sm" variant="ghost" onClick={() => ctx.openInModule("/dashboard/qto")}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Take-Off</Button>
        </>}
      >
        {loading ? <Loading /> : !latest ? (
          <p className="text-xs text-muted-foreground">No bid summary prepared yet — build the tender BOQ and bid summary in Cost Estimation.</p>
        ) : (
          <div className="divide-y divide-border text-sm">
            {([
              ["Direct Cost", latest.direct_cost], ["Preliminaries", latest.preliminaries], ["Subcontract Cost", latest.subcontract_cost],
              ["Overhead", latest.overhead_amount], ["Profit", latest.profit_amount], ["Contingency", latest.contingency],
              ["Risk Allowance", latest.risk_allowance], ["VAT", latest.vat_amount],
            ] as [string, number | null][]).map(([l, v]) => (
              <div key={l} className="flex justify-between py-2"><span className="text-muted-foreground">{l}</span><span>{money(v)}</span></div>
            ))}
            <div className="flex justify-between py-2 font-semibold"><span>Total Bid Price</span><span>{money(latest.total_bid_price)}</span></div>
            <div className="flex justify-between py-2 text-xs text-muted-foreground"><span>Revision status</span><Pill>{latest.status}</Pill></div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 07 Tender Planning ──────────────────────────────────────────────────────

export function PlanningSection({ ctx }: { ctx: PrecontractCtx }) {
  const [taskCount, setTaskCount] = useState<number | null>(null);
  useEffect(() => {
    supabase().from("wbs_tasks").select("id", { count: "exact", head: true }).eq("project_id", ctx.project.id)
      .then(({ count }) => setTaskCount(count ?? 0));
  }, [ctx.project.id]);

  return (
    <SectionShell ctx={ctx} codes={["planning"]} what="Tender planning">
      <Card title="Tender Programme" description="If we win this project, how are we going to build it? The programme, methodology, resource and plant plan.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Programme activities" value={taskCount ?? "…"} />
          <Field label="Estimated duration" value={ctx.project.duration ? `${ctx.project.duration} months` : "—"} />
          <Field label="Tender days" value={ctx.details.tender_days ?? "—"} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          On award, this programme becomes the contract baseline of the same project — nothing is re-entered.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => ctx.openInModule("/dashboard/planning/gantt")}><GanttChartSquare className="h-3.5 w-3.5 mr-1.5" /> Programme (Gantt)</Button>
          <Button size="sm" variant="outline" onClick={() => ctx.openInModule("/dashboard/planning/resource-loading")}>Resources</Button>
          <Button size="sm" variant="outline" onClick={() => ctx.openInModule("/dashboard/planning/productivity")}>Productivity Norms</Button>
          <Button size="sm" variant="ghost" onClick={() => ctx.openInModule("/dashboard/wbs")}>WBS</Button>
        </div>
      </Card>
    </SectionShell>
  );
}

// ─── 08 Procurement ──────────────────────────────────────────────────────────

interface Quote {
  id: string;
  company_name: string;
  trade: string | null;
  quote_type: "supplier" | "subcontractor";
  status: "enquiry_sent" | "received" | "declined";
  quote_amount: number | null;
  currency: string | null;
  enquiry_date: string | null;
  received_date: string | null;
  valid_until: string | null;
  lead_time_days: number | null;
  availability: string | null;
  technical_score: number | null;
  commercial_score: number | null;
  is_preferred: boolean;
  scope_of_work: string | null;
}

export function ProcurementSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading, reload, patchRow } = useTenderRows<Quote>("tender_sub_quotes", tenderId, [{ column: "trade" }, { column: "quote_amount" }]);
  const empty = { company_name: "", trade: "", quote_type: "subcontractor", status: "enquiry_sent", quote_amount: "", lead_time_days: "", availability: "", scope_of_work: "" };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const editable = canPrepare(ctx) && ctx.can("tender_sub_quotes", "edit");

  const byTrade = useMemo(() => {
    const m = new Map<string, Quote[]>();
    for (const q of rows) {
      const k = q.trade?.trim() || "General";
      m.set(k, [...(m.get(k) ?? []), q]);
    }
    return [...m.entries()];
  }, [rows]);

  async function add() {
    const { error } = await supabase().from("tender_sub_quotes").insert({
      tender_id: tenderId!, company_name: form.company_name.trim(), trade: form.trade.trim() || null,
      quote_type: form.quote_type, status: form.status,
      quote_amount: form.quote_amount ? parseFloat(form.quote_amount) : 0,
      currency: ctx.details.bid_currency,
      enquiry_date: new Date().toISOString().slice(0, 10),
      received_date: form.status === "received" ? new Date().toISOString().slice(0, 10) : null,
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days, 10) : null,
      availability: form.availability.trim() || null,
      scope_of_work: form.scope_of_work.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setForm(empty);
    setShowForm(false);
    reload();
  }

  const update = (q: Quote, patch: Record<string, unknown>) =>
    saveRow<Quote>("tender_sub_quotes", q.id, patch, { patchRow, reload });

  // One preferred (selected tender rate) per trade.
  async function prefer(q: Quote, trade: string) {
    const others = rows.filter((r) => (r.trade?.trim() || "General") === trade && r.id !== q.id && r.is_preferred);
    for (const o of others) await update(o, { is_preferred: false });
    await update(q, { is_preferred: !q.is_preferred });
  }

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["procurement"]} what="Procurement">
      <Card
        title="Enquiries & Quotation Comparison"
        description="Market cost, availability and lead time to price the tender. Star the selected tender rate per trade."
        actions={editable && <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Enquiry / Quote</Button>}
      >
        {showForm && (
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <input className={cn(fieldClass, "sm:col-span-2")} placeholder="Company" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            <input className={fieldClass} placeholder="Trade / package (e.g. Structural Steel)" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} />
            <select className={fieldClass} value={form.quote_type} onChange={(e) => setForm({ ...form, quote_type: e.target.value })}>
              <option value="subcontractor">Subcontractor</option>
              <option value="supplier">Supplier</option>
            </select>
            <select className={fieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="enquiry_sent">Enquiry sent</option>
              <option value="received">Quote received</option>
              <option value="declined">Declined</option>
            </select>
            <input type="number" className={fieldClass} placeholder={`Amount (${ctx.details.bid_currency})`} value={form.quote_amount} onChange={(e) => setForm({ ...form, quote_amount: e.target.value })} />
            <input type="number" className={fieldClass} placeholder="Lead time (days)" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} />
            <input className={fieldClass} placeholder="Availability" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} />
            <input className={cn(fieldClass, "sm:col-span-3")} placeholder="Scope of work" value={form.scope_of_work} onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!form.company_name.trim()} onClick={add}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <Loading /> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No enquiries or quotations yet.</p>
        ) : (
          <div className="space-y-4">
            {byTrade.map(([trade, quotes]) => {
              const received = quotes.filter((q) => q.status === "received" && q.quote_amount);
              const lowest = received.length ? Math.min(...received.map((q) => Number(q.quote_amount))) : null;
              return (
                <div key={trade}>
                  <p className="mb-1 text-xs font-semibold">{trade} <span className="font-normal text-muted-foreground">· {quotes.length} enquir{quotes.length === 1 ? "y" : "ies"}</span></p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium w-8"></th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium text-right">Amount</th>
                          <th className="px-3 py-2 font-medium">Lead time</th>
                          <th className="px-3 py-2 font-medium">Availability</th>
                          <th className="px-3 py-2 font-medium">Tech /10</th>
                          <th className="px-3 py-2 font-medium">Comm /10</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {quotes.map((q) => (
                          <tr key={q.id} className={cn(q.is_preferred && "bg-emerald-50/60 dark:bg-emerald-950/30")}>
                            <td className="px-3 py-2">
                              <button type="button" disabled={!editable} title="Selected tender rate" onClick={() => prefer(q, trade)}>
                                <Star className={cn("h-4 w-4", q.is_preferred ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
                              </button>
                            </td>
                            <td className="px-3 py-2 font-medium">{q.company_name}</td>
                            <td className="px-3 py-2 text-xs capitalize">{q.quote_type}</td>
                            <td className="px-3 py-2">
                              <select className={cn(smallFieldClass, "text-xs")} value={q.status} disabled={!editable}
                                onChange={(e) => update(q, { status: e.target.value, received_date: e.target.value === "received" ? new Date().toISOString().slice(0, 10) : q.received_date })}>
                                <option value="enquiry_sent">Enquiry sent</option>
                                <option value="received">Received</option>
                                <option value="declined">Declined</option>
                              </select>
                            </td>
                            <td className={cn("px-3 py-2 text-right", lowest != null && Number(q.quote_amount) === lowest && "font-semibold text-emerald-700 dark:text-emerald-300")}>
                              {q.status === "received" ? formatMoney(q.quote_amount, q.currency ?? ctx.details.bid_currency) : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">{q.lead_time_days != null ? `${q.lead_time_days} d` : "—"}</td>
                            <td className="px-3 py-2 text-xs">{q.availability ?? "—"}</td>
                            {(["technical_score", "commercial_score"] as const).map((f) => (
                              <td key={f} className="px-3 py-2">
                                <input type="number" min={0} max={10} step={0.5} className={cn(smallFieldClass, "w-16")} disabled={!editable}
                                  defaultValue={q[f] ?? ""} onBlur={(e) => {
                                    const v = e.target.value === "" ? null : Number(e.target.value);
                                    if (v !== q[f]) void update(q, { [f]: v });
                                  }} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </SectionShell>
  );
}

// ─── 09 Commercial ───────────────────────────────────────────────────────────

interface CommercialItem {
  id: string;
  topic: string;
  client_requirement: string | null;
  assessment: "pending" | "acceptable" | "qualify" | "reject";
  qualification: string | null;
  cost_impact: number;
  risk_id: string | null;
  sort_order: number;
}

export function CommercialSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading, reload, patchRow } = useTenderRows<CommercialItem>("tender_commercial_items", tenderId, [{ column: "sort_order" }, { column: "created_at" }]);
  const editable = canPrepare(ctx) && ctx.can("tender_commercial", "edit");
  const topicLabel = (t: string) => COMMERCIAL_TOPICS.find((c) => c.topic === t)?.label ?? t;
  const totalImpact = rows.reduce((s, r) => s + Number(r.cost_impact || 0), 0);

  const update = (item: CommercialItem, patch: Partial<CommercialItem>) =>
    saveRow<CommercialItem>("tender_commercial_items", item.id, { ...patch, updated_at: nowIso() }, { patchRow, reload });

  async function addSpecial() {
    const { error } = await supabase().from("tender_commercial_items").insert({ tender_id: tenderId!, topic: "special_conditions", sort_order: rows.length });
    if (error) toast.error(error.message);
    reload();
  }

  async function addRisk(item: CommercialItem) {
    const riskNo = await nextNumber("tender_risk_items", "risk_no", tenderId!, "R");
    const { data, error } = await supabase().from("tender_risk_items").insert({
      tender_id: tenderId!, risk_no: riskNo, category: "contract", likelihood: "medium", impact: "medium",
      description: `${topicLabel(item.topic)}: ${item.client_requirement ?? "contract condition"}`,
      priced_amount: item.cost_impact || 0,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await update(item, { risk_id: data.id });
    toast.success(`Added to the risk register as ${riskNo}`);
  }

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["commercial"]} what="The commercial review">
      <Card
        title="Contract Conditions Review"
        description={`Assess each condition; qualifications go into the tender, cost impacts into pricing / risk allowance. Total cost impact ${formatMoney(totalImpact, ctx.details.bid_currency)}.`}
        actions={editable && <Button size="sm" variant="outline" onClick={addSpecial}><Plus className="h-3.5 w-3.5 mr-1" /> Special Condition</Button>}
      >
        {loading ? <Loading /> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">The review topics are created with the Go decision.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((item) => (
              <div key={item.id} className="grid gap-2 py-3 lg:grid-cols-[160px_1fr_130px_1fr_120px_auto] lg:items-start">
                <p className="text-sm font-medium">{topicLabel(item.topic)}</p>
                <textarea className={fieldClass} rows={2} placeholder="Client requirement" disabled={!editable}
                  defaultValue={item.client_requirement ?? ""} onBlur={(e) => e.target.value !== (item.client_requirement ?? "") && update(item, { client_requirement: e.target.value || null })} />
                <select className={fieldClass} value={item.assessment} disabled={!editable}
                  onChange={(e) => update(item, { assessment: e.target.value as CommercialItem["assessment"] })}>
                  <option value="pending">Pending</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="qualify">Qualify</option>
                  <option value="reject">Reject</option>
                </select>
                <textarea className={fieldClass} rows={2} placeholder="Qualification / deviation" disabled={!editable}
                  defaultValue={item.qualification ?? ""} onBlur={(e) => e.target.value !== (item.qualification ?? "") && update(item, { qualification: e.target.value || null })} />
                <input type="number" className={fieldClass} placeholder="Cost impact" disabled={!editable}
                  defaultValue={item.cost_impact || ""} onBlur={(e) => Number(e.target.value || 0) !== Number(item.cost_impact) && update(item, { cost_impact: Number(e.target.value || 0) })} />
                <div className="flex items-center gap-1">
                  {item.risk_id ? <Pill tone="amber">risk</Pill> : editable && (
                    <Button size="sm" variant="ghost" className="h-8 px-2" title="Add to risk register" onClick={() => addRisk(item)}>
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </SectionShell>
  );
}

// ─── 10 Risk & Opportunity ───────────────────────────────────────────────────

const RISK_CATEGORIES = ["technical", "cost", "programme", "procurement", "contract", "site", "labour", "design", "client", "commercial", "geotechnical", "market", "regulatory", "environmental", "schedule", "other"];
const LEVELS = ["very_low", "low", "medium", "high", "very_high"];

interface RiskItem {
  id: string;
  risk_no: string;
  entry_type: "risk" | "opportunity";
  description: string;
  cause: string | null;
  category: string;
  likelihood: string;
  impact: string;
  risk_score: string | null;
  priced_amount: number | null;
  programme_impact_days: number | null;
  mitigation: string | null;
  owner_id: string | null;
  owner: string | null;
  status: string;
}

export function RiskSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { rows, loading, reload, patchRow } = useTenderRows<RiskItem>("tender_risk_items", tenderId, [{ column: "risk_no" }]);
  const { rows: summaries, reload: reloadSummaries } = useTenderRows<BidSummary>("tender_bid_summaries", tenderId, [{ column: "revision_no", ascending: false }]);
  const empty = { entry_type: "risk", description: "", cause: "", category: "technical", likelihood: "medium", impact: "medium", priced_amount: "", programme_impact_days: "", mitigation: "", owner_id: "" };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const editable = canPrepare(ctx) && ctx.can("tender_risks", "edit");
  const live = rows.filter((r) => r.status === "open" || r.status === "realised");
  const riskTotal = live.filter((r) => r.entry_type === "risk").reduce((s, r) => s + Number(r.priced_amount || 0), 0);
  const oppTotal = live.filter((r) => r.entry_type === "opportunity").reduce((s, r) => s + Number(r.priced_amount || 0), 0);
  const allowance = Math.max(0, riskTotal - oppTotal);
  const latest = summaries[0];
  const money = (v: number | null | undefined) => formatMoney(v, ctx.details.bid_currency);

  async function add() {
    const riskNo = await nextNumber("tender_risk_items", "risk_no", tenderId!, form.entry_type === "opportunity" ? "O" : "R");
    const { error } = await supabase().from("tender_risk_items").insert({
      tender_id: tenderId!, risk_no: riskNo, entry_type: form.entry_type, description: form.description.trim(),
      cause: form.cause.trim() || null, category: form.category, likelihood: form.likelihood, impact: form.impact,
      priced_amount: form.priced_amount ? Number(form.priced_amount) : 0,
      programme_impact_days: form.programme_impact_days ? parseInt(form.programme_impact_days, 10) : null,
      mitigation: form.mitigation.trim() || null, owner_id: form.owner_id || null,
      owner: form.owner_id ? staffName(ctx, form.owner_id) : null,
    });
    if (error) { toast.error(error.message); return; }
    setForm(empty);
    setShowForm(false);
    reload();
  }

  const setStatus = (r: RiskItem, status: string) =>
    saveRow<RiskItem>("tender_risk_items", r.id, { status, updated_at: nowIso() }, { patchRow, reload });

  async function applyAllowance() {
    if (!latest) return;
    const { error } = await supabase().from("tender_bid_summaries").update({ risk_allowance: allowance, updated_at: nowIso() }).eq("id", latest.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Risk allowance on Rev ${latest.revision_no} set to ${money(allowance)}`);
    reloadSummaries();
  }

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["risk"]} what="The risk register">
      <Card title="Risk Allowance" description="Open risks minus open opportunities, priced.">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Open risks (priced)" value={money(riskTotal)} />
          <Field label="Opportunities (priced)" value={money(oppTotal)} />
          <Field label="Proposed allowance" value={money(allowance)} className="text-primary" />
          <Field label={latest ? `In bid summary (Rev ${latest.revision_no})` : "In bid summary"} value={latest ? money(latest.risk_allowance) : "—"} />
        </div>
        {editable && latest && Number(latest.risk_allowance ?? 0) !== allowance && (
          <Button size="sm" className="mt-3" onClick={applyAllowance}>Apply to Bid Summary</Button>
        )}
      </Card>

      <Card
        title="Risk & Opportunity Register"
        actions={editable && <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>}
      >
        {showForm && (
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <select className={fieldClass} value={form.entry_type} onChange={(e) => setForm({ ...form, entry_type: e.target.value })}>
              <option value="risk">Risk</option>
              <option value="opportunity">Opportunity</option>
            </select>
            <select className={fieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {RISK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={fieldClass} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: e.target.value })}>
              {LEVELS.map((l) => <option key={l} value={l}>Probability: {l.replace(/_/g, " ")}</option>)}
            </select>
            <select className={fieldClass} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
              {LEVELS.map((l) => <option key={l} value={l}>Impact: {l.replace(/_/g, " ")}</option>)}
            </select>
            <textarea className={cn(fieldClass, "sm:col-span-2")} rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <textarea className={cn(fieldClass, "sm:col-span-2")} rows={2} placeholder="Cause" value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} />
            <input type="number" className={fieldClass} placeholder="Cost impact" value={form.priced_amount} onChange={(e) => setForm({ ...form, priced_amount: e.target.value })} />
            <input type="number" className={fieldClass} placeholder="Programme impact (days)" value={form.programme_impact_days} onChange={(e) => setForm({ ...form, programme_impact_days: e.target.value })} />
            <select className={fieldClass} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
              <option value="">— Owner —</option>
              {ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <input className={fieldClass} placeholder="Mitigation" value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!form.description.trim()} onClick={add}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <Loading /> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No risks or opportunities registered.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.risk_no}</span> · <span className="capitalize">{r.category}</span>
                    {" · "}{staffName(ctx, r.owner_id) !== "—" ? staffName(ctx, r.owner_id) : r.owner ?? "no owner"}
                  </p>
                  <p className="text-sm mt-0.5">{r.description}</p>
                  {r.cause && <p className="text-xs text-muted-foreground">Cause: {r.cause}</p>}
                  {r.mitigation && <p className="text-xs text-muted-foreground">Mitigation: {r.mitigation}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={r.entry_type === "opportunity" ? "green" : "muted"}>{r.entry_type}</Pill>
                  {r.risk_score && (
                    <Pill tone={r.risk_score === "critical" ? "red" : r.risk_score === "high" ? "amber" : r.risk_score === "medium" ? "blue" : "muted"}>{r.risk_score}</Pill>
                  )}
                  <span className="text-xs text-muted-foreground">{money(r.priced_amount)}{r.programme_impact_days ? ` · ${r.programme_impact_days} d` : ""}</span>
                  <select className={cn(smallFieldClass, "text-xs")} value={r.status} disabled={!editable} onChange={(e) => setStatus(r, e.target.value)}>
                    <option value="open">Open</option>
                    <option value="mitigated">Mitigated</option>
                    <option value="realised">Realised</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </SectionShell>
  );
}

// ─── 11 HSE / QAQC ───────────────────────────────────────────────────────────

export function HseQaqcSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const ws = ctx.workstreams.find((w) => w.code === "hse_qaqc");
  const { rows, reload } = useTenderRows<{ id: string; item: string; is_mandatory: boolean; is_ready: boolean; workstream_code: string | null }>(
    "tender_returnables", tenderId, [{ column: "sort_order" }]);
  const deliverables = rows.filter((r) => r.workstream_code === "hse_qaqc");
  const canToggle = canPrepare(ctx) && ctx.can("tender_workstreams", "edit");

  // Requirement-driven: switching the workstream on makes its deliverables mandatory returnables.
  async function setRequired(required: boolean) {
    if (!ws) return;
    ctx.patchWorkstream(ws.id, { required });
    const r = await setWorkstreamRequired(ws, required);
    if (r.error) {
      toast.error(r.error);
      await ctx.refresh();
    }
    reload();
  }

  if (!tenderId) return <NoTender />;
  return (
    <SectionShell ctx={ctx} codes={["hse_qaqc"]} what="HSE / QAQC">
      <Card
        title="HSE / QAQC Submission"
        description="Only what this tender asks for. When required, each deliverable becomes a mandatory returnable in Tender Compilation."
      >
        {!ws ? (
          <p className="text-xs text-muted-foreground">Available after the Go decision.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={ws.required} disabled={!canToggle} onChange={(e) => setRequired(e.target.checked)} />
              The tender requires HSE / QAQC submissions
            </label>
            {ws.required && (
              <ul className="mt-3 divide-y divide-border">
                {deliverables.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                    <span className={cn(d.is_ready && "text-muted-foreground line-through")}>{d.item}</span>
                    <Pill tone={d.is_ready ? "green" : "muted"}>{d.is_ready ? "ready" : "outstanding"}</Pill>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => ctx.openInModule("/dashboard/documents")}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Documents (method statements, plans)</Button>
            </div>
          </>
        )}
      </Card>
    </SectionShell>
  );
}
