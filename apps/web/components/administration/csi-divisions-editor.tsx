"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Power, PowerOff, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  buildCsiTree, canManageCsiLibrary, formatSectionCode, getCsiUsage, isValidDivisionCode,
  listCsiDivisions, listCsiSections, parentSectionCode, setCsiDivisionActive, setCsiSectionActive,
  upsertCsiDivision, upsertCsiSection,
  type CsiDivision, type CsiSection, type CsiTreeNode, type CsiUsage, type CsiUsageCounts,
} from "@/lib/csi-divisions";

const GROUP_ORDER = [
  "Procurement and Contracting", "General Requirements", "Facility Construction", "Facility Services",
  "Site and Infrastructure", "Process Equipment",
];

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

type Target = { kind: "division" | "section"; code: string; name: string };
type DivisionDialogState = { edit: CsiDivision | null };
type SectionDialogState = { edit: CsiSection | null; divisionCode: string | null };

function usageChips(u: CsiUsageCounts | undefined): { label: string; n: number }[] {
  if (!u) return [];
  return [
    { label: "materials", n: u.materialCategories },
    { label: "cost", n: u.costDivisions + u.costSections },
    { label: "activities", n: u.activities },
    { label: "work items", n: u.workItems },
    { label: "WBS templates", n: u.wbsTemplates },
  ].filter((c) => c.n > 0);
}

function usageText(u: CsiUsageCounts | undefined): string {
  const chips = usageChips(u);
  return chips.length ? chips.map((c) => `${c.n} ${c.label}`).join(", ") : "nothing";
}

/**
 * Master Libraries > CSI Divisions. The shared MasterFormat 2016 classification used by QS
 * (materials, cost codes, work items) and Planning (activities). Library managers edit; everyone else reads.
 */
export function CsiDivisionsEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [divisions, setDivisions] = useState<CsiDivision[]>([]);
  const [sections, setSections] = useState<CsiSection[]>([]);
  const [usage, setUsage] = useState<CsiUsage>({ divisions: {}, sections: {} });
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [divisionDialog, setDivisionDialog] = useState<DivisionDialogState | null>(null);
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Target | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [divs, secs, use, manage] = await Promise.all([
        listCsiDivisions(supabase), listCsiSections(supabase), getCsiUsage(supabase), canManageCsiLibrary(supabase),
      ]);
      setDivisions(divs);
      setSections(secs);
      setUsage(use);
      setCanManage(manage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load the CSI library");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const tree = useMemo(() => buildCsiTree(divisions, sections), [divisions, sections]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (n: CsiTreeNode) => n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
    const anyMatch = (n: CsiTreeNode): boolean => matches(n) || n.children.some(anyMatch);
    const visible = tree.filter((d) => (showInactive || d.is_active) && (!q || anyMatch(d)));
    const names = [...GROUP_ORDER];
    for (const d of visible) if (d.group_name && !names.includes(d.group_name)) names.push(d.group_name);
    return names
      .map((name) => ({ name, divisions: visible.filter((d) => d.group_name === name) }))
      .filter((g) => g.divisions.length > 0);
  }, [tree, search, showInactive]);

  const groupNames = useMemo(() => {
    const names = [...GROUP_ORDER];
    for (const d of divisions) if (d.group_name && !names.includes(d.group_name)) names.push(d.group_name);
    return names;
  }, [divisions]);

  const searching = search.trim() !== "";
  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  async function confirmToggle() {
    if (!toggleTarget) return;
    const activate = !isActive(toggleTarget);
    setToggling(true);
    try {
      if (toggleTarget.kind === "division") await setCsiDivisionActive(supabase, toggleTarget.code, activate);
      else await setCsiSectionActive(supabase, toggleTarget.code, activate);
      toast.success(`${toggleTarget.code} ${activate ? "activated" : "deactivated"}`);
      setToggleTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update");
    } finally {
      setToggling(false);
    }
  }

  function isActive(t: Target): boolean {
    return t.kind === "division"
      ? (divisions.find((d) => d.code === t.code)?.is_active ?? true)
      : (sections.find((s) => s.code === t.code)?.is_active ?? true);
  }

  function renderSection(node: CsiTreeNode, depth: number) {
    const u = usage.sections[node.code];
    const open = expanded.has(node.code) || searching;
    return (
      <div key={node.code} className="flex flex-col">
        <div className={cn("flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/60", !node.is_active && "opacity-50")} style={{ paddingLeft: 12 + depth * 20 }}>
          {node.children.length > 0 ? (
            <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => toggle(node.code)} className="rounded p-0.5 hover:bg-muted">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-[18px]" />}
          <span className="rounded bg-sky-50 px-1.5 font-mono text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-200">{node.code}</span>
          <span className="min-w-0 flex-1 truncate text-xs">{node.name}</span>
          <Chips u={u} />
          {!node.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
          {canManage && (
            <RowActions
              onEdit={() => setSectionDialog({ edit: sections.find((s) => s.code === node.code) ?? null, divisionCode: node.code.slice(0, 2) })}
              active={node.is_active}
              onToggle={() => setToggleTarget({ kind: "section", code: node.code, name: node.name })}
            />
          )}
        </div>
        {open && node.children.map((c) => renderSection(c, depth + 1))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-5 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground">Failed to load the CSI library: {error}</p>
        <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-sm font-semibold">CSI Divisions</h2>
          <p className="text-xs text-muted-foreground">
            CSI MasterFormat 2016 — the shared classification used by QS (materials, cost codes, work items) and Planning (activities).
            {" "}{divisions.length} divisions, {sections.length} sections.
            {!canManage && " You can view this library; only library managers can change it."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSectionDialog({ edit: null, divisionCode: null })}>
              <Plus className="h-3.5 w-3.5" /> Add Section
            </Button>
            <Button size="sm" onClick={() => setDivisionDialog({ edit: null })}>
              <Plus className="h-3.5 w-3.5" /> Add Division
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search division or section code / name..." className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">{searching ? "No divisions or sections match your search." : "No CSI divisions yet."}</p>
          {canManage && !searching && <Button size="sm" onClick={() => setDivisionDialog({ edit: null })}><Plus className="h-3.5 w-3.5" /> Add Division</Button>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>{group.name}</span>
                <span className="font-mono text-[10px]">{group.divisions.length} divisions</span>
              </div>
              {group.divisions.map((div) => {
                const open = expanded.has(div.code) || searching;
                const secCount = sections.filter((s) => s.division_code === div.code).length;
                return (
                  <div key={div.code} className="flex flex-col">
                    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60", !div.is_active && "opacity-50")}>
                      {div.children.length > 0 ? (
                        <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => toggle(div.code)} className="rounded p-0.5 hover:bg-muted">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : <span className="w-[18px]" />}
                      <span className="rounded bg-amber-50 px-1.5 font-mono text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{div.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{div.name}</span>
                      {secCount > 0 && <span className="font-mono text-[10px] text-muted-foreground">{secCount} sec</span>}
                      <Chips u={usage.divisions[div.code]} />
                      {!div.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      {canManage && (
                        <RowActions
                          onEdit={() => setDivisionDialog({ edit: divisions.find((d) => d.code === div.code) ?? null })}
                          active={div.is_active}
                          onToggle={() => setToggleTarget({ kind: "division", code: div.code, name: div.name })}
                          onAdd={() => setSectionDialog({ edit: null, divisionCode: div.code })}
                        />
                      )}
                    </div>
                    {open && div.children.map((c) => renderSection(c, 1))}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {divisionDialog && (
        <DivisionDialog
          edit={divisionDialog.edit}
          groupNames={groupNames}
          onClose={() => setDivisionDialog(null)}
          onSaved={async () => { setDivisionDialog(null); await load(); }}
        />
      )}
      {sectionDialog && (
        <SectionDialog
          edit={sectionDialog.edit}
          divisions={divisions}
          defaultDivision={sectionDialog.divisionCode}
          onClose={() => setSectionDialog(null)}
          onSaved={async (code) => {
            setSectionDialog(null);
            setExpanded((prev) => new Set([...prev, code.slice(0, 2), `${code.slice(0, 5)} 00`]));
            await load();
          }}
        />
      )}

      <Dialog open={toggleTarget != null} onOpenChange={(o) => { if (!o) setToggleTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          {toggleTarget && (() => {
            const activate = !isActive(toggleTarget);
            const u = toggleTarget.kind === "division" ? usage.divisions[toggleTarget.code] : usage.sections[toggleTarget.code];
            const inUse = (u?.total ?? 0) > 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{activate ? "Activate" : "Deactivate"} {toggleTarget.code}</DialogTitle>
                  <DialogDescription>
                    {activate
                      ? `${toggleTarget.name} will be offered again in pickers across QS and Planning.`
                      : `${toggleTarget.name} will no longer be offered in new pickers. Existing records keep their code.`}
                  </DialogDescription>
                </DialogHeader>
                {!activate && inUse && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>This code is in use by {usageText(u)}. Deactivating is allowed, but those records will still reference it.</span>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setToggleTarget(null)} disabled={toggling}>Cancel</Button>
                  <Button size="sm" variant={activate ? "default" : "destructive"} onClick={() => void confirmToggle()} disabled={toggling}>
                    {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {activate ? "Activate" : "Deactivate"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Chips({ u }: { u: CsiUsageCounts | undefined }) {
  const chips = usageChips(u);
  if (chips.length === 0) return null;
  return (
    <div className="hidden shrink-0 items-center gap-1 md:flex">
      {chips.map((c) => (
        <span key={c.label} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{c.n} {c.label}</span>
      ))}
    </div>
  );
}

function RowActions({ onEdit, onToggle, onAdd, active }: { onEdit: () => void; onToggle: () => void; onAdd?: () => void; active: boolean }) {
  return (
    <div className="flex shrink-0 items-center">
      {onAdd && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Add section" onClick={onAdd}><Plus className="h-3.5 w-3.5" /></Button>
      )}
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={active ? "Deactivate" : "Activate"} onClick={onToggle}>
        {active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function DivisionDialog({
  edit, groupNames, onClose, onSaved,
}: { edit: CsiDivision | null; groupNames: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [group, setGroup] = useState(edit?.group_name ?? groupNames[1] ?? groupNames[0] ?? "");
  const [sort, setSort] = useState(edit ? String(edit.sort_order) : "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string; sort?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!edit && !isValidDivisionCode(code.trim())) next.code = "Two digits, e.g. 03";
    if (!name.trim()) next.name = "Required";
    if (sort.trim() !== "" && !Number.isFinite(Number(sort))) next.sort = "Must be a number";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await upsertCsiDivision(supabase, {
        code: code.trim(), name, group_name: group, ...(sort.trim() !== "" ? { sort_order: Number(sort) } : {}),
      });
      toast.success(edit ? "Division updated" : "Division added");
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save";
      if (/already exists/i.test(msg)) setErrors({ code: msg });
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? `Edit Division ${edit.code}` : "New Division"}</DialogTitle>
          <DialogDescription>A CSI MasterFormat division, shared by QS and Planning.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-div-code">Code</Label>
            <Input id="csi-div-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!edit} placeholder="03" maxLength={2} className="font-mono" />
            {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-div-name">Name</Label>
            <Input id="csi-div-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Concrete" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-div-group">Group</Label>
            <select id="csi-div-group" value={group} onChange={(e) => setGroup(e.target.value)} className={selectClass}>
              {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-div-sort">Sort order</Label>
            <Input id="csi-div-sort" value={sort} onChange={(e) => setSort(e.target.value)} placeholder="Defaults to the code" inputMode="numeric" />
            {errors.sort && <p className="text-xs text-destructive">{errors.sort}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {edit ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionDialog({
  edit, divisions, defaultDivision, onClose, onSaved,
}: {
  edit: CsiSection | null;
  divisions: CsiDivision[];
  defaultDivision: string | null;
  onClose: () => void;
  onSaved: (code: string) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState(edit?.code ?? (defaultDivision ? `${defaultDivision} ` : ""));
  const [name, setName] = useState(edit?.name ?? "");
  const [sort, setSort] = useState(edit ? String(edit.sort_order) : "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string; sort?: string }>({});

  const formatted = formatSectionCode(code);
  const parent = formatted ? parentSectionCode(formatted) : null;
  const division = formatted ? divisions.find((d) => d.code === formatted.slice(0, 2)) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!formatted) next.code = "Six digits, e.g. 03 30 00";
    else if (!division) next.code = `Division ${formatted.slice(0, 2)} does not exist. Add it first.`;
    if (!name.trim()) next.name = "Required";
    if (sort.trim() !== "" && !Number.isFinite(Number(sort))) next.sort = "Must be a number";
    setErrors(next);
    if (Object.keys(next).length || !formatted) return;
    setSaving(true);
    try {
      await upsertCsiSection(supabase, { code: formatted, name, ...(sort.trim() !== "" ? { sort_order: Number(sort) } : {}) });
      toast.success(edit ? "Section updated" : "Section added");
      await onSaved(formatted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save";
      if (/code|parent|division/i.test(msg)) setErrors({ code: msg });
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? `Edit Section ${edit.code}` : "New Section"}</DialogTitle>
          <DialogDescription>Level 2 ends in 00 (03 30 00); anything else is level 3 under its level-2 parent.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-sec-code">Code</Label>
            <Input
              id="csi-sec-code" value={code} disabled={!!edit} placeholder="03 30 00" className="font-mono"
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => { if (formatted) setCode(formatted); }}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            {formatted && !errors.code && (
              <p className="text-xs text-muted-foreground">
                {division ? `Division ${division.code} — ${division.name}` : `Division ${formatted.slice(0, 2)} not found`}
                {parent ? `; level 3 under ${parent}` : "; level 2"}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-sec-name">Name</Label>
            <Input id="csi-sec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cast-in-Place Concrete" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csi-sec-sort">Sort order</Label>
            <Input id="csi-sec-sort" value={sort} onChange={(e) => setSort(e.target.value)} placeholder="Optional" inputMode="numeric" />
            {errors.sort && <p className="text-xs text-destructive">{errors.sort}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {edit ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
