// Module 10-01 Daily Reporting — AI assurance, server side: claims reports
// from the queue, sends their activity photos to the model, and records the
// run and its findings. Asynchronous and advisory: it runs after a report is
// stored and never blocks or changes one (design §11.5). Its only writes are
// through dr_ai_claim and dr_ai_record_run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DrPayload } from "../types";
import {
  activityText,
  EVIDENCE_CAPABILITY,
  EVIDENCE_DEFAULT_MODEL,
  EVIDENCE_PROMPT_VERSION,
  EVIDENCE_SYSTEM_PROMPT,
  EVIDENCE_TOOL,
  findingsFromToolInput,
  selectActivities,
  type AssessablePhoto,
  type AssessmentActivity,
} from "./evidence-assessment";

const EVIDENCE_BUCKET = "dr-evidence";
/** Longest side sent to the model. Enough to recognise the work; keeps the cost per photo low. */
const MAX_SIDE = 1024;
const MODEL_TIMEOUT_MS = 90_000;

export const evidenceModel = () => process.env.DR_AI_MODEL?.trim() || EVIDENCE_DEFAULT_MODEL;
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export interface ModelImage {
  activity: number;
  photo_id: string;
  /** JPEG, base64. */
  data: string;
}

export interface ModelAnswer {
  /** The tool input the model produced; checked by findingsFromToolInput. */
  input: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
}

export type ModelCall = (args: { model: string; activities: AssessmentActivity[]; images: ModelImage[] }) => Promise<ModelAnswer>;

/** The real model call. Tests pass their own. */
export const callClaude: ModelCall = async ({ model, activities, images }) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
  const content: (
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
  )[] = [];
  for (const a of activities) {
    const mine = images.filter((i) => i.activity === a.number);
    if (mine.length === 0) continue;
    content.push({ type: "text", text: activityText(a) });
    for (const img of mine) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: "Record one assessment for each activity above." });

  const message = await client.messages.create({
    model,
    max_tokens: 1500,
    system: EVIDENCE_SYSTEM_PROMPT,
    tools: [EVIDENCE_TOOL],
    tool_choice: { type: "tool", name: EVIDENCE_TOOL.name },
    messages: [{ role: "user", content }],
  });
  const use = message.content.find((b) => b.type === "tool_use");
  return {
    input: use && use.type === "tool_use" ? use.input : null,
    input_tokens: message.usage?.input_tokens ?? null,
    output_tokens: message.usage?.output_tokens ?? null,
  };
};

/** Downscaled JPEG of a stored photo, or null when it cannot be read. */
async function loadImage(admin: SupabaseClient, storageKey: string): Promise<string | null> {
  try {
    const { data: blob, error } = await admin.storage.from(EVIDENCE_BUCKET).download(storageKey);
    if (error || !blob) return null;
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(Buffer.from(await blob.arrayBuffer()))
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return jpeg.toString("base64");
  } catch {
    return null;
  }
}

interface Claim {
  report_id: string;
  version_id: string;
  version_no: number;
  project_id: string;
  unit_id: string;
}

async function assessOne(admin: SupabaseClient, claim: Claim, model: string, call: ModelCall) {
  const [{ data: version }, { data: evidence }, { data: nodes }] = await Promise.all([
    admin.from("dr_report_versions").select("payload").eq("id", claim.version_id).maybeSingle(),
    admin.from("dr_evidence").select("id, storage_key, target_section, target_line_id, mime_type, scan_status").eq("version_id", claim.version_id),
    admin.from("wbs_nodes").select("id, parent_id, wbs_name").eq("project_id", claim.project_id),
  ]);
  if (!version) throw new Error("The report version could not be read.");
  const payload = version.payload as DrPayload;

  const taskIds = [...new Set((payload.activities ?? []).map((a) => a.task_id).filter(Boolean))] as string[];
  const { data: taskRows } = taskIds.length
    ? await admin.from("wbs_tasks").select("id, task_name, wbs_node_id").in("id", taskIds)
    : { data: [] as { id: string; task_name: string; wbs_node_id: string | null }[] };
  const nodeById = new Map((nodes ?? []).map((n) => [n.id as string, n as { parent_id: string | null; wbs_name: string }]));
  const locationOf = (nodeId: string | null): string | null => {
    const node = nodeId ? nodeById.get(nodeId) : undefined;
    if (!node) return null;
    const parent = node.parent_id ? nodeById.get(node.parent_id) : undefined;
    return parent ? `${parent.wbs_name} › ${node.wbs_name}` : node.wbs_name;
  };
  const tasks = Object.fromEntries(
    (taskRows ?? []).map((t) => [t.id as string, { name: t.task_name as string, location: locationOf((t.wbs_node_id as string | null) ?? null) }]),
  );

  const activities = selectActivities(payload, (evidence as AssessablePhoto[] | null) ?? [], tasks);
  if (activities.length === 0) throw new Error("No activity of this report has a photo that can be assessed.");

  const images: ModelImage[] = [];
  for (const a of activities) {
    for (const p of a.photos) {
      const data = await loadImage(admin, p.storage_key);
      if (data) images.push({ activity: a.number, photo_id: p.id, data });
    }
  }
  if (images.length === 0) throw new Error("None of the photos could be read.");

  const answer = await call({ model, activities, images });
  const findings = findingsFromToolInput(answer.input, activities, new Set(images.map((i) => i.photo_id)));
  return { findings, images: images.length, answer };
}

export interface AssuranceResult {
  configured: boolean;
  assessed: number;
  failed: number;
}

/**
 * Assesses up to `limit` waiting reports. Never throws. Does nothing, and
 * claims nothing, when no API key is set.
 */
export async function runEvidenceAssessments(
  admin: SupabaseClient,
  opts: { limit?: number; call?: ModelCall } = {},
): Promise<AssuranceResult> {
  const out: AssuranceResult = { configured: !!opts.call || aiConfigured(), assessed: 0, failed: 0 };
  if (!out.configured) return out;
  const call = opts.call ?? callClaude;
  const model = evidenceModel();
  try {
    const { data: claims, error } = await admin.rpc("dr_ai_claim", { p_capability: EVIDENCE_CAPABILITY, p_limit: opts.limit ?? 3 });
    if (error) throw new Error(error.message);
    for (const claim of (claims as Claim[] | null) ?? []) {
      const startedAt = new Date().toISOString();
      const common = {
        p_capability: EVIDENCE_CAPABILITY,
        p_version_id: claim.version_id,
        p_model: model,
        p_prompt_version: EVIDENCE_PROMPT_VERSION,
        p_started_at: startedAt,
      };
      try {
        const { findings, images, answer } = await assessOne(admin, claim, model, call);
        const { error: recordError } = await admin.rpc("dr_ai_record_run", {
          ...common,
          p_status: "SUCCEEDED",
          p_input_tokens: answer.input_tokens,
          p_output_tokens: answer.output_tokens,
          p_images: images,
          p_findings: findings,
        });
        if (recordError) throw new Error(recordError.message);
        out.assessed += 1;
      } catch (e) {
        out.failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        console.error("daily-reporting: AI evidence assessment failed:", message);
        await admin.rpc("dr_ai_record_run", { ...common, p_status: "FAILED", p_error: message });
      }
    }
  } catch (e) {
    console.error("daily-reporting: AI assurance run failed:", e instanceof Error ? e.message : e);
  }
  return out;
}
