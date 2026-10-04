import { describe, expect, it } from "vitest";
import { memoryStore, type QueueItem } from "../offline/store";
import { countWaiting, isSettled, NetworkError, ServerRefusal, syncQueue, type ConflictStatus, type SyncApi } from "../offline/sync";
import type { PushOutcome } from "../sync-server";
import { emptyPayload } from "../types";

function item(id: string, photos = 0, writtenAt = "2026-10-04T08:00:00Z"): QueueItem {
  return {
    id,
    unit_id: "u1",
    unit_label: "Unit",
    report_date: "2026-10-04",
    report_kind: "WORK",
    payload: emptyPayload(),
    evidence: Array.from({ length: photos }, (_, i) => ({
      local_id: `${id}-p${i}`,
      target_section: "activities" as const,
      target_line_id: "a1",
      name: `p${i}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 3,
      captured_at_device: writtenAt,
    })),
    local_findings: [],
    client_created_at: writtenAt,
    grant_id: "g1",
    device_id: "d1",
    state: "LOCAL_ONLY",
    attempts: 0,
  };
}

const accepted = (id: string, flags: string[] = []): PushOutcome => ({
  outcome: "ACCEPTED",
  report_id: `r-${id}`,
  report_no: `DR-${id}`,
  version_no: 1,
  sync_state: "SYNCED",
  review_flags: flags,
  replayed: false,
});

/** Scriptable fake server that records every call. */
function fakeApi(overrides: Partial<SyncApi> = {}) {
  const calls: string[] = [];
  const api: SyncApi = {
    push: async (i) => {
      calls.push(`push:${i.id}`);
      return accepted(i.id);
    },
    upload: async (_i, localId) => {
      calls.push(`upload:${localId}`);
      return `key/${localId}`;
    },
    attach: async (_r, _v, ev) => {
      calls.push(`attach:${ev[0].storage_key}`);
      return { complete: true };
    },
    conflict: async () => null,
    ...overrides,
  };
  return { api, calls };
}

async function seed(items: QueueItem[]) {
  const store = memoryStore();
  for (const i of items) {
    await store.putItem(i);
    for (const p of i.evidence) await store.putBlob(p.local_id, new Blob(["abc"]));
  }
  return store;
}

describe("field app sync engine", () => {
  it("sends the report first, then its photos, oldest report first", async () => {
    const store = await seed([item("b", 1, "2026-10-04T09:00:00Z"), item("a", 2, "2026-10-04T08:00:00Z")]);
    const { api, calls } = fakeApi();
    const summary = await syncQueue(store, api);

    expect(calls).toEqual([
      "push:a", "upload:a-p0", "attach:key/a-p0", "upload:a-p1", "attach:key/a-p1",
      "push:b", "upload:b-p0", "attach:key/b-p0",
    ]);
    expect(summary).toMatchObject({ pushed: 2, photos: 3, stoppedOffline: false, errors: 0 });
    const queue = await store.listQueue();
    expect(queue.map((i) => i.state)).toEqual(["SYNCED", "SYNCED"]);
    expect(queue[0].result?.report_no).toBe("DR-a");
    expect(await store.getBlob("a-p0")).toBeNull(); // photos leave the device once registered
  });

  it("stops when the connection drops and changes nothing", async () => {
    const store = await seed([item("a"), item("b")]);
    const { api, calls } = fakeApi({
      push: async () => {
        throw new NetworkError("offline");
      },
    });
    const summary = await syncQueue(store, api);
    expect(summary.stoppedOffline).toBe(true);
    expect(calls).toEqual([]);
    expect((await store.listQueue()).map((i) => i.state)).toEqual(["LOCAL_ONLY", "LOCAL_ONLY"]);
  });

  it("resumes after a drop between photos without re-sending the report or a finished photo", async () => {
    const store = await seed([item("a", 2)]);
    let drop = true;
    const first = fakeApi({
      upload: async (_i, localId) => {
        if (localId === "a-p1" && drop) throw new NetworkError("offline");
        first.calls.push(`upload:${localId}`);
        return `key/${localId}`;
      },
    });
    await syncQueue(store, first.api);
    let [queued] = await store.listQueue();
    expect(queued.state).toBe("EVIDENCE_PENDING");
    expect(queued.evidence.map((e) => !!e.attached)).toEqual([true, false]);
    expect(await store.getBlob("a-p1")).not.toBeNull(); // the unsent photo is still on the device

    drop = false;
    const second = fakeApi();
    await syncQueue(store, second.api);
    expect(second.calls).toEqual(["upload:a-p1", "attach:key/a-p1"]);
    [queued] = await store.listQueue();
    expect(queued.state).toBe("SYNCED");
  });

  it("does not upload a photo twice when the drop happens after upload, before registration", async () => {
    const store = await seed([item("a", 1)]);
    const first = fakeApi({
      attach: async () => {
        throw new NetworkError("offline");
      },
    });
    await syncQueue(store, first.api);
    expect(first.calls).toEqual(["push:a", "upload:a-p0"]);

    const second = fakeApi();
    await syncQueue(store, second.api);
    expect(second.calls).toEqual(["attach:key/a-p0"]);
  });

  it("keeps a flagged report and still sends its photos", async () => {
    const store = await seed([item("a", 1)]);
    const { api } = fakeApi({ push: async (i) => accepted(i.id, ["membership_revoked"]) });
    await syncQueue(store, api);
    const [queued] = await store.listQueue();
    expect(queued.state).toBe("REQUIRES_REVIEW");
    expect(queued.result?.review_flags).toEqual(["membership_revoked"]);
    expect(queued.evidence[0].attached).toBe(true);
    expect(isSettled(queued)).toBe(true);
  });

  it("holds a conflict, then attaches the photos once it is resolved as a new version", async () => {
    const store = await seed([item("a", 1)]);
    let status: ConflictStatus = { status: "Open", existing_report_id: "r-existing", resulting_version_no: null };
    const { api, calls } = fakeApi({
      push: async () => ({ outcome: "CONFLICT", conflict_id: "c1", existing_report_id: "r-existing", report_no: "DR-9", replayed: false }),
      conflict: async () => status,
    });

    await syncQueue(store, api);
    let [queued] = await store.listQueue();
    expect(queued.state).toBe("CONFLICT");
    expect(await store.getBlob("a-p0")).not.toBeNull();

    await syncQueue(store, api); // still open: nothing happens, nothing is re-pushed
    expect(calls).toEqual([]);

    status = { status: "Resolved — Kept Both", existing_report_id: "r-existing", resulting_version_no: 2 };
    await syncQueue(store, api);
    [queued] = await store.listQueue();
    expect(calls).toEqual(["upload:a-p0", "attach:key/a-p0"]);
    expect(queued.state).toBe("SYNCED");
    expect(queued.result).toMatchObject({ report_id: "r-existing", version_no: 2 });
  });

  it("closes a conflict resolved in favour of the existing report", async () => {
    const store = await seed([item("a", 1)]);
    const { api } = fakeApi({
      push: async () => ({ outcome: "CONFLICT", conflict_id: "c1", existing_report_id: "r1", replayed: false }),
      conflict: async () => ({ status: "Resolved — Kept Existing", existing_report_id: "r1", resulting_version_no: null }),
    });
    await syncQueue(store, api);
    await syncQueue(store, api);
    const [queued] = await store.listQueue();
    expect(queued.state).toBe("CLOSED");
    expect(await store.getBlob("a-p0")).toBeNull();
  });

  it("keeps a refused report on the device and carries on with the next one", async () => {
    const store = await seed([item("a", 0, "2026-10-04T08:00:00Z"), item("b", 0, "2026-10-04T09:00:00Z")]);
    const { api } = fakeApi({
      push: async (i) => {
        if (i.id === "a") throw new ServerRefusal("no offline authorisation covers this report", "DR_FORBIDDEN", 403);
        return accepted(i.id);
      },
    });
    const summary = await syncQueue(store, api);
    const queue = await store.listQueue();
    expect(queue.map((i) => i.state)).toEqual(["REJECTED", "SYNCED"]);
    expect(queue[0].last_error).toMatch(/no offline authorisation/);
    expect(summary.errors).toBe(1);
  });

  it("leaves everything queued when the user is signed out", async () => {
    const store = await seed([item("a"), item("b", 0, "2026-10-04T09:00:00Z")]);
    const { api, calls } = fakeApi({
      push: async (i) => {
        calls.push(`push:${i.id}`);
        throw new ServerRefusal("Unauthorized", "UNAUTHORIZED", 401);
      },
    });
    await syncQueue(store, api);
    expect(calls).toEqual(["push:a"]);
    expect((await store.listQueue()).map((i) => i.state)).toEqual(["LOCAL_ONLY", "LOCAL_ONLY"]);
  });

  it("records a quarantined report with the server's reason", async () => {
    const store = await seed([item("a")]);
    const { api } = fakeApi({
      push: async () => ({ outcome: "QUARANTINE", conflict_id: "q1", error: "violates check constraint", replayed: false }),
    });
    await syncQueue(store, api);
    const [queued] = await store.listQueue();
    expect(queued.state).toBe("QUARANTINE");
    expect(queued.last_error).toMatch(/check constraint/);
  });

  it("counts only what is still waiting to be sent", async () => {
    const waiting = item("a");
    const done = { ...item("b"), state: "SYNCED" as const };
    const conflict = { ...item("c"), state: "CONFLICT" as const };
    const photos = { ...item("d", 1), state: "EVIDENCE_PENDING" as const };
    expect(countWaiting([waiting, done, conflict, photos])).toBe(2);
  });

  it("runs once when triggered twice at the same time", async () => {
    const store = await seed([item("a")]);
    const { api, calls } = fakeApi();
    await Promise.all([syncQueue(store, api), syncQueue(store, api)]);
    expect(calls).toEqual(["push:a"]);
  });
});
