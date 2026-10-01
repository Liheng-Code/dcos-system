import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PDFDocument } from "pdf-lib";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  AI_BOQ_DRAFT_MODEL,
  AI_BOQ_MAX_IMAGE_BYTES,
  AI_BOQ_MAX_PAGES,
  AI_BOQ_MAX_REQUEST_BYTES,
  AI_BOQ_SYSTEM_PROMPT,
  AiBoqDraftSchema,
  AiBoqDraftWireSchema,
  normalizeAiBoqDraft,
  buildUserInstruction,
  type AiBoqDraft,
  type AiBoqDraftResponse,
  type AiBoqDraftResponseLine,
  type AiBoqLibraryMatch,
} from "@/lib/qs/ai-boq-draft-schema";

// AI-assisted BOQ drafting: sends one tender drawing (selected PDF pages, or an
// uploaded image) to Claude and returns proposed BOQ lines with QS-library
// matches. Nothing is written to tender_boq_items here — the QS reviews and
// accepts lines in the UI. Every run is logged to tender_ai_boq_drafts with its
// token usage. The drawing content is sent to Anthropic's API.

// A drawing take-off with adaptive thinking can take a few minutes.
export const maxDuration = 300;

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

interface SearchRow {
  source_type: AiBoqLibraryMatch["source_type"];
  source_id: string;
  title: string;
  subtitle: string | null;
}

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

async function searchLibrary(userClient: UserClient, query: string): Promise<SearchRow[]> {
  const types = ["element_description", "resource"];
  // Hybrid (keyword + meaning) via the Phase 2 edge function, run as the user so tenant RLS applies.
  try {
    const { data, error } = await userClient.functions.invoke("qs-library-search", {
      body: { query, types, limit: 3 },
    });
    if (!error && data && Array.isArray(data.results)) return data.results as SearchRow[];
  } catch {
    // fall back to keyword-only
  }
  const { data } = await userClient.rpc("search_qs_library", { p_query: query, p_types: types, p_limit: 3 });
  return (data ?? []) as SearchRow[];
}

async function attachLibraryMatches(userClient: UserClient, draft: AiBoqDraft): Promise<AiBoqDraftResponseLine[]> {
  const results: SearchRow[][] = [];
  // A few lines at a time: each search embeds the query.
  for (let i = 0; i < draft.lines.length; i += 5) {
    const batch = draft.lines.slice(i, i + 5);
    results.push(...(await Promise.all(batch.map((line) => searchLibrary(userClient, line.description)))));
  }

  const descIds = [...new Set(results.flat().filter((r) => r.source_type === "element_description").map((r) => r.source_id))];
  const descInfo = new Map<string, { material_rate: number | null; labor_rate: number | null; budget_code_id: string | null }>();
  if (descIds.length > 0) {
    const { data: descs } = await userClient
      .from("qs_description_library")
      .select("id, material_rate, labor_rate, qs_element_library(budget_code_id)")
      .in("id", descIds);
    for (const d of (descs ?? []) as unknown as {
      id: string;
      material_rate: number | null;
      labor_rate: number | null;
      qs_element_library: { budget_code_id: string | null } | null;
    }[]) {
      descInfo.set(d.id, {
        material_rate: d.material_rate,
        labor_rate: d.labor_rate,
        budget_code_id: d.qs_element_library?.budget_code_id ?? null,
      });
    }
  }

  return draft.lines.map((line, i) => ({
    ...line,
    matches: (results[i] ?? []).map((r) => ({
      source_type: r.source_type,
      source_id: r.source_id,
      title: r.title,
      subtitle: r.subtitle,
      material_rate: descInfo.get(r.source_id)?.material_rate ?? null,
      labor_rate: descInfo.get(r.source_id)?.labor_rate ?? null,
      budget_code_id: descInfo.get(r.source_id)?.budget_code_id ?? null,
    })),
  }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenderId: string }> }) {
  const { tenderId } = await params;
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonError("Unauthorized", 401);

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("AI drafting is not configured on this server (ANTHROPIC_API_KEY is not set).", 503, "NOT_CONFIGURED");
  }

  const { data: tender } = await userClient.from("tender_register").select("id, title, tender_no").eq("id", tenderId).single();
  if (!tender) return jsonError("Tender not found", 404);

  // ── Resolve the source: a registered drawing revision (PDF) or an uploaded image ──
  let documentBlock: Anthropic.Beta.BetaBase64PDFBlock | Anthropic.Beta.BetaImageBlockParam;
  let sourceName: string;
  let drawingRevisionId: string | null = null;
  let pages: number[] | null = null;
  let instructions: string | null = null;
  let scale: string | null = null;
  let units: string | null = null;
  let discipline: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    instructions = (form.get("instructions") as string | null) || null;
    if (!(file instanceof File)) return jsonError("No image file received", 400);
    if (!["image/png", "image/jpeg"].includes(file.type)) return jsonError("Only PNG or JPEG images can be uploaded", 400);
    if (file.size > AI_BOQ_MAX_IMAGE_BYTES) return jsonError("Image is larger than 5 MB", 400);
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    documentBlock = { type: "image", source: { type: "base64", media_type: file.type as "image/png" | "image/jpeg", data } };
    sourceName = file.name || "uploaded image";
  } else {
    let body: { drawingRevisionId?: string; pages?: number[]; instructions?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    if (!body.drawingRevisionId) return jsonError("drawingRevisionId is required", 400);
    instructions = body.instructions?.trim() || null;

    const { data: rev } = await userClient
      .from("qto_drawing_revisions")
      .select("id, revision, status, file_type, file_path, pdf_path, scale, units, drawing:qto_drawing_register(tender_id, drawing_no, title, discipline)")
      .eq("id", body.drawingRevisionId)
      .single();
    const drawing = rev?.drawing as unknown as { tender_id: string; drawing_no: string; title: string; discipline: string | null } | null;
    if (!rev || !drawing || drawing.tender_id !== tenderId) return jsonError("Drawing revision not found for this tender", 404);
    if (rev.status !== "current") return jsonError(`Revision ${rev.revision} is ${rev.status}; draft from the current revision instead`, 400);
    const path = rev.pdf_path ?? (rev.file_type === "pdf" ? rev.file_path : null);
    if (!path) return jsonError("This revision has no PDF. DWG files can't be read directly; upload a PDF print of the drawing.", 400);

    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage.from("qto-files").download(path);
    if (dlErr || !blob) return jsonError(`Could not read the drawing file: ${dlErr?.message ?? "not found"}`, 502);

    let pdfBytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
    const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = source.getPageCount();
    const requested = (body.pages ?? []).filter((p) => Number.isInteger(p));
    if (requested.length > 0) {
      const invalid = requested.filter((p) => p < 1 || p > pageCount);
      if (invalid.length > 0) return jsonError(`Page(s) ${invalid.join(", ")} don't exist; the drawing has ${pageCount} page(s)`, 400);
      if (requested.length > AI_BOQ_MAX_PAGES) return jsonError(`Choose at most ${AI_BOQ_MAX_PAGES} pages per draft`, 400);
      // Send only the chosen pages, never the whole set.
      const subset = await PDFDocument.create();
      const copied = await subset.copyPages(source, requested.map((p) => p - 1));
      copied.forEach((p) => subset.addPage(p));
      pdfBytes = await subset.save();
      pages = requested;
    } else if (pageCount > AI_BOQ_MAX_PAGES) {
      return jsonError(`The drawing has ${pageCount} pages; choose at most ${AI_BOQ_MAX_PAGES}`, 400);
    }
    if (pdfBytes.byteLength > AI_BOQ_MAX_REQUEST_BYTES) {
      return jsonError("The selected pages are too large to send (over 30 MB). Choose fewer pages.", 400);
    }

    documentBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdfBytes).toString("base64") } };
    drawingRevisionId = rev.id;
    sourceName = `${drawing.drawing_no} rev ${rev.revision} — ${drawing.title}`;
    scale = rev.scale;
    units = rev.units;
    discipline = drawing.discipline;
  }

  const userText = buildUserInstruction({
    tenderTitle: `${tender.tender_no} ${tender.title}`,
    drawingLabel: sourceName,
    scale,
    units,
    discipline,
    pages,
    instructions,
  });

  const logRun = async (row: {
    status: "succeeded" | "failed" | "refused";
    error?: string | null;
    result?: unknown;
    usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null } | null;
  }) => {
    const { data } = await userClient
      .from("tender_ai_boq_drafts")
      .insert({
        tender_id: tenderId,
        drawing_revision_id: drawingRevisionId,
        source_name: sourceName,
        pages,
        instructions,
        model: AI_BOQ_DRAFT_MODEL,
        input_tokens: row.usage?.input_tokens ?? null,
        output_tokens: row.usage?.output_tokens ?? null,
        cache_read_tokens: row.usage?.cache_read_input_tokens ?? null,
        status: row.status,
        error: row.error ?? null,
        result: (row.result ?? null) as never,
        created_by: user.id,
      })
      .select("id")
      .single();
    return data?.id as string | undefined;
  };

  const anthropic = new Anthropic();
  let message;
  try {
    const stream = anthropic.beta.messages.stream({
      model: AI_BOQ_DRAFT_MODEL,
      max_tokens: 32000,
      // On a policy decline the API re-runs the request on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(AiBoqDraftWireSchema) },
      system: [{ type: "text", text: AI_BOQ_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [documentBlock, { type: "text", text: userText }] }],
    });
    message = await stream.finalMessage();
  } catch (e) {
    let msg = "AI drafting failed";
    let status = 502;
    if (e instanceof Anthropic.RateLimitError) {
      msg = "The AI service is busy (rate limited). Try again in a minute.";
      status = 429;
    } else if (e instanceof Anthropic.AuthenticationError) {
      msg = "The AI service rejected the server's API key.";
      status = 503;
    } else if (e instanceof Anthropic.BadRequestError) {
      msg = `The AI service could not process this drawing: ${e.message}`;
      status = 400;
    } else if (e instanceof Anthropic.APIError) {
      msg = `AI service error (${e.status ?? "network"}): ${e.message}`;
    } else if (e instanceof Error) {
      msg = e.message;
    }
    await logRun({ status: "failed", error: msg });
    return jsonError(msg, status);
  }

  const usage = message.usage;
  if (message.stop_reason === "refusal") {
    await logRun({ status: "refused", error: "The model declined to process this drawing", usage });
    return jsonError("The AI declined to process this drawing.", 422, "REFUSED");
  }
  if (message.stop_reason === "max_tokens") {
    await logRun({ status: "failed", error: "Output was cut off (max_tokens)", usage });
    return jsonError("The drawing produced too many lines to finish in one run. Select fewer pages or narrow the instructions.", 422);
  }

  const parsed = message.parsed_output
    ? AiBoqDraftSchema.safeParse(normalizeAiBoqDraft(message.parsed_output))
    : AiBoqDraftSchema.safeParse(null);
  if (!parsed.success) {
    await logRun({ status: "failed", error: `Invalid AI output: ${parsed.error.message.slice(0, 500)}`, usage });
    return jsonError("The AI returned an answer that didn't match the expected format. Try again.", 502);
  }

  const lines = await attachLibraryMatches(userClient, parsed.data);
  const result = { drawingSummary: parsed.data.drawing_summary, warnings: parsed.data.warnings, lines };
  const draftId = await logRun({ status: "succeeded", result, usage });
  if (!draftId) return jsonError("The draft was produced but could not be saved to the log", 500);

  const response: AiBoqDraftResponse = {
    draftId,
    ...result,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    },
  };
  return NextResponse.json(response);
}
