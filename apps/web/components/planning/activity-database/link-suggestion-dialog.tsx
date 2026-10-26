"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { applySuggestedLinks, suggestLinks, type ApplyLinksResult, type LinkSuggestionRow } from "@/lib/planning/activity-library/link-suggestion-service";
import { autoPicks, picksToList, scoreLabel, togglePick, type PickMap } from "@/lib/planning/activity-library/link-suggestion-view";
import { workItemLabel } from "@/lib/planning/activity-library/boq-item-rules";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
import { cn } from "@/lib/utils";
import { errorMessage, SELECT_CLS } from "./activity-database-shared";

const PAGE = 100;

/** Auto-suggest links (doc 24, phase 1): BOQ items without an activity link, each with its best matching activities. */
export function LinkSuggestionDialog({
  db, divisions, defaultDivision, onClose, onApplied, onOpenActivity,
}: {
  db: SupabaseClient; divisions: Division[]; defaultDivision: string | null;
  onClose: () => void; onApplied: () => void; onOpenActivity: (id: string) => void;
}) {
  const [division, setDivision] = useState<string>(defaultDivision ?? "");
  const [state, setState] = useState<{ key: string; rows: LinkSuggestionRow[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const [picks, setPicks] = useState<PickMap>(new Map());
  const [shown, setShown] = useState(PAGE);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyLinksResult | null>(null);
  const key = `${division}|${retry}`;

  const load = useCallback(async () => {
    try { setState({ key, rows: await suggestLinks(db, { divisionCode: division || null, limit: 3 }), error: null }); }
    catch (e) { setState({ key, rows: [], error: errorMessage(e, "Could not load suggestions") }); }
  }, [db, division, key]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const loaded = state?.key === key ? state : null;
  const rows = loaded?.rows ?? [];
  const autoCount = rows.filter((r) => r.band === "auto").length;

  async function apply() {
    setApplying(true);
    try {
      const r = await applySuggestedLinks(db, picksToList(picks));
      setResult(r);
      if (r.inserted > 0) { toast.success(`${r.inserted} link${r.inserted === 1 ? "" : "s"} added`); onApplied(); }
    } catch (e) { toast.error(errorMessage(e, "Could not apply the links")); } finally { setApplying(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[88vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Auto-suggest links</DialogTitle>
          <DialogDescription>BOQ items without an activity link, with the activities that match best. Tick one suggestion per item, then apply.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-primary" /> {result.inserted} link{result.inserted === 1 ? "" : "s"} added, {result.alreadyLinked} already linked.</p>
            {result.nonDraft.length > 0 && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="font-medium">Not written: these activities are not drafts</p>
                <p className="text-xs text-muted-foreground">Approved or active activities are locked. Create a new version of the activity, then link its BOQ items from the new draft.</p>
                {result.nonDraft.map((t) => (
                  <div key={t.masterId} className="flex items-center justify-between gap-2">
                    <span><span className="font-mono text-xs">{t.visibleCode ?? t.code}</span> ({t.status}): {t.workItemIds.length} BOQ item{t.workItemIds.length === 1 ? "" : "s"}</span>
                    <Button size="sm" variant="outline" onClick={() => { onClose(); onOpenActivity(t.masterId); }}>Open activity</Button>
                  </div>
                ))}
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="space-y-1 rounded-md border border-destructive/40 p-3">
                <p className="font-medium text-destructive">{result.failed.length} could not be written</p>
                {result.failed.slice(0, 10).map((f) => <p key={`${f.workItemId}${f.masterId}`} className="text-xs text-muted-foreground">{f.message}</p>)}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Division
                <select className={`${SELECT_CLS} w-64`} value={division} onChange={(e) => { setDivision(e.target.value); setPicks(new Map()); setShown(PAGE); }}>
                  <option value="">All divisions</option>
                  {divisions.filter((d) => d.is_active).map((d) => <option key={d.code} value={d.code}>Division {d.code} - {d.name}</option>)}
                </select>
              </label>
              {loaded && !loaded.error && <span className="text-sm text-muted-foreground">{rows.length.toLocaleString()} BOQ item{rows.length === 1 ? "" : "s"} with suggestions, {autoCount} clear match{autoCount === 1 ? "" : "es"}</span>}
              <Button size="sm" variant="outline" className="ml-auto" disabled={autoCount === 0} onClick={() => setPicks(autoPicks(rows))}>Select all auto</Button>
              <Button size="sm" variant="ghost" disabled={picks.size === 0} onClick={() => setPicks(new Map())}>Clear</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
              {!loaded ? (
                <div className="space-y-1 p-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : loaded.error ? (
                <div className="space-y-2 p-8 text-center text-sm"><p className="text-destructive">{loaded.error}</p><Button size="sm" variant="outline" onClick={() => { setState(null); setRetry((n) => n + 1); }}>Retry</Button></div>
              ) : rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No unlinked BOQ items have a matching activity{division ? " in this division" : ""}.</p>
              ) : (
                <>
                  {rows.slice(0, shown).map((r) => (
                    <div key={r.workItem.id} className="space-y-1.5 border-b border-border/60 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{r.workItem.code}</span>
                        <span className="min-w-0 flex-1 truncate">{workItemLabel(r.workItem)} <span className="text-muted-foreground">({r.workItem.unit})</span></span>
                        <Badge variant={r.band === "auto" ? "default" : "secondary"}>{r.band === "auto" ? "Auto" : "Review"}</Badge>
                      </div>
                      <div className="flex flex-col gap-1">
                        {r.suggestions.map((s) => {
                          const on = picks.get(r.workItem.id)?.masterId === s.masterId;
                          return (
                            <label key={s.masterId} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-sm", on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                              <input type="checkbox" className="mt-1" checked={on} onChange={() => setPicks((p) => togglePick(p, r.workItem.id, s))} />
                              <span className="min-w-0 flex-1">
                                <span className="font-mono text-xs text-muted-foreground">{s.visibleCode ?? s.code}</span> {s.name}
                                {s.status !== "draft" && <span className="ml-2 text-xs text-muted-foreground">({s.status}, needs a new version)</span>}
                                {s.reasons.length > 0 && <span className="block text-xs text-muted-foreground">{s.reasons.join(" · ")}</span>}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{scoreLabel(s.score)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {shown < rows.length && (
                    <div className="flex justify-center p-3"><Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show more ({rows.length - shown} left)</Button></div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{result ? "Close" : "Cancel"}</Button>
          {result ? (
            <Button onClick={() => { setResult(null); setPicks(new Map()); setState(null); setRetry((n) => n + 1); }}>Back to suggestions</Button>
          ) : (
            <Button disabled={picks.size === 0 || applying} onClick={() => void apply()}>
              {applying && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Apply {picks.size > 0 ? `(${picks.size})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
