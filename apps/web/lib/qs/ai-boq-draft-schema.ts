import { z } from "zod";
import { BOQ_UNITS } from "@/lib/qs/boq-units";

// Shared contract for AI-assisted BOQ drafting (route + client + tests).
// Claude reads a tender drawing and proposes BOQ lines; a QS reviews every
// line before anything is written to tender_boq_items.

export const AI_BOQ_DRAFT_MODEL = "claude-opus-5";
export const AI_BOQ_MAX_PAGES = 20;
export const AI_BOQ_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const AI_BOQ_MAX_REQUEST_BYTES = 30 * 1024 * 1024; // API limit is 32 MB per request; keep headroom

export const AiBoqDraftLineSchema = z.object({
  description: z.string().describe("BOQ item description in QS style, e.g. 'Formwork, plywood 18mm to slab soffit'"),
  unit: z.enum(BOQ_UNITS).describe("Unit of measurement; must be one of the allowed units"),
  quantity: z.number().nullable().describe("Measured quantity, or null when it cannot be determined from the drawing"),
  quantity_basis: z.string().describe("How the quantity was derived: dimensions read, counts, formula"),
  location_on_drawing: z.string().describe("Where on the drawing this was measured (grid, room, detail/section reference)"),
  suggested_section: z.string().describe("Trade/work section, e.g. 'Concrete', 'Masonry', 'Finishes', 'MEP - Plumbing'"),
  discipline: z.string().describe("Civil and Structure, Architecture, MEP, or External Works"),
  confidence: z.enum(["high", "medium", "low"]).describe("high = dimensioned on the drawing; medium = scaled or partly inferred; low = assumed"),
  assumptions: z.string().describe("Assumptions made (thicknesses, heights, waste excluded, etc.); empty string if none"),
});

export const AiBoqDraftSchema = z.object({
  drawing_summary: z.string().describe("One or two sentences: what the drawing shows and its scale/units"),
  warnings: z.array(z.string()).describe("Problems a QS must know: unreadable areas, missing dimensions, scale doubts"),
  lines: z.array(AiBoqDraftLineSchema),
});

// What Claude is asked to return. Structured outputs can't enforce the unit
// enum, so the wire schema takes any string; normalizeAiBoqDraft maps it onto
// BOQ_UNITS before the strict AiBoqDraftSchema check. One odd unit then costs
// one line's confidence, not the whole (paid) run.
export const AiBoqDraftWireSchema = AiBoqDraftSchema.extend({
  lines: z.array(AiBoqDraftLineSchema.extend({
    unit: z.string().describe(`Unit of measurement; exactly one of: ${BOQ_UNITS.join(", ")}`),
  })),
});

const UNIT_ALIASES: Record<string, string> = {
  "m²": "m2", "sqm": "m2", "sq.m": "m2", "m^2": "m2",
  "m³": "m3", "cum": "m3", "cu.m": "m3", "m^3": "m3",
  "lm": "m", "rm": "m", "lin.m": "m",
  "nr": "no", "nos": "no", "no.": "no", "ea": "no", "each": "no", "unit": "no", "units": "no",
  "pc": "pcs", "piece": "pcs", "pieces": "pcs",
  "t": "tonne", "ton": "tonne", "tons": "tonne", "tonnes": "tonne",
  "lump sum": "ls", "l.s.": "ls", "item": "ls", "sum": "ls",
  "sets": "set", "days": "day", "hrs": "hr", "hour": "hr", "hours": "hr", "month": "months",
};

export function normalizeAiBoqDraft(raw: z.infer<typeof AiBoqDraftWireSchema>): unknown {
  const allowed = new Set<string>(BOQ_UNITS);
  return {
    ...raw,
    lines: raw.lines.map((line) => {
      const key = line.unit.trim().toLowerCase();
      const unit = allowed.has(key) ? key : UNIT_ALIASES[key];
      if (unit) return { ...line, unit };
      return {
        ...line,
        unit: "ls",
        confidence: "low",
        assumptions: [`AI unit "${line.unit}" is not a BOQ unit; check the unit.`, line.assumptions].filter(Boolean).join(" "),
      };
    }),
  };
}

export type AiBoqDraft = z.infer<typeof AiBoqDraftSchema>;
export type AiBoqDraftLine = z.infer<typeof AiBoqDraftLineSchema>;

export interface AiBoqLibraryMatch {
  source_type: "resource" | "element" | "element_description";
  source_id: string;
  title: string;
  subtitle: string | null;
  // Element-description matches carry the library's rates and the element's budget code,
  // so accepting the match can prefill both.
  material_rate: number | null;
  labor_rate: number | null;
  budget_code_id: string | null;
}

export interface AiBoqDraftResponseLine extends AiBoqDraftLine {
  matches: AiBoqLibraryMatch[];
}

export interface AiBoqDraftResponse {
  draftId: string;
  drawingSummary: string;
  warnings: string[];
  lines: AiBoqDraftResponseLine[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

// Stable system prompt (cached). Volatile context — tender, drawing, scale, the
// QS's own instructions — goes in the user turn so this prefix never changes.
export const AI_BOQ_SYSTEM_PROMPT = `You are an experienced quantity surveyor preparing a first-draft Bill of Quantities from a construction drawing for a contractor in Cambodia. A human QS will review every line you propose before anything is used, so accuracy and honesty about uncertainty matter more than completeness.

Measurement rules:
- Measure only what the drawing shows. Prefer written dimensions. Scale from the drawing only when a scale is stated or a dimension gives a reliable reference, and say so in quantity_basis.
- Never invent dimensions you cannot see. If a quantity cannot be determined, return quantity null and explain what is missing in assumptions.
- Set confidence to high only for quantities computed from dimensions written on the drawing, medium for scaled or partly inferred quantities, and low for anything that depends on assumptions.
- Give net quantities as drawn; do not add waste or allowances.
- Use SI units and only the units allowed by the schema. Areas in m2, volumes in m3, lengths in m, counts in no or pcs, reinforcement in kg or tonne, lump sums in ls.
- Describe each item the way a Cambodian QS would write a BOQ line: material, specification or thickness as shown, and location or element (for example "Brick wall 100mm thk. to internal partitions, plastered both sides").
- Split items by element and specification rather than lumping unlike work together. Do not duplicate the same quantity under two lines.
- Do not propose rates or prices. Pricing is done later from the company's library.
- Record anything unclear, illegible or contradictory on the drawing in warnings.`;

export function buildUserInstruction(ctx: {
  tenderTitle: string;
  drawingLabel: string;
  scale: string | null;
  units: string | null;
  discipline: string | null;
  pages: number[] | null;
  instructions: string | null;
}): string {
  const lines = [
    `Tender: ${ctx.tenderTitle}`,
    `Drawing: ${ctx.drawingLabel}`,
    ctx.discipline ? `Discipline: ${ctx.discipline}` : null,
    ctx.scale ? `Stated scale: ${ctx.scale}` : "Stated scale: not recorded in the drawing register — read it from the title block if shown.",
    ctx.units ? `Drawing units: ${ctx.units}` : null,
    ctx.pages && ctx.pages.length > 0 ? `Pages supplied (from the original set): ${ctx.pages.join(", ")}` : null,
    "",
    ctx.instructions?.trim()
      ? `The QS asks you to focus on: ${ctx.instructions.trim()}`
      : "Take off all measurable work shown on the drawing.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
