"use client";

// AI assurance in the web app (design §11):
//   DrAiFindings  the photo check of one report version, in the approver's
//                 review package. Advisory: it shows what the check found and
//                 lets the approver mark each flagged finding as useful or not.
//   DrAiSettings  the project's switch and daily limit, in Setup.
// Reporting units never see either: the tables behind them are readable by
// approvers only.

import { useCallback, useEffect, useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAiAcceptance,
  getAiAssurance,
  getAiSettings,
  saveAiSettings,
  setAiFindingVerdict,
  type AiAcceptance,
  type AiAssurance,
  type AiFinding,
} from "@/lib/construction/daily-reporting/service";
import { Field, Flag, formatDateTime, inputClass, SectionCard } from "./dr-ui";

const ASSESSMENT: Record<AiFinding["assessment"], { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  SUPPORTED: { label: "Photos support the report", tone: "good" },
  UNCLEAR: { label: "Unclear", tone: "warn" },
  CONTRADICTED: { label: "Photos conflict with the report", tone: "bad" },
  NOT_ASSESSABLE: { label: "Could not be assessed", tone: "neutral" },
};

export function DrAiFindings({
  versionId,
  assuranceState,
  lineLabels,
}: {
  versionId: string;
  assuranceState: string;
  /** Activity line id → what to call it. */
  lineLabels: Record<string, string>;
}) {
  const [data, setData] = useState<AiAssurance | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getAiAssurance(versionId));
    } catch {
      setData({ runs: [], findings: [] });
    }
  }, [versionId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount / version change
    void load();
  }, [load]);

  if (!data) return null;
  const lastRun = data.runs[0] ?? null;
  const running = assuranceState === "AI_RUNNING" && (!lastRun || lastRun.status === "FAILED");
  // AI is not switched on for this project, or this report had no activity photos.
  if (!running && (!lastRun || lastRun.status === "SKIPPED_NO_PHOTOS")) return null;

  const flagged = data.findings.filter((f) => f.severity === "WARNING").length;
  const verdict = async (f: AiFinding, v: "ACCEPTED" | "DISMISSED") => {
    try {
      await setAiFindingVerdict(f.id, v);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SectionCard title={`AI photo check${data.findings.length ? ` — ${flagged} flagged` : ""}`}>
      <p className="text-xs text-muted-foreground">
        Advisory only. An AI model looked at the photos attached to each activity. It cannot measure quantities or percentages, and it can be
        wrong. The decision is yours; the reporting unit does not see this.
      </p>

      {running ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> The check is running. Reload in a minute.
        </p>
      ) : lastRun && lastRun.status !== "SUCCEEDED" ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The AI check did not run for this version{lastRun.status === "SKIPPED_BUDGET" ? ": the project's daily limit was reached." : "."} Review the
          photos yourself.
          {lastRun.status === "FAILED" && lastRun.error ? <span className="mt-1 block text-xs">{lastRun.error}</span> : null}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.findings.map((f) => {
            const a = ASSESSMENT[f.assessment];
            return (
              <li key={f.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {lineLabels[f.target.line_id ?? ""] ?? "Activity"}
                      <span className="ml-2 align-middle">
                        <Flag tone={a.tone}>{a.label}</Flag>
                      </span>
                    </p>
                    <p className="mt-0.5">{f.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.source_refs.length} photo{f.source_refs.length === 1 ? "" : "s"} checked
                      {f.recommended_action === "REQUEST_ADDITIONAL_EVIDENCE" ? " · suggestion: ask for clearer photos" : ""}
                    </p>
                  </div>
                  {f.severity === "WARNING" ? (
                    <div className="flex items-center gap-1">
                      <Button variant={f.verdict === "ACCEPTED" ? "default" : "outline"} size="sm" aria-pressed={f.verdict === "ACCEPTED"} onClick={() => verdict(f, "ACCEPTED")}>
                        <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Useful
                      </Button>
                      <Button variant={f.verdict === "DISMISSED" ? "default" : "outline"} size="sm" aria-pressed={f.verdict === "DISMISSED"} onClick={() => verdict(f, "DISMISSED")}>
                        <ThumbsDown className="mr-1 h-3.5 w-3.5" /> Not useful
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lastRun && lastRun.status === "SUCCEEDED" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {lastRun.model} · prompt {lastRun.prompt_version} · {lastRun.images} photo{lastRun.images === 1 ? "" : "s"} · {formatDateTime(lastRun.finished_at)}
        </p>
      ) : null}
    </SectionCard>
  );
}

export function DrAiSettings({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState("30");
  const [acceptance, setAcceptance] = useState<AiAcceptance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAiSettings(projectId), getAiAcceptance(projectId, 30)])
      .then(([s, a]) => {
        if (cancelled) return;
        setEnabled(s.evidence_assessment_enabled);
        setLimit(String(s.daily_report_limit));
        setAcceptance(a);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!loaded) return null;

  const save = async () => {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      toast.error("Daily limit: enter a whole number from 0 to 1000.");
      return;
    }
    setSaving(true);
    try {
      await saveAiSettings(projectId, { evidence_assessment_enabled: enabled, daily_report_limit: n });
      toast.success(enabled ? "AI photo check is on for this project." : "AI photo check is off for this project.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="AI photo check">
      <p className="text-sm text-muted-foreground">
        When on, each submitted report&apos;s activity photos are sent to an AI model, which tells the approver whether they appear to support what
        was reported. It is advisory: it never approves, returns or changes a report, and reporting units do not see it. Each assessed report
        has a cost, so set a daily limit. It works only when the AI key is configured on the server.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Check photos on this project
        </label>
        <Field label="Reports assessed per day, at most" className="w-56">
          <input type="number" inputMode="numeric" min={0} max={1000} className={inputClass} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Button size="sm" disabled={saving} onClick={save}>
          Save
        </Button>
      </div>
      {acceptance && acceptance.flagged > 0 ? (
        <p className={cn("mt-3 text-sm", acceptance.reviewed === 0 && "text-muted-foreground")}>
          Last 30 days: {acceptance.flagged} finding{acceptance.flagged === 1 ? "" : "s"} flagged, {acceptance.reviewed} rated by approvers
          {acceptance.reviewed > 0 ? `, ${acceptance.accepted} of them useful (${Math.round((acceptance.accepted / acceptance.reviewed) * 100)}%)` : ""}.
        </p>
      ) : null}
    </SectionCard>
  );
}
