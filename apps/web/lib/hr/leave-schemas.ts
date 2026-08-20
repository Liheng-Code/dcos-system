import { z } from "zod";

// ── Shared ───────────────────────────────────────────────────────────────

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format");

export const DaySelectionSchema = z.enum(["full", "morning", "afternoon", "skip"]);

// ── Apply Leave ──────────────────────────────────────────────────────────
//
// Mirrors the fields actually read/required by
// `apps/web/components/hr/leave/leave-request-form.tsx`'s `validate()` and
// submit path: leave type, start/end date, reason, and (optionally) explicit
// per-day AM/PM/Skip/Override selections. CC teammates/emails and file
// attachments are handled by the form's UI but are never sent to the
// `leave_requests` insert itself (attachments become a `text[]` column with
// no upload wired up, CC is not persisted at all in the current form) — so
// they are intentionally out of scope for this v1 apply payload.

export const LeaveApplySchema = z.object({
  leave_type_id: z.string().uuid(),
  start_date: dateOnly,
  end_date: dateOnly,
  // Per-day overrides keyed by yyyy-MM-dd. Optional — omitted days (and any
  // day not covered by an explicit override) fall back to the form's default
  // rule: "full" for ordinary days, auto-excluded for Sundays/public
  // holidays. See lib/hr/leave-day-calculation.ts.
  day_selections: z.record(z.string(), DaySelectionSchema).optional(),
  reason: z.string().min(1, "reason is required").max(2000),
});

export type LeaveApplyInput = z.infer<typeof LeaveApplySchema>;

// ── Leave Decision (approve/reject) ─────────────────────────────────────────
//
// Mirrors the input shape of `decideLeaveRequest` in lib/hr/leave.ts:
// `requestId` (here `request_id`) and optional `notes`. `notes` is left
// optional at the Zod boundary even for the reject route — `decideLeaveRequest`
// itself enforces "reason required for reject" (returning `reason_required`),
// so making it a hard Zod requirement here would just produce a duplicate,
// differently-shaped error for the same rule. `approverId`/`decision` are not
// part of this schema: the approver id always comes from the authenticated
// mini app profile, never the client body, and the decision is implied by
// which route (approve vs reject) is called.

export const LeaveDecisionSchema = z.object({
  request_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export type LeaveDecisionInput = z.infer<typeof LeaveDecisionSchema>;
