// Bid Approval gate, submission record and tender result for the pre-contract lifecycle.
// Pattern follows the VO approval chain (lib/qs/qs-service.ts submitVoApprovalDecision): one row per step
// in tender_bid_approvals, per internal-review round. Stage moves go through setTenderStage.
// Schema: supabase/migrations/20260928000002_tender_gates.sql.

import { createClient } from "@/lib/supabase/client";
import { setTenderStage, type TenderStage } from "@/lib/qs/tender-lifecycle";

export type ApprovalStep = "technical" | "commercial" | "price" | "management";
export type ApprovalDecision = "approved" | "returned" | "rejected";

export const REVIEW_STEPS: ApprovalStep[] = ["technical", "commercial", "price"];

export const APPROVAL_STEPS: { step: ApprovalStep; label: string; roles: string[] }[] = [
  { step: "technical", label: "Technical Review", roles: ["L0", "L1", "L2", "L3", "L4", "L5"] },
  { step: "commercial", label: "Commercial Review", roles: ["L0", "L1", "L2", "QS"] },
  { step: "price", label: "Price Review", roles: ["L0", "L1", "L2", "QS"] },
  { step: "management", label: "Management Approval", roles: ["L0", "L1", "L2"] },
];

export interface BidApproval {
  id: string;
  tender_id: string;
  round: number;
  bid_summary_id: string | null;
  step: ApprovalStep;
  decision: ApprovalDecision;
  comments: string | null;
  user_id: string | null;
  decided_at: string;
}

export function canDecideStep(step: ApprovalStep, roleCodes: string[]): boolean {
  const roles = APPROVAL_STEPS.find((s) => s.step === step)?.roles ?? [];
  return roleCodes.some((r) => roles.includes(r));
}

async function currentUserId(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser();
  return user?.id ?? null;
}

/** Tendering → Internal Review. Opens a new approval round against the latest bid revision. */
export async function startInternalReview(
  projectId: string,
  approvalRound: number,
  bidSummaryId: string,
): Promise<{ error: string | null }> {
  return setTenderStage(projectId, "tendering", "internal_review", {
    approval_round: approvalRound + 1,
    review_bid_summary_id: bidSummaryId,
    bid_approved_at: null,
    approved_bid_summary_id: null,
  });
}

/**
 * Records one step's decision and applies its effect:
 *  - review step returned            → back to Tendering (pricing unlocks)
 *  - all three reviews approved      → Approval (management)
 *  - management approved             → bid revision final, bid price locked in, ready to submit
 *  - management returned             → back to Tendering
 *  - management rejected             → tender Closed (master: REJECT → CLOSE)
 */
export async function decideApprovalStep(args: {
  projectId: string;
  tenderId: string;
  stage: TenderStage;
  round: number;
  bidSummaryId: string | null;
  step: ApprovalStep;
  decision: ApprovalDecision;
  comments: string;
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { projectId, tenderId, stage, round, bidSummaryId, step, decision, comments } = args;

  if (step === "management" ? stage !== "approval" : stage !== "internal_review") {
    return { error: "This step cannot be decided at the tender's current stage." };
  }
  if (decision === "rejected" && step !== "management") {
    return { error: "Review steps can approve or return the bid; only management can reject it." };
  }
  if ((decision !== "approved") && !comments.trim()) {
    return { error: "Give a reason when returning or rejecting the bid." };
  }

  const { error: upErr } = await supabase.from("tender_bid_approvals").upsert(
    {
      tender_id: tenderId,
      round,
      bid_summary_id: bidSummaryId,
      step,
      decision,
      comments: comments.trim() || null,
      user_id: await currentUserId(),
      decided_at: new Date().toISOString(),
    },
    { onConflict: "tender_id,round,step" },
  );
  if (upErr) return { error: upErr.message };

  if (decision === "returned") return setTenderStage(projectId, stage, "tendering");
  if (decision === "rejected") {
    return setTenderStage(projectId, "approval", "closed", { closed_reason: `Bid rejected at management approval: ${comments.trim()}` });
  }

  if (step !== "management") {
    const { data: rows } = await supabase
      .from("tender_bid_approvals")
      .select("step, decision")
      .eq("tender_id", tenderId)
      .eq("round", round);
    const approved = new Set((rows ?? []).filter((r) => r.decision === "approved").map((r) => r.step));
    if (REVIEW_STEPS.every((s) => approved.has(s))) return setTenderStage(projectId, "internal_review", "approval");
    return { error: null };
  }

  // Management approval: freeze the reviewed revision as the approved bid.
  if (!bidSummaryId) return { error: "No bid revision is attached to this approval round." };
  const { data: summary, error: sumErr } = await supabase
    .from("tender_bid_summaries")
    .update({ status: "final" })
    .eq("id", bidSummaryId)
    .select("total_bid_price")
    .single();
  if (sumErr) return { error: sumErr.message };
  const { error: pcErr } = await supabase
    .from("project_precontract_details")
    .update({
      bid_approved_at: new Date().toISOString(),
      approved_bid_summary_id: bidSummaryId,
      bid_price: summary?.total_bid_price ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("tender_stage", "approval");
  return { error: pcErr?.message ?? null };
}

export const SUBMISSION_METHODS = [
  { value: "portal", label: "e-Tender portal" },
  { value: "email", label: "Email" },
  { value: "hand_delivery", label: "Hand delivery" },
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
] as const;

/** Approval (approved) → Submitted. Records how, when and by whom; the approved revision becomes the submitted one. */
export async function recordSubmission(args: {
  projectId: string;
  approvedBidSummaryId: string;
  submittedAt: string;
  method: string;
  reference: string;
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error: sumErr } = await supabase
    .from("tender_bid_summaries")
    .update({ status: "submitted" })
    .eq("id", args.approvedBidSummaryId);
  if (sumErr) return { error: sumErr.message };
  return setTenderStage(args.projectId, "approval", "submitted", {
    submitted_at: args.submittedAt,
    submitted_by: await currentUserId(),
    submission_method: args.method,
    submission_reference: args.reference.trim() || null,
    submitted_bid_summary_id: args.approvedBidSummaryId,
  });
}

/** Submitted / Awaiting Result → Unsuccessful, with the win/loss record and lessons learned. */
export async function recordUnsuccessful(args: {
  projectId: string;
  tenderId: string;
  stage: TenderStage;
  ourBid: number;
  winningBid: number | null;
  awardee: string;
  competitorCount: number | null;
  reasonLost: string;
  lessons: string;
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  const spread = args.winningBid && args.ourBid ? ((args.ourBid - args.winningBid) / args.winningBid) * 100 : null;
  const { error } = await supabase.from("tender_win_loss").upsert(
    {
      tender_id: args.tenderId,
      our_bid_amount: args.ourBid,
      winning_bid_amount: args.winningBid,
      awardee_name: args.awardee.trim() || null,
      bid_spread: spread != null ? Math.round(spread * 100) / 100 : null,
      competitor_count: args.competitorCount,
      reason_lost: args.reasonLost.trim(),
      lesson_learned: args.lessons.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tender_id" },
  );
  if (error) return { error: error.message };
  return setTenderStage(args.projectId, args.stage, "unsuccessful", { loss_reason: args.reasonLost.trim() });
}
