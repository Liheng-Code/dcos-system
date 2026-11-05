"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Skeleton } from "@/components/ui/skeleton";
import { compareWithPrevious, type VersionComparison } from "@/lib/work-library/version-compare-service";
import { isEmptyDiff, type ListDiff } from "@/lib/work-library/version-diff";
import { errorMessage } from "./work-library-shared";

function DiffSection({ title, diff }: { title: string; diff: ListDiff }) {
  if (isEmptyDiff(diff)) return null;
  const row = (k: string, sign: string, cls: string, label: string, detail?: string) => (
    <li key={k} className="flex gap-2 text-sm">
      <span className={`w-4 shrink-0 font-mono ${cls}`}>{sign}</span>
      <span>{label}{detail && <span className="ml-1 text-xs text-muted-foreground">{detail}</span>}</span>
    </li>
  );
  return (
    <section>
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul className="space-y-0.5">
        {diff.added.map((x) => row(`a${x.key}`, "+", "text-emerald-600", x.label, x.detail))}
        {diff.removed.map((x) => row(`r${x.key}`, "−", "text-red-600", x.label, x.detail))}
        {diff.changed.map((x) => row(`c${x.key}`, "~", "text-amber-600", x.label, x.detail))}
      </ul>
    </section>
  );
}

/** Changes of this version against the one it supersedes: review before approving / activating. */
export function ActivityChangesTab({ db, masterId }: { db: SupabaseClient; masterId: string }) {
  const [state, setState] = useState<{ id: string; data: VersionComparison | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    compareWithPrevious(db, masterId)
      .then((data) => { if (live) setState({ id: masterId, data, error: null }); })
      .catch((e) => { if (live) setState({ id: masterId, data: null, error: errorMessage(e, "Could not compare the versions") }); });
    return () => { live = false; };
  }, [db, masterId]);

  const s = state?.id === masterId ? state : null;
  if (!s) return <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (s.error) return <p className="text-sm text-destructive">{s.error}</p>;
  const c = s.data;
  if (!c) return <p className="text-sm text-muted-foreground">This is the first version of the activity; there is nothing to compare.</p>;

  const lists: [string, ListDiff][] = [
    ["Methods", c.methods], ["BOQ links", c.boqLinks], ["Predecessors & successors", c.logic], ["Requirements", c.requirements], ["Quantity rules", c.quantityRules],
  ];
  const nothing = !c.fields.length && lists.every(([, d]) => isEmptyDiff(d));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Version {c.current.version} ({c.current.status}) against version {c.previous.version} ({c.previous.status}).
        {c.current.status !== "active" && " Activating this version supersedes the previous one and moves its norms, template lines and schedule tasks here."}
      </p>
      {nothing && <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No differences yet: the new version is still a copy of the previous one.</p>}
      {c.fields.length > 0 && (
        <section>
          <h4 className="mb-1 text-sm font-semibold">Fields</h4>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground"><th className="px-3 py-1.5">Field</th><th className="px-3 py-1.5">Version {c.previous.version}</th><th className="px-3 py-1.5">Version {c.current.version}</th></tr></thead>
              <tbody>
                {c.fields.map((f) => (
                  <tr key={f.field} className="border-b last:border-0"><td className="px-3 py-1.5 font-medium">{f.label}</td><td className="px-3 py-1.5 text-muted-foreground line-through decoration-red-400/60">{f.from}</td><td className="px-3 py-1.5">{f.to}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {lists.map(([title, d]) => <DiffSection key={title} title={title} diff={d} />)}
      {c.normsToMove.length > 0 && c.current.status !== "active" && (
        <section>
          <h4 className="mb-1 text-sm font-semibold">Norms that move on activation</h4>
          <ul className="space-y-0.5 text-sm">
            {c.normsToMove.map((n) => <li key={n.code}><span className="font-mono text-xs">{n.code}</span> <span className="text-muted-foreground">{n.output ?? "-"} {n.unit}/day</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
