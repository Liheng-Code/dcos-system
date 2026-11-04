// Planning reports (doc 35 M1-M4). One content model, built from the programme by report-builders.ts and rendered to
// HTML (report-html.ts) and PDF (report-pdf.ts). The model is what plan_report_snapshots keeps, so a historical
// report is reopened from exactly what was generated. Pure, no I/O.

export type ReportType = "master_programme" | "weekly" | "monthly" | "recovery";

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  master_programme: "Master programme",
  weekly: "Weekly progress report",
  monthly: "Monthly progress report",
  recovery: "Recovery report",
};

/** Bump when a renderer changes what the same content looks like. Stored with every snapshot. */
export const RENDERER_VERSION = "1.0.0";

/** plan_report_basis(project): what every report states it is based on (M3). */
export interface ReportBasis {
  project: { id: string; code: string; name: string; data_date: string | null; start: string | null; contract_finish: string | null } | null;
  baseline: { id: string; number: number; name: string; type: string; date: string; approved_at: string | null; client_accepted: boolean } | null;
  revision: { id: string; stream: string; number: number; status: string; created_at: string } | null;
  calculation: { id: string; at: string; engine_version: string; input_hash: string; finish: string | null; data_date: string | null; current: boolean } | null;
  forecast: { id: string; at: string; label: string; finish: string | null } | null;
  last_change: string | null;
}

export type Cell = string | number | null;
export type Tone = "good" | "warn" | "bad";

export interface KpiSection { kind: "kpis"; title?: string; items: { label: string; value: string; tone?: Tone }[] }
export interface TextSection { kind: "text"; title?: string; paragraphs: string[] }
export interface TableColumn { key: string; label: string; align?: "left" | "right"; /** relative width */ width?: number }
export interface TableSection {
  kind: "table";
  title: string;
  note?: string;
  columns: TableColumn[];
  rows: Cell[][];
  /** per row: a WBS heading row, or a row to highlight */
  rowStyle?: ("group" | "critical" | null)[];
  empty?: string;
}
export interface BarsSection {
  kind: "bars";
  title: string;
  unit: string;
  /** a pair of values per row, e.g. planned vs actual */
  legend: [string, string];
  bars: { label: string; a: number | null; b: number | null }[];
  max?: number;
}
export type ReportSection = KpiSection | TextSection | TableSection | BarsSection;

export interface ReportDoc {
  type: ReportType;
  title: string;
  /** the project line under the title */
  subtitle: string;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** the date the report is "as at": the data date, or the generation day when none is set */
  asAt: string;
  orientation: "portrait" | "landscape";
  basis: ReportBasis;
  generatedAt: string;
  generatedBy: string | null;
  sections: ReportSection[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string | null | undefined): string =>
  iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—";

const REVISION_STATUS: Record<string, string> = {
  approved_internal: "approved internally", submitted_client: "submitted to the client", approved_client: "approved by the client",
};

/** The lines every report prints under its title and in its footer (PRD: "reports must identify their data date and baseline reference"). */
export function basisLines(basis: ReportBasis, asAt: string): { label: string; value: string; warn?: boolean }[] {
  const b = basis.baseline;
  const r = basis.revision;
  const c = basis.calculation;
  return [
    { label: "Data date", value: basis.project?.data_date ? fmtDate(basis.project.data_date) : `none set (as at ${fmtDate(asAt)})`, warn: !basis.project?.data_date },
    {
      label: "Baseline",
      value: b
        ? `BL${b.number} ${b.name} (${b.type}), set ${fmtDate(b.date)}${b.approved_at ? `, approved ${fmtDate(b.approved_at.slice(0, 10))}` : ", not approved"}${b.client_accepted ? ", client accepted" : ""}`
        : "no approved baseline",
      warn: !b || !b.approved_at,
    },
    { label: "Programme revision", value: r ? `${r.stream} R${r.number}, ${REVISION_STATUS[r.status] ?? r.status}` : "no approved revision" },
    {
      label: "Calculation",
      value: c
        ? `${fmtDate(c.at.slice(0, 10))}, engine ${c.engine_version}${c.current ? "" : " (activities changed after it)"}`
        : "never calculated",
      warn: !c || !c.current,
    },
  ];
}

/** One-line form for page footers. */
export function basisFooter(basis: ReportBasis, asAt: string): string {
  return basisLines(basis, asAt).map((l) => `${l.label}: ${l.value}`).join("  ·  ");
}

/** Stable JSON (sorted keys) of a value, for the content hash. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** Every table of a report as rows for a spreadsheet (one sheet per table). */
export function reportTables(doc: ReportDoc): { name: string; header: string[]; rows: Cell[][] }[] {
  const used = new Set<string>();
  return doc.sections.filter((s): s is TableSection => s.kind === "table").map((t) => {
    let name = t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Table";
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 25)} ${i}`;
    used.add(name);
    return { name, header: t.columns.map((c) => c.label), rows: t.rows };
  });
}
