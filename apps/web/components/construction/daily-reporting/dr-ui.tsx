"use client";

// Shared presentational pieces for Module 10-01 Daily Reporting.

import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { derivedLabel, labelTone, SECTION_LABELS, TONE_CLASS } from "@/lib/construction/daily-reporting/status";
import type { DrReport, RuleResult, SectionKey } from "@/lib/construction/daily-reporting/types";

// Large touch targets: the form is used on site, on a phone.
export const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70";
export const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70";

export function StateBadge({ report, official = false }: { report: Pick<DrReport, "submission_state" | "review_state">; official?: boolean }) {
  const label = derivedLabel(report, official);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[labelTone(label)])}>
      {label}
    </span>
  );
}

export function Flag({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "bad" | "neutral" | "good" | "info" }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function SectionCard({
  title,
  children,
  action,
  locked,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  locked?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", locked && "opacity-80")}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {locked ? <Flag tone="neutral">Locked</Flag> : null}
          {action}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Rule findings, errors first. `forSection` narrows to one section (and line). */
export function RuleList({ results, forSection, lineId }: { results: RuleResult[]; forSection?: SectionKey | "header"; lineId?: string }) {
  const shown = results
    .filter((r) => (forSection ? r.target.section === forSection : true))
    .filter((r) => (lineId ? r.target.line_id === lineId : true))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "ERROR" ? -1 : 1));
  if (shown.length === 0) return null;
  return (
    <ul className="space-y-1">
      {shown.map((r, i) => (
        <li
          key={`${r.rule_code}-${r.target.line_id ?? ""}-${i}`}
          className={cn(
            "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs",
            r.severity === "ERROR" ? TONE_CLASS.bad : TONE_CLASS.warn,
          )}
        >
          {r.severity === "ERROR" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {!forSection && r.target.section && r.target.section !== "header" ? (
              <span className="font-medium">{SECTION_LABELS[r.target.section]}: </span>
            ) : null}
            {r.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="mt-1 text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
