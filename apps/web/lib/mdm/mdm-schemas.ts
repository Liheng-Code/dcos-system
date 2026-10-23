import { z } from "zod";

/**
 * Transport-level validation shared by MDM API handlers.
 * Actor identity, tenant scope, permissions, and workflow status must be
 * derived by the authenticated server path; none are accepted from the body.
 * Domain fields are intentionally opaque here; a registered domain adapter
 * must validate `proposed_values` against its own versioned schema before submit
 * and again before applying an approved request.
 */
export const MDM_REQUEST_TYPES = ["create", "update", "deactivate"] as const;
export type MdmRequestType = (typeof MDM_REQUEST_TYPES)[number];

const MdmEntityCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[A-Z][A-Z0-9_-]*$/, "Entity code must use uppercase letters, digits, _ or -");

const SYSTEM_MANAGED_FIELDS = new Set([
  "id",
  "tenant_id",
  "company_id",
  "project_id",
  "code",
  "status",
  "workflow_status",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "archived_at",
]);

const MdmPayloadSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .superRefine((payload, context) => {
    for (const key of Object.keys(payload)) {
      if (SYSTEM_MANAGED_FIELDS.has(key.toLowerCase())) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "This field is managed by DCOS and cannot be submitted as master data",
        });
      }
    }
    if (JSON.stringify(payload).length > 64_000) {
      context.addIssue({
        code: "custom",
        message: "Request payload exceeds the 64 KB limit",
      });
    }
  });

export const MdmCreateRequestSchema = z
  .object({
    entity_code: MdmEntityCodeSchema,
    request_type: z.literal("create"),
    project_id: z.uuid().nullable().optional(),
    proposed_values: MdmPayloadSchema,
    reason: z.string().trim().min(1).max(2000),
    effective_at: z.iso.date().nullable().optional(),
  })
  .strict();

export const MdmUpdateRequestSchema = z
  .object({
    entity_code: MdmEntityCodeSchema,
    request_type: z.literal("update"),
    project_id: z.uuid().nullable().optional(),
    target_record_id: z.uuid(),
    proposed_values: MdmPayloadSchema,
    reason: z.string().trim().min(1).max(2000),
    effective_at: z.iso.date().nullable().optional(),
  })
  .strict();

export const MdmDeactivateRequestSchema = z
  .object({
    entity_code: MdmEntityCodeSchema,
    request_type: z.literal("deactivate"),
    project_id: z.uuid().nullable().optional(),
    target_record_id: z.uuid(),
    proposed_values: MdmPayloadSchema.optional().default({}),
    reason: z.string().trim().min(1).max(2000),
    effective_at: z.iso.date().nullable().optional(),
  })
  .strict();

export const MdmCreateRequestInputSchema = z.discriminatedUnion("request_type", [
  MdmCreateRequestSchema,
  MdmUpdateRequestSchema,
  MdmDeactivateRequestSchema,
]);

export type MdmCreateRequestInput = z.infer<typeof MdmCreateRequestInputSchema>;

export const MdmDecisionInputSchema = z
  .object({
    decision: z.enum(["approve", "reject", "return"]),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision !== "approve" && !value.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "A reason is required to reject or return a request",
      });
    }
  });

export type MdmDecisionInput = z.infer<typeof MdmDecisionInputSchema>;

export const MdmCancelInputSchema = z
  .object({ reason: z.string().trim().min(1).max(2000) })
  .strict();

export const MdmTransitionInputSchema = z
  .object({
    expected_version: z.number().int().positive(),
    action: z.enum(["submit", "start_review", "approve", "reject", "return", "cancel"]),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (["reject", "return", "cancel"].includes(value.action) && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for this action" });
    }
  });

export const MdmUpdateDraftInputSchema = z
  .object({
    expected_version: z.number().int().positive(),
    proposed_values: MdmPayloadSchema,
    reason: z.string().trim().min(1).max(2000),
    effective_at: z.iso.date().nullable().optional(),
  })
  .strict();

export const MdmRequestListQuerySchema = z.object({
  status: z.enum([
    "draft",
    "submitted",
    "under_review",
    "returned",
    "approved",
    "apply_failed",
    "rejected",
    "applied",
    "cancelled",
  ]).optional(),
  entity_code: MdmEntityCodeSchema.optional(),
  project_id: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type MdmRequestListQuery = z.infer<typeof MdmRequestListQuerySchema>;
