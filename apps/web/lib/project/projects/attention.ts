// "Needs attention" on a project's Overview: open items with a due date, grouped per module
// and bucketed as overdue / due within 7 days / later, the way Procore's Project Overview does.

export type AttentionSourceKey =
  | "tasks"
  | "rfis"
  | "technical_queries"
  | "coordination"
  | "ncrs"
  | "inspections"
  | "submittals"
  | "documents"
  | "permits";

export interface AttentionSource {
  key: AttentionSourceKey;
  label: string;
  /** Module page with the full list (it reads the project from ProjectContext). */
  href: string;
  /** What the date means, shown next to it. */
  dueLabel: string;
}

export const ATTENTION_SOURCES: AttentionSource[] = [
  { key: "tasks", label: "Tasks", href: "/dashboard/tasks", dueLabel: "Finish" },
  { key: "rfis", label: "RFIs", href: "/dashboard/design/arc/rfi", dueLabel: "Response due" },
  { key: "technical_queries", label: "Technical queries", href: "/dashboard/design/str/technical-queries", dueLabel: "Response due" },
  { key: "coordination", label: "Design coordination", href: "/dashboard/design/coordination", dueLabel: "Due" },
  { key: "ncrs", label: "NCRs", href: "/dashboard/qaqc?sub=ncrs", dueLabel: "Close-out due" },
  { key: "inspections", label: "Inspection requests", href: "/dashboard/qaqc?sub=inspections", dueLabel: "Inspection" },
  { key: "submittals", label: "Submittals", href: "/dashboard/documents/submittals", dueLabel: "Consultant due" },
  { key: "documents", label: "Documents in review", href: "/dashboard/documents/controller", dueLabel: "Consultant due" },
  { key: "permits", label: "Work permits", href: "/dashboard/hse/permits", dueLabel: "Expires" },
];

export interface AttentionItem {
  source: AttentionSourceKey;
  id: string;
  /** Register number (RFI-012, NCR-003 …) when the record has one. */
  ref: string | null;
  title: string;
  /** ISO date (yyyy-mm-dd or a timestamp); only dated items are loaded. */
  due: string;
  /** Overrides the source page, e.g. an RFI's own discipline register. */
  href?: string;
}

export type AttentionBucket = "overdue" | "soon" | "later";

export interface AttentionGroup {
  source: AttentionSource;
  overdue: number;
  soon: number;
  later: number;
  total: number;
  /** Most urgent first, at most PREVIEW_SIZE. */
  preview: (AttentionItem & { bucket: AttentionBucket })[];
}

export const PREVIEW_SIZE = 5;
const SOON_DAYS = 7;

/** Local calendar date as yyyy-mm-dd. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

/** Overdue: before today. Soon: today up to 7 days ahead. Later: after that. */
export function bucketOf(due: string, today: string): AttentionBucket {
  const day = due.slice(0, 10);
  if (day < today) return "overdue";
  if (day <= addDays(today, SOON_DAYS)) return "soon";
  return "later";
}

/** Groups items by source in ATTENTION_SOURCES order; sources with nothing open are left out. */
export function groupAttention(items: AttentionItem[], today: string): AttentionGroup[] {
  const groups: AttentionGroup[] = [];
  for (const source of ATTENTION_SOURCES) {
    const mine = items
      .filter((i) => i.source === source.key)
      .map((i) => ({ ...i, bucket: bucketOf(i.due, today) }))
      .sort((a, b) => a.due.localeCompare(b.due));
    if (!mine.length) continue;
    groups.push({
      source,
      overdue: mine.filter((i) => i.bucket === "overdue").length,
      soon: mine.filter((i) => i.bucket === "soon").length,
      later: mine.filter((i) => i.bucket === "later").length,
      total: mine.length,
      preview: mine.slice(0, PREVIEW_SIZE),
    });
  }
  return groups;
}

/** RFIs have one register per discipline; "all" opens the architectural one. */
export function rfiHref(discipline: string | null): string {
  return discipline === "str" || discipline === "mep" ? `/dashboard/design/${discipline}/rfi` : "/dashboard/design/arc/rfi";
}
