// Doc 35 Phase A - pure core of the four reading-and-writing tools (A1 QA/QC explanations, A2 delay summaries, A3 report
// commentary drafts, A4 questions about the schedule). As in ai-core.ts the model only explains or words what the DATA
// already says: every figure it writes must occur in the DATA, every finding / activity it names must be one it was
// given, and an answer that fails is discarded. All four are information: nothing they return changes the programme.

import { z } from "zod";
import { clamp01, numbersSubset, trimTo, type SuggestionDraft } from "./ai-core";
import type { ReportDoc } from "../../reports/report-model";
import type { ReportData, ReportTask } from "../../reports/report-data";

const INFO = "none (information)";
const dataBlock = (lines: string[]) => `<data>\n${lines.join("\n")}\n</data>`;
const clean = (s: string | null | undefined, max = 120) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ── A1 explain QA/QC findings ────────────────────────────────────────────

export interface QaqcFindingFact {
  id: string; code: string; name: string; severity: string; message: string;
  metric: number | null; threshold: number | null; affected: number; samples: string[];
}

export function buildQaqcContext(findings: QaqcFindingFact[], taskCount: number): string {
  return [
    "TASK: these schedule quality findings come from the DCMA 14-point checks run on the programme. For each finding, explain in plain words what it means for this programme and why it matters, and give the first thing the planner should check. Then order the finding ids from most to least urgent. Use only the DATA; refer to findings by their id.",
    dataBlock([
      `ACTIVITIES CHECKED: ${taskCount}`,
      "FINDINGS:",
      ...findings.map((f) => `- id=${f.id} | ${f.code} ${clean(f.name)} | severity ${f.severity} | ${clean(f.message, 200)}${f.metric != null ? ` | value ${f.metric}` : ""}${f.threshold != null ? ` | limit ${f.threshold}` : ""} | ${f.affected} activities${f.samples.length ? ` e.g. ${f.samples.join(", ")}` : ""}`),
    ]),
  ].join("\n");
}

export const qaqcSchema = z.object({
  findings: z.array(z.object({ finding_id: z.string(), explanation: z.string(), first_step: z.string(), confidence: z.number() })),
  fix_order: z.array(z.string()),
});

export function qaqcSuggestions(out: z.infer<typeof qaqcSchema>, findings: QaqcFindingFact[], data: string, projectId: string): SuggestionDraft[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const order = out.fix_order.filter((id) => byId.has(id));
  const seen = new Set<string>();
  const drafts: SuggestionDraft[] = [];
  for (const x of out.findings) {
    const f = byId.get(x.finding_id);
    if (!f || seen.has(f.id)) continue;
    if (!numbersSubset(`${x.explanation} ${x.first_step}`, data)) continue;
    seen.add(f.id);
    const rank = order.indexOf(f.id);
    drafts.push({
      kind: "qaqc_explanation", target_type: "project", target_id: projectId,
      recommendation: `${f.code} ${f.name}: ${trimTo(x.explanation, 700)}`,
      reason: `First check: ${trimTo(x.first_step, 400)}`,
      source: `Schedule Check finding ${f.code} (${f.severity}, ${f.affected} activities), explained by the model`,
      confidence: clamp01(x.confidence), affected: [{ type: "qaqc_finding", id: f.id, label: `${f.code} ${f.name}` }],
      required_approval: INFO, payload: { finding_id: f.id, check_code: f.code, rank: rank >= 0 ? rank + 1 : null },
    });
  }
  return drafts.sort((a, b) => ((a.payload.rank as number | null) ?? 99) - ((b.payload.rank as number | null) ?? 99));
}

// ── A2 summarise delays ──────────────────────────────────────────────────

export interface DelayFact {
  code: string; description: string; type: string | null; cause: string | null; responsible: string | null;
  impactDays: number; status: string; lifecycle: string | null; critical: boolean | null; openedAt: string | null; activities: string[];
}

export interface DelayTotals {
  count: number; open: number; totalImpact: number; openImpact: number; criticalAtOpen: number;
  byResponsible: { key: string; count: number; days: number }[];
  byType: { key: string; count: number; days: number }[];
}

// delay_register: status open / disputed / resolved; lifecycle notified … agreed, ending closed or rejected
export const delayIsOpen = (d: { status: string; lifecycle: string | null }) => d.status !== "resolved" && d.lifecycle !== "closed" && d.lifecycle !== "rejected";
const isOpen = delayIsOpen;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic totals the summary is built from (the model never adds anything up itself). */
export function delayTotals(delays: DelayFact[]): DelayTotals {
  const group = (key: (d: DelayFact) => string) => {
    const m = new Map<string, { key: string; count: number; days: number }>();
    for (const d of delays) {
      const k = key(d);
      const g = m.get(k) ?? { key: k, count: 0, days: 0 };
      g.count++; g.days = r2(g.days + d.impactDays);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.days - a.days || b.count - a.count);
  };
  const open = delays.filter(isOpen);
  return {
    count: delays.length, open: open.length,
    totalImpact: r2(delays.reduce((n, d) => n + d.impactDays, 0)), openImpact: r2(open.reduce((n, d) => n + d.impactDays, 0)),
    criticalAtOpen: delays.filter((d) => d.critical === true).length,
    byResponsible: group((d) => clean(d.responsible, 60) || "not stated"),
    byType: group((d) => clean(d.type, 40) || "not stated"),
  };
}

export function buildDelayContext(delays: DelayFact[], t: DelayTotals, asAt: string): string {
  const shown = [...delays].sort((a, b) => b.impactDays - a.impactDays).slice(0, 60);
  return [
    "TASK: summarise the project's delay register for the project manager: where the time is going, who is responsible, what is still open, and what to watch. Use only the DATA and its totals; do not add up or estimate anything yourself. Refer to delays by their code.",
    dataBlock([
      `AS AT: ${asAt}`,
      `TOTALS: ${t.count} delays, ${t.open} open; impact ${t.totalImpact} days in all, ${t.openImpact} days on open delays; ${t.criticalAtOpen} were on the critical path when raised`,
      `BY RESPONSIBLE PARTY: ${t.byResponsible.map((g) => `${g.key} ${g.count} (${g.days} days)`).join("; ")}`,
      `BY TYPE: ${t.byType.map((g) => `${g.key} ${g.count} (${g.days} days)`).join("; ")}`,
      `DELAYS (largest first${shown.length < delays.length ? `, ${shown.length} of ${delays.length}` : ""}):`,
      ...shown.map((d) => `- ${d.code} | ${clean(d.description, 140)} | type ${d.type ?? "n/a"} | cause ${clean(d.cause, 100) || "n/a"} | responsible ${clean(d.responsible, 60) || "n/a"} | ${d.impactDays} days | ${d.lifecycle ?? d.status}${d.critical ? " | critical when raised" : ""}${d.openedAt ? ` | raised ${d.openedAt}` : ""}${d.activities.length ? ` | activities ${d.activities.slice(0, 4).join(", ")}` : ""}`),
    ]),
  ].join("\n");
}

export const delaySchema = z.object({ summary: z.string(), key_points: z.array(z.string()), watch: z.array(z.string()), confidence: z.number() });

export function delaySuggestion(out: z.infer<typeof delaySchema>, delays: DelayFact[], data: string, projectId: string, asAt: string): SuggestionDraft[] {
  const text = [out.summary, ...out.key_points, ...out.watch].join(" ");
  if (!numbersSubset(text, data)) return [];
  const codes = new Set(delays.map((d) => d.code));
  const named = [...new Set((text.match(/[A-Z][A-Z0-9]*-[A-Z0-9-]+/g) ?? []).filter((c) => codes.has(c)))];
  return [{
    kind: "delay_summary", target_type: "project", target_id: projectId,
    recommendation: trimTo(out.summary, 900),
    reason: trimTo([...out.key_points.slice(0, 5), ...out.watch.slice(0, 3).map((w) => `Watch: ${w}`)].join(" · "), 900),
    source: `Delay register as at ${asAt}: ${delays.length} entries and their totals, summarised by the model`,
    confidence: clamp01(out.confidence), affected: named.slice(0, 12).map((c) => ({ type: "delay", id: c, label: c })),
    required_approval: INFO, payload: { as_at: asAt, delays: delays.length, key_points: out.key_points.slice(0, 8), watch: out.watch.slice(0, 5) },
  }];
}

// ── A3 draft report commentary ───────────────────────────────────────────

/** The report's content as plain lines: title, basis, every figure tile and the first rows of every table. */
export function reportFacts(doc: ReportDoc, rowsPerTable = 12): string[] {
  const lines = [`REPORT: ${doc.title} | ${doc.subtitle} | period ${doc.periodLabel}${doc.periodStart ? ` (${doc.periodStart} to ${doc.periodEnd})` : ""} | as at ${doc.asAt}`];
  const b = doc.basis;
  if (b.baseline) lines.push(`BASELINE: BL${b.baseline.number} ${clean(b.baseline.name, 60)}${b.baseline.approved_at ? "" : " (not approved)"}`);
  if (b.calculation?.finish) lines.push(`CALCULATED FINISH: ${b.calculation.finish}`);
  if (b.project?.contract_finish) lines.push(`CONTRACT FINISH: ${b.project.contract_finish}`);
  for (const s of doc.sections) {
    if (s.kind === "kpis") lines.push(`${(s.title ?? "FIGURES").toUpperCase()}: ${s.items.map((i) => `${i.label} ${i.value}`).join("; ")}`);
    else if (s.kind === "text") lines.push(`${(s.title ?? "NOTE").toUpperCase()}: ${clean(s.paragraphs.join(" "), 400)}`);
    else if (s.kind === "table") {
      lines.push(`TABLE ${s.title}: ${s.rows.length} rows${s.rows.length === 0 && s.empty ? ` (${clean(s.empty, 80)})` : ""}`);
      const cols = s.columns.map((c) => c.label);
      for (const r of s.rows.slice(0, rowsPerTable)) lines.push(`  - ${r.map((v, i) => `${cols[i] ?? ""} ${v ?? ""}`.trim()).filter(Boolean).join(" | ")}`);
      if (s.rows.length > rowsPerTable) lines.push(`  (${s.rows.length - rowsPerTable} more rows)`);
    } else if (s.kind === "bars") lines.push(`CHART ${s.title}`);
  }
  return lines;
}

export function buildReportContext(doc: ReportDoc): string {
  return [
    `TASK: draft the planner's commentary for this ${doc.type === "weekly" ? "weekly" : "monthly"} programme report: three to five short paragraphs covering overall position against the baseline, progress in the period, the critical work and delays, and what is coming next. Write in plain professional English for the client and project manager. Use only the DATA: quote its figures, dates and activity codes as given and do not calculate new ones. If the DATA is thin, say less.`,
    dataBlock(reportFacts(doc)),
  ].join("\n");
}

export const reportSchema = z.object({ paragraphs: z.array(z.string()), confidence: z.number() });

export function reportSuggestion(out: z.infer<typeof reportSchema>, doc: ReportDoc, data: string, projectId: string): SuggestionDraft[] {
  const paragraphs = out.paragraphs.map((p) => trimTo(p, 1200)).filter((p) => p.length > 0).slice(0, 6);
  if (paragraphs.length === 0 || !numbersSubset(paragraphs.join(" "), data)) return [];
  return [{
    kind: "report_draft", target_type: "project", target_id: projectId,
    recommendation: paragraphs[0], reason: paragraphs.slice(1).join(" ").slice(0, 900),
    source: `${doc.title} for ${doc.periodLabel}, built from the programme as at ${doc.asAt}; worded by the model`,
    confidence: clamp01(out.confidence), affected: [{ type: "report", id: `${doc.type}:${doc.periodLabel}`, label: `${doc.title} ${doc.periodLabel}` }],
    required_approval: "Planner edits and approves it before it goes into a report",
    payload: { report_type: doc.type, period_label: doc.periodLabel, as_at: doc.asAt, paragraphs },
  }];
}

// ── A4 questions about the schedule ──────────────────────────────────────

const STOP = new Set(["the", "and", "of", "to", "in", "on", "for", "with", "a", "an", "at", "is", "are", "what", "when", "which", "who", "why", "how", "will", "does", "do", "did", "be", "it", "this", "that", "we", "our", "us", "by", "from", "any", "all", "can", "has", "have", "programme", "program", "schedule", "project", "activity", "activities"]);
export const questionTerms = (q: string): string[] =>
  [...new Set(q.toLowerCase().replace(/[^a-z0-9\s.-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 8);

const taskLine = (t: ReportTask) =>
  `${t.code} | ${clean(t.name, 70)} | ${t.start ?? "?"} to ${t.finish ?? "?"} | float ${t.totalFloat ?? "n/a"} | ${t.progress}% | ${t.status}${t.critical ? " | critical" : ""}${t.baselineFinish ? ` | baseline finish ${t.baselineFinish}` : ""}${t.isMilestone ? " | milestone" : ""}`;

export interface ScheduleDigest { text: string; codes: Set<string> }

export interface DigestMilestone { code: string; name: string; due: string; forecast: string | null; state: string }

/** What the model may see to answer one question: the programme's headline figures and the lists most questions are about. */
export function scheduleDigest(data: ReportData, question: string, milestones: DigestMilestone[] = [], per = 20): ScheduleDigest {
  const live = data.tasks.filter((t) => !t.isMilestone || t.progress < 100);
  const open = data.tasks.filter((t) => t.progress < 100);
  const by = (a: ReportTask, b: ReportTask) => (a.start ?? "").localeCompare(b.start ?? "") || a.code.localeCompare(b.code);
  const ahead = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const until = ahead(data.asAt, 30);
  const finish = data.tasks.reduce<string | null>((f, t) => (t.finish && (!f || t.finish > f) ? t.finish : f), null);
  const blFinish = data.tasks.reduce<string | null>((f, t) => (t.baselineFinish && (!f || t.baselineFinish > f) ? t.baselineFinish : f), null);
  const k = data.kpis;
  const terms = questionTerms(question);
  const matched = terms.length ? live.filter((t) => terms.some((w) => `${t.code} ${t.name}`.toLowerCase().includes(w))).sort(by).slice(0, 30) : [];
  const lists: [string, ReportTask[]][] = [
    ["MATCHING THE QUESTION", matched],
    ["CRITICAL, NOT FINISHED", open.filter((t) => t.critical).sort(by).slice(0, per)],
    ["NEGATIVE FLOAT", open.filter((t) => (t.totalFloat ?? 0) < 0).sort((a, b) => (a.totalFloat ?? 0) - (b.totalFloat ?? 0)).slice(0, per)],
    ["BEHIND (should have started or finished by the data date)", open.filter((t) => !t.isMilestone && ((t.progress <= 0 && !!t.start && t.start <= data.asAt) || (!!t.finish && t.finish <= data.asAt))).sort(by).slice(0, per)],
    ["STARTING OR FINISHING IN THE NEXT 30 DAYS", open.filter((t) => (t.start && t.start > data.asAt && t.start <= until) || (t.finish && t.finish > data.asAt && t.finish <= until)).sort(by).slice(0, per)],
    ["PROGRAMME MILESTONES NOT REACHED", open.filter((t) => t.isMilestone).sort(by).slice(0, 15)],
  ];
  const codes = new Set<string>();
  const lines = [
    `AS AT (data date): ${data.asAt}`,
    `ACTIVITIES: ${data.tasks.length} in all, ${data.tasks.filter((t) => t.progress >= 100).length} complete, ${data.tasks.filter((t) => t.progress > 0 && t.progress < 100).length} in progress`,
    `FORECAST FINISH: ${finish ?? "n/a"} | BASELINE FINISH: ${blFinish ?? "n/a"} | PROGRAMME STATUS: ${k.programmeStatus ?? "n/a"}${k.overrunWd != null ? ` | overrun ${k.overrunWd} working days (negative = ahead)` : ""}`,
    `FIGURES: overdue ${k.overdue}, starting in 14 days ${k.startingNext14d}, finishing in 14 days ${k.finishingNext14d}, critical ${k.critical}, negative float ${k.negativeFloat}, near critical ${k.nearCritical}${data.scurve.livePct != null ? `, overall progress ${data.scurve.livePct}%` : ""}`,
  ];
  for (const [title, list] of lists) {
    if (!list.length) continue;
    lines.push(`${title}:`);
    for (const t of list) { lines.push(`- ${taskLine(t)}`); codes.add(t.code); }
  }
  if (milestones.length) {
    lines.push("CONTRACT MILESTONES:");
    for (const m of milestones) lines.push(`- ${m.code} | ${clean(m.name, 60)} | due ${m.due} | forecast ${m.forecast ?? "n/a"} | ${m.state}`);
  }
  const delays = data.delays.filter(delayIsOpen).slice(0, 15);
  if (delays.length) {
    lines.push("OPEN DELAYS:");
    for (const d of delays) lines.push(`- ${d.code ?? "?"} | ${clean(d.description, 90)} | ${d.impactDays} days | ${clean(d.responsible, 40) || "n/a"}`);
  }
  return { text: lines.join("\n"), codes };
}

export function buildAskContext(question: string, digest: ScheduleDigest): string {
  return [
    "TASK: answer the planner's QUESTION about the programme in two to five sentences, using only the DATA. Quote dates, figures and activity codes exactly as given; do not calculate new numbers. List in cited_codes the activity codes your answer relies on. If the DATA does not answer it, set answerable to false and say what is missing.",
    `<question>\n${question.replace(/<\/?question>/gi, "").slice(0, 500)}\n</question>`,
    dataBlock([digest.text]),
  ].join("\n");
}

export const askSchema = z.object({ answer: z.string(), cited_codes: z.array(z.string()), answerable: z.boolean(), confidence: z.number() });

export function askSuggestion(out: z.infer<typeof askSchema>, question: string, digest: ScheduleDigest, data: string, projectId: string): SuggestionDraft[] {
  const answer = trimTo(out.answer, 1200);
  if (!answer || !numbersSubset(answer, data)) return [];
  const cited = [...new Set(out.cited_codes)].filter((c) => digest.codes.has(c)).slice(0, 15);
  return [{
    kind: "schedule_answer", target_type: "project", target_id: projectId,
    recommendation: answer,
    reason: out.answerable ? (cited.length ? `Based on ${cited.join(", ")}` : "Based on the programme's headline figures") : "The programme data given could not answer this fully.",
    source: `Q: “${trimTo(question, 200)}” — answered from the programme as calculated at the data date (lists, figures, milestones, delays)`,
    confidence: out.answerable ? clamp01(out.confidence) : Math.min(0.3, clamp01(out.confidence)),
    affected: cited.map((c) => ({ type: "activity", id: c, label: c })),
    required_approval: INFO, payload: { question: trimTo(question, 500), answerable: out.answerable, cited_codes: cited },
  }];
}
