// Doc 35 I3–I7: Planning's outbound feeds. The rows are computed on the server (plan_feed_rows); a planner previews
// them and publishes a numbered version (plan_feed_publications) that the receiving module reads with plan_latest_feed.
// This file: the feed contract (row shapes), column layout, row flags and the change list against the last version.

export const FEED_KEYS = ["materials", "manpower", "inspections", "submissions", "cost"] as const;
export type FeedKey = (typeof FEED_KEYS)[number];

export interface MaterialRow {
  key: string; task_id: string; task_code: string | null; task_name: string | null; wbs_code: string | null;
  kind: "material" | "equipment"; resource_id: string; resource_code: string | null; resource: string | null;
  unit: string | null; quantity: number; start: string; finish: string | null;
  required_on_site: string; lead_time_days: number; lead_time_source: "price" | "default"; order_by: string;
  pr_numbers: string | null; pr_required_date: string | null; coverage: "covered" | "pr_late" | "no_pr";
}
export interface ManpowerRow {
  key: string; week: string; resource_id: string; trade_code: string | null; trade: string | null;
  hours: number; working_days: number; headcount: number | null;
}
export interface InspectionRow {
  key: string; task_id: string; task_code: string | null; task_name: string | null; wbs_code: string | null;
  item_id: string; item_code: string; item: string; tc_type: string; planned_date: string; request_by: string;
  in_itp: boolean; ir_numbers: string | null; ir_inspection_date: string | null;
  state: "passed" | "requested" | "ir_late" | "not_requested";
}
export interface SubmissionRow {
  key: string; kind: "shop_drawing" | "method_statement"; item_id: string; item_code: string; item: string;
  first_task: string | null; first_start: string; activities: number; approve_by: string; submit_by: string;
  submittal_numbers: string | null; target_submission_date: string | null; actual_submission_date: string | null;
  state: "approved" | "submitted" | "planned" | "target_late" | "not_registered";
}
export interface CostRow { key: string; month: string; cost_code: string; kind: string; currency: string | null; amount: number }

export interface FeedRowMap { materials: MaterialRow; manpower: ManpowerRow; inspections: InspectionRow; submissions: SubmissionRow; cost: CostRow }
export type AnyFeedRow = FeedRowMap[FeedKey];

export interface FeedSettings {
  material_lead_days: number; site_buffer_days: number; submission_review_days: number; submission_buffer_days: number; inspection_notice_days: number;
}
export const DEFAULT_FEED_SETTINGS: FeedSettings = {
  material_lead_days: 14, site_buffer_days: 3, submission_review_days: 14, submission_buffer_days: 7, inspection_notice_days: 2,
};

export const FEED_META: Record<FeedKey, { label: string; receiver: string; what: string }> = {
  materials: {
    label: "Materials & equipment", receiver: "Procurement",
    what: "Each activity's materials and equipment: on site by the start less the site buffer, ordered by that less the lead time (the price's lead time, else the default). Purchase requests raised against the activity cover it when they are needed in time.",
  },
  manpower: {
    label: "Manpower", receiver: "HR",
    what: "Remaining labour hours per trade per week, spread over the working days left in each activity; headcount = hours ÷ (hours per day × working days in the week).",
  },
  inspections: {
    label: "Inspections", receiver: "QA/QC",
    what: "Each test or inspection an activity's library entry calls for, due when the activity finishes; the request is due the notice days before. Inspection requests raised against the activity are matched.",
  },
  submissions: {
    label: "Submissions", receiver: "Document Control",
    what: "Each shop drawing and method statement the remaining work needs, by the first activity that needs it: approved by its start less the buffer, submitted by that less the review period. Matched to submittals that name the item.",
  },
  cost: {
    label: "Cost distribution", receiver: "Finance",
    what: "Priced cost per month, cost code and cost type, spread over each activity's working days (the activity's cost code, else its WBS item's).",
  },
};

export type RowFlag = "overdue" | "warn" | "done" | null;

/** How a row should be shown, as at the data date. */
export function rowFlag(feed: FeedKey, row: AnyFeedRow, asAt: string, soonDays = 14): RowFlag {
  const soon = addDays(asAt, soonDays);
  switch (feed) {
    case "materials": {
      const r = row as MaterialRow;
      if (r.coverage === "covered") return "done";
      if (r.coverage === "pr_late" || r.order_by < asAt) return "overdue";
      return r.order_by <= soon ? "warn" : null;
    }
    case "inspections": {
      const r = row as InspectionRow;
      if (r.state === "passed") return "done";
      if (r.state === "ir_late" || (r.state === "not_requested" && r.request_by < asAt)) return "overdue";
      return r.state === "not_requested" && r.request_by <= soon ? "warn" : null;
    }
    case "submissions": {
      const r = row as SubmissionRow;
      if (r.state === "approved") return "done";
      if (r.state === "target_late" || (r.state !== "submitted" && r.submit_by < asAt)) return "overdue";
      return r.state !== "submitted" && r.submit_by <= soon ? "warn" : null;
    }
    default:
      return null;
  }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface FeedDiff { added: string[]; removed: string[]; changed: string[] }

// Coverage / state columns describe the receiving module's records, not the programme: a change there alone is not
// a programme change to publish.
const RECEIVER_FIELDS = new Set(["coverage", "pr_numbers", "pr_required_date", "state", "in_itp", "ir_numbers", "ir_inspection_date",
  "submittal_numbers", "target_submission_date", "actual_submission_date"]);

function planned(row: AnyFeedRow): string {
  const o = row as unknown as Record<string, unknown>;
  return JSON.stringify(Object.keys(o).filter((k) => !RECEIVER_FIELDS.has(k)).sort().map((k) => [k, o[k]]));
}

/** What changed in the programme's demands since the published version (by row key). */
export function diffFeed(published: AnyFeedRow[] | null, live: AnyFeedRow[]): FeedDiff {
  const before = new Map((published ?? []).map((r) => [r.key, planned(r)]));
  const after = new Map(live.map((r) => [r.key, planned(r)]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of after) {
    const b = before.get(k);
    if (b === undefined) added.push(k);
    else if (b !== v) changed.push(k);
  }
  const removed = [...before.keys()].filter((k) => !after.has(k));
  return { added, removed, changed };
}

/** Headcount per week across trades (for the manpower summary). */
export function weeklyHeadcount(rows: ManpowerRow[]): { week: string; hours: number; headcount: number }[] {
  const m = new Map<string, { week: string; hours: number; headcount: number }>();
  for (const r of rows) {
    const w = m.get(r.week) ?? { week: r.week, hours: 0, headcount: 0 };
    w.hours += r.hours;
    w.headcount += r.headcount ?? 0;
    m.set(r.week, w);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, hours: Math.round(w.hours * 10) / 10, headcount: Math.round(w.headcount * 10) / 10 }));
}
