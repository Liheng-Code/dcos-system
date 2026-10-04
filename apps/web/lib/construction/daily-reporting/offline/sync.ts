// Module 10-01 Daily Reporting — Phase 1B, the Field App's sync engine.
// Order (design §12.4): the report first, its photos second. Each step is
// written back to the device before the next one starts, so a run that is cut
// off by a lost signal resumes where it stopped and never sends twice.

import type { PushOutcome } from "../sync-server";
import type { EvidenceRef } from "../types";
import type { OfflineStore, QueueItem, QueueState } from "./store";

/** Thrown by the API layer when the server could not be reached at all. */
export class NetworkError extends Error {}

/** Thrown when the server answered with a refusal. */
export class ServerRefusal extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ConflictStatus {
  status: string;
  existing_report_id: string | null;
  resulting_version_no: number | null;
}

export interface SyncApi {
  push(item: QueueItem): Promise<PushOutcome>;
  /** Uploads one file to server storage and returns its storage key. */
  upload(item: QueueItem, localId: string, blob: Blob, mimeType: string): Promise<string>;
  attach(reportId: string, versionNo: number, evidence: EvidenceRef[]): Promise<{ complete: boolean; evidence_rejected?: string[] }>;
  conflict(conflictId: string): Promise<ConflictStatus | null>;
}

export interface SyncSummary {
  pushed: number;
  photos: number;
  stoppedOffline: boolean;
  errors: number;
}

const FINAL: QueueState[] = ["SYNCED", "REJECTED", "CLOSED", "QUARANTINE"];

const pendingPhotos = (item: QueueItem) => item.evidence.filter((e) => !e.attached && !e.rejected);

/** True when nothing more will happen to this item without the user. */
export const isSettled = (item: QueueItem) =>
  FINAL.includes(item.state) || (item.state === "REQUIRES_REVIEW" && pendingPhotos(item).length === 0);

async function sendPhotos(store: OfflineStore, api: SyncApi, item: QueueItem, summary: SyncSummary): Promise<void> {
  const { report_id, version_no } = item.result ?? {};
  if (!report_id || !version_no) return;

  for (const photo of pendingPhotos(item)) {
    if (!photo.storage_key) {
      const blob = await store.getBlob(photo.local_id);
      if (!blob) {
        // The file is gone from the device (storage cleared). Record it; do not block the rest.
        photo.rejected = true;
        item.last_error = `Photo "${photo.name}" is no longer on this device.`;
        await store.putItem(item);
        continue;
      }
      photo.storage_key = await api.upload(item, photo.local_id, blob, photo.mime_type);
      await store.putItem(item); // remember the upload before registering it
    }
    const res = await api.attach(report_id, version_no, [
      {
        storage_key: photo.storage_key,
        target_section: photo.target_section,
        target_line_id: photo.target_line_id,
        captured_at_device: photo.captured_at_device,
      },
    ]);
    if (res.evidence_rejected?.includes(photo.storage_key)) photo.rejected = true;
    else photo.attached = true;
    await store.putItem(item);
    await store.deleteBlob(photo.local_id);
    summary.photos++;
  }
}

async function syncItem(store: OfflineStore, api: SyncApi, item: QueueItem, summary: SyncSummary): Promise<void> {
  // A held conflict: see whether someone has resolved it.
  if (item.state === "CONFLICT" && item.result?.conflict_id) {
    const c = await api.conflict(item.result.conflict_id);
    if (!c || c.status === "Open") return;
    if (c.resulting_version_no && c.existing_report_id) {
      // Kept (or merged) as a new version: its photos now have somewhere to go.
      item.result = { ...item.result, report_id: c.existing_report_id, version_no: c.resulting_version_no };
      item.state = pendingPhotos(item).length > 0 ? "EVIDENCE_PENDING" : "SYNCED";
    } else {
      item.state = "CLOSED";
      for (const photo of item.evidence) await store.deleteBlob(photo.local_id);
    }
    await store.putItem(item);
  }

  if (item.state === "LOCAL_ONLY" || item.state === "SYNCING") {
    item.state = "SYNCING";
    item.attempts++;
    item.last_attempt_at = new Date().toISOString();
    await store.putItem(item);

    const outcome = await api.push(item);
    summary.pushed++;
    item.last_error = undefined;
    if (outcome.outcome === "ACCEPTED") {
      item.result = {
        report_id: outcome.report_id,
        report_no: outcome.report_no,
        version_no: outcome.version_no,
        review_flags: outcome.review_flags,
        synced_at: new Date().toISOString(),
      };
      item.state =
        outcome.review_flags.length > 0 ? "REQUIRES_REVIEW" : pendingPhotos(item).length > 0 ? "EVIDENCE_PENDING" : "SYNCED";
    } else {
      item.result = { conflict_id: outcome.conflict_id, report_id: outcome.existing_report_id, report_no: outcome.report_no };
      item.state = outcome.outcome;
      if (outcome.outcome === "QUARANTINE") item.last_error = outcome.error;
    }
    await store.putItem(item);
  }

  if ((item.state === "EVIDENCE_PENDING" || item.state === "REQUIRES_REVIEW") && pendingPhotos(item).length > 0) {
    await sendPhotos(store, api, item, summary);
    if (item.state === "EVIDENCE_PENDING" && pendingPhotos(item).length === 0) item.state = "SYNCED";
    await store.putItem(item);
  }
}

let running: Promise<SyncSummary> | null = null;

/**
 * Sends everything that is waiting, oldest first. Safe to call often (on
 * coming online, on app focus, on a timer): concurrent calls share one run.
 * A lost connection stops the run and leaves every item as it was.
 */
export function syncQueue(store: OfflineStore, api: SyncApi): Promise<SyncSummary> {
  if (running) return running;
  running = (async () => {
    const summary: SyncSummary = { pushed: 0, photos: 0, stoppedOffline: false, errors: 0 };
    try {
      for (const item of await store.listQueue()) {
        if (isSettled(item)) continue;
        try {
          await syncItem(store, api, item, summary);
        } catch (e) {
          if (e instanceof NetworkError) {
            if (item.state === "SYNCING") item.state = "LOCAL_ONLY";
            item.last_error = "No connection";
            await store.putItem(item);
            summary.stoppedOffline = true;
            break;
          }
          summary.errors++;
          item.last_error = e instanceof Error ? e.message : String(e);
          // Not authorised, or signed out: sending again will not help. Keep the
          // report on the device so the user can show it to the PM.
          if (e instanceof ServerRefusal && e.status === 403) item.state = "REJECTED";
          else if (item.state === "SYNCING") item.state = "LOCAL_ONLY";
          await store.putItem(item);
          if (e instanceof ServerRefusal && e.status === 401) break; // signed out: nothing else will go either
        }
      }
    } finally {
      running = null;
    }
    return summary;
  })();
  return running;
}

export function countWaiting(items: QueueItem[]): number {
  return items.filter((i) => !isSettled(i) && i.state !== "CONFLICT").length;
}
