// Module 10-01 Daily Reporting — Phase 1B, on-device storage for the Field App.
// Everything is written here before any network attempt ("local first").
// IndexedDB in the browser; an in-memory twin for tests.

import type { SyncBundle } from "../sync-server";
import type { DrPayload, ReportKind, RuleResult, SectionKey } from "../types";

/** What the user sees for a queued report (design §12.4). */
export type QueueState =
  | "LOCAL_ONLY" // written on the device, not yet sent
  | "SYNCING"
  | "EVIDENCE_PENDING" // report received, photos still to upload
  | "SYNCED"
  | "REQUIRES_REVIEW" // received, flagged for the approver
  | "CONFLICT" // a report already existed for that unit and date
  | "QUARANTINE" // received but could not be stored as a report; held for the approver
  | "REJECTED" // the server refused it (no offline authorisation); kept on the device
  | "CLOSED"; // conflict resolved without using this report

export interface QueuedEvidence {
  local_id: string;
  target_section: SectionKey;
  target_line_id: string | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  captured_at_device: string;
  /** Set once the file is in server storage. */
  storage_key?: string;
  /** Set once the server has registered it on the report. */
  attached?: boolean;
  /** The server refused the file (wrong type, virus). */
  rejected?: boolean;
}

export interface QueueItem {
  /** Also the Idempotency-Key: pushing the same item twice has no effect. */
  id: string;
  unit_id: string;
  unit_label: string;
  report_date: string;
  report_kind: ReportKind;
  payload: DrPayload;
  evidence: QueuedEvidence[];
  local_findings: RuleResult[];
  client_created_at: string;
  grant_id: string;
  device_id: string;
  state: QueueState;
  attempts: number;
  last_error?: string;
  last_attempt_at?: string;
  result?: {
    report_id?: string;
    report_no?: string;
    version_no?: number;
    conflict_id?: string;
    review_flags?: string[];
    synced_at?: string;
  };
}

export interface OfflineStore {
  getBundle(): Promise<SyncBundle | null>;
  putBundle(bundle: SyncBundle): Promise<void>;
  getDeviceId(): Promise<string>;
  listQueue(): Promise<QueueItem[]>;
  putItem(item: QueueItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  putBlob(localId: string, blob: Blob): Promise<void>;
  getBlob(localId: string): Promise<Blob | null>;
  deleteBlob(localId: string): Promise<void>;
}

const byWrittenTime = (a: QueueItem, b: QueueItem) => a.client_created_at.localeCompare(b.client_created_at);

export function memoryStore(deviceId = "00000000-0000-4000-8000-000000000001"): OfflineStore {
  let bundle: SyncBundle | null = null;
  const queue = new Map<string, QueueItem>();
  const blobs = new Map<string, Blob>();
  return {
    getBundle: async () => bundle,
    putBundle: async (b) => void (bundle = b),
    getDeviceId: async () => deviceId,
    listQueue: async () => [...queue.values()].map((i) => structuredClone(i)).sort(byWrittenTime),
    putItem: async (item) => void queue.set(item.id, structuredClone(item)),
    deleteItem: async (id) => void queue.delete(id),
    putBlob: async (id, blob) => void blobs.set(id, blob),
    getBlob: async (id) => blobs.get(id) ?? null,
    deleteBlob: async (id) => void blobs.delete(id),
  };
}

const DB_NAME = "dcos-field-dr";
const DB_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        // Resolve on commit, so a "saved" report really is on disk.
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = t.onabort = () => {
          db.close();
          reject(t.error ?? req.error);
        };
      }),
  );
}

export function idbStore(): OfflineStore {
  return {
    getBundle: () => tx<SyncBundle | undefined>("kv", "readonly", (s) => s.get("bundle")).then((b) => b ?? null),
    putBundle: (bundle) => tx("kv", "readwrite", (s) => s.put(bundle, "bundle")).then(() => undefined),
    async getDeviceId() {
      const existing = await tx<string | undefined>("kv", "readonly", (s) => s.get("device_id"));
      if (existing) return existing;
      const id = crypto.randomUUID();
      await tx("kv", "readwrite", (s) => s.put(id, "device_id"));
      return id;
    },
    listQueue: () => tx<QueueItem[]>("queue", "readonly", (s) => s.getAll()).then((items) => items.sort(byWrittenTime)),
    putItem: (item) => tx("queue", "readwrite", (s) => s.put(item)).then(() => undefined),
    deleteItem: (id) => tx("queue", "readwrite", (s) => s.delete(id)).then(() => undefined),
    putBlob: (id, blob) => tx("blobs", "readwrite", (s) => s.put(blob, id)).then(() => undefined),
    getBlob: (id) => tx<Blob | undefined>("blobs", "readonly", (s) => s.get(id)).then((b) => b ?? null),
    deleteBlob: (id) => tx("blobs", "readwrite", (s) => s.delete(id)).then(() => undefined),
  };
}

/** Asks the browser not to evict this origin's storage under pressure (matters most on iOS). */
export async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return null;
  }
}
