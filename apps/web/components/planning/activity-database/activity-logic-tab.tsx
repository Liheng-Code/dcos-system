"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listLogicForMaster, type MasterLogic } from "@/lib/planning/activity-library/activity-database-service";
import { getMaster, listLogicRules } from "@/lib/planning/activity-library/library-service";
import type { ActLogicRule, ActMaster } from "@/lib/planning/activity-library/types";
import { LogicEditor } from "../plan-act-master-editors";
import { LogicNetworkView } from "./logic-network-view";
import { errorMessage } from "./activity-database-shared";

interface Loaded { master: ActMaster; rules: ActLogicRule[]; names: Record<string, string>; network: MasterLogic }

/** Predecessors & Successors tab: List (the existing LogicEditor) or Network (SVG). */
export function ActivityLogicTab({
  db, masterId, visibleCode, onSelectActivity,
}: { db: SupabaseClient; masterId: string; visibleCode: string | null; onSelectActivity: (id: string) => void }) {
  const [view, setView] = useState<"list" | "network">("list");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [master, rules, network] = await Promise.all([getMaster(db, masterId), listLogicRules(db, masterId), listLogicForMaster(db, masterId)]);
      if (!master) { setError("Activity not found"); return; }
      const names: Record<string, string> = {};
      for (const n of [...network.predecessors, ...network.successors]) names[n.master.id] = `${n.master.visible_code ?? n.master.code} ${n.master.name}`;
      setData({ master, rules, names, network });
      setError(null);
    } catch (e) { setError(errorMessage(e, "Failed to load logic")); }
  }, [db, masterId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-6 text-center text-sm">
        <p className="text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!data) return <div className="space-y-2"><Skeleton className="h-9 w-64" /><Skeleton className="h-40 w-full" /></div>;

  const seg = (v: "list" | "network", label: string) => (
    <button
      type="button" onClick={() => setView(v)} aria-pressed={view === v}
      className={cn("rounded-md px-4 py-1 text-sm font-medium transition-colors", view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">{seg("list", "List")}{seg("network", "Network")}</div>
      {view === "list" ? (
        <LogicEditor master={data.master} logic={data.rules} names={data.names} onChanged={() => void load()} />
      ) : (
        <LogicNetworkView
          center={{ id: data.master.id, visibleCode, code: data.master.code, name: data.master.name }}
          logic={data.network} onSelect={onSelectActivity}
        />
      )}
    </div>
  );
}
