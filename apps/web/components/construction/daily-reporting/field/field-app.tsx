"use client";

// DCOS Field App — Daily Report (Phase 1B). A standalone screen outside the
// dashboard that keeps working with no signal: the form comes from the device
// cache, the report and its photos are written to the device first, and the
// sync engine sends them when a connection returns. Review and approval are
// not available here; they need a live session in the dashboard.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CloudOff, FilePlus2, Loader2, RefreshCw, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  contextForDate,
  fieldApi,
  grantValid,
  knownReport,
  localDateIn,
  pullBundle,
  resolveConflict,
} from "@/lib/construction/daily-reporting/offline/client";
import { compressPhoto, connectionIsConstrained } from "@/lib/construction/daily-reporting/offline/compress";
import { idbStore, requestPersistence, type QueueItem, type QueueState } from "@/lib/construction/daily-reporting/offline/store";
import { countWaiting, NetworkError, ServerRefusal, syncQueue } from "@/lib/construction/daily-reporting/offline/sync";
import type { SyncBundle } from "@/lib/construction/daily-reporting/sync-server";
import { TONE_CLASS, type LabelTone } from "@/lib/construction/daily-reporting/status";
import { DrReportForm, type OfflineFormSource, type PendingEvidence } from "../dr-report-form";
import { EmptyState, formatDateTime, inputClass } from "../dr-ui";

const STATE_LABEL: Record<QueueState, { text: string; tone: LabelTone }> = {
  LOCAL_ONLY: { text: "Saved on device — not yet sent", tone: "warn" },
  SYNCING: { text: "Sending…", tone: "info" },
  EVIDENCE_PENDING: { text: "Report sent — photos still uploading", tone: "info" },
  SYNCED: { text: "Sent", tone: "good" },
  REQUIRES_REVIEW: { text: "Sent — the PM must review it", tone: "warn" },
  CONFLICT: { text: "Conflict — a report already exists for this date", tone: "bad" },
  QUARANTINE: { text: "Received but held for the PM", tone: "bad" },
  REJECTED: { text: "Not accepted — show this to your PM", tone: "bad" },
  CLOSED: { text: "Closed — the existing report was kept", tone: "neutral" },
};

const FLAG_TEXT: Record<string, string> = {
  offline_grant_revoked: "offline access was revoked",
  membership_revoked: "you are no longer a reporter of this unit",
  unit_not_active: "the unit is not active",
  rule_errors: "the report has errors",
  outside_wbs_scope: "an activity is outside the unit's scope",
  future_date: "the date is in the future",
  device_clock_ahead: "the phone's clock is wrong",
};

type View = { kind: "home" } | { kind: "form"; unitId: string; date: string };

export function FieldApp() {
  const store = useMemo(() => idbStore(), []);
  const [bundle, setBundle] = useState<SyncBundle | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState("");
  const running = useRef(false);

  const refreshQueue = useCallback(async () => setQueue(await store.listQueue()), [store]);

  /** Online: renew the offline grant and forms, then send whatever is waiting. */
  const refresh = useCallback(
    async (announce = false) => {
      if (running.current || !navigator.onLine) return;
      running.current = true;
      setBusy(true);
      try {
        try {
          // Forms and the offline grant are renewed at most every ten minutes,
          // or when the user asks; the queue is sent on every run.
          const cached = await store.getBundle();
          const fresh = !!cached && Date.now() - new Date(cached.pulled_at).getTime() < 10 * 60_000;
          if (announce || !fresh) setBundle(await pullBundle(store));
          setSignedOut(false);
        } catch (e) {
          if (e instanceof ServerRefusal && e.status === 401) setSignedOut(true);
          else if (!(e instanceof NetworkError)) toast.error(e instanceof Error ? e.message : String(e));
          if (e instanceof NetworkError || (e instanceof ServerRefusal && e.status === 401)) return;
        }
        const summary = await syncQueue(store, fieldApi);
        if (announce || summary.pushed > 0 || summary.photos > 0) {
          toast.success(
            summary.pushed + summary.photos === 0
              ? "Everything is up to date."
              : `Sent ${summary.pushed} report(s) and ${summary.photos} photo(s).`,
          );
        }
      } finally {
        await refreshQueue();
        running.current = false;
        setBusy(false);
      }
    },
    [store, refreshQueue],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([store.getBundle(), store.listQueue(), requestPersistence()])
      .then(([cached, items, persistent]) => {
        if (cancelled) return;
        setBundle(cached);
        setQueue(items);
        setPersisted(persistent);
        setOnline(navigator.onLine);
        setReady(true);
        void refresh();
      })
      .catch((e) => toast.error(`This device cannot store reports: ${e instanceof Error ? e.message : String(e)}`));

    const goOnline = () => {
      setOnline(true);
      void refresh();
    };
    const goOffline = () => setOnline(false);
    // No Background Sync on iOS: send when the app comes back to the front.
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store, refresh]);

  const units = useMemo(() => bundle?.units.map((u) => u.context.unit) ?? [], [bundle]);
  const selectedUnit = units.find((u) => u.id === unitId) ?? units[0];
  const timezone = bundle?.units.find((u) => u.context.unit.id === selectedUnit?.id)?.context.schedule.timezone;
  const today = timezone ? localDateIn(timezone) : "";
  const reportDate = date || today;

  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view.kind === "form" && bundle) {
    const formUnit = units.find((u) => u.id === view.unitId);
    const photos = new Map<string, { mime_type: string; size_bytes: number }>();
    const source: OfflineFormSource = {
      async loadContext() {
        const ctx = contextForDate(bundle, view.unitId, view.date);
        if (!ctx) throw new Error("This unit is not on the device. Connect and refresh.");
        return ctx;
      },
      async storePhoto(file, section, lineId): Promise<PendingEvidence> {
        const prepared = connectionIsConstrained()
          ? await compressPhoto(file)
          : { blob: file as Blob, mimeType: file.type };
        const localId = crypto.randomUUID();
        await store.putBlob(localId, prepared.blob);
        photos.set(localId, { mime_type: prepared.mimeType, size_bytes: prepared.blob.size });
        return {
          storage_key: `local:${localId}`,
          target_section: section,
          target_line_id: lineId ?? null,
          name: file.name,
          captured_at_device: new Date(file.lastModified || Date.now()).toISOString(),
        };
      },
      async enqueue({ payload, kind, evidence, findings }) {
        await store.putItem({
          id: crypto.randomUUID(),
          unit_id: view.unitId,
          unit_label: formUnit ? `${formUnit.display_name} (${formUnit.unit_code})` : view.unitId,
          report_date: view.date,
          report_kind: kind,
          payload,
          evidence: evidence.map((e) => {
            const localId = e.storage_key.replace(/^local:/, "");
            return {
              local_id: localId,
              target_section: e.target_section,
              target_line_id: e.target_line_id ?? null,
              name: e.name,
              mime_type: photos.get(localId)?.mime_type ?? "image/jpeg",
              size_bytes: photos.get(localId)?.size_bytes ?? 0,
              captured_at_device: e.captured_at_device ?? new Date().toISOString(),
            };
          }),
          local_findings: findings,
          client_created_at: new Date().toISOString(),
          grant_id: bundle.grant.grant_id,
          device_id: bundle.device_id,
          state: "LOCAL_ONLY",
          attempts: 0,
        });
        await refreshQueue();
      },
    };
    return (
      <div className="mx-auto max-w-3xl p-4">
        <DrReportForm
          key={`${view.unitId}-${view.date}`}
          unitId={view.unitId}
          date={view.date}
          mode="new"
          offline={source}
          onCancel={() => setView({ kind: "home" })}
          onDone={() => {
            setView({ kind: "home" });
            void refresh();
          }}
        />
      </div>
    );
  }

  const waiting = countWaiting(queue);
  const canWrite = grantValid(bundle);
  const already = bundle && selectedUnit ? knownReport(bundle, selectedUnit.id, reportDate, queue) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">Daily Report</h1>
        <p className="text-sm text-muted-foreground">
          {bundle ? `${bundle.user.name} · works without signal` : "DCOS Field App"}
        </p>
      </header>

      {/* Sync status: visible on every screen of the Field App (the form shows its own banner). */}
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
          !online ? TONE_CLASS.warn : waiting > 0 ? TONE_CLASS.info : TONE_CLASS.good,
        )}
      >
        <span className="flex items-center gap-2 font-medium">
          {online ? <Wifi className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          {online ? "Online" : "Offline"} ·{" "}
          {waiting > 0 ? `${waiting} waiting to send` : queue.length > 0 ? "everything sent" : "nothing waiting"}
        </span>
        <Button size="sm" variant="outline" disabled={!online || busy} onClick={() => void refresh(true)}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Sync now
        </Button>
      </div>

      {signedOut ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You are signed out. Your saved reports stay on this device.{" "}
          <Link className="font-medium underline" href="/">
            Sign in
          </Link>{" "}
          and come back to send them.
        </div>
      ) : null}

      {!bundle ? (
        <EmptyState title={online ? "Getting your forms…" : "Connect once to set up this device"}>
          {online
            ? "If this does not finish, sign in to DCOS first, then open this page again."
            : "The first time, this device needs a connection to download your reporting units."}
        </EmptyState>
      ) : units.length === 0 ? (
        <EmptyState title="You are not a reporter of any active unit">Ask your Project Manager to add you to a reporting unit.</EmptyState>
      ) : (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            {units.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Reporting unit</span>
                <select className={cn(inputClass, "w-auto")} value={selectedUnit?.id} onChange={(e) => setUnitId(e.target.value)}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} ({u.unit_code})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-sm">
                <p className="font-medium">{selectedUnit?.display_name}</p>
                <p className="text-xs text-muted-foreground">{selectedUnit?.unit_code}</p>
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Report date</span>
              <input type="date" className={cn(inputClass, "w-auto")} value={reportDate} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            <Button
              disabled={!canWrite || !!already || !selectedUnit}
              onClick={() => selectedUnit && setView({ kind: "form", unitId: selectedUnit.id, date: reportDate })}
            >
              <FilePlus2 className="mr-1 h-4 w-4" /> Start report
            </Button>
          </div>
          {already ? (
            <p className="text-sm text-amber-700">
              {already} already covers this unit and date. To correct it, use Daily Reporting in DCOS when you are online.
            </p>
          ) : null}
          {!canWrite ? (
            <p className="text-sm text-red-700">
              Offline use on this device has expired. Connect to the internet and press Sync now before writing a new report.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Offline use is valid until {formatDateTime(bundle.grant.expires_at)}. Forms last updated {formatDateTime(bundle.pulled_at)}.
              {persisted === false ? " This browser may clear saved reports if storage runs low — install the app to your home screen." : ""}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">On this device</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports saved on this device.</p>
        ) : (
          <ul className="space-y-2">
            {[...queue].reverse().map((item) => {
              const label = STATE_LABEL[item.state];
              const photosLeft = item.evidence.filter((e) => !e.attached && !e.rejected).length;
              return (
                <li key={item.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {item.result?.report_no ?? "Not yet numbered"} · {item.report_date}
                        {item.report_kind === "NO_WORK" ? " · no work" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.unit_label} · written {formatDateTime(item.client_created_at)}
                        {item.evidence.length > 0 ? ` · ${item.evidence.length} photo(s)${photosLeft > 0 ? `, ${photosLeft} to send` : ""}` : ""}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[label.tone])}>
                      {item.state === "SYNCED" ? <CheckCircle2 className="h-3 w-3" /> : null}
                      {label.text}
                    </span>
                  </div>
                  {item.result?.review_flags?.length ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Reason: {item.result.review_flags.map((f) => FLAG_TEXT[f] ?? f).join("; ")}.
                    </p>
                  ) : null}
                  {item.last_error && item.state !== "SYNCED" ? <p className="mt-1 text-xs text-red-700">{item.last_error}</p> : null}
                  {item.state === "CONFLICT" && item.result?.conflict_id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {item.result.report_no ?? "A report"} is already in DCOS for this date. Your PM can also decide.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!online || busy}
                        onClick={async () => {
                          try {
                            await resolveConflict(item.result!.conflict_id!, "KEEP_BOTH");
                            toast.success("Kept as a new version for the PM to review.");
                            await refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Keep mine as a new version
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!online || busy}
                        onClick={async () => {
                          try {
                            await resolveConflict(item.result!.conflict_id!, "KEEP_EXISTING");
                            toast.success("The existing report was kept.");
                            await refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Keep the existing report
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
