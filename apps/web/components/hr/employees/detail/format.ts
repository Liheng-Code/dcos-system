// Display helpers for the Employee Master detail page.

export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "EM";
}
export function labelize(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtMoney(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const STATUS_BADGE: Record<string, string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  suspended: "border-orange-200 bg-orange-50 text-orange-700",
  disabled: "border-red-200 bg-red-50 text-red-700",
  resigned: "border-slate-200 bg-slate-100 text-slate-600",
  terminated: "border-red-200 bg-red-50 text-red-700",
  archived: "border-gray-200 bg-gray-50 text-gray-500",
};
export const PAYROLL_STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  paid: "bg-green-100 text-green-800",
};
