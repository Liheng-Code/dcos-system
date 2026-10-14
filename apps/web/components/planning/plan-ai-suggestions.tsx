"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { acceptSuggestion, askAi, decideSuggestion, listSuggestions, type AiSuggestionRow } from "@/lib/planning/activity-library/ai/ai-client";
import type { AiRequest } from "@/lib/planning/activity-library/ai/ai-run";

const KIND_LABEL: Record<AiSuggestionRow["kind"], string> = {
  match_master: "Activity match", quantity_mapping: "BOQ link", productivity: "Productivity", conflict: "Check", explanation: "Explanation", recovery: "Recovery",
};

/** One card per suggestion: what is recommended, why, from what, how sure, what it touches, who must approve. */
export function PlanAiSuggestionList({
  suggestions, projectId, onChanged, compact,
}: { suggestions: AiSuggestionRow[]; projectId: string | null; onChanged: () => void; compact?: boolean }) {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function accept(s: AiSuggestionRow) {
    setBusy(s.id);
    try {
      const msg = await acceptSuggestion(db, s, projectId);
      toast.success(msg);
      onChanged();
      if (s.kind === "match_master" && typeof s.payload.master_id === "string") router.push(`/dashboard/planning/activity-library/${s.payload.master_id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not accept"); } finally { setBusy(null); }
  }
  async function reject(s: AiSuggestionRow) {
    setBusy(s.id);
    try { await decideSuggestion(db, s.id, "rejected"); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  if (suggestions.length === 0) return null;
  return (
    <ul className="space-y-2">
      {suggestions.map((s) => (
        <li key={s.id} className={cn("rounded-lg border border-border bg-card p-3 text-sm", s.status !== "pending" && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-primary"><Sparkles className="h-3 w-3" /> AI · {KIND_LABEL[s.kind]}</span>
            <span className="text-xs text-muted-foreground" title="How sure the model is. Low confidence means thin evidence.">confidence {Math.round(s.confidence * 100)}%</span>
            <span className="h-1.5 w-20 overflow-hidden rounded bg-muted"><span className="block h-full bg-primary" style={{ width: `${Math.round(s.confidence * 100)}%` }} /></span>
            {s.status !== "pending" && <span className={cn("ml-auto text-[11px] font-semibold uppercase", s.status === "accepted" ? "text-emerald-500" : "text-muted-foreground")}>{s.status}</span>}
          </div>
          <p className="mt-2 font-medium">{s.recommendation}</p>
          {s.reason && <p className="mt-1 text-muted-foreground">{s.reason}</p>}
          {!compact && (
            <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <dt>Source</dt><dd>{s.source}</dd>
              <dt>Affects</dt><dd>{s.affected.map((a) => a.label ?? a.type).join(" · ") || "—"}</dd>
              <dt>Approval</dt><dd>{s.required_approval}</dd>
            </dl>
          )}
          {s.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busy === s.id} onClick={() => accept(s)}>{busy === s.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}{s.kind === "quantity_mapping" ? "Accept and link" : s.kind === "match_master" ? "Open activity" : s.kind === "recovery" ? "Save scenario" : "Acknowledge"}</Button>
              <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => reject(s)}><X className="mr-1 h-4 w-4" /> Reject</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Ask the assistant and keep the answer: returns the suggestions to show plus a helper to reload them. */
export function useAskAi() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fresh, setFresh] = useState<AiSuggestionRow[]>([]);
  const db = useMemo(() => createClient(), []);

  async function ask(req: AiRequest): Promise<AiSuggestionRow[]> {
    setBusy(true); setMessage(null);
    try {
      const res = await askAi(req);
      if (res.message) setMessage(res.message);
      if (res.suggestions.length === 0) { setFresh([]); return []; }
      const rows = await listSuggestions(db, { runId: res.runId ?? undefined });
      setFresh(rows);
      return rows;
    } catch (e) {
      const m = e instanceof Error ? e.message : "The AI request failed";
      setMessage(m); toast.error(m); return [];
    } finally { setBusy(false); }
  }
  return { ask, busy, message, fresh, clear: () => { setFresh([]); setMessage(null); } };
}

export { listSuggestions };
