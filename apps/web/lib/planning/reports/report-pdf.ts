// ReportDoc → PDF (doc 35 M2) with pdf-lib, which the app already ships. A4, portrait or landscape. Every page carries
// the report title and, in the footer, the data date and baseline reference (M3) with "page n of m". Tables break
// across pages and repeat their header. The standard Helvetica font covers Latin text only: other characters are
// replaced (see pdfSafe) and the HTML copy keeps the original text.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { basisFooter, basisLines, fmtDate, RENDERER_VERSION, type Cell, type ReportDoc, type ReportSection, type TableSection, type Tone } from "./report-model";

const A4: [number, number] = [595.28, 841.89];
const M = 36;
/** space between a right-aligned number and the next column */
const GAP = 10;
const INK = rgb(0.12, 0.16, 0.23);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.89, 0.91, 0.94);
const GROUP = rgb(0.95, 0.96, 0.98);
const CRIT = rgb(0.73, 0.11, 0.11);
const TONES: Record<Tone, RGB> = { good: rgb(0.02, 0.59, 0.41), warn: rgb(0.85, 0.47, 0.02), bad: rgb(0.86, 0.15, 0.15) };

const REPLACE: Record<string, string> = { "◆": "»", "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "✓": "v", "×": "x", "·": "·", "—": "—", "–": "–" };
/** Text Helvetica (WinAnsi) can draw: common symbols mapped, anything else becomes "?". */
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of s.replace(/\s+/g, " ")) {
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue; }
    const c = ch.codePointAt(0)!;
    // Latin-1 plus the Windows-1252 punctuation Helvetica carries
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch)) out += ch;
    else out += "?";
  }
  return out;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  readonly w: number;
  readonly h: number;
  constructor(readonly pdf: PDFDocument, readonly font: PDFFont, readonly bold: PDFFont, readonly doc: ReportDoc) {
    [this.w, this.h] = doc.orientation === "landscape" ? [A4[1], A4[0]] : A4;
    this.newPage();
  }
  get inner() { return this.w - 2 * M; }
  newPage() {
    this.page = this.pdf.addPage([this.w, this.h]);
    this.pages.push(this.page);
    this.y = this.h - M;
    if (this.pages.length > 1) {
      this.text(`${this.doc.title} · ${this.doc.subtitle} · ${this.doc.periodLabel}`, M, this.y, 8, this.font, MUTED);
      this.y -= 16;
    }
  }
  ensure(space: number) { if (this.y - space < M + 22) this.newPage(); }
  fit(s: string, size: number, width: number, f = this.font): string {
    let t = pdfSafe(s);
    if (f.widthOfTextAtSize(t, size) <= width) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
    return `${t}…`;
  }
  text(s: string, x: number, y: number, size: number, f = this.font, color = INK) {
    this.page.drawText(pdfSafe(s), { x, y, size, font: f, color });
  }
  wrap(s: string, size: number, width: number): string[] {
    const words = pdfSafe(s).split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (this.font.widthOfTextAtSize(next, size) > width && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  heading(s: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(s, M, this.y, 11, this.bold);
    this.y -= 5;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: this.w - M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 12;
  }
}

function kpis(wr: Writer, s: Extract<ReportSection, { kind: "kpis" }>) {
  if (s.title) wr.heading(s.title);
  const per = wr.doc.orientation === "landscape" ? 7 : 4;
  const w = wr.inner / per;
  for (let i = 0; i < s.items.length; i += per) {
    wr.ensure(34);
    s.items.slice(i, i + per).forEach((it, j) => {
      const x = M + j * w;
      wr.page.drawRectangle({ x, y: wr.y - 26, width: w - 6, height: 30, borderColor: LINE, borderWidth: 0.6 });
      wr.text(wr.fit(it.label.toUpperCase(), 6.5, w - 14), x + 5, wr.y - 4, 6.5, wr.font, MUTED);
      wr.text(wr.fit(it.value, 11, w - 14, wr.bold), x + 5, wr.y - 19, 11, wr.bold, it.tone ? TONES[it.tone] : INK);
    });
    wr.y -= 38;
  }
}

function table(wr: Writer, s: TableSection) {
  wr.heading(s.title);
  if (s.note) for (const line of wr.wrap(s.note, 7.5, wr.inner)) { wr.ensure(12); wr.text(line, M, wr.y, 7.5, wr.font, MUTED); wr.y -= 10; }
  const total = s.columns.reduce((n, c) => n + (c.width ?? 1), 0);
  const widths = s.columns.map((c) => ((c.width ?? 1) / total) * wr.inner);
  const size = 7.5;
  const rowH = 11.5;
  const header = () => {
    let x = M;
    s.columns.forEach((c, i) => {
      const t = wr.fit(c.label.toUpperCase(), 6.5, widths[i] - (c.align === "right" ? GAP + 2 : 4), wr.bold);
      const tx = c.align === "right" ? x + widths[i] - GAP - wr.bold.widthOfTextAtSize(t, 6.5) : x + 2;
      wr.text(t, tx, wr.y, 6.5, wr.bold, MUTED);
      x += widths[i];
    });
    wr.y -= 4;
    wr.page.drawLine({ start: { x: M, y: wr.y }, end: { x: wr.w - M, y: wr.y }, thickness: 0.5, color: LINE });
    wr.y -= rowH - 3;
  };
  wr.ensure(rowH * 3);
  header();
  if (s.rows.length === 0) { wr.text(s.empty ?? "None.", M + 2, wr.y, size, wr.font, MUTED); wr.y -= rowH; return; }
  s.rows.forEach((r, ri) => {
    if (wr.y - rowH < M + 22) { wr.newPage(); header(); }
    const st = s.rowStyle?.[ri] ?? null;
    if (st === "group") wr.page.drawRectangle({ x: M, y: wr.y - 3, width: wr.inner, height: rowH, color: GROUP });
    let x = M;
    r.forEach((v: Cell, i) => {
      const col = s.columns[i];
      if (!col) return;
      const f = st === "group" ? wr.bold : wr.font;
      const t = wr.fit(v == null || v === "" ? (st === "group" ? "" : "—") : String(v), size, widths[i] - (col.align === "right" ? GAP + 2 : 4), f);
      const tx = col.align === "right" ? x + widths[i] - GAP - f.widthOfTextAtSize(t, size) : x + 2;
      wr.text(t, tx, wr.y, size, f, st === "critical" ? CRIT : INK);
      x += widths[i];
    });
    wr.y -= rowH;
  });
  wr.y -= 4;
}

function bars(wr: Writer, s: Extract<ReportSection, { kind: "bars" }>) {
  wr.heading(s.title);
  if (s.bars.length === 0) { wr.text("No data recorded yet.", M, wr.y, 8, wr.font, MUTED); wr.y -= 14; return; }
  const max = s.max ?? Math.max(1, ...s.bars.flatMap((b) => [b.a ?? 0, b.b ?? 0]));
  const labelW = 90;
  const barW = (wr.inner - labelW - 80) / 2;
  wr.text(s.legend[0], M + labelW, wr.y, 7, wr.bold, MUTED);
  wr.text(s.legend[1], M + labelW + barW + 40, wr.y, 7, wr.bold, MUTED);
  wr.y -= 12;
  for (const b of s.bars) {
    wr.ensure(14);
    wr.text(wr.fit(b.label, 7.5, labelW - 6), M, wr.y, 7.5);
    [[b.a, rgb(0.58, 0.64, 0.72), M + labelW], [b.b, rgb(0.15, 0.39, 0.92), M + labelW + barW + 40]].forEach(([v, color, x]) => {
      const val = v as number | null;
      const len = val == null ? 0 : Math.max(0, Math.min(1, val / max)) * barW;
      if (len > 0) wr.page.drawRectangle({ x: x as number, y: wr.y - 1, width: len, height: 7, color: color as RGB });
      wr.text(val == null ? "—" : `${val}${s.unit}`, (x as number) + len + 3, wr.y, 7, wr.font, MUTED);
    });
    wr.y -= 12;
  }
}

export async function renderReportPdf(doc: ReportDoc): Promise<{ bytes: Uint8Array; pages: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`${doc.title} — ${doc.basis.project?.code ?? ""} — ${doc.periodLabel}`));
  pdf.setProducer(`DCOS Planning reports ${RENDERER_VERSION}`);
  pdf.setCreationDate(new Date(doc.generatedAt));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wr = new Writer(pdf, font, bold, doc);

  wr.text(doc.title, M, wr.y - 6, 17, bold);
  wr.y -= 22;
  wr.text(wr.fit(`${doc.subtitle} · ${doc.periodLabel}`, 9.5, wr.inner), M, wr.y, 9.5, font, MUTED);
  wr.y -= 14;
  const lines = basisLines(doc.basis, doc.asAt);
  const colW = wr.inner / 2;
  const boxH = Math.ceil(lines.length / 2) * 11 + 8;
  wr.page.drawRectangle({ x: M, y: wr.y - boxH + 8, width: wr.inner, height: boxH, borderColor: LINE, borderWidth: 0.6 });
  lines.forEach((l, i) => {
    const x = M + 6 + (i % 2) * colW;
    const y = wr.y - Math.floor(i / 2) * 11;
    wr.text(`${l.label}:`, x, y, 7.5, bold, MUTED);
    wr.text(wr.fit(l.value, 7.5, colW - 104), x + 92, y, 7.5, font, l.warn ? TONES.warn : INK);
  });
  wr.y -= boxH + 4;

  for (const s of doc.sections) {
    if (s.kind === "kpis") kpis(wr, s);
    else if (s.kind === "table") table(wr, s);
    else if (s.kind === "bars") bars(wr, s);
    else {
      if (s.title) wr.heading(s.title);
      for (const p of s.paragraphs) for (const line of wr.wrap(p, 8.5, wr.inner)) { wr.ensure(12); wr.text(line, M, wr.y, 8.5); wr.y -= 11; }
    }
  }

  const footer = basisFooter(doc.basis, doc.asAt);
  const made = `Generated ${fmtDate(doc.generatedAt.slice(0, 10))} ${doc.generatedAt.slice(11, 16)} UTC${doc.generatedBy ? ` by ${doc.generatedBy}` : ""}`;
  wr.pages.forEach((p, i) => {
    const pageNo = `Page ${i + 1} of ${wr.pages.length}`;
    const pw = font.widthOfTextAtSize(pageNo, 7);
    p.drawLine({ start: { x: M, y: M + 12 }, end: { x: wr.w - M, y: M + 12 }, thickness: 0.4, color: LINE });
    p.drawText(wr.fit(footer, 6.5, wr.inner - pw - 12), { x: M, y: M + 3, size: 6.5, font, color: MUTED });
    p.drawText(wr.fit(made, 6.5, wr.inner - pw - 12), { x: M, y: M - 6, size: 6.5, font, color: MUTED });
    p.drawText(pageNo, { x: wr.w - M - pw, y: M + 3, size: 7, font, color: MUTED });
  });
  return { bytes: await pdf.save(), pages: wr.pages.length };
}
