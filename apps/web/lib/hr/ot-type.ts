// Suggests the OT type for a request from HR's overtime_type_rules. Pure: the caller supplies
// the rules, the holiday and rest-day facts, and which OT types are currently rated.
//
// Times are the wall-clock strings the OT form sends ("YYYY-MM-DDTHH:mm"); no timezone is applied.

export interface OtTypeRule {
  priority: number;
  kind: "public_holiday" | "rest_day" | "night_window" | "default";
  params: { from?: string; to?: string };
  ot_type: string;
  is_active: boolean;
}

export interface OtTypeContext {
  start: string; // "YYYY-MM-DDTHH:mm"
  end: string;
  /** The start date is a public holiday. */
  isHoliday: boolean;
  /** The start date is not a working day for the employee. */
  isRestDay: boolean;
  /** OT types that currently have an active rate; others are never suggested. */
  ratedTypes: Set<string>;
}

export interface OtTypeSuggestion {
  ot_type: string;
  kind: OtTypeRule["kind"];
  reason: string;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when [start, end] (minutes from the start date's midnight) overlaps the night window. */
export function overlapsNightWindow(startMin: number, endMin: number, from: string, to: string): boolean {
  const f = minutes(from);
  const t = minutes(to);
  // The window repeats every day; list its occurrences over the start day, the next day and the day after.
  const windows = f < t
    ? [[f, t], [1440 + f, 1440 + t]]
    : [[0, t], [f, 1440 + t], [1440 + f, 2880]];
  return windows.some(([ws, we]) => startMin < we && endMin > ws);
}

export function suggestOtType(rules: OtTypeRule[], ctx: OtTypeContext): OtTypeSuggestion | null {
  const startMin = minutes(ctx.start.slice(11, 16));
  const durationMin = Math.max(0, (Date.parse(`${ctx.end}:00Z`) - Date.parse(`${ctx.start}:00Z`)) / 60000);
  const endMin = startMin + durationMin;

  const ordered = rules.filter((r) => r.is_active && ctx.ratedTypes.has(r.ot_type)).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    switch (rule.kind) {
      case "public_holiday":
        if (ctx.isHoliday) return { ot_type: rule.ot_type, kind: rule.kind, reason: "the date is a public holiday" };
        break;
      case "rest_day":
        if (ctx.isRestDay) return { ot_type: rule.ot_type, kind: rule.kind, reason: "the date is a rest day" };
        break;
      case "night_window":
        if (rule.params.from && rule.params.to && overlapsNightWindow(startMin, endMin, rule.params.from, rule.params.to)) {
          return { ot_type: rule.ot_type, kind: rule.kind, reason: `it overlaps the night window ${rule.params.from}–${rule.params.to}` };
        }
        break;
      case "default":
        return { ot_type: rule.ot_type, kind: rule.kind, reason: "a regular working day" };
    }
  }
  return null;
}
