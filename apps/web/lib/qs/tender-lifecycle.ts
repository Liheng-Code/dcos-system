// Contractor-side pre-contract lifecycle (master flow:
// docs/04-Business-Modules/04-02-Project-Setup/04-02-01-Pre Contract Project/PRE-CONTRACT Project Prompt.md).
// This module is the single owner of project_precontract_details.tender_stage transitions and keeps
// the legacy award_status column in sync for readers that still use it (precontract-dashboard,
// project-list-page). Schema: supabase/migrations/20260928000001_tender_lifecycle.sql.

import { createClient } from "@/lib/supabase/client";

export type TenderStage =
  | "opportunity"
  | "review"
  | "go_no_go"
  | "tendering"
  | "internal_review"
  | "approval"
  | "submitted"
  | "awaiting_result"
  | "awarded"
  | "unsuccessful"
  | "closed";

// The master's "typical status" path, in order. Outcomes follow it.
export const STAGE_PATH: { stage: TenderStage; label: string }[] = [
  { stage: "opportunity", label: "Opportunity" },
  { stage: "review", label: "Review" },
  { stage: "go_no_go", label: "Go / No-Go" },
  { stage: "tendering", label: "Tendering" },
  { stage: "internal_review", label: "Internal Review" },
  { stage: "approval", label: "Approval" },
  { stage: "submitted", label: "Submitted" },
  { stage: "awaiting_result", label: "Awaiting Result" },
];

export const STAGE_LABELS: Record<TenderStage, string> = {
  ...(Object.fromEntries(STAGE_PATH.map((s) => [s.stage, s.label])) as Record<TenderStage, string>),
  awarded: "Awarded",
  unsuccessful: "Unsuccessful",
  closed: "Closed",
};

const TRANSITIONS: Record<TenderStage, TenderStage[]> = {
  opportunity: ["review", "closed"],
  review: ["go_no_go", "closed"],
  go_no_go: ["tendering", "closed"],
  tendering: ["internal_review", "closed"],
  internal_review: ["tendering", "approval", "closed"],
  approval: ["tendering", "submitted", "closed"],
  submitted: ["awaiting_result", "awarded", "unsuccessful"],
  awaiting_result: ["awarded", "unsuccessful"],
  awarded: [],
  unsuccessful: [],
  closed: [],
};

export function canTransition(from: TenderStage, to: TenderStage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function stageIndex(stage: TenderStage): number {
  const i = STAGE_PATH.findIndex((s) => s.stage === stage);
  return i === -1 ? STAGE_PATH.length : i;
}

export const isTerminalStage = (stage: TenderStage) => TRANSITIONS[stage].length === 0;

// Tender preparation happens between Go and submission. Before Go the workstreams are not started;
// from submission on the tender is frozen except through controlled change.
export function isPreparationOpen(stage: TenderStage): boolean {
  return stage === "tendering" || stage === "internal_review" || stage === "approval";
}

export function isSubmittedOrLater(stage: TenderStage): boolean {
  return ["submitted", "awaiting_result", "awarded", "unsuccessful"].includes(stage);
}

function awardStatusFor(stage: TenderStage): string {
  switch (stage) {
    case "submitted":
    case "awaiting_result":
      return "submitted";
    case "awarded":
      return "awarded";
    case "unsuccessful":
      return "lost";
    case "closed":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Moves a tender from `from` to `to`. The update is conditional on the row still being at `from`,
 * so two people acting at once cannot skip a gate. `extra` carries the fields recorded with the
 * transition (decision, reason, submission details...).
 */
export async function setTenderStage(
  projectId: string,
  from: TenderStage,
  to: TenderStage,
  extra: Record<string, unknown> = {},
): Promise<{ error: string | null }> {
  if (!canTransition(from, to)) {
    return { error: `A tender cannot move from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]}.` };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_precontract_details")
    .update({
      ...extra,
      tender_stage: to,
      stage_changed_at: new Date().toISOString(),
      award_status: awardStatusFor(to),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("tender_stage", from)
    .select("project_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "This tender was updated by someone else. Reload and try again." };
  return { error: null };
}

// ─── Workstreams (responsibility matrix) ─────────────────────────────────────

export type WorkstreamCode =
  | "documents"
  | "technical_arc"
  | "technical_str"
  | "technical_mep"
  | "technical_bim"
  | "qs_tendering"
  | "planning"
  | "procurement"
  | "commercial"
  | "risk"
  | "hse_qaqc"
  | "clarifications"
  | "compilation";

export const WORKSTREAMS: { code: WorkstreamCode; label: string; defaultRequired: boolean }[] = [
  { code: "documents", label: "Tender Documents", defaultRequired: true },
  { code: "technical_arc", label: "Technical Review — ARC", defaultRequired: true },
  { code: "technical_str", label: "Technical Review — STR", defaultRequired: true },
  { code: "technical_mep", label: "Technical Review — MEP", defaultRequired: true },
  { code: "technical_bim", label: "Technical Review — BIM", defaultRequired: false },
  { code: "qs_tendering", label: "QS Tendering", defaultRequired: true },
  { code: "planning", label: "Tender Planning", defaultRequired: true },
  { code: "procurement", label: "Procurement", defaultRequired: true },
  { code: "commercial", label: "Commercial Review", defaultRequired: true },
  { code: "risk", label: "Risk & Opportunity", defaultRequired: true },
  // Requirement-driven: only when the tender asks for HSE/QAQC submissions.
  { code: "hse_qaqc", label: "HSE / QAQC", defaultRequired: false },
  { code: "clarifications", label: "Clarifications & Addenda", defaultRequired: true },
  { code: "compilation", label: "Tender Compilation", defaultRequired: true },
];

export const workstreamLabel = (code: string) => WORKSTREAMS.find((w) => w.code === code)?.label ?? code;

export interface Workstream {
  id: string;
  tender_id: string;
  code: WorkstreamCode;
  required: boolean;
  owner_id: string | null;
  due_date: string | null;
  status: "not_started" | "in_progress" | "completed";
  notes: string | null;
  sort_order: number;
}

/** Creates any missing workstream rows for a tender (existing rows are left untouched). */
export async function seedWorkstreams(tenderId: string, dueDate: string | null): Promise<{ error: string | null }> {
  const supabase = createClient();
  const rows = WORKSTREAMS.map((w, i) => ({
    tender_id: tenderId,
    code: w.code,
    required: w.defaultRequired,
    due_date: dueDate,
    sort_order: i,
  }));
  const { error } = await supabase
    .from("tender_workstreams")
    .upsert(rows, { onConflict: "tender_id,code", ignoreDuplicates: true });
  return { error: error?.message ?? null };
}

// ─── Tender preparation set-up (on Go) ───────────────────────────────────────

// Master step 13 compilation list; each item is owned by the workstream that produces it.
const COMPILATION_TEMPLATE: { item: string; category: string; workstream: WorkstreamCode; mandatory: boolean }[] = [
  { item: "Technical submission", category: "technical", workstream: "technical_arc", mandatory: true },
  { item: "Commercial submission", category: "commercial", workstream: "commercial", mandatory: true },
  { item: "Priced tender BOQ", category: "commercial", workstream: "qs_tendering", mandatory: true },
  { item: "Price schedule / form of tender", category: "commercial", workstream: "qs_tendering", mandatory: true },
  { item: "Tender programme", category: "technical", workstream: "planning", mandatory: true },
  { item: "Construction methodology", category: "technical", workstream: "planning", mandatory: true },
  { item: "Organisation chart", category: "technical", workstream: "compilation", mandatory: true },
  { item: "Resource & plant plan", category: "technical", workstream: "planning", mandatory: true },
  { item: "HSE plan", category: "technical", workstream: "hse_qaqc", mandatory: false },
  { item: "QA/QC plan", category: "technical", workstream: "hse_qaqc", mandatory: false },
  { item: "Tender forms, bonds & declarations", category: "legal", workstream: "compilation", mandatory: true },
  { item: "Qualifications & exclusions", category: "commercial", workstream: "commercial", mandatory: true },
  { item: "Supporting documents (licences, experience, CVs)", category: "other", workstream: "compilation", mandatory: true },
];

// Master step 09 commercial review topics.
export const COMMERCIAL_TOPICS: { topic: string; label: string }[] = [
  { topic: "contract_conditions", label: "Contract Conditions" },
  { topic: "payment_terms", label: "Payment Terms" },
  { topic: "retention", label: "Retention" },
  { topic: "advance_payment", label: "Advance Payment" },
  { topic: "liquidated_damages", label: "Liquidated Damages" },
  { topic: "bonds", label: "Bonds" },
  { topic: "insurance", label: "Insurance" },
  { topic: "variations", label: "Variations" },
  { topic: "extension_of_time", label: "Extension of Time" },
  { topic: "claims", label: "Claims" },
  { topic: "defects_liability", label: "Defects Liability" },
  { topic: "tax", label: "Tax" },
  { topic: "special_conditions", label: "Special Conditions" },
];

/**
 * Sets up tender preparation after the Go decision: the workstream matrix, the compilation
 * checklist and the commercial review topics. Each part is only created when the tender has none,
 * so running it again (e.g. for a tender that was already past Go) is safe.
 */
export async function setUpTenderPreparation(tenderId: string, dueDate: string | null): Promise<{ error: string | null }> {
  const supabase = createClient();
  const ws = await seedWorkstreams(tenderId, dueDate);
  if (ws.error) return ws;

  const [{ count: retCount }, { count: comCount }] = await Promise.all([
    supabase.from("tender_returnables").select("id", { count: "exact", head: true }).eq("tender_id", tenderId),
    supabase.from("tender_commercial_items").select("id", { count: "exact", head: true }).eq("tender_id", tenderId),
  ]);

  if (!retCount) {
    const { error } = await supabase.from("tender_returnables").insert(
      COMPILATION_TEMPLATE.map((t, i) => ({
        tender_id: tenderId,
        item: t.item,
        category: t.category,
        workstream_code: t.workstream,
        is_mandatory: t.mandatory,
        sort_order: i,
      })),
    );
    if (error) return { error: error.message };
  }
  if (!comCount) {
    const { error } = await supabase.from("tender_commercial_items").insert(
      COMMERCIAL_TOPICS.map((t, i) => ({ tender_id: tenderId, topic: t.topic, sort_order: i })),
    );
    if (error) return { error: error.message };
  }
  return { error: null };
}

const HSE_QAQC_DELIVERABLES = [
  "HSE plan", "QA/QC plan", "Inspection strategy", "Testing requirements", "Environmental requirements",
  "Safety organisation", "Method statements", "Quality procedures",
];

/**
 * Switches a workstream on or off for this tender. HSE / QAQC is requirement-driven: switching it on
 * adds its deliverables to the compliance checklist as mandatory items; switching it off makes them
 * optional. Used by both the responsibility matrix and the HSE / QAQC section so they behave the same.
 */
export async function setWorkstreamRequired(ws: Workstream, required: boolean): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tender_workstreams")
    .update({ required, updated_at: new Date().toISOString() })
    .eq("id", ws.id);
  if (error) return { error: error.message };
  if (ws.code !== "hse_qaqc") return { error: null };

  if (required) {
    const { data: existing } = await supabase
      .from("tender_returnables")
      .select("item")
      .eq("tender_id", ws.tender_id)
      .eq("workstream_code", "hse_qaqc");
    const have = new Set((existing ?? []).map((r) => r.item.toLowerCase()));
    const missing = HSE_QAQC_DELIVERABLES.filter((d) => !have.has(d.toLowerCase()));
    if (missing.length) {
      const { error: insErr } = await supabase.from("tender_returnables").insert(missing.map((item, i) => ({
        tender_id: ws.tender_id, item, category: "technical", workstream_code: "hse_qaqc", is_mandatory: true, sort_order: 100 + i,
      })));
      if (insErr) return { error: insErr.message };
    }
  }
  const { error: mandErr } = await supabase
    .from("tender_returnables")
    .update({ is_mandatory: required })
    .eq("tender_id", ws.tender_id)
    .eq("workstream_code", "hse_qaqc");
  return { error: mandErr?.message ?? null };
}

/** Closes a live tender (No-Go, withdrawal). Reason is required. */
export async function closeTender(projectId: string, from: TenderStage, reason: string): Promise<{ error: string | null }> {
  if (!reason.trim()) return { error: "A reason is required to close the tender." };
  return setTenderStage(projectId, from, "closed", { closed_reason: reason.trim() });
}

// ─── Go / No-Go criteria ─────────────────────────────────────────────────────

export const GO_NO_GO_CRITERIA = [
  { key: "commercial", label: "Commercial" },
  { key: "technical", label: "Technical" },
  { key: "financial", label: "Financial" },
  { key: "capacity", label: "Capacity" },
  { key: "programme", label: "Programme" },
  { key: "client", label: "Client" },
  { key: "contract", label: "Contract" },
  { key: "risk", label: "Risk" },
  { key: "resource", label: "Resource" },
] as const;

export type GoNoGoCriteria = Partial<Record<(typeof GO_NO_GO_CRITERIA)[number]["key"], { score: number; note?: string }>>;

/** Average 1–5 score across the scored criteria, or null when nothing is scored yet. */
export function criteriaAverage(criteria: GoNoGoCriteria | null | undefined): number | null {
  const scores = Object.values(criteria ?? {}).map((c) => c?.score).filter((s): s is number => typeof s === "number" && s > 0);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function criteriaRecommendation(avg: number | null): { label: string; tone: "go" | "marginal" | "no_go" } | null {
  if (avg == null) return null;
  if (avg >= 3.5) return { label: "Recommend Go", tone: "go" };
  if (avg >= 2.5) return { label: "Marginal — management judgement", tone: "marginal" };
  return { label: "Recommend No-Go", tone: "no_go" };
}
