"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { listSuggestionsFor, type AiSuggestionRow } from "@/lib/planning/activity-library/ai/ai-client";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";

/** "Explain this run" and "Check for conflicts", plus every suggestion made for this run or its activities. */
export function PlanAiRunPanel({ runId, projectId, itemIds, onChanged }: { runId: string; projectId: string; itemIds: string[]; onChanged: () => void }) {
  const db = useMemo(() => createClient(), []);
  const { ask, busy, message } = useAskAi();
  const [rows, setRows] = useState<AiSuggestionRow[]>([]);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    try { setRows(await listSuggestionsFor(db, [runId, ...itemIds])); } catch { /* the panel is optional; the run page must keep working */ }
  }, [db, runId, itemIds]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets state after awaiting
  useEffect(() => { void reload(); }, [reload]);

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="flex items-center gap-2 text-sm font-semibold" onClick={() => setOpen(!open)}>
          <Sparkles className="h-4 w-4 text-primary" /> AI assistant {pending > 0 && <span className="rounded bg-primary px-1.5 text-[11px] text-primary-foreground">{pending} pending</span>}
        </button>
        <span className="text-xs text-muted-foreground">Advisory: nothing changes until you accept.</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setOpen(true); await ask({ tool: "explain_generation", runId }); await reload(); }}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Explain this run
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setOpen(true); await ask({ tool: "detect_schedule_conflict", runId }); await reload(); }}>Check for conflicts</Button>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      {(open || pending > 0) && rows.length > 0 && (
        <div className="mt-3"><PlanAiSuggestionList suggestions={rows} projectId={projectId} onChanged={() => { void reload(); onChanged(); }} /></div>
      )}
    </div>
  );
}
