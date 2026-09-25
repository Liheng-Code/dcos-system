import { createClient } from "@/lib/supabase/client";
import { createBoqItem, getTenderMargins } from "@/lib/tender-cost-service";
import type { AiBoqDraftResponse } from "@/lib/ai-boq-draft-schema";

// Client side of AI-assisted BOQ drafting. The route
// (app/api/tenders/[tenderId]/ai-boq-draft) produces a draft; nothing is
// written to tender_boq_items until acceptAiBoqLines is called with the lines a
// QS has reviewed.

export interface TenderDrawingRevisionOption {
  revisionId: string;
  drawingNo: string;
  title: string;
  revision: string;
  discipline: string | null;
  hasPdf: boolean;
}

export async function listTenderDrawingRevisions(tenderId: string): Promise<TenderDrawingRevisionOption[]> {
  const { data, error } = await createClient()
    .from("qto_drawing_revisions")
    .select("id, revision, file_type, pdf_path, file_path, drawing:qto_drawing_register!inner(tender_id, drawing_no, title, discipline)")
    .eq("drawing.tender_id", tenderId)
    .eq("status", "current");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as {
    id: string;
    revision: string;
    file_type: string | null;
    pdf_path: string | null;
    file_path: string | null;
    drawing: { drawing_no: string; title: string; discipline: string | null };
  }[])
    .map((r) => ({
      revisionId: r.id,
      drawingNo: r.drawing.drawing_no,
      title: r.drawing.title,
      revision: r.revision,
      discipline: r.drawing.discipline,
      hasPdf: !!(r.pdf_path || (r.file_type === "pdf" && r.file_path)),
    }))
    .sort((a, b) => a.drawingNo.localeCompare(b.drawingNo, undefined, { numeric: true }));
}

export class AiDraftError extends Error {
  code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AiDraftError";
    this.code = code;
  }
}

async function readResponse(res: Response): Promise<AiBoqDraftResponse> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (e.g. a platform timeout page)
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; code?: string };
    throw new AiDraftError(b.error ?? `AI drafting failed (HTTP ${res.status})`, b.code);
  }
  return body as AiBoqDraftResponse;
}

export async function runAiBoqDraftFromDrawing(
  tenderId: string,
  input: { drawingRevisionId: string; pages: number[]; instructions: string },
): Promise<AiBoqDraftResponse> {
  const res = await fetch(`/api/tenders/${tenderId}/ai-boq-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse(res);
}

export async function runAiBoqDraftFromImage(tenderId: string, file: File, instructions: string): Promise<AiBoqDraftResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("instructions", instructions);
  const res = await fetch(`/api/tenders/${tenderId}/ai-boq-draft`, { method: "POST", body: form });
  return readResponse(res);
}

// Parse "1, 3-5" into [1, 3, 4, 5]. Returns null when the text is invalid.
export function parsePageList(text: string): number[] | null {
  const pages = new Set<number>();
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (a < 1 || b < a) return null;
      for (let p = a; p <= b; p++) pages.add(p);
    } else if (/^\d+$/.test(part) && Number(part) >= 1) {
      pages.add(Number(part));
    } else {
      return null;
    }
  }
  return [...pages].sort((x, y) => x - y);
}

export interface AcceptedAiLine {
  description: string;
  unit: string;
  quantity: number;
  section: string;
  discipline: string | null;
  budgetCodeId: string;
  budgetCode: string;
  laborNetCost: number;
  materialNetCost: number;
  quantityBasis: string;
  assumptions: string;
}

// Creates one tender BOQ item per accepted line, the same way the Element
// Library picker does: library rates (if a match was chosen) are net costs and
// the tender's default margins apply. Lines without a match are created
// unpriced (rate 0), to be priced later.
export async function acceptAiBoqLines(tenderId: string, draftId: string, lines: AcceptedAiLine[]): Promise<number> {
  if (lines.length === 0) return 0;
  const margins = await getTenderMargins(tenderId);
  const stamp = Date.now().toString().slice(-6);
  let created = 0;
  for (const line of lines) {
    const provenance = [`AI draft ${draftId.slice(0, 8)}`, line.quantityBasis, line.assumptions].filter((s) => s && s.trim()).join(" · ");
    await createBoqItem({
      tender_id: tenderId,
      section: line.section.trim() || "AI Draft",
      item_code: `${line.budgetCode || "MISC"}.${stamp}-AI${created + 1}`,
      description: line.description.trim(),
      unit: line.unit,
      quantity: line.quantity,
      budget_code_id: line.budgetCodeId,
      discipline: line.discipline,
      labor_net_cost: line.laborNetCost,
      labor_margin_pct: margins.defaultLaborMarginPct,
      material_net_cost: line.materialNetCost,
      material_margin_pct: margins.defaultMaterialMarginPct,
      notes: provenance.slice(0, 1000),
    });
    created++;
  }
  // Keep the audit row honest about what was used. Non-fatal if it fails.
  const supabase = createClient();
  const { data: row } = await supabase.from("tender_ai_boq_drafts").select("accepted_count").eq("id", draftId).single();
  await supabase
    .from("tender_ai_boq_drafts")
    .update({ accepted_count: (row?.accepted_count ?? 0) + created })
    .eq("id", draftId);
  return created;
}
