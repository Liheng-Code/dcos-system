import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { dispatchScheduleAlert, type ScheduleAlertType } from "@/lib/notifications/dispatch";

const PLANNER_ROLE_CODES = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "PE"];

/**
 * R2.2 — progress-review notifications. Client calls this after a successful
 * submit_progress() (action "requested": notify every intended reviewer) and
 * after decide_progress_review() (action "decided": notify the proposer ).
 * Recipient resolution is centralised here so the client stays thin:
 *
 *   action "requested" -> project members whose role can approve
 *     ('planning','progress_review'). Falls back to the planner role codes
 *     when role_permissions has not been seeded yet.
 *   action "decided"   -> the proposed_by of each decided review id.
 *
 * Dedupe safety: dispatchScheduleAlert's sourceKey dedupes retries and
 * repeated dispatches for the same review state (unique partial index on
 * task_alerts.source_key), so re-delivery on retry is a silent no-op.
 */

interface RecipientMember { user_id: string; }
interface ProposerOf { proposed_by: string | null; }

async function reviewerUserIds(supabase: Awaited<ReturnType<typeof createAdminClient>>, projectId: string): Promise<string[]> {
  const { data: allowed } = await supabase
    .from("role_permissions")
    .select("role_code")
    .eq("module", "planning")
    .eq("action", "progress_review")
    .eq("approve", true);
  let codes = (allowed ?? []).map((r) => r.role_code as string);
  if (codes.length === 0) codes = PLANNER_ROLE_CODES;
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("role_code", codes);
  return (members ?? []).map((m) => (m as RecipientMember).user_id);
}

async function proposerUserIds(supabase: Awaited<ReturnType<typeof createAdminClient>>, reviewIds: string[]): Promise<string[]> {
  if (reviewIds.length === 0) return [];
  const { data } = await supabase
    .from("wbs_task_progress_reviews")
    .select("proposed_by")
    .in("id", reviewIds);
  return Array.from(new Set((data ?? []).map((r) => (r as ProposerOf).proposed_by).filter((x): x is string => !!x)));
}

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { project_id?: string; review_ids?: string[]; action?: "requested" | "decided" }
    | null;
  if (!body?.project_id || !body?.action) {
    return NextResponse.json({ error: "project_id and action are required" }, { status: 400 });
  }
  if (body.action !== "requested" && body.action !== "decided") {
    return NextResponse.json({ error: "action must be requested or decided" }, { status: 400 });
  }
  const reviewIds = body.review_ids ?? [];
  const projectId = body.project_id;

  const supabase = createAdminClient();

  const recipientIds =
    body.action === "requested"
      ? await reviewerUserIds(supabase, projectId)
      : await proposerUserIds(supabase, reviewIds);

  let dispatched = 0;
  for (const recipientId of new Set(recipientIds)) {
    if (recipientId === user.id) continue;
    const sourceKey =
      body.action === "requested"
        ? `progress-review:${projectId}:${reviewIds.sort().join(",")}:request`
        : `progress-review:${reviewIds.sort().join(",")}:decided`;
    await dispatchScheduleAlert(supabase, {
      projectId,
      recipientIds: [recipientId],
      alertType:
        (body.action === "requested"
          ? "progress_review_requested"
          : "progress_review_decided") satisfies ScheduleAlertType,
      title: body.action === "requested" ? "Progress change awaiting review" : "Progress review decided",
      body:
        body.action === "requested"
          ? "A planner submitted a progress change on the programme — confirm or reject it in the Progress Reviews queue."
          : "A decision was made on your proposed progress change. See the Progress Reviews queue for the outcome.",
      sourceKey,
      actorId: user.id,
    });
    dispatched++;
  }

  return NextResponse.json({ dispatched });
}
