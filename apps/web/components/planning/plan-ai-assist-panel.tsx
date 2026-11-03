"use client";

// Doc 35 Phase A: one panel for the AI tools that explain or word what the programme already says (Schedule Check
// findings, the delay register, questions about the schedule). Asks the server route, then lists the suggestions of
// this kind for the project; each is information the planner can mark as accepted or rejected. Nothing is changed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";
import { askAi, listSuggestions, loadAiStatus, type AiStatus, type AiSuggestionRow } from "@/lib/planning/activity-library/ai/ai-client";
import type { SuggestionKind } from "@/lib/planning/activity-library/ai/ai-core";
import type { AiRequest } from "@/lib/planning/activity-library/ai/ai-run";
import { PlanAiSuggestionList } from "./plan-ai-suggestions";

export function PlanAiAssistPanel({
  title, description, kind, buttonLabel, request, question, show = 6,
}: {
  title: string;
  description: string;
  kind: SuggestionKind;
  buttonLabel: string;
  /** the request for the selected project (question = the text typed, when `question` is set) */
  request: (projectId: string, question: string) => AiRequest;
  /** show a question box with this placeholder */
  question?: string;
  show?: number;
}) {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [rows, setRows] = useState<{ projectId: string; list: AiSuggestionRow[] } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadAiStatus(db).then(setStatus).catch(() => setStatus(null)); }, [db]);
  const load = useCallback(() => {
    if (!projectId) return;
    listSuggestions(db, { targetType: "project", targetId: projectId, kind, limit: 30 })
      .then((list) => setRows({ projectId, list }))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [db, projectId, kind]);
  useEffect(load, [load]);

  async function ask() {
    if (!projectId) return;
    setBusy(true);
    try {
      const r = await askAi(request(projectId, text));
      if (r.status === "ok" && r.suggestions.length) { toast.success(`${r.suggestions.length} suggestion(s) to review`); if (question) setText(""); }
      else if (r.status === "ok") toast.message(r.message ?? "Nothing passed the checks.");
      else if (r.status === "empty") toast.message(r.message ?? "Nothing to ask.");
      else toast.error(r.message ?? "The AI request did not complete");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "AI request failed"); } finally { setBusy(false); }
  }

  if (!projectId) return null;
  const list = rows?.projectId === projectId ? rows.list : null;
  const off = status && !status.enabled;
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {!question && <Button size="sm" variant="outline" onClick={() => void ask()} disabled={busy || !!off}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{buttonLabel}</Button>}
      </div>
      {question && (
        <form className="flex gap-2 px-4 pt-3" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={question} maxLength={500} disabled={!!off} />
          <Button type="submit" size="sm" disabled={busy || !!off || text.trim().length < 5}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{buttonLabel}</Button>
        </form>
      )}
      <div className="space-y-2 px-4 py-3">
        {off && <p className="text-xs text-muted-foreground">AI assistance is switched off for this organisation (Activity Library › AI Assistant).</p>}
        <p className="text-[11px] text-muted-foreground">
          Only activity codes, names, dates and figures are sent. Every figure in an answer is checked against the data it was given; an answer that fails is discarded. Answers are advice: they change nothing.
        </p>
        {!list ? <Loader2 className="h-4 w-4 animate-spin" /> : list.length === 0 ? null : (
          <PlanAiSuggestionList suggestions={list.slice(0, show)} projectId={projectId} onChanged={load} />
        )}
      </div>
    </section>
  );
}
