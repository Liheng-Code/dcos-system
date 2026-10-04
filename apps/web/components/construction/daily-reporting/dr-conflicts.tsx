"use client";

// Sync conflicts and quarantined offline reports (Phase 1B), shown to the
// approver above the review inbox. A conflict is an offline report for a unit
// and date that already had a report; a quarantined report is one the
// database could not store. Neither is ever dropped: each stays here, with its
// full content, until someone decides.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listSyncConflicts, resolveSyncConflict, type SyncConflict } from "@/lib/construction/daily-reporting/service";
import { Flag, formatDateTime, inputClass } from "./dr-ui";

export function DrConflicts({ projectId, onOpenReport, onChanged }: { projectId: string; onOpenReport: (id: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<SyncConflict[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSyncConflicts(projectId)
      .then((data) => !cancelled && setRows(data))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [projectId, refresh]);

  if (rows.length === 0) return null;

  async function resolve(c: SyncConflict, resolution: "KEEP_EXISTING" | "KEEP_BOTH" | "DISCARD") {
    if (resolution === "DISCARD" && !(note[c.id] ?? "").trim()) return void toast.error("Give the reason for closing this record.");
    setBusy(c.id);
    try {
      const res = await resolveSyncConflict(c.id, resolution, (note[c.id] ?? "").trim() || null);
      toast.success(res.status);
      setRefresh((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-4">
      <h3 className="text-sm font-semibold text-red-800">Offline reports needing a decision ({rows.length})</h3>
      <ul className="space-y-2">
        {rows.map((c) => {
          const incoming = c.incoming.payload;
          const manpower = (incoming.manpower ?? []).reduce((s, m) => s + (m.reported_count ?? 0), 0);
          return (
            <li key={c.id} className="rounded-md border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {c.unit?.display_name} · {c.report_date}{" "}
                    <Flag tone="bad">{c.kind === "CONFLICT" ? "Conflict" : "Held — could not be stored"}</Flag>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Written offline {formatDateTime(c.incoming.client_created_at)} · received {formatDateTime(c.detected_at)} ·{" "}
                    {(incoming.activities ?? []).length} activit{(incoming.activities ?? []).length === 1 ? "y" : "ies"}, manpower {manpower}
                    {c.incoming.expected_evidence ? `, ${c.incoming.expected_evidence} photo(s) on the phone` : ""}
                  </p>
                  {c.kind === "QUARANTINE" ? <p className="mt-1 text-xs text-red-700">Database said: {c.error}</p> : null}
                </div>
                {c.existing_report_id ? (
                  <Button size="sm" variant="ghost" onClick={() => onOpenReport(c.existing_report_id as string)}>
                    Open the existing report
                  </Button>
                ) : null}
              </div>

              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Show the offline report</summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2">{JSON.stringify(incoming, null, 2)}</pre>
              </details>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.kind === "CONFLICT" ? (
                  <>
                    <Button size="sm" disabled={busy === c.id} onClick={() => void resolve(c, "KEEP_BOTH")}>
                      Keep it as a new version to review
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void resolve(c, "KEEP_EXISTING")}>
                      Keep the existing report only
                    </Button>
                  </>
                ) : (
                  <>
                    <input
                      className={inputClass + " max-w-sm"}
                      placeholder="Reason (required)"
                      value={note[c.id] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [c.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void resolve(c, "DISCARD")}>
                      Close this record
                    </Button>
                    <span className="text-xs text-muted-foreground">The content stays on file. Ask the unit to re-enter the report online.</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
