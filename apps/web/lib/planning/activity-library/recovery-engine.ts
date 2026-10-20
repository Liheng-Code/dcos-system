// Recovery scenarios (Phase 3.6). Pure and deterministic. Given the live programme and a target finish, find the SMALLEST set
// of changes that reaches it, per family of levers, measuring every change with the real CPM engine (never an estimate):
//   crew        add crews / a second shift on a critical SITE activity that has not started (labour-driven; duration shortened, capped)
//   expedite    shorten a critical activity that crews cannot speed up (procurement, design, approvals) by management action; smaller cap
//   method      switch to another construction method of the activity library whose standard gives a shorter duration
//   fasttrack   overlap a critical finish-to-start link (start-to-start after half of the predecessor): highest risk
// Output is SCENARIOS to compare. Nothing here changes a programme; a planner decides what, if anything, to apply.

import { depsFromArrays, scheduleProject, signedWorkingDayGap, type EngineDep, type EngineTask } from "../schedule-engine";
import { workingDaysBetween, type WorkCalendar } from "../work-calendar";

export type LeverKind = "crew" | "expedite" | "method" | "fasttrack";
export type Risk = "low" | "medium" | "high";

export interface RecoveryTask {
  id: string;
  code: string;
  name: string;
  discipline: string | null;
  start: string | null;
  finish: string | null;
  progress: number;
  isMilestone: boolean;
  manual: boolean;
  /** labour-driven work that more crews can speed up (has a productivity norm or comes from the library) */
  crewable: boolean;
  constraintType: string | null;
  constraintDate: string | null;
  depIds: string[];
  depTypes: string[];
  depLags: number[];
}

/** A shorter way of doing the same activity, computed from the library standards by the service. */
export interface MethodAlternative {
  methodName: string;
  durationWd: number;
  /** the standard behind it is still a draft */
  draft: boolean;
}

export interface RecoverySettings {
  /** share of a duration that adding crews may remove, e.g. 0.2 */
  maxCompression: number;
  /** share of a duration that expediting (procurement, design, approvals) may remove, e.g. 0.1 */
  expediteCompression: number;
  /** activities shorter than this are not compressed */
  minDurationWd: number;
  allowFastTrack: boolean;
  maxLevers: number;
  /** at most this many candidates are measured per step (longest critical activities first) */
  candidateLimit: number;
}

export const DEFAULT_RECOVERY_SETTINGS: RecoverySettings = { maxCompression: 0.2, expediteCompression: 0.1, minDurationWd: 3, allowFastTrack: true, maxLevers: 12, candidateLimit: 60 };

export interface Lever {
  kind: LeverKind;
  taskId: string;
  code: string;
  name: string;
  /** human text of the change */
  label: string;
  fromWd: number;
  toWd: number;
  /** working days of programme finish this lever recovered at the moment it was chosen */
  gainWd: number;
  risk: Risk;
  /** fast-track only */
  predId?: string;
}

export interface Scenario {
  key: string;
  name: string;
  description: string;
  levers: Lever[];
  finish: string;
  recoveredWd: number;
  /** working days still missing against the target (0 = target met) */
  remainingGapWd: number;
  meetsTarget: boolean;
  risk: Risk;
  /** plain statement of the resource consequence */
  resourceNote: string;
}

export interface RecoveryAnalysis {
  ok: boolean;
  cycle?: string[];
  liveFinish: string | null;
  targetFinish: string | null;
  /** working days the live finish is later than the target (positive = recovery needed) */
  gapWd: number;
  criticalCount: number;
  candidates: { crew: number; expedite: number; method: number; fasttrack: number };
  scenarios: Scenario[];
}

const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };
const maxRisk = (a: Risk[]): Risk => a.reduce<Risk>((m, r) => (RISK_RANK[r] > RISK_RANK[m] ? r : m), "low");

function toEngine(tasks: RecoveryTask[], cal: WorkCalendar): EngineTask[] {
  return tasks.map((t) => {
    // work under way or finished keeps its real dates: it is not recoverable, but it still drives its successors
    const anchored = t.manual || t.progress > 0;
    const durationWd = t.isMilestone ? 0 : t.start && t.finish ? Math.max(1, workingDaysBetween(cal, t.start, t.finish)) : 1;
    return {
      id: t.id, start: anchored ? t.start : null, finish: anchored ? t.finish : null, durationWd,
      manuallyScheduled: anchored, constraintType: t.constraintType, constraintDate: t.constraintDate,
      deps: depsFromArrays(t.depIds, t.depTypes, t.depLags),
    };
  });
}

interface Changes {
  duration: Map<string, number>;
  /** replacement dependency lists (fast-tracking edits a task's own predecessors) */
  deps: Map<string, EngineDep[]>;
}

const emptyChanges = (): Changes => ({ duration: new Map(), deps: new Map() });

function apply(base: EngineTask[], c: Changes): EngineTask[] {
  if (c.duration.size === 0 && c.deps.size === 0) return base;
  return base.map((t) => {
    const d = c.duration.get(t.id);
    const deps = c.deps.get(t.id);
    return d === undefined && deps === undefined ? t : { ...t, durationWd: d ?? t.durationWd, deps: deps ?? t.deps };
  });
}

function maxFinish(dates: Map<string, { finish: string }>): string | null {
  let m: string | null = null;
  for (const d of dates.values()) if (m === null || d.finish > m) m = d.finish;
  return m;
}

interface Run { ok: true; finish: string; critical: Set<string>; }

function run(tasks: EngineTask[], cal: WorkCalendar, start: string): Run | null {
  const r = scheduleProject(tasks, cal, start);
  if (!r.ok) return null;
  const finish = maxFinish(r.dates);
  if (!finish) return null;
  const critical = new Set<string>();
  for (const [id, f] of r.float) if (f.critical) critical.add(id);
  return { ok: true, finish, critical };
}

interface Candidate { kind: LeverKind; task: RecoveryTask; change: Changes; lever: Omit<Lever, "gainWd">; magnitude: number }

function enumerate(
  state: Changes, engine: EngineTask[], byId: Map<string, RecoveryTask>, critical: Set<string>,
  alternatives: Map<string, MethodAlternative[]>, allowed: Set<LeverKind>, s: RecoverySettings,
): Candidate[] {
  const out: Candidate[] = [];
  const current = new Map(engine.map((t) => [t.id, t]));
  const crit = [...critical].map((id) => current.get(id)!).filter(Boolean);

  for (const et of crit) {
    const task = byId.get(et.id);
    if (!task || task.isMilestone || task.manual || task.progress > 0) continue;
    const dur = et.durationWd;
    // one duration change per activity: a task already shortened is not squeezed again beyond its cap
    const durationTouched = state.duration.has(task.id);

    if (allowed.has("crew") && task.crewable && !durationTouched && dur >= s.minDurationWd) {
      const to = Math.max(1, Math.ceil(dur * (1 - s.maxCompression)));
      if (to < dur) {
        const c = emptyChanges(); c.duration.set(task.id, to);
        const share = (dur - to) / dur;
        out.push({
          kind: "crew", task, change: c, magnitude: dur - to,
          lever: { kind: "crew", taskId: task.id, code: task.code, name: task.name, fromWd: dur, toWd: to, risk: share <= 0.2 ? "low" : "medium",
            label: `Add crews / second shift: ${dur} → ${to} wd (crew ×${(1 / (1 - share)).toFixed(2)})` },
        });
      }
    }

    if (allowed.has("expedite") && !task.crewable && !durationTouched && dur >= s.minDurationWd) {
      const to = Math.max(1, Math.ceil(dur * (1 - s.expediteCompression)));
      if (to < dur) {
        const c = emptyChanges(); c.duration.set(task.id, to);
        out.push({
          kind: "expedite", task, change: c, magnitude: dur - to,
          lever: { kind: "expedite", taskId: task.id, code: task.code, name: task.name, fromWd: dur, toWd: to, risk: "medium",
            label: `Expedite by management action (earlier release, parallel approvals): ${dur} → ${to} wd` },
        });
      }
    }

    if (allowed.has("method") && !durationTouched) {
      for (const alt of alternatives.get(task.id) ?? []) {
        const to = Math.max(1, Math.ceil(alt.durationWd));
        if (to >= dur) continue;
        const c = emptyChanges(); c.duration.set(task.id, to);
        out.push({
          kind: "method", task, change: c, magnitude: dur - to,
          lever: { kind: "method", taskId: task.id, code: task.code, name: task.name, fromWd: dur, toWd: to, risk: alt.draft ? "high" : "medium",
            label: `Switch method to ${alt.methodName}: ${dur} → ${to} wd${alt.draft ? " (standard is a draft)" : ""}` },
        });
      }
    }

    if (allowed.has("fasttrack")) {
      for (const d of et.deps) {
        if (d.type !== "fs" || d.lag > 0 || !critical.has(d.predId)) continue;
        const pred = current.get(d.predId);
        const predTask = byId.get(d.predId);
        if (!pred || !predTask || predTask.isMilestone || pred.durationWd < 2) continue;
        const lag = Math.ceil(pred.durationWd / 2);
        const c = emptyChanges();
        c.deps.set(task.id, et.deps.map((x) => (x === d ? { ...x, type: "ss" as const, lag } : x)));
        out.push({
          kind: "fasttrack", task, change: c, magnitude: lag, // measured effect decides; lag is only a tie-break
          lever: { kind: "fasttrack", taskId: task.id, predId: d.predId, code: task.code, name: task.name, fromWd: et.durationWd, toWd: et.durationWd, risk: "high",
            label: `Start after half of ${predTask.code} (overlap): finish-to-start becomes start-to-start +${lag} wd` },
        });
      }
    }
  }
  return out;
}

type Memo = Map<string, Run | null>;

/** Identity of a set of changes: the same set evaluated twice (in different lever families) costs one CPM run. */
function signature(c: Changes): string {
  const d = [...c.duration].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `d${k}:${v}`).join("|");
  const p = [...c.deps].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `p${k}:${v.map((x) => `${x.predId}${x.type}${x.lag}`).join(",")}`).join("|");
  return `${d}#${p}`;
}

function memoRun(memo: Memo, base: EngineTask[], c: Changes, cal: WorkCalendar, start: string): Run | null {
  const k = signature(c);
  if (memo.has(k)) return memo.get(k)!;
  const r = run(apply(base, c), cal, start);
  memo.set(k, r);
  return r;
}

function merge(a: Changes, b: Changes): Changes {
  return { duration: new Map([...a.duration, ...b.duration]), deps: new Map([...a.deps, ...b.deps]) };
}

function greedy(
  tasks: RecoveryTask[], base: EngineTask[], cal: WorkCalendar, start: string, target: string,
  alternatives: Map<string, MethodAlternative[]>, allowed: Set<LeverKind>, s: RecoverySettings, memo: Memo,
): { levers: Lever[]; finish: string; ok: boolean } | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let state = emptyChanges();
  const levers: Lever[] = [];
  let now = memoRun(memo, base, emptyChanges(), cal, start);
  if (!now) return null;
  let before = now; // the state before the last lever, for tightening

  while (levers.length < s.maxLevers) {
    if (signedWorkingDayGap(cal, target, now.finish) <= 0) break; // target met
    const engine = apply(base, state);
    const cands = enumerate(state, engine, byId, now.critical, alternatives, allowed, s)
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, s.candidateLimit);

    let best: { c: Candidate; gain: number; res: Run } | null = null;
    for (const c of cands) {
      const res = memoRun(memo, base, merge(state, c.change), cal, start);
      if (!res) continue;
      const gain = signedWorkingDayGap(cal, res.finish, now.finish);
      if (gain <= 0) continue;
      if (!best || gain > best.gain || (gain === best.gain && (RISK_RANK[c.lever.risk] < RISK_RANK[best.c.lever.risk] || (RISK_RANK[c.lever.risk] === RISK_RANK[best.c.lever.risk] && c.magnitude < best.c.magnitude)))) {
        best = { c, gain, res };
      }
    }
    if (!best) break;
    before = now;
    state = merge(state, best.c.change);
    levers.push({ ...best.c.lever, gainWd: best.gain });
    now = best.res;
  }

  // "Just enough": when the last lever is a crew boost and the target is met, ask for the smallest compression that still meets it.
  const last = levers[levers.length - 1];
  if (last && (last.kind === "crew" || last.kind === "expedite") && signedWorkingDayGap(cal, target, now.finish) <= 0) {
    const stateBefore: Changes = { duration: new Map(state.duration), deps: new Map(state.deps) };
    stateBefore.duration.delete(last.taskId);
    let lo = last.toWd; // meets the target
    let hi = last.fromWd - 1; // least compression we could ask for
    let bestRun: Run | null = null;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const c = merge(stateBefore, { duration: new Map([[last.taskId, mid]]), deps: new Map() });
      const r = memoRun(memo, base, c, cal, start);
      if (r && signedWorkingDayGap(cal, target, r.finish) <= 0) { lo = mid; bestRun = r; } else hi = mid - 1;
    }
    if (lo > last.toWd) {
      const share = (last.fromWd - lo) / last.fromWd;
      const c = merge(stateBefore, { duration: new Map([[last.taskId, lo]]), deps: new Map() });
      const r = bestRun ?? memoRun(memo, base, c, cal, start);
      if (r) {
        last.toWd = lo;
        if (last.kind === "crew") {
          last.label = `Add crews / second shift: ${last.fromWd} → ${lo} wd (crew ×${(1 / (1 - share)).toFixed(2)})`;
          last.risk = share <= 0.2 ? "low" : "medium";
        } else {
          last.label = `Expedite by management action (earlier release, parallel approvals): ${last.fromWd} → ${lo} wd`;
        }
        last.gainWd = signedWorkingDayGap(cal, r.finish, before.finish);
        now = r;
      }
    }
  }
  return { levers, finish: now.finish, ok: true };
}

const FAMILIES: { key: string; name: string; description: string; kinds: LeverKind[] }[] = [
  { key: "A", name: "More resources", description: "Add crews or a second shift on critical site activities that have not started.", kinds: ["crew"] },
  { key: "B", name: "Method changes", description: "Switch critical activities to a faster construction method from the library.", kinds: ["method"] },
  { key: "C", name: "Expedite procurement, design and approvals", description: "Shorten critical activities that crews cannot speed up, by management action (earlier release, parallel approvals).", kinds: ["expedite"] },
  { key: "D", name: "Combined, no overlapping", description: "Crews, method changes and expediting together, choosing whichever recovers most each step.", kinds: ["crew", "method", "expedite"] },
  { key: "E", name: "Everything, including overlapping", description: "As D, and also start critical successors before their predecessor finishes. Highest risk of rework.", kinds: ["crew", "method", "expedite", "fasttrack"] },
];

function resourceNote(levers: Lever[]): string {
  const crew = levers.filter((l) => l.kind === "crew");
  const parts: string[] = [];
  if (crew.length) parts.push(`${crew.length} activit${crew.length === 1 ? "y needs" : "ies need"} more crews or a second shift`);
  const e = levers.filter((l) => l.kind === "expedite");
  if (e.length) parts.push(`${e.length} activit${e.length === 1 ? "y" : "ies"} to expedite (needs a decision from procurement, design or the client)`);
  const m = levers.filter((l) => l.kind === "method");
  if (m.length) parts.push(`${m.length} method change${m.length === 1 ? "" : "s"} (check equipment and availability)`);
  const f = levers.filter((l) => l.kind === "fasttrack");
  if (f.length) parts.push(`${f.length} overlapped link${f.length === 1 ? "" : "s"} (work front, access and rework risk)`);
  return parts.join("; ") || "no change";
}

export function analyseRecovery(
  tasks: RecoveryTask[], cal: WorkCalendar, projectStart: string, targetFinish: string | null,
  alternatives: Map<string, MethodAlternative[]> = new Map(), settings: RecoverySettings = DEFAULT_RECOVERY_SETTINGS,
): RecoveryAnalysis {
  const base = toEngine(tasks, cal);
  const live = scheduleProject(base, cal, projectStart);
  if (!live.ok) return { ok: false, cycle: live.cycle, liveFinish: null, targetFinish, gapWd: 0, criticalCount: 0, candidates: { crew: 0, expedite: 0, method: 0, fasttrack: 0 }, scenarios: [] };
  const liveFinish = maxFinish(live.dates);
  const critical = new Set<string>();
  for (const [id, f] of live.float) if (f.critical) critical.add(id);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const all = enumerate(emptyChanges(), base, byId, critical, alternatives, new Set<LeverKind>(["crew", "expedite", "method", "fasttrack"]), settings);
  const candidates = { crew: all.filter((c) => c.kind === "crew").length, expedite: all.filter((c) => c.kind === "expedite").length, method: all.filter((c) => c.kind === "method").length, fasttrack: all.filter((c) => c.kind === "fasttrack").length };

  const target = targetFinish ?? liveFinish;
  const gapWd = liveFinish && target ? signedWorkingDayGap(cal, target, liveFinish) : 0;

  const scenarios: Scenario[] = [];
  const memo: Memo = new Map();
  const seen = new Set<string>();
  if (liveFinish && target && gapWd > 0) {
    for (const f of FAMILIES) {
      // a family none of whose lever kinds has a candidate has nothing to offer
      if (!f.kinds.some((k) => candidates[k] > 0)) continue;
      if (f.kinds.includes("fasttrack") && !settings.allowFastTrack) continue;

      const g = greedy(tasks, base, cal, projectStart, target, alternatives, new Set(f.kinds), { ...settings }, memo);
      if (!g || g.levers.length === 0) continue;
      const id = g.levers.map((l) => `${l.kind}:${l.taskId}:${l.toWd}:${l.predId ?? ""}`).join(",");
      if (seen.has(id)) continue; // same changes as an earlier scenario
      seen.add(id);
      const remaining = Math.max(0, signedWorkingDayGap(cal, target, g.finish));
      scenarios.push({
        key: f.key, name: f.name, description: f.description, levers: g.levers, finish: g.finish,
        recoveredWd: signedWorkingDayGap(cal, g.finish, liveFinish), remainingGapWd: remaining, meetsTarget: remaining === 0,
        risk: maxRisk(g.levers.map((l) => l.risk)), resourceNote: resourceNote(g.levers),
      });
    }
  }
  return { ok: true, liveFinish, targetFinish: target, gapWd, criticalCount: critical.size, candidates, scenarios };
}

/** Plain-text change list a planner can paste into a programme review. */
export function changeListText(s: Scenario, targetFinish: string | null): string {
  const head = `Recovery scenario ${s.key} - ${s.name}: finish ${s.finish}${targetFinish ? ` vs target ${targetFinish}` : ""}; recovers ${s.recoveredWd} wd; ${s.meetsTarget ? "meets the target" : `${s.remainingGapWd} wd still missing`}; risk ${s.risk}.`;
  return [head, ...s.levers.map((l, i) => `${i + 1}. ${l.code} ${l.name}: ${l.label} (+${l.gainWd} wd)`), `Resources: ${s.resourceNote}.`].join("\n");
}
