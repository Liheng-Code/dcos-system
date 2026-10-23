"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanActMasterForm } from "./plan-act-master-form";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listMasters, loadLibraryTree, type LibraryTree } from "@/lib/planning/activity-library/library-service";
import { LIBRARY_STATUSES, type ActMaster, type LibraryStatus } from "@/lib/planning/activity-library/types";
import { ActStatusPill, CodeChip, EmptyNote, STATUS_LABEL } from "./plan-act-shared";
import { PROJECT_SECTORS } from "@/lib/project-categories";
import { sectorListLabel } from "@/lib/template-fit";

type Selection = { level: "all" } | { level: "domain" | "category" | "family"; id: string };

export function PlanActivityLibrary() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tree, setTree] = useState<LibraryTree | null>(null);
  const [masters, setMasters] = useState<ActMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection>({ level: "all" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LibraryStatus | "">("");
  /** Sector slug: masters used in that sector (or in every sector). */
  const [sector, setSector] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiText, setAiText] = useState("");
  const ai = useAskAi();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [t, m] = await Promise.all([loadLibraryTree(supabase), listMasters(supabase)]);
        if (!live) return;
        setTree(t);
        setMasters(m);
        if (t.domains[0]) setExpanded(new Set([t.domains[0].id, ...t.categories.filter((c) => c.domain_id === t.domains[0].id).map((c) => c.id)]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load the Activity Library");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [supabase]);

  // newest version per code
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return masters.filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)));
  }, [masters]);

  const counts = useMemo(() => {
    const byFamily = new Map<string, number>();
    for (const m of latest) byFamily.set(m.family_id, (byFamily.get(m.family_id) ?? 0) + 1);
    return byFamily;
  }, [latest]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return latest.filter((m) => {
      if (selection.level === "domain" && m.domain_id !== selection.id) return false;
      if (selection.level === "category" && m.category_id !== selection.id) return false;
      if (selection.level === "family" && m.family_id !== selection.id) return false;
      if (status && m.status !== status) return false;
      if (sector && m.sectors.length > 0 && !m.sectors.includes(sector)) return false;
      return !q || m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [latest, selection, search, status, sector]);

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const familyCount = (ids: string[]) => ids.reduce((a, id) => a + (counts.get(id) ?? 0), 0);

  if (loading || !tree) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_1fr]">
      <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-border bg-card py-2">
        <button
          onClick={() => setSelection({ level: "all" })}
          className={cn("flex items-center justify-between px-4 py-1.5 text-left text-sm hover:bg-muted", selection.level === "all" && "bg-primary/10 font-semibold text-primary")}
        >
          All activities <span className="text-xs text-muted-foreground">{latest.length}</span>
        </button>
        {tree.domains.map((d) => {
          const cats = tree.categories.filter((c) => c.domain_id === d.id);
          const open = expanded.has(d.id);
          return (
            <div key={d.id}>
              <div className={cn("flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-muted", selection.level === "domain" && selection.id === d.id && "bg-primary/10 font-semibold text-primary")}>
                <button onClick={() => toggle(d.id)} aria-label="Toggle"><ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} /></button>
                <button className="flex-1 text-left" onClick={() => { setSelection({ level: "domain", id: d.id }); if (!open) toggle(d.id); }}>{d.name}</button>
                <span className="text-xs text-muted-foreground">{familyCount(tree.families.filter((f) => cats.some((c) => c.id === f.category_id)).map((f) => f.id))}</span>
              </div>
              {open && cats.map((c) => {
                const fams = tree.families.filter((f) => f.category_id === c.id);
                const copen = expanded.has(c.id);
                return (
                  <div key={c.id} className="pl-4">
                    <div className={cn("flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-muted", selection.level === "category" && selection.id === c.id && "bg-primary/10 font-semibold text-primary")}>
                      <button onClick={() => toggle(c.id)} aria-label="Toggle"><ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", copen && "rotate-90")} /></button>
                      <button className="flex-1 text-left" onClick={() => { setSelection({ level: "category", id: c.id }); if (!copen) toggle(c.id); }}>{c.name}</button>
                    </div>
                    {copen && fams.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelection({ level: "family", id: f.id })}
                        className={cn("flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-sm hover:bg-muted", selection.level === "family" && selection.id === f.id && "bg-primary/10 font-semibold text-primary")}
                      >
                        {f.name}
                        <span className="text-xs text-muted-foreground">{counts.get(f.id) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </aside>

      <section className="flex min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as LibraryStatus | "")}
          >
            <option value="">All statuses</option>
            {LIBRARY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Sector"
          >
            <option value="">All sectors</option>
            {PROJECT_SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="ml-auto text-sm text-muted-foreground">{rows.length} activit{rows.length === 1 ? "y" : "ies"}</span>
          <div className="flex items-center gap-2">
            <Input className="h-8 w-64" placeholder="Describe the work, e.g. cast the level 3 slab…" value={aiText} onChange={(e) => setAiText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && aiText.trim().length >= 3) void ai.ask({ tool: "find_activity_master", query: aiText }); }} />
            <Button size="sm" variant="outline" disabled={ai.busy || aiText.trim().length < 3} onClick={() => void ai.ask({ tool: "find_activity_master", query: aiText })}>Find with AI</Button>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New activity</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {(ai.message || ai.fresh.length > 0) && (
            <div className="mb-4 space-y-2">
              {ai.message && <p className="text-sm text-muted-foreground">{ai.message}</p>}
              <PlanAiSuggestionList suggestions={ai.fresh} projectId={null} onChanged={() => ai.clear()} />
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyNote>No Activity Masters match. Pick another family or clear the filters.</EmptyNote>
          ) : (
            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Discipline</th><th className="px-3 py-2">Sectors</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Version</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => router.push(`/dashboard/planning/activity-library/${m.id}`)}>
                    <td className="px-3 py-2"><CodeChip code={m.code} /></td>
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2">{m.default_unit ?? "—"}</td>
                    <td className="px-3 py-2">{m.discipline ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={m.building_types.length ? `${m.building_types.length} building types recommended` : undefined}>{sectorListLabel(m.sectors)}</td>
                    <td className="px-3 py-2"><ActStatusPill status={m.status} /></td>
                    <td className="px-3 py-2 text-muted-foreground">v{m.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {creating && (
        <PlanActMasterForm
          tree={tree}
          defaultFamilyId={selection.level === "family" ? selection.id : undefined}
          onClose={() => setCreating(false)}
          onSaved={(m) => { setCreating(false); if (m) router.push(`/dashboard/planning/activity-library/${m.id}`); }}
        />
      )}
    </div>
  );
}
