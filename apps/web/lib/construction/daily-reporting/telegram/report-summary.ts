// Module 10-01 Daily Reporting — the text posted to a unit's Telegram group
// when its report is submitted: everything the reporter filled in. Pure
// function, so it can be unit tested.
//
// The group belongs to one reporting unit, so this shows the unit its own
// report. It never includes rule warnings, verified quantities or anything a
// reviewer wrote: those stay between the approver and the reporter.

import type { CustomField, DrPayload } from "../types";

/** Telegram refuses messages over 4096 characters. */
const MAX_LENGTH = 3900;

export interface ReportSummaryInput {
  /** First line, e.g. "DR-2026-000001 submitted (late)". */
  heading: string;
  unitName: string;
  reportDate: string;
  reporterName: string | null;
  reportKind: "WORK" | "NO_WORK";
  payload: DrPayload;
  /** Task id → name and location, for the activity lines. */
  tasks: Record<string, { name: string; location?: string | null }>;
  customFields: CustomField[];
  photoCount: number;
}

const has = (v: unknown): boolean => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function formatReportForGroup(input: ReportSummaryInput): string {
  const { payload: p } = input;
  const lines: string[] = [input.heading, `${input.unitName} · ${input.reportDate}`];
  if (input.reporterName) lines.push(`Reported by ${input.reporterName}`);

  if (input.reportKind === "NO_WORK") {
    lines.push("", `No work today: ${p.no_work_reason?.trim() || "no reason given"}`);
    return lines.join("\n");
  }

  const site: string[] = [];
  if (has(p.weather?.condition)) {
    const lost = p.weather?.hours_lost ? ` (${p.weather.hours_lost} h lost)` : "";
    site.push(`Weather: ${p.weather?.condition}${lost}`);
  }
  const workers = p.manpower.reduce((sum, m) => sum + (m.reported_count ?? 0), 0);
  if (p.manpower.length > 0) {
    const trades = p.manpower.filter((m) => has(m.trade) && p.manpower.length > 1).map((m) => `${m.trade} ${m.reported_count ?? 0}`);
    site.push(`Manpower: ${plural(workers, "worker")}${trades.length ? ` (${trades.join(", ")})` : ""}`);
  }
  if (p.safety?.toolbox_talk_held === true || p.safety?.toolbox_talk_held === false) {
    site.push(`Toolbox talk: ${p.safety.toolbox_talk_held ? "Yes" : "No"}`);
  }
  const incidents = (p.safety?.incident_count ?? 0) + (p.safety?.near_miss_count ?? 0);
  if (incidents > 0) {
    const nearMisses = p.safety?.near_miss_count ?? 0;
    site.push(`Safety: ${plural(p.safety?.incident_count ?? 0, "incident")}, ${nearMisses} near miss${nearMisses === 1 ? "" : "es"}`);
  }
  if (site.length) lines.push("", ...site);

  if (p.activities.length > 0) {
    lines.push("", p.activities.length === 1 ? "Activity" : "Activities");
    p.activities.forEach((a, i) => {
      const task = a.task_id ? input.tasks[a.task_id] : undefined;
      const name = task?.name ?? a.free_text_activity ?? "Activity";
      lines.push(`${i + 1}. ${name}${task?.location ? ` — ${task.location}` : ""}`);
      const detail: string[] = [];
      if (has(a.progress_today)) {
        detail.push(has(a.progress_before) && a.progress_before !== a.progress_today ? `Progress ${a.progress_before}% → ${a.progress_today}%` : `Progress ${a.progress_today}%`);
      }
      if (has(a.reported_qty)) detail.push(`Qty ${a.reported_qty}${a.uom ? ` ${a.uom}` : ""}`);
      if (has(a.headcount)) detail.push(plural(a.headcount as number, "worker"));
      if (detail.length) lines.push(`   ${detail.join(" · ")}`);
      if (has(a.remarks)) lines.push(`   ${a.remarks}`);
    });
  }

  const extra: string[] = [];
  for (const e of p.equipment) extra.push(`Equipment: ${e.equipment_type}${has(e.hours_working) ? `, ${e.hours_working} h working` : ""}`);
  for (const m of p.materials) {
    const qty = has(m.qty_delivered) ? `, ${m.qty_delivered}${m.uom ? ` ${m.uom}` : ""} delivered` : "";
    extra.push(`Material: ${m.description}${qty}`);
  }
  for (const d of p.delays) extra.push(`Delay: ${d.description}${has(d.hours_lost) ? ` (${d.hours_lost} h lost)` : ""}`);
  for (const ins of p.instructions) extra.push(`Instruction received: ${ins.description}`);
  if (p.issues.length === 0) extra.push("Issue / constraint: No issue");
  for (const issue of p.issues) extra.push(`Issue / constraint: ${issue.description}`);
  for (const n of p.next_day) {
    const what = n.description?.trim() || (n.task_id ? input.tasks[n.task_id]?.name : null) || "planned work";
    extra.push(`Tomorrow: ${what}${has(n.planned_manpower) ? ` (${plural(n.planned_manpower as number, "worker")})` : ""}`);
  }
  if (extra.length) lines.push("", ...extra);

  const values = p.custom_fields ?? {};
  const custom = input.customFields
    .filter((f) => has(values[f.key]))
    .map((f) => `${f.label}: ${values[f.key]}${f.unit ? ` ${f.unit}` : ""}`);
  // A value whose field has since left the definition is still part of the report.
  const known = new Set(input.customFields.map((f) => f.key));
  for (const [key, value] of Object.entries(values)) if (!known.has(key) && has(value)) custom.push(`${key}: ${value}`);
  if (custom.length) lines.push("", ...custom);

  lines.push("", input.photoCount > 0 ? `Photos: ${input.photoCount}` : "Photos: none");

  const text = lines.join("\n");
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}\n… (open the report in DCOS for the rest)` : text;
}
