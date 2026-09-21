// Parity check: the TypeScript work engine (UI previews) vs the SQL function plan_compute_work (what is stored).
// They are two implementations of the same formulas and must never drift apart.
//
// Needs the LOCAL Supabase database container, so it is opt-in:
//   $env:DCOS_PARITY = "1"; pnpm exec vitest run lib/planning/__tests__/work-engine-parity.test.ts
// Without DCOS_PARITY it is skipped, so the normal test run stays dependency-free.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { computeTaskWork, type WorkInput } from "../work-engine";

const RUN = process.env.DCOS_PARITY === "1";
const CONTAINER = process.env.DCOS_DB_CONTAINER ?? "supabase_db_dcos-system";
const CASES = 600;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

interface Case {
  quantity: number | null;
  taskUnit: string | null;
  normUnit: string | null;
  lc: number | null;
  eff: number;
  adjust: number;
  crewWorkers: number;
  crews: number;
  hours: number | null;
  duration: number | null;
}

function makeCases(n: number): Case[] {
  const r = rng(20260922);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const dp = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  const UNITS = ["m3", "m²", "M3", "cum", "m2", "sqm", "kg", "no", "Nos", "t", "tonne", "m"];
  const out: Case[] = [];
  for (let i = 0; i < n; i++) {
    const unit = pick(UNITS);
    const mismatch = r() < 0.08;
    out.push({
      quantity: r() < 0.05 ? null : r() < 0.05 ? 0 : dp(0.5 + r() * 5000, 2),
      taskUnit: r() < 0.03 ? null : unit,
      normUnit: mismatch ? pick(UNITS) : unit,
      lc: r() < 0.05 ? null : dp(0.02 + r() * 25, 4),
      eff: dp(50 + r() * 100, 1),
      adjust: dp(60 + r() * 100, 1),
      crewWorkers: r() < 0.1 ? 0 : dp(0.5 + r() * 30, 1),
      crews: pick([1, 1, 1, 2, 3, 0.5, 1.5]),
      hours: r() < 0.1 ? null : pick([6, 7, 7.5, 8, 8, 8, 9, 10, 12]),
      duration: r() < 0.15 ? (r() < 0.5 ? null : 0) : 1 + Math.floor(r() * 90),
    });
  }
  return out;
}

const sqlNum = (v: number | null, t = "numeric") => (v === null ? `null::${t}` : `${v}::${t}`);
const sqlText = (v: string | null) => (v === null ? "null::text" : `'${v.replace(/'/g, "''")}'::text`);

function querySql(cases: Case[]) {
  const values = cases
    .map(
      (c, i) =>
        `(${i}, ${sqlNum(c.quantity)}, ${sqlText(c.taskUnit)}, ${sqlText(c.normUnit)}, ${sqlNum(c.lc)}, ${sqlNum(c.eff)}, ${sqlNum(c.adjust)}, ${sqlNum(c.crewWorkers)}, ${sqlNum(c.crews)}, ${sqlNum(c.hours)}, ${sqlNum(c.duration, "integer")})`,
    )
    .join(",\n");
  const sql = `select v.i, r.work_hours, r.productivity_factor, r.crew_required, r.crews_required, r.duration_wd_derived, r.calc_status
from (values ${values}) as v(i, q, tu, nu, lc, eff, adj, cw, crews, h, dur)
cross join lateral public.plan_compute_work(v.q, v.tu, v.nu, v.lc, v.eff, v.adj, v.cw, v.crews, v.h, v.dur) r
order by v.i;`;
  const out = execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const p = l.split("|");
      const num = (s: string) => (s === "" ? null : Number(s));
      return {
        i: Number(p[0]),
        workHours: num(p[1]),
        productivityFactor: num(p[2]),
        crewRequired: num(p[3]),
        crewsRequired: num(p[4]),
        durationWdDerived: num(p[5]),
        status: p[6],
      };
    });
}

describe.skipIf(!RUN)("work engine parity: TypeScript vs SQL plan_compute_work", () => {
  it(`agrees on ${CASES} random inputs (every field, incl. status)`, () => {
    const cases = makeCases(CASES);
    const sql = querySql(cases);
    expect(sql).toHaveLength(CASES);

    const seen = new Map<string, number>();
    for (const row of sql) {
      const c = cases[row.i];
      const input: WorkInput = {
        quantity: c.quantity,
        quantityUnit: c.taskUnit,
        norm: c.lc === null ? null : { unit: c.normUnit ?? "", labourConstantHrPerUnit: c.lc, efficiencyPct: c.eff },
        adjustPct: c.adjust,
        crewWorkers: c.crewWorkers,
        crews: c.crews,
        hoursPerDay: c.hours,
        currentDurationWd: c.duration,
      };
      const ts = computeTaskWork(input);
      const label = `case ${row.i} ${JSON.stringify(c)}`;
      expect(ts.status, label).toBe(row.status);
      expect(ts.workHours, `${label} workHours`).toBe(row.workHours);
      expect(ts.productivityFactor, `${label} factor`).toBe(row.productivityFactor);
      expect(ts.crewRequired, `${label} crewRequired`).toBe(row.crewRequired);
      expect(ts.crewsRequired, `${label} crewsRequired`).toBe(row.crewsRequired);
      expect(ts.durationWdDerived, `${label} durationWdDerived`).toBe(row.durationWdDerived);
      seen.set(row.status, (seen.get(row.status) ?? 0) + 1);
    }

    // guard against a vacuous pass: the random cases must exercise several statuses, mostly "ok"
    expect(seen.get("ok") ?? 0).toBeGreaterThan(CASES * 0.6);
    for (const s of ["missing_quantity", "missing_norm", "unit_mismatch"]) expect(seen.get(s) ?? 0, s).toBeGreaterThan(0);
  });
});
