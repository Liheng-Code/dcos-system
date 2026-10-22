export const MDM_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "returned",
  "approved",
  "apply_failed",
  "rejected",
  "applied",
  "cancelled",
] as const;

export type MdmRequestStatus = (typeof MDM_REQUEST_STATUSES)[number];

export type MdmLifecycleCommand =
  | { type: "submit" }
  | { type: "start_review" }
  | { type: "approve" }
  | { type: "reject"; reason: string }
  | { type: "return"; reason: string }
  | { type: "cancel"; reason: string }
  | { type: "apply_succeeded" }
  | { type: "apply_failed"; reason: string }
  | { type: "retry_apply" };

export interface MdmLifecycleRequest {
  status: MdmRequestStatus;
  requestedBy: string;
}

export interface MdmLifecycleActor {
  userId: string;
  canSubmit: boolean;
  canReview: boolean;
  canCancelAny: boolean;
  isSystem: boolean;
}

export type MdmLifecycleErrorCode =
  | "MDM_INVALID_TRANSITION"
  | "MDM_FORBIDDEN"
  | "MDM_MAKER_CHECKER"
  | "MDM_REASON_REQUIRED"
  | "MDM_ADAPTER_REQUIRED";

export class MdmLifecycleError extends Error {
  constructor(
    readonly code: MdmLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MdmLifecycleError";
  }
}

/**
 * Computes a permitted next state for use in application validation and UI.
 * PostgreSQL transition functions remain authoritative and must repeat every
 * authorization and state check inside the same transaction as the event insert.
 */
export function transitionMdmRequest(
  request: MdmLifecycleRequest,
  actor: MdmLifecycleActor,
  command: MdmLifecycleCommand,
  options: { adapterReady?: boolean } = {},
): MdmRequestStatus {
  const { status, requestedBy } = request;
  const isRequester = actor.userId === requestedBy;

  switch (command.type) {
    case "submit":
      requirePermission(actor.canSubmit, "Submitting this request is not permitted");
      requireStatus(status, ["draft", "returned"]);
      return "submitted";

    case "start_review":
      requirePermission(actor.canReview, "Review permission is required");
      requireStatus(status, ["submitted"]);
      return "under_review";

    case "approve":
      requireDecisionAuthority(actor, isRequester);
      requireStatus(status, ["under_review"]);
      return "approved";

    case "reject":
      requireDecisionAuthority(actor, isRequester);
      requireReason(command.reason);
      requireStatus(status, ["under_review"]);
      return "rejected";

    case "return":
      requireDecisionAuthority(actor, isRequester);
      requireReason(command.reason);
      requireStatus(status, ["under_review"]);
      return "returned";

    case "cancel":
      requireReason(command.reason);
      requireStatus(status, ["draft", "submitted", "returned"]);
      if (!isRequester && !actor.canCancelAny) {
        throw new MdmLifecycleError("MDM_FORBIDDEN", "Only the requester or an authorized steward can cancel this request");
      }
      return "cancelled";

    case "apply_succeeded":
      requireSystem(actor);
      requireAdapter(options.adapterReady);
      requireStatus(status, ["approved"]);
      return "applied";

    case "apply_failed":
      requireSystem(actor);
      requireAdapter(options.adapterReady);
      requireReason(command.reason);
      requireStatus(status, ["approved"]);
      return "apply_failed";

    case "retry_apply":
      requireSystem(actor);
      requireAdapter(options.adapterReady);
      requireStatus(status, ["apply_failed"]);
      return "approved";
  }
}

function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) throw new MdmLifecycleError("MDM_FORBIDDEN", message);
}

function requireDecisionAuthority(actor: MdmLifecycleActor, isRequester: boolean): void {
  requirePermission(actor.canReview, "Decision permission is required");
  if (isRequester) {
    throw new MdmLifecycleError("MDM_MAKER_CHECKER", "The requester cannot approve, reject, or return their own request");
  }
}

function requireStatus(status: MdmRequestStatus, allowed: MdmRequestStatus[]): void {
  if (!allowed.includes(status)) {
    throw new MdmLifecycleError("MDM_INVALID_TRANSITION", `Cannot transition a ${status} request with this command`);
  }
}

function requireReason(reason: string): void {
  if (!reason.trim()) throw new MdmLifecycleError("MDM_REASON_REQUIRED", "A reason is required for this action");
}

function requireSystem(actor: MdmLifecycleActor): void {
  requirePermission(actor.isSystem, "Only the server-side domain adapter can apply an approved request");
}

function requireAdapter(adapterReady: boolean | undefined): void {
  if (!adapterReady) {
    throw new MdmLifecycleError("MDM_ADAPTER_REQUIRED", "No domain adapter is enabled for this entity");
  }
}
