// Module 10-01 Daily Reporting — Phase 1B, browser side of the Field App:
// the calls the sync engine makes, the bundle pull, and the helpers that turn
// the cached bundle into a form.

import { createClient } from "@/lib/supabase/client";
import type { PushOutcome, SyncBundle } from "../sync-server";
import type { EvidenceRef, FormContext } from "../types";
import type { OfflineStore, QueueItem } from "./store";
import { NetworkError, ServerRefusal, type SyncApi } from "./sync";

const EVIDENCE_BUCKET = "dr-evidence";

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new NetworkError("No connection");
  }
  // The service worker answers 503 when the network is unreachable.
  if (res.status === 503 || res.status === 504) throw new NetworkError("No connection");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ServerRefusal(body.error ?? "Request refused", body.code ?? "DR_INTERNAL", res.status);
  return body as T;
}

export const fieldApi: SyncApi = {
  push: (item: QueueItem) =>
    call<PushOutcome>("/api/dr/sync/push", {
      method: "POST",
      idempotencyKey: item.id,
      body: JSON.stringify({
        unit_id: item.unit_id,
        report_date: item.report_date,
        report_kind: item.report_kind,
        payload: item.payload,
        evidence: [],
        expected_evidence: item.evidence.length,
        client_created_at: item.client_created_at,
        grant_id: item.grant_id,
        device_id: item.device_id,
      }),
    }),

  async upload(item, _localId, blob, mimeType) {
    const { storage_key, token } = await call<{ storage_key: string; token: string }>("/api/dr/evidence/upload-url", {
      method: "POST",
      body: JSON.stringify({ unit_id: item.unit_id, report_date: item.report_date, mime_type: mimeType }),
    });
    const { error } = await createClient().storage.from(EVIDENCE_BUCKET).uploadToSignedUrl(storage_key, token, blob, { contentType: mimeType });
    if (error) {
      // supabase-js reports a dropped connection as an error object, not a throw.
      if (!navigator.onLine || /fetch|network/i.test(error.message)) throw new NetworkError("No connection");
      throw new ServerRefusal(error.message, "DR_EVIDENCE", 422);
    }
    return storage_key;
  },

  attach: (reportId: string, versionNo: number, evidence: EvidenceRef[]) =>
    call<{ complete: boolean; evidence_rejected?: string[] }>("/api/dr/sync/evidence", {
      method: "POST",
      body: JSON.stringify({ report_id: reportId, version_no: versionNo, evidence }),
    }),

  async conflict(conflictId: string) {
    const { data, error } = await createClient()
      .from("dr_sync_conflicts")
      .select("status, existing_report_id, resulting_version_no")
      .eq("id", conflictId)
      .maybeSingle();
    if (error) {
      if (!navigator.onLine || /fetch|network/i.test(error.message)) throw new NetworkError("No connection");
      return null;
    }
    return data;
  },
};

/** Online only: renews the offline grant and refreshes the cached forms. */
export async function pullBundle(store: OfflineStore): Promise<SyncBundle> {
  const bundle = await call<SyncBundle>("/api/dr/sync/pull", {
    method: "POST",
    body: JSON.stringify({ device_id: await store.getDeviceId(), label: navigator.userAgent.slice(0, 120) }),
  });
  await store.putBundle(bundle);
  return bundle;
}

export const resolveConflict = (conflictId: string, resolution: "KEEP_EXISTING" | "KEEP_BOTH", note?: string) =>
  call<{ status: string }>(`/api/dr/sync/conflicts/${conflictId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution, note: note ?? null }),
  });

/** Local date (yyyy-mm-dd) in a time zone. */
export function localDateIn(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * The cached form for a unit, re-based to the chosen date: which activities
 * are planned that day. The Field App writes new reports only.
 */
export function contextForDate(bundle: SyncBundle, unitId: string, date: string): FormContext | null {
  const unit = bundle.units.find((u) => u.context.unit.id === unitId);
  if (!unit) return null;
  const base = unit.context;
  return {
    ...base,
    report_date: date,
    today_local: localDateIn(base.schedule.timezone),
    activities: base.activities.map((a) => ({
      ...a,
      planned_today: !!a.start_date && !!a.end_date && a.start_date <= date && a.end_date >= date,
    })),
    // Corrections and amendments are done online; the Field App writes new reports only.
    existing: null,
    existing_payload: null,
    existing_evidence: [],
    correction: null,
    draft: null,
    previous_next_day: date === base.report_date ? base.previous_next_day : [],
  };
}

/** A report for this unit and date that the device already knows about. */
export function knownReport(bundle: SyncBundle, unitId: string, date: string, queue: QueueItem[]): string | null {
  const queued = queue.find((q) => q.unit_id === unitId && q.report_date === date && q.state !== "REJECTED" && q.state !== "CLOSED");
  if (queued) return queued.result?.report_no ?? "a report saved on this device";
  const recent = bundle.units
    .find((u) => u.context.unit.id === unitId)
    ?.recent.find((r) => r.report_date === date && r.submission_state !== "WITHDRAWN");
  return recent?.report_no ?? null;
}

export function grantValid(bundle: SyncBundle | null, at: Date = new Date()): boolean {
  return !!bundle && new Date(bundle.grant.expires_at).getTime() > at.getTime();
}
