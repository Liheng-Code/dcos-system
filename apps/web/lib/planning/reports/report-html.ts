// ReportDoc → a standalone, printable HTML page (doc 35 M1/M3). Pure. The same content renders to PDF in report-pdf.ts.

import { basisLines, fmtDate, RENDERER_VERSION, type Cell, type ReportDoc, type ReportSection, type Tone } from "./report-model";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const cell = (v: Cell) => (v == null || v === "" ? "—" : esc(String(v)));
const TONE: Record<Tone, string> = { good: "#059669", warn: "#d97706", bad: "#dc2626" };

function section(s: ReportSection): string {
  const title = "title" in s && s.title ? `<h2>${esc(s.title)}</h2>` : "";
  if (s.kind === "kpis") {
    return `${title}<div class="tiles">${s.items.map((i) => `<div class="tile"><div class="label">${esc(i.label)}</div><div class="value"${i.tone ? ` style="color:${TONE[i.tone]}"` : ""}>${esc(i.value)}</div></div>`).join("")}</div>`;
  }
  if (s.kind === "text") return `${title}${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}`;
  if (s.kind === "bars") {
    const max = s.max ?? Math.max(1, ...s.bars.flatMap((b) => [b.a ?? 0, b.b ?? 0]));
    const bar = (v: number | null, color: string) => `<div class="bar" style="width:${v == null ? 0 : Math.max(0, Math.min(100, (v / max) * 100))}%;background:${color}"></div><span class="bv">${v == null ? "—" : `${v}${esc(s.unit)}`}</span>`;
    const rows = s.bars.length
      ? s.bars.map((b) => `<tr><td class="bl">${esc(b.label)}</td><td class="bc">${bar(b.a, "#94a3b8")}</td><td class="bc">${bar(b.b, "#2563eb")}</td></tr>`).join("")
      : `<tr><td colspan="3" class="empty">No data recorded yet.</td></tr>`;
    return `${title}<table class="bars"><thead><tr><th></th><th>${esc(s.legend[0])}</th><th>${esc(s.legend[1])}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const head = s.columns.map((c) => `<th${c.align === "right" ? ' class="r"' : ""}>${esc(c.label)}</th>`).join("");
  const body = s.rows.length
    ? s.rows.map((r, i) => {
        const st = s.rowStyle?.[i];
        return `<tr${st ? ` class="${st}"` : ""}>${r.map((v, j) => `<td${s.columns[j]?.align === "right" ? ' class="r"' : ""}>${cell(v)}</td>`).join("")}</tr>`;
      }).join("")
    : `<tr><td colspan="${s.columns.length}" class="empty">${esc(s.empty ?? "None.")}</td></tr>`;
  return `${title}${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderReportHtml(doc: ReportDoc): string {
  const basis = basisLines(doc.basis, doc.asAt)
    .map((l) => `<div><span class="k">${esc(l.label)}</span> <span${l.warn ? ' class="warn"' : ""}>${esc(l.value)}</span></div>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} — ${esc(doc.basis.project?.code ?? "")} — ${esc(doc.periodLabel)}</title>
<style>
  @page { size: A4 ${doc.orientation}; margin: 12mm; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1e293b; margin: 0 auto; padding: 24px; max-width: ${doc.orientation === "landscape" ? 1180 : 860}px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 22px 0 6px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  .sub { color: #64748b; margin: 0 0 10px; }
  .basis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 18px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 11px; }
  .basis .k { color: #64748b; } .warn { color: #b45309; }
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; } .tile { flex: 1 1 120px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 9px; }
  .tile .label { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; } .tile .value { font-size: 16px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; } th, td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; text-align: left; vertical-align: top; }
  th { color: #64748b; font-weight: 600; font-size: 9px; text-transform: uppercase; } .r { text-align: right; } thead { display: table-header-group; }
  tr.group td { background: #f1f5f9; font-weight: 600; } tr.critical td { color: #b91c1c; } .empty { color: #94a3b8; text-align: center; }
  .note { color: #64748b; font-size: 10px; margin: 0 0 4px; }
  table.bars td.bl { width: 110px; white-space: nowrap; } table.bars td.bc { width: 45%; } .bar { display: inline-block; height: 9px; border-radius: 2px; vertical-align: middle; } .bv { margin-left: 4px; font-size: 10px; }
  .footer { margin-top: 24px; font-size: 9.5px; color: #94a3b8; }
</style>
</head>
<body>
  <h1>${esc(doc.title)}</h1>
  <p class="sub">${esc(doc.subtitle)} · ${esc(doc.periodLabel)}</p>
  <div class="basis">${basis}</div>
  ${doc.sections.map(section).join("\n")}
  <p class="footer">Generated ${esc(fmtDate(doc.generatedAt.slice(0, 10)))} ${esc(doc.generatedAt.slice(11, 16))} UTC${doc.generatedBy ? ` by ${esc(doc.generatedBy)}` : ""} · DCOS Planning &amp; Scheduling · report format ${RENDERER_VERSION}. This report is kept as generated and is not changed afterwards.</p>
</body>
</html>`;
}
