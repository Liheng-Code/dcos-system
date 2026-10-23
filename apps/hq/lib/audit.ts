import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Append-only record of every HQ action (design 3.1, hq_audit_log).
export async function audit(
  db: SupabaseClient,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    tenantId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  const { error } = await db.from("hq_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    tenant_id: entry.tenantId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) throw new Error(`Audit log: ${error.message}`);
}

export async function licenseEvent(
  db: SupabaseClient,
  entry: { tenantId: string; licenseId?: string | null; eventType: string; payload?: Record<string, unknown>; actorId: string },
) {
  const { error } = await db.from("license_events").insert({
    tenant_id: entry.tenantId,
    license_id: entry.licenseId ?? null,
    event_type: entry.eventType,
    payload: entry.payload ?? {},
    actor_id: entry.actorId,
  });
  if (error) throw new Error(`License event: ${error.message}`);
}
