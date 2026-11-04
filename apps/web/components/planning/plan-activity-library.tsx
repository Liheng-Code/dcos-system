"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanActMasterForm } from "./plan-act-master-form";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listCsiDivisions, listCsiSections, type CsiDivision, type CsiSection } from "@/lib/csi-divisions";
import { activateMaster, listMasters, loadLibraryTree, setMasterStatus, type LibraryTree } from "@/lib/planning/activity-library/library-service";
import { canManageLibraries } from "@/lib/planning/activity-library/qs-bridge-service";
import { listMasterLinkCounts, type MasterLinkCounts } from "@/lib/planning/activity-library/link-counts-service";
import {
  activationSteps, csiCounts, inCsiSelection, NO_DIVISION_KEY, NO_SECTION, type CsiSelection,
} from "@/lib/planning/activity-library/csi-grouping";
import { LIBRARY_STATUSES, type ActMaster, type LibraryStatus } from "@/lib/planning/activity-library/types";
import { ActStatusPill, CodeChip, EmptyNote, STATUS_LABEL } from "./plan-act-shared";
import { PROJECT_SECTORS } from "@/lib/project-categories";
import { sectorListLabel } from "@/lib/template-fit";

type Selection = { level: "all" } | { level: "domain" | "category" | "family"; id: string };
type ViewMode = "csi" | "domain";
const VIEW_KEY = "dcos.activityLibrary.view";

function readView(): ViewMode {
  try { return window.localStorage.getItem(VIEW_KEY) === "domain" ? "domain" : "csi"; } catch { return "csi"; }
}

/** BOQ / MS / T&C / package link counts as small badges; a zero shows dimmed so gaps stand out. */
function LinkBadges({ c }: { c: MasterLinkCounts | undefined }) {
  if (!c) return <span className="text-xs text-muted-foreground">…</span>;
  const item = (label: string, n: number, title: string) => (
    <span title={`${n} ${title}`} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", n > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/60")}>
      {label} {n}
    </span>
  );
  return (
    <div className="flex gap-1 whitespace-nowrap">
      {item("BOQ", c.boq, "BOQ items")}{item("MS", c.ms, "method statements")}{item("T&C", c.tc, "T&C items")}{item("PD", c.pkg, "procurement packages")}
    </div>
  );
}

export function PlanActivityLibrary() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tree, setTree] = useState<LibraryTree | null>(null);
  const [masters, setMasters] = useState<ActMaster[]>([]);
  const [divisions, setDivisions] = useState<CsiDivision[]>([]);
  const [sections, setSections] = useState<CsiSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("csi");
  const [selection, setSelection] = useState<Selection>({ level: "all" });
  const [csiSel, setCsiSel] = useState<CsiSelection>({ level: "all" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LibraryStatus | "">("");
  /** Sector slug: masters used in that sector (or in every sector). */
  const [sector, setSector] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiText, setAiText] = useState("");
  const [links, setLinks] = useState<Map<string, MasterLinkCounts>>(new Map());
  const [canManage, setCanManage] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState(false);
  const ai = useAskAi();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the remembered view is only readable in the browser
  useEffect(() => { setView(readView()); }, []);
  function changeView(v: ViewMode) {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* per-browser convenience only */ }
  }

  const reloadMasters = useCallback(async () => setMasters(await listMasters(supabase)), [supabase]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [t, m, d, s] = await Promise.all([
          loadLibraryTree(supabase), listMasters(supabase), listCsiDivisions(supabase), listCsiSections(supabase),
        ]);
        if (!live) return;
        setTree(t);
        setMasters(m);
        setDivisions(d);
        setSections(s);
        if (t.domains[0]) setExpanded(new Set([t.domains[0].id, ...t.categories.filter((c) => c.domain_id === t.domains[0].id).map((c) => c.id)]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load the Activity Library");
      } finally {
        if (live) setLoading(false);
      }
    })();
    void canManageLibraries(supabase).then((ok) => { if (live) setCanManage(ok); });
    return () => { live = false; };
  }, [supabase]);

  // newest version per code
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return masters.filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)));
  }, [masters]);

  useEffect(() => {
    if (!latest.length) return;
    let live = true;
    listMasterLinkCounts(supabase, latest.map((m) => m.id))
      .then((c) => { if (live) setLinks(c); })
      .catch(() => { /* badges are optional */ });
    return () => { live = false; };
  }, [supabase, latest]);

  const counts = useMemo(() => {
    const byFamily = new Map<string, number>();
    for (const m of latest) byFamily.set(m.family_id, (byFamily.get(m.family_id) ?? 0) + 1);
    return byFamily;
  }, [latest]);
  const csi = useMemo(() => csiCounts(latest), [latest]);
  const divisionName = useMemo(() => new Map(divisions.map((d) => [d.code, d.name])), [divisions]);
  const sectionName = useMemo(() => new Map(sections.map((s) => [s.code, s.name])), [sections]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return latest.filter((m) => {
      if (view === "csi") {
        if (!inCsiSelection(m, csiSel)) return false;
      } else {
        if (selection.level === "domain" && m.domain_id !== selection.id) return false;
        if (selection.level === "category" && m.category_id !== selection.id) return false;
        if (selection.level === "family" && m.family_id !== selection.id) return false;
      }
      if (status && m.status !== status) return false;
      if (sector && m.sectors.length > 0 && !m.sectors.includes(sector)) return false;
      return !q || m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || (m.visible_code ?? "").toLowerCase().includes(q);
    });
  }, [latest, view, csiSel, selection, search, status, sector]);

  const activatable = rows.filter((m) => activationSteps(m.status).length > 0);
  const pickedRows = rows.filter((m) => picked.has(m.id));

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function togglePick(id: string) {
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function activatePicked() {
    setActivating(true);
    let ok = 0;
    const failed: string[] = [];
    for (const m of pickedRows) {
      try {
        for (const step of activationSteps(m.status)) {
          if (step === "active") await activateMaster(supabase, m.id);
          else await setMasterStatus(supabase, m.id, step);
        }
        ok += 1;
      } catch (e) {
        failed.push(`${m.visible_code ?? m.code}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setActivating(false);
    setPicked(new Set());
    if (ok) toast.success(`${ok} activit${ok === 1 ? "y" : "ies"} activated`);
    if (failed.length) toast.error(`${failed.length} could not be activated`, { description: failed.slice(0, 5).join("\n") });
    await reloadMasters();
  }

  const familyCount = (ids: string[]) => ids.reduce((a, id) => a + (counts.get(id) ?? 0), 0);
  const rowCls = (active: boolean) => cn("flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-muted", active && "bg-primary/10 font-semibold text-primary");

  if (loading || !tree) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const csiDivisionsShown = [
    ...divisions.filter((d) => (csi.byDivision.get(d.code) ?? 0) > 0),
    ...((csi.byDivision.get(NO_DIVISION_KEY) ?? 0) > 0 ? [{ code: NO_DIVISION_KEY, name: "No division" } as CsiDivision] : []),
  ];

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-border bg-card">
        <div className="flex shrink-0 gap-1 border-b border-border p-2" role="tablist" aria-label="Group activities by">
          {(["csi", "domain"] as const).map((v) => (
            <button
              key={v} role="tab" aria-selected={view === v} onClick={() => changeView(v)}
              className={cn("flex-1 rounded-md px-2 py-1 text-xs font-medium", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {v === "csi" ? "CSI Division" : "Domain"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {view === "csi" ? (
            <>
              <button onClick={() => setCsiSel({ level: "all" })} className={cn(rowCls(csiSel.level === "all"), "w-full justify-between px-4")}>
                All activities <span className="text-xs text-muted-foreground">{latest.length}</span>
              </button>
              {csiDivisionsShown.map((d) => {
                const key = `csi:${d.code}`;
                const open = expanded.has(key);
                const secs = [
                  ...sections.filter((s) => s.division_code === d.code && (csi.bySection.get(`${d.code}|${s.code}`) ?? 0) > 0),
                  ...((csi.bySection.get(`${d.code}|${NO_SECTION}`) ?? 0) > 0 ? [{ code: NO_SECTION, name: "No section" } as CsiSection] : []),
                ];
                return (
                  <div key={d.code}>
                    <div className={rowCls(csiSel.level === "division" && csiSel.code === d.code)}>
                      <button onClick={() => toggle(key)} aria-label="Toggle"><ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} /></button>
                      <button className="flex-1 truncate text-left" title={d.name} onClick={() => { setCsiSel({ level: "division", code: d.code }); if (!open) toggle(key); }}>
                        {d.code === NO_DIVISION_KEY ? d.name : `${d.code} - ${d.name}`}
                      </button>
                      <span className="text-xs text-muted-foreground">{csi.byDivision.get(d.code) ?? 0}</span>
                    </div>
                    {open && secs.map((s) => (
                      <button
                        key={s.code}
                        onClick={() => setCsiSel({ level: "section", division: d.code, code: s.code })}
                        className={cn(rowCls(csiSel.level === "section" && csiSel.division === d.code && csiSel.code === s.code), "w-full justify-between pl-9 pr-3 text-left")}
                        title={s.name}
                      >
                        <span className="truncate">{s.code === NO_SECTION ? <span className="italic text-muted-foreground">No section</span> : <><span className="font-mono text-xs">{s.code}</span> {s.name}</>}</span>
                        <span className="text-xs text-muted-foreground">{csi.bySection.get(`${d.code}|${s.code}`) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <button
                onClick={() => setSelection({ level: "all" })}
                className={cn("flex w-full items-center justify-between px-4 py-1.5 text-left text-sm hover:bg-muted", selection.level === "all" && "bg-primary/10 font-semibold text-primary")}
              >
                All activities <span className="text-xs text-muted-foreground">{latest.length}</span>
              </button>
              {tree.domains.map((d) => {
                const cats = tree.categories.filter((c) => c.domain_id === d.id);
                const open = expanded.has(d.id);
                return (
                  <div key={d.id}>
                    <div className={rowCls(selection.level === "domain" && selection.id === d.id)}>
                      <button onClick={() => toggle(d.id)} aria-label="Toggle"><ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} /></button>
                      <button className="flex-1 text-left" onClick={() => { setSelection({ level: "domain", id: d.id }); if (!open) toggle(d.id); }}>{d.name}</button>
                      <span className="text-xs text-muted-foreground">{familyCount(tree.families.filter((f) => cats.some((c) => c.id === f.category_id)).map((f) => f.id))}</span>
                    </div>
                    {open && cats.map((c) => {
                      const fams = tree.families.filter((f) => f.category_id === c.id);
                      const copen = expanded.has(c.id);
                      return (
                        <div key={c.id} className="pl-4">
                          <div className={rowCls(selection.level === "category" && selection.id === c.id)}>
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
            </>
          )}
        </div>
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
          {canManage && pickedRows.length > 0 && (
            <Button size="sm" variant="outline" disabled={activating} onClick={() => void activatePicked()}>
              {activating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Activate ({pickedRows.length})
            </Button>
          )}
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
            <EmptyNote>No Activity Masters match. Pick another division or family, or clear the filters.</EmptyNote>
          ) : (
            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead>
                <tr className="whitespace-nowrap bg-muted/50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {canManage && (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox" aria-label="Select all that can be activated" className="h-4 w-4"
                        checked={activatable.length > 0 && activatable.every((m) => picked.has(m.id))}
                        disabled={activatable.length === 0}
                        onChange={(e) => setPicked(e.target.checked ? new Set(activatable.map((m) => m.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">CSI section</th>
                  <th className="px-3 py-2">Trade</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Links</th>
                  <th className="px-3 py-2">Sectors</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ver.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const canActivate = activationSteps(m.status).length > 0;
                  return (
                    <tr key={m.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => router.push(`/dashboard/planning/activity-library/${m.id}`)}>
                      {canManage && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {canActivate && <input type="checkbox" aria-label={`Select ${m.name}`} className="h-4 w-4" checked={picked.has(m.id)} onChange={() => togglePick(m.id)} />}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2">
                        {m.visible_code && <span className="mr-1.5 font-mono text-xs font-semibold">{m.visible_code}</span>}
                        <CodeChip code={m.code} />
                      </td>
                      <td className="px-3 py-2">{m.name}</td>
                      <td className="px-3 py-2 text-xs" title={m.csi_section_code ? sectionName.get(m.csi_section_code) ?? undefined : divisionName.get(m.csi_division_code ?? "") ?? undefined}>
                        {m.csi_section_code
                          ? <span className="whitespace-nowrap font-mono">{m.csi_section_code}</span>
                          : <span className="text-amber-600">{m.csi_division_code ? `Div ${m.csi_division_code}, no section` : "No division"}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{m.trade ?? "—"}</td>
                      <td className="px-3 py-2">{m.default_unit ?? "—"}</td>
                      <td className="px-3 py-2"><LinkBadges c={links.get(m.id)} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" title={m.building_types.length ? `${m.building_types.length} building types recommended` : undefined}>{sectorListLabel(m.sectors)}</td>
                      <td className="px-3 py-2"><ActStatusPill status={m.status} /></td>
                      <td className="px-3 py-2 text-muted-foreground">v{m.version}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {creating && (
        <PlanActMasterForm
          tree={tree}
          defaultFamilyId={view === "domain" && selection.level === "family" ? selection.id : undefined}
          onClose={() => setCreating(false)}
          onSaved={(m) => { setCreating(false); if (m) router.push(`/dashboard/planning/activity-library/${m.id}`); }}
        />
      )}
    </div>
  );
}
