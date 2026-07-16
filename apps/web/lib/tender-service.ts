import { SupabaseClient } from "@supabase/supabase-js"

// ── Error type ──────────────────────────────────────────────────────────────
// Mirrors the InvError convention used across apps/web/lib/inv/inv-service.ts:
// a typed error carrying an HTTP status + machine-readable code that API routes
// can catch and map directly to a response, instead of leaking raw Postgres text.

export class TenderError extends Error {
  public status: number
  public code: string
  public details?: unknown

  constructor(
    message: string,
    options: { status: number; code: string; details?: unknown },
  ) {
    super(message)
    this.name = "TenderError"
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

// ── Convert tender to project budget ────────────────────────────────────────
// Thin wrapper around the convert_tender_to_project_budget(uuid, uuid) RPC
// (see supabase/migrations/20260716000001_tender_award_budget_conversion.sql
// and .../20260716000002_tender_award_budget_conversion_hardening.sql).
// All validation (awarded status, project link, idempotency) lives in the
// Postgres function; this function only translates its RAISE EXCEPTION
// messages into TenderError so the route handler can map them to HTTP status
// codes without inspecting Postgres error text itself.

export interface ConvertTenderToProjectBudgetResult {
  sections_created: number
  items_created: number
  prelim_items_created: number
  total_amount: number
  project_id: string
}

export async function convertTenderToProjectBudget(
  supabase: SupabaseClient,
  tenderId: string,
  userId: string,
): Promise<ConvertTenderToProjectBudgetResult> {
  const { data, error } = await supabase.rpc("convert_tender_to_project_budget", {
    p_tender_id: tenderId,
    p_user_id: userId,
  })

  if (error) {
    const message = error.message ?? ""

    if (message === "Tender not found") {
      throw new TenderError("Tender not found", { status: 404, code: "NOT_FOUND" })
    }
    if (message.startsWith("NOT_AWARDED")) {
      throw new TenderError(message, { status: 409, code: "NOT_AWARDED" })
    }
    if (message.startsWith("NO_PROJECT_LINKED")) {
      throw new TenderError(message, { status: 409, code: "NO_PROJECT_LINKED" })
    }
    if (message.startsWith("ALREADY_CONVERTED")) {
      throw new TenderError(message, { status: 409, code: "ALREADY_CONVERTED", details: message })
    }

    throw new TenderError("Failed to convert tender to project budget", {
      status: 500,
      code: "CONVERSION_FAILED",
      details: error,
    })
  }

  return data as ConvertTenderToProjectBudgetResult
}
