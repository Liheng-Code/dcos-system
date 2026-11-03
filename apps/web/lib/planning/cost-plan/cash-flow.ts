// Planned cash flow (doc 35 C4; PRD FR-077). Pure, no I/O.
//
// Cash in:  the value earned each month (activity budgets = BOQ value, spread over working days) is certified at the
//           month end and paid `paymentLagDays` later, less retention and advance recovery. The advance is paid in
//           the first month and recovered at `advanceRecoveryPct` of each certificate (the rest from the last one). Retention is released `retentionReleasePct` % after the last certificate and the rest
//           after the defects liability period (`dlpMonths`), each with the payment lag.
// Cash out: the cost of each month (labour, material, equipment, subcontract) is paid `costLagDays` after the month
//           end.
// Separate from the cost curve: the cost curve says when work is done, this says when money moves.

export interface CashFlowSettings {
  paymentLagDays: number;
  /** % of each certificate held */
  retentionPct: number;
  /** retention stops once it reaches this % of the contract value; null = no limit */
  retentionLimitPct: number | null;
  /** % of the retention released after the last certificate (the rest after the defects period) */
  retentionReleasePct: number;
  dlpMonths: number;
  /** % of the contract value paid in advance */
  advancePct: number;
  /** % of each certificate recovered against the advance; null = the advance % */
  advanceRecoveryPct: number | null;
  costLagDays: number;
}

export const DEFAULT_CASH_FLOW: CashFlowSettings = {
  paymentLagDays: 30, retentionPct: 0, retentionLimitPct: null, retentionReleasePct: 50, dlpMonths: 12,
  advancePct: 0, advanceRecoveryPct: null, costLagDays: 30,
};

/** An amount for a month; `month` is the first day of the month (YYYY-MM-01) or any day in it. */
export interface MonthAmount {
  month: string;
  amount: number;
}

export interface CashFlowRow {
  month: string;
  /** value earned (certified at the month end) */
  value: number;
  /** cost incurred */
  cost: number;
  cashIn: number;
  cashOut: number;
  net: number;
  cumulativeIn: number;
  cumulativeOut: number;
  cumulativeNet: number;
  /** retention held at the month end */
  retentionHeld: number;
}

export interface CashFlowResult {
  rows: CashFlowRow[];
  contractValue: number;
  totalCost: number;
  advance: number;
  retention: number;
  totalIn: number;
  totalOut: number;
  /** the lowest cumulative position (negative = money the contractor must fund) and its month */
  peakFunding: { amount: number; month: string | null };
  /** months when retention comes back */
  retentionRelease: { month: string; amount: number }[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthKey = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Last day of the month containing `iso`, as a UTC date. */
function monthEnd(iso: string): Date {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return new Date(Date.UTC(y, m, 0));
}
function plusDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
function plusMonths(d: Date, months: number): Date {
  // month end + n months stays on a month end
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + months, 0));
}
const keyOf = (d: Date) => monthKey(d.toISOString());

function nextMonth(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function byMonth(list: MonthAmount[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of list) {
    const k = monthKey(a.month);
    map.set(k, (map.get(k) ?? 0) + (Number(a.amount) || 0));
  }
  return map;
}

export function cashFlow(valueByMonth: MonthAmount[], costByMonth: MonthAmount[], settings: CashFlowSettings): CashFlowResult {
  const s = settings;
  const value = byMonth(valueByMonth);
  const cost = byMonth(costByMonth);
  const valueMonths = [...value.keys()].filter((k) => value.get(k) !== 0).sort();
  const contractValue = [...value.values()].reduce((a, b) => a + b, 0);
  const totalCost = [...cost.values()].reduce((a, b) => a + b, 0);

  const cashIn = new Map<string, number>();
  const cashOut = new Map<string, number>();
  const retentionDelta = new Map<string, number>();
  const add = (map: Map<string, number>, k: string, v: number) => { if (v !== 0) map.set(k, (map.get(k) ?? 0) + v); };

  const advance = valueMonths.length > 0 ? contractValue * (Math.max(0, s.advancePct) / 100) : 0;
  if (advance > 0) add(cashIn, valueMonths[0], advance);
  const recoveryRate = Math.max(0, s.advanceRecoveryPct ?? s.advancePct) / 100;
  const retentionCap = s.retentionLimitPct == null ? Infinity : contractValue * (s.retentionLimitPct / 100);

  let held = 0;
  let recovered = 0;
  for (const m of valueMonths) {
    const gross = value.get(m) ?? 0;
    const retention = gross > 0 ? Math.min(gross * (Math.max(0, s.retentionPct) / 100), Math.max(0, retentionCap - held)) : 0;
    // whatever is still outstanding comes off the last certificate
    const due = m === valueMonths[valueMonths.length - 1] ? gross - retention : gross * recoveryRate;
    const recovery = gross > 0 ? Math.min(Math.max(0, due), Math.max(0, advance - recovered)) : 0;
    held += retention;
    recovered += recovery;
    add(retentionDelta, m, retention);
    add(cashIn, keyOf(plusDays(monthEnd(m), s.paymentLagDays)), gross - retention - recovery);
  }

  const retentionRelease: { month: string; amount: number }[] = [];
  if (held > 0 && valueMonths.length > 0) {
    const last = monthEnd(valueMonths[valueMonths.length - 1]);
    const first = held * (Math.min(100, Math.max(0, s.retentionReleasePct)) / 100);
    const parts = [
      { at: plusDays(last, s.paymentLagDays), amount: first },
      { at: plusDays(plusMonths(last, s.dlpMonths), s.paymentLagDays), amount: held - first },
    ];
    for (const p of parts) {
      if (p.amount <= 0) continue;
      const k = keyOf(p.at);
      add(cashIn, k, p.amount);
      add(retentionDelta, k, -p.amount);
      retentionRelease.push({ month: k, amount: round2(p.amount) });
    }
  }

  for (const [m, c] of cost) add(cashOut, keyOf(plusDays(monthEnd(m), s.costLagDays)), c);

  const allKeys = [...value.keys(), ...cost.keys(), ...cashIn.keys(), ...cashOut.keys()].sort();
  const rows: CashFlowRow[] = [];
  if (allKeys.length > 0) {
    let cin = 0, cout = 0, ret = 0;
    for (let k = allKeys[0]; k <= allKeys[allKeys.length - 1]; k = nextMonth(k)) {
      const i = cashIn.get(k) ?? 0;
      const o = cashOut.get(k) ?? 0;
      cin += i; cout += o; ret += retentionDelta.get(k) ?? 0;
      rows.push({
        month: k, value: round2(value.get(k) ?? 0), cost: round2(cost.get(k) ?? 0),
        cashIn: round2(i), cashOut: round2(o), net: round2(i - o),
        cumulativeIn: round2(cin), cumulativeOut: round2(cout), cumulativeNet: round2(cin - cout), retentionHeld: round2(ret),
      });
    }
  }

  let peak: { amount: number; month: string | null } = { amount: 0, month: null };
  for (const r of rows) if (r.cumulativeNet < peak.amount) peak = { amount: r.cumulativeNet, month: r.month };

  return {
    rows,
    contractValue: round2(contractValue),
    totalCost: round2(totalCost),
    advance: round2(advance),
    retention: round2(held),
    totalIn: round2([...cashIn.values()].reduce((a, b) => a + b, 0)),
    totalOut: round2([...cashOut.values()].reduce((a, b) => a + b, 0)),
    peakFunding: peak,
    retentionRelease,
  };
}
