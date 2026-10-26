import { describe, expect, it } from "vitest";
import {
  allowedNextStatuses,
  checkTransition,
  isFinalStatus,
  isIndependentReviewer,
  type TransitionContext,
} from "../task-workflow";

const base: TransitionContext = {
  reviewRequired: true,
  deliverablesComplete: true,
  actorId: "owner",
  ownerId: "owner",
  supportIds: ["support"],
  reviewerId: "reviewer",
};

describe("task workflow", () => {
  it("allows the normal path", () => {
    expect(checkTransition("assigned", "in_progress", base).ok).toBe(true);
    expect(checkTransition("in_progress", "submitted", base).ok).toBe(true);
    expect(checkTransition("submitted", "review", base).ok).toBe(true);
    expect(checkTransition("review", "approved", { ...base, actorId: "reviewer" }).ok).toBe(true);
    expect(checkTransition("approved", "completed", base).ok).toBe(true);
  });

  it("rejects invalid transitions and final-state exits", () => {
    expect(checkTransition("open", "approved", base).ok).toBe(false);
    expect(checkTransition("closed", "in_progress", base).ok).toBe(false);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
    expect(isFinalStatus("closed")).toBe(true);
    expect(checkTransition("assigned", "assigned", base).ok).toBe(false);
  });

  it("blocks skipping review when the task type requires it", () => {
    expect(checkTransition("in_progress", "completed", base).ok).toBe(false);
    expect(checkTransition("in_progress", "completed", { ...base, reviewRequired: false }).ok).toBe(true);
  });

  it("requires deliverables before submit and complete", () => {
    const ctx = { ...base, deliverablesComplete: false };
    expect(checkTransition("in_progress", "submitted", ctx).ok).toBe(false);
    expect(checkTransition("in_progress", "completed", { ...ctx, reviewRequired: false }).ok).toBe(false);
  });

  it("enforces separation of duties", () => {
    expect(isIndependentReviewer("owner", "owner")).toBe(false);
    expect(isIndependentReviewer("support", "owner", ["support"])).toBe(false);
    expect(isIndependentReviewer(null, "owner")).toBe(false);
    expect(checkTransition("submitted", "review", { ...base, reviewerId: "owner" }).ok).toBe(false);
    expect(checkTransition("review", "approved", { ...base, actorId: "owner" }).ok).toBe(false);
    expect(checkTransition("review", "approved", { ...base, actorId: "someone-else" }).ok).toBe(false);
  });

  it("lets only the reviewer or approver return work, back to in progress", () => {
    expect(checkTransition("review", "in_progress", { ...base, actorId: "reviewer" }).ok).toBe(true);
    expect(checkTransition("review", "in_progress", { ...base, actorId: "owner" }).ok).toBe(false);
    expect(
      checkTransition("review", "approved", { ...base, actorId: "approver", approverId: "approver" }).ok,
    ).toBe(true);
  });
});
