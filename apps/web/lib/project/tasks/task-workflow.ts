/**
 * Central task status transition rules (Task Team Planning addendum §5).
 * Pure functions: callers (API routes / RPC wrappers) enforce them server-side.
 */

export type TaskStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "paused"
  | "blocked"
  | "review"
  | "submitted"
  | "approved"
  | "completed"
  | "closed"
  | "cancelled"
  | "rejected";

const FINAL: ReadonlySet<string> = new Set(["closed", "cancelled"]);

const TRANSITIONS: Record<string, readonly TaskStatus[]> = {
  open: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "open", "cancelled"],
  in_progress: ["paused", "submitted", "completed", "assigned", "cancelled"],
  paused: ["in_progress", "cancelled"],
  // Legacy: new code uses the is_blocked flag instead of this status.
  blocked: ["in_progress", "cancelled"],
  submitted: ["review", "in_progress", "cancelled"],
  review: ["approved", "in_progress", "cancelled"],
  // Legacy value, treated as a returned review.
  rejected: ["in_progress", "cancelled"],
  approved: ["completed", "in_progress", "cancelled"],
  completed: ["closed", "in_progress"],
  closed: [],
  cancelled: [],
};

export interface TransitionContext {
  /** The task type requires independent review before completion. */
  reviewRequired: boolean;
  /** All required deliverables are submitted. */
  deliverablesComplete: boolean;
  /** The acting user. */
  actorId: string | null;
  ownerId: string | null;
  supportIds?: readonly string[];
  reviewerId: string | null;
  approverId?: string | null;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function isFinalStatus(status: string): boolean {
  return FINAL.has(status);
}

export function allowedNextStatuses(from: string): readonly TaskStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Reviewer must be independent of the people who did the work. */
export function isIndependentReviewer(
  reviewerId: string | null,
  ownerId: string | null,
  supportIds: readonly string[] = [],
): boolean {
  if (!reviewerId) return false;
  return reviewerId !== ownerId && !supportIds.includes(reviewerId);
}

export function checkTransition(
  from: string,
  to: TaskStatus,
  ctx: TransitionContext,
): TransitionResult {
  if (from === to) return { ok: false, reason: "Task is already in this status." };
  if (!allowedNextStatuses(from).includes(to)) {
    return { ok: false, reason: `Cannot move a task from "${from}" to "${to}".` };
  }

  if (to === "submitted" && !ctx.deliverablesComplete) {
    return { ok: false, reason: "Required deliverables are incomplete." };
  }

  if (to === "completed") {
    if (from === "in_progress" && ctx.reviewRequired) {
      return { ok: false, reason: "This task type requires review before completion." };
    }
    if (!ctx.deliverablesComplete) {
      return { ok: false, reason: "Required deliverables are incomplete." };
    }
  }

  if (to === "review" || to === "approved") {
    if (!ctx.reviewerId) return { ok: false, reason: "No reviewer is assigned." };
    if (!isIndependentReviewer(ctx.reviewerId, ctx.ownerId, ctx.supportIds)) {
      return { ok: false, reason: "The reviewer must be independent of the task owner and support staff." };
    }
  }

  // Only the named reviewer (or approver) may decide a review; no self-approval.
  if (from === "review" && (to === "approved" || to === "in_progress")) {
    const allowed = [ctx.reviewerId, ctx.approverId].filter(Boolean);
    if (!ctx.actorId || !allowed.includes(ctx.actorId)) {
      return { ok: false, reason: "Only the assigned reviewer or approver can decide this review." };
    }
    if (ctx.actorId === ctx.ownerId || ctx.supportIds?.includes(ctx.actorId)) {
      return { ok: false, reason: "You cannot review your own work." };
    }
  }

  return { ok: true };
}
