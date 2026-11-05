// Pure comparison of two Activity Master versions (the draft and the version it supersedes), for the Changes tab.

export interface FieldChange { field: string; label: string; from: string; to: string }
export interface ListChange { key: string; label: string; detail?: string }
export interface ListDiff { added: ListChange[]; removed: ListChange[]; changed: ListChange[] }

/** Fields a new version exists to change (frozen once approved), plus the planning inputs. */
export const VERSION_FIELDS: { field: string; label: string }[] = [
  { field: "name", label: "Name" }, { field: "description", label: "Description" }, { field: "default_unit", label: "Unit" },
  { field: "activity_type", label: "Type" }, { field: "duration_basis", label: "Duration basis" },
  { field: "min_duration_pct", label: "Min duration %" }, { field: "max_duration_pct", label: "Max duration %" },
  { field: "crew_size", label: "Crew size" }, { field: "hours_per_day", label: "Hours / day" },
  { field: "csi_section_code", label: "CSI section" }, { field: "trade", label: "Trade" },
];

const show = (v: unknown): string => (v === null || v === undefined || v === "" ? "-" : typeof v === "number" ? String(Number(v)) : String(v));
/** Numbers stored as numeric come back as "50.00" or 50: compare their values. */
const same = (a: unknown, b: unknown): boolean => {
  const na = a === null || a === undefined || a === "" ? null : a;
  const nb = b === null || b === undefined || b === "" ? null : b;
  if (na === null || nb === null) return na === nb;
  const fa = Number(na), fb = Number(nb);
  if (typeof na !== "boolean" && Number.isFinite(fa) && Number.isFinite(fb) && String(na).trim() !== "" && String(nb).trim() !== "") return fa === fb;
  return String(na).trim() === String(nb).trim();
};

export function diffFields(from: Record<string, unknown>, to: Record<string, unknown>, fields = VERSION_FIELDS): FieldChange[] {
  return fields.filter((f) => !same(from[f.field], to[f.field])).map((f) => ({ field: f.field, label: f.label, from: show(from[f.field]), to: show(to[f.field]) }));
}

/**
 * Items of a child list matched by `key`: added, removed, and changed (same key, different `detail`).
 * `label` names the item; `detail` holds the values that matter (e.g. "2 days/unit, 100%").
 */
export function diffList<T>(from: readonly T[], to: readonly T[], key: (t: T) => string, label: (t: T) => string, detail: (t: T) => string = () => ""): ListDiff {
  const a = new Map(from.map((t) => [key(t), t]));
  const b = new Map(to.map((t) => [key(t), t]));
  const added = [...b].filter(([k]) => !a.has(k)).map(([k, t]) => ({ key: k, label: label(t), detail: detail(t) || undefined }));
  const removed = [...a].filter(([k]) => !b.has(k)).map(([k, t]) => ({ key: k, label: label(t), detail: detail(t) || undefined }));
  const changed = [...b].filter(([k, t]) => a.has(k) && detail(a.get(k)!) !== detail(t))
    .map(([k, t]) => ({ key: k, label: label(t), detail: `${detail(a.get(k)!) || "-"} → ${detail(t) || "-"}` }));
  const byLabel = (x: ListChange, y: ListChange) => x.label.localeCompare(y.label);
  return { added: added.sort(byLabel), removed: removed.sort(byLabel), changed: changed.sort(byLabel) };
}

export const isEmptyDiff = (d: ListDiff): boolean => !d.added.length && !d.removed.length && !d.changed.length;
