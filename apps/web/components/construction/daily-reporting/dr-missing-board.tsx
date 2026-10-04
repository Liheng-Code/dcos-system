"use client";

// Missing Reports board (design §13.7): silence and "no work" are different
// facts. A unit that submits nothing by its deadline appears here until it
// reports late or an approver excuses it with a reason.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { excuseMissing, listMissingReports, type DrCapabilities, type MissingReport } from "@/lib/construction/daily-reporting/service";
import { addDays, EmptyState, Flag, formatDateTime, inputClass, todayIso } from "./dr-ui";

const ESCALATION = ["Reporter notified", "Escalated to PM", "Escalated to management"];

export function DrMissingBoard({
  projectId,
  capabilities,
  onOpenReport,
}: {
  projectId: string;
  capabilities: DrCapabilities;
  onOpenReport: (reportId: string) => void;
}) {
  const [rows, setRows] = useState<MissingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [excusing, setExcusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listMissingReports(projectId, addDays(todayIso(), -30))
      .then((data) => !cancelled && setRows(data))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, refresh]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="No missing reports in the last 30 days">Every active unit reported, or reported no work, on each working day.</EmptyState>;
  }

  return (
    <div className="mx-auto max-w-5xl overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Escalation</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-border align-top">
              <td className="px-3 py-2 tabular-nums">{m.report_date}</td>
              <td className="px-3 py-2">
                {m.unit?.display_name} <span className="text-xs text-muted-foreground">{m.unit?.unit_code}</span>
              </td>
              <td className="px-3 py-2">
                <Flag tone={m.status === "Open" ? "bad" : m.status === "Excused" ? "neutral" : "warn"}>{m.status}</Flag>
                {m.excuse_reason ? <p className="mt-1 text-xs text-muted-foreground">{m.excuse_reason}</p> : null}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {m.status === "Open" ? ESCALATION[Math.min(m.escalation_level, 2)] : "—"}
                <br />
                raised {formatDateTime(m.detected_at)}
              </td>
              <td className="px-3 py-2 text-right">
                {m.linked_report_id ? (
                  <Button variant="ghost" size="sm" onClick={() => onOpenReport(m.linked_report_id as string)}>
                    Open report
                  </Button>
                ) : m.status === "Open" && capabilities.canReview ? (
                  excusing === m.id ? (
                    <div className="flex flex-col items-end gap-2">
                      <input className={inputClass} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setExcusing(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={reason.trim() === ""}
                          onClick={async () => {
                            try {
                              await excuseMissing(m.id, reason.trim());
                              toast.success("Marked as excused.");
                              setExcusing(null);
                              setReason("");
                              setRefresh((n) => n + 1);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          Confirm
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => { setExcusing(m.id); setReason(""); }}>
                      Excuse
                    </Button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
