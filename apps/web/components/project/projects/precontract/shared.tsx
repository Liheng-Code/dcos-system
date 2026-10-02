"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/components/project/projects/project-edit-sheet";
import {
  isPreparationOpen,
  STAGE_LABELS,
  workstreamLabel,
  type GoNoGoCriteria,
  type TenderStage,
  type Workstream,
  type WorkstreamCode,
} from "@/lib/qs/tender-lifecycle";
import { updateTenderWorkstreamById } from "@/lib/project/projects/projects-queries";

// Shared context for the Pre-Contract project view sections (components/project/projects/precontract-detail.tsx).

export interface PrecontractDetails {
  tender_register_id: string | null;
  tender_type: string | null;
  procurement_method: string | null;
  submission_deadline: string | null;
  tender_days: number | null;
  estimated_value: number | null;
  bid_price: number | null;
  bid_currency: string;
  award_status: string;
  award_date: string | null;
  loss_reason: string | null;
  go_no_go_decision: "go" | "no_go" | null;
  go_no_go_date: string | null;
  go_no_go_by: string | null;
  go_no_go_rationale: string | null;
  go_no_go_criteria: GoNoGoCriteria | null;
  tender_stage: TenderStage;
  stage_changed_at: string | null;
  closed_reason: string | null;
  site_visit_date: string | null;
  query_deadline: string | null;
  approval_round: number;
  review_bid_summary_id: string | null;
  approved_bid_summary_id: string | null;
  bid_approved_at: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  submission_method: string | null;
  submission_reference: string | null;
  submitted_bid_summary_id: string | null;
}

export interface TenderRecord {
  id: string;
  tender_no: string;
  title: string;
  status: string;
  issue_date: string | null;
}

export interface StaffOption {
  id: string;
  full_name: string;
}

export type PermField = "view" | "can_create" | "edit" | "delete" | "submit" | "approve" | "reject" | "export" | "configure" | "transmit";

export interface PrecontractCtx {
  project: Project;
  details: PrecontractDetails;
  tender: TenderRecord | null;
  workstreams: Workstream[];
  staff: StaffOption[];
  userId: string | null;
  roleCodes: string[];
  can: (action: string, field: PermField) => boolean;
  refresh: () => Promise<void>;
  /** Applies a workstream change on screen immediately (optimistic); callers persist it and refresh on error. */
  patchWorkstream: (id: string, patch: Partial<Workstream>) => void;
  openInModule: (href: string) => void;
  onEdit: () => void;
  onProjectUpdate: (project: Project) => void;
}

export const stageOf = (ctx: PrecontractCtx) => ctx.details.tender_stage;
/** Tender preparation records (registers, checklists) are editable between Go and Internal Review. */
export const canPrepare = (ctx: PrecontractCtx) => ctx.details.tender_stage === "tendering";
/** Pricing is frozen by the DB from Internal Review on (tender_is_locked); mirror that in the UI. */
export const pricingLocked = (ctx: PrecontractCtx) => !["opportunity", "review", "go_no_go", "tendering"].includes(ctx.details.tender_stage);

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
export const smallFieldClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

export function formatMoney(v: number | null | undefined, currency: string): string {
  return v != null ? `${currency} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—";
}

export function formatDate(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleDateString() : "—";
}

export function formatDateTime(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export const staffName = (ctx: PrecontractCtx, id: string | null | undefined) =>
  (id && ctx.staff.find((s) => s.id === id)?.full_name) || "—";

export function toastResult(result: { error: string | null }, success: string): boolean {
  if (result.error) {
    toast.error(result.error);
    return false;
  }
  toast.success(success);
  return true;
}

/** Next sequential number like Q-004 / R-012 for a register, from the highest existing one. */
export async function nextNumber(table: "tender_clarifications" | "tender_risk_items", column: "query_no" | "risk_no", tenderId: string, prefix: string) {
  const { data } = await createClient().from(table).select(column).eq("tender_id", tenderId);
  const rows = (data ?? []) as Record<string, string>[];
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r[column]).replace(/\D/g, ""), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function Field({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium break-words", className)}>{value}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Card({ title, description, actions, children, className }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Pill({ tone = "muted", children }: { tone?: "muted" | "green" | "blue" | "amber" | "red"; children: ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
      tone === "green" && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
      tone === "blue" && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
      tone === "amber" && "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
      tone === "red" && "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
      tone === "muted" && "bg-muted text-muted-foreground border-border",
    )}>
      {children}
    </span>
  );
}

/** Explains why a section is read-only at the current stage. */
export function StageNotice({ ctx, what = "This workstream" }: { ctx: PrecontractCtx; what?: string }) {
  const stage = ctx.details.tender_stage;
  if (canPrepare(ctx)) return null;
  const message = ["opportunity", "review", "go_no_go"].includes(stage)
    ? `${what} opens once the Go decision is made.`
    : isPreparationOpen(stage)
      ? `${what} is read-only while the bid is in ${STAGE_LABELS[stage]}. Return the bid to Tendering (Bid Approval) or record an addendum to change it.`
      : `${what} is frozen — the tender is ${STAGE_LABELS[stage]}.`;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      {message}
    </div>
  );
}

/** Owner / due date / status of the workstream(s) behind a section; the owner or a tender manager updates status. */
export function WorkstreamStrip({ ctx, codes }: { ctx: PrecontractCtx; codes: WorkstreamCode[] }) {
  const rows = ctx.workstreams.filter((w) => codes.includes(w.code));
  if (!rows.length) return null;

  async function setStatus(w: Workstream, status: Workstream["status"]) {
    ctx.patchWorkstream(w.id, { status });
    const { error } = await updateTenderWorkstreamById({ status, updated_at: new Date().toISOString() }, w.id);
    if (error) {
      toast.error(error.message);
      await ctx.refresh();
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((w) => {
        const editable = !["submitted", "awaiting_result", "awarded", "unsuccessful", "closed"].includes(ctx.details.tender_stage)
          && (w.owner_id === ctx.userId || ctx.can("tender_workstreams", "edit"));
        return (
          <div key={w.id} className={cn("flex items-center gap-3 rounded-lg border border-border px-3 py-2", !w.required && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{workstreamLabel(w.code)}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {w.required ? `${staffName(ctx, w.owner_id)} · due ${formatDate(w.due_date)}` : "Not required for this tender"}
              </p>
            </div>
            {w.required && (
              <select
                className={cn(smallFieldClass, "text-xs")}
                value={w.status}
                disabled={!editable}
                onChange={(e) => setStatus(w, e.target.value as Workstream["status"])}
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
