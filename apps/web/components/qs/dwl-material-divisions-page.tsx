"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, FileCode, Folder, FolderOpen, Layers,
  Loader2, Network, Package, Pencil, Plus, Search, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import type {
  DwlMaterialCategory, DwlMaterialDivision, DwlMaterialDivisionSection,
} from "@/components/qs/dwl-types";
import {
  deleteDwlMaterialDivisionSectionById, insertDwlMaterialDivision, insertDwlMaterialDivisionSection,
  listDwlMaterialCategoriesOrderedBySortOrderAndName, listDwlMaterialDivisionSectionsOrderedBySortOrderAndCode,
  listDwlMaterialDivisionsOrderedBySortOrderAndCode, listDwlVMaterials, updateDwlMaterialCategoryById,
  updateDwlMaterialDivisionByCode,
} from "@/lib/qs/qs-queries";

interface MaterialLite {
  resource_id: string;
  code: string;
  material_name: string;
  category_id: string | null;
  category_name: string | null;
  is_active: boolean;
}

type CategoryLite = Pick<DwlMaterialCategory, "id" | "name" | "code" | "cost_code_prefix" | "is_active"> & {
  division_code: string | null;
};

const DIVISION_GROUPS = [
  "General Requirements", "Facility Construction", "Facility Services", "Site and Infrastructure",
] as const;
const OTHER_GROUP = "Other";

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

// "09-5100" → "09 51 00", the MasterFormat spelling the sections use.
function sectionCodeFromPrefix(prefix: string | null): string | null {
  const digits = (prefix ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
}

export default function DwlMaterialDivisionsPage() {
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [divisions, setDivisions] = useState<DwlMaterialDivision[]>([]);
  const [sections, setSections] = useState<DwlMaterialDivisionSection[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [materials, setMaterials] = useState<MaterialLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string | null>(null);
  const [selectedNodeCode, setSelectedNodeCode] = useState<string | null>(null);

  const [divisionDialog, setDivisionDialog] = useState<{ edit: DwlMaterialDivision | null } | null>(null);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [deleteSection, setDeleteSection] = useState<DwlMaterialDivisionSection | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setErrorMsg(null);
    const [divRes, secRes, catRes, matRes] = await Promise.all([
      listDwlMaterialDivisionsOrderedBySortOrderAndCode(),
      listDwlMaterialDivisionSectionsOrderedBySortOrderAndCode(),
      listDwlMaterialCategoriesOrderedBySortOrderAndName("id, name, code, cost_code_prefix, division_code, is_active"),
      listDwlVMaterials(),
    ]);
    const error = divRes.error ?? secRes.error ?? catRes.error ?? matRes.error;
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    const divs = (divRes.data ?? []) as DwlMaterialDivision[];
    setDivisions(divs);
    setSections((secRes.data ?? []) as DwlMaterialDivisionSection[]);
    setCategories((catRes.data ?? []) as unknown as CategoryLite[]);
    setMaterials((matRes.data ?? []) as MaterialLite[]);
    setSelectedDivisionCode((prev) => prev ?? divs[0]?.code ?? null);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  // Each category sits on the deepest section its cost code prefix matches:
  // the exact section or subclass, else the section sharing its first three digits.
  const model = useMemo(() => {
    const sectionsByDivision = new Map<string, DwlMaterialDivisionSection[]>();
    const childrenByParent = new Map<string, DwlMaterialDivisionSection[]>();
    const sectionByCode = new Map<string, DwlMaterialDivisionSection>();
    for (const s of sections) {
      sectionByCode.set(s.code, s);
      if (s.parent_code) {
        childrenByParent.set(s.parent_code, [...(childrenByParent.get(s.parent_code) ?? []), s]);
      } else {
        sectionsByDivision.set(s.division_code, [...(sectionsByDivision.get(s.division_code) ?? []), s]);
      }
    }

    const materialsByCategory = new Map<string, MaterialLite[]>();
    for (const m of materials) {
      if (!m.category_id) continue;
      materialsByCategory.set(m.category_id, [...(materialsByCategory.get(m.category_id) ?? []), m]);
    }

    const nodeOfCategory = new Map<string, string>();
    for (const c of categories) {
      if (!c.division_code) continue;
      const code = sectionCodeFromPrefix(c.cost_code_prefix);
      if (!code || code.slice(0, 2) !== c.division_code) continue;
      const exact = sectionByCode.get(code);
      if (exact) {
        nodeOfCategory.set(c.id, exact.code);
        continue;
      }
      const parent = (sectionsByDivision.get(c.division_code) ?? []).find((s) => s.code.slice(0, 4) === code.slice(0, 4));
      if (parent) nodeOfCategory.set(c.id, parent.code);
    }

    // Categories in scope of a division, or of one section / subclass of it.
    const categoriesIn = (divisionCode: string, nodeCode: string | null) =>
      categories.filter((c) => {
        if (c.division_code !== divisionCode) return false;
        if (!nodeCode) return true;
        const node = nodeOfCategory.get(c.id);
        return node === nodeCode || (node != null && sectionByCode.get(node)?.parent_code === nodeCode);
      });
    const materialsIn = (divisionCode: string, nodeCode: string | null) =>
      categoriesIn(divisionCode, nodeCode).flatMap((c) => materialsByCategory.get(c.id) ?? []);

    return { sectionsByDivision, childrenByParent, sectionByCode, materialsByCategory, categoriesIn, materialsIn };
  }, [sections, categories, materials]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hit = (code: string, name: string) => code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    const visible = divisions.filter((d) => {
      if (!q) return true;
      if (hit(d.code, d.name)) return true;
      return sections.some((s) => s.division_code === d.code && hit(s.code, s.name));
    });
    const names = [...DIVISION_GROUPS as readonly string[]];
    for (const d of visible) {
      const g = d.group_name || OTHER_GROUP;
      if (!names.includes(g)) names.push(g);
    }
    return names
      .map((name) => ({ name, divisions: visible.filter((d) => (d.group_name || OTHER_GROUP) === name) }))
      .filter((g) => g.divisions.length > 0);
  }, [divisions, sections, search]);

  const selectedDivision = divisions.find((d) => d.code === selectedDivisionCode) ?? null;
  const selectedNode = selectedNodeCode ? model.sectionByCode.get(selectedNodeCode) ?? null : null;
  const scopeCategories = selectedDivision ? model.categoriesIn(selectedDivision.code, selectedNodeCode) : [];
  const scopeMaterials = selectedDivision ? model.materialsIn(selectedDivision.code, selectedNodeCode) : [];
  const unclassifiedCount = materials.length - divisions.reduce((n, d) => n + model.materialsIn(d.code, null).length, 0);

  function toggleExpand(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function select(divisionCode: string, nodeCode: string | null) {
    setSelectedDivisionCode(divisionCode);
    setSelectedNodeCode(nodeCode);
  }

  async function assignCategory(categoryId: string, divisionCode: string | null) {
    const { error } = await updateDwlMaterialCategoryById({ division_code: divisionCode }, categoryId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(divisionCode ? `Category moved to division ${divisionCode}` : "Category removed from division");
    await loadData();
  }

  async function handleDeleteSection() {
    if (!deleteSection) return;
    setSaving(true);
    const { error } = await deleteDwlMaterialDivisionSectionById(deleteSection.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${deleteSection.code} deleted`);
    if (selectedNodeCode === deleteSection.code) setSelectedNodeCode(null);
    setDeleteSection(null);
    await loadData();
  }

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Cost &amp; Rate Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Network className="h-5 w-5 text-muted-foreground" /> MasterFormat Divisions
          </h1>
          <p className="text-sm text-muted-foreground">
            {divisions.length} divisions, {sections.length} sections — the classification hierarchy above the Material Master categories.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/qs/dwl-materials"><Package className="h-3.5 w-3.5" /> Material Master</Link>
          </Button>
          <Button size="sm" onClick={() => setDivisionDialog({ edit: null })} disabled={!canCreate} title={!canCreate ? "You lack create permission on QS libraries" : undefined}>
            <Plus className="h-3.5 w-3.5" /> Add Division
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Skeleton className="h-96 lg:col-span-7" />
          <Skeleton className="h-96 lg:col-span-5" />
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load divisions: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-12">
          {/* Hierarchy tree */}
          <div className="flex flex-col gap-4 border-b border-border p-4 lg:col-span-7 lg:border-b-0 lg:border-r">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search division or section code / name..." className="pl-8" />
            </div>

            <div className="flex max-h-[calc(100vh-18rem)] flex-col gap-4 overflow-y-auto pr-1">
              {groups.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">No divisions match your search.</p>
              )}
              {groups.map((group) => (
                <div key={group.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>{group.name}</span>
                    <span className="font-mono text-[10px]">{group.divisions.length} Divisions</span>
                  </div>

                  <div className="flex flex-col gap-1 pl-1">
                    {group.divisions.map((div) => {
                      const divSections = model.sectionsByDivision.get(div.code) ?? [];
                      const isOpen = expanded.has(div.code) || (search.trim() !== "" && divSections.length > 0);
                      const isSelected = selectedDivisionCode === div.code && !selectedNodeCode;
                      const count = model.materialsIn(div.code, null).length;
                      return (
                        <div key={div.code} className="flex flex-col gap-1">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => select(div.code, null)}
                            onKeyDown={(e) => { if (e.key === "Enter") select(div.code, null); }}
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-2 rounded-lg p-2 transition-colors",
                              isSelected ? "bg-foreground font-semibold text-background" : "hover:bg-muted",
                              !div.is_active && "opacity-50",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {divSections.length > 0 ? (
                                <button
                                  type="button"
                                  aria-label={isOpen ? "Collapse" : "Expand"}
                                  onClick={(e) => { e.stopPropagation(); toggleExpand(div.code); }}
                                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                                >
                                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              ) : (
                                <span className="w-[18px]" />
                              )}
                              {isOpen
                                ? <FolderOpen className={cn("h-4 w-4 shrink-0", isSelected ? "text-amber-400" : "text-amber-600")} />
                                : <Folder className={cn("h-4 w-4 shrink-0", isSelected ? "text-amber-400" : "text-amber-600")} />}
                              <span className="rounded bg-muted-foreground/15 px-1.5 font-mono text-xs font-bold">{div.code}</span>
                              <span className="truncate text-xs">{div.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
                              {divSections.length > 0 && (
                                <span className={cn("rounded px-1.5 py-0.5 text-[10px]", isSelected ? "bg-background/15" : "bg-muted text-muted-foreground")}>
                                  {divSections.length} sec
                                </span>
                              )}
                              <span className={isSelected ? "opacity-80" : "text-muted-foreground"}>{count} mat</span>
                            </div>
                          </div>

                          {isOpen && divSections.length > 0 && (
                            <div className="my-1 ml-6 flex flex-col gap-1 border-l-2 border-border pl-3">
                              {divSections.map((sec) => {
                                const subs = model.childrenByParent.get(sec.code) ?? [];
                                const secOpen = expanded.has(sec.code) || search.trim() !== "";
                                const secSelected = selectedNodeCode === sec.code;
                                return (
                                  <div key={sec.code} className="flex flex-col gap-1">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => select(div.code, sec.code)}
                                      onKeyDown={(e) => { if (e.key === "Enter") select(div.code, sec.code); }}
                                      className={cn(
                                        "flex cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent p-1.5 text-xs transition-colors",
                                        secSelected
                                          ? "border-amber-300 bg-amber-100 font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                                          : "hover:bg-muted",
                                      )}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        {subs.length > 0 ? (
                                          <button
                                            type="button"
                                            aria-label={secOpen ? "Collapse" : "Expand"}
                                            onClick={(e) => { e.stopPropagation(); toggleExpand(sec.code); }}
                                            className="rounded p-0.5 hover:bg-muted-foreground/20"
                                          >
                                            {secOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                          </button>
                                        ) : (
                                          <span className="w-4" />
                                        )}
                                        <span className="rounded bg-muted px-1 font-mono text-[11px] font-semibold text-muted-foreground">{sec.code}</span>
                                        <span className="truncate">{sec.name}</span>
                                      </div>
                                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                        {subs.length > 0 ? `${subs.length} sub · ` : ""}{model.materialsIn(div.code, sec.code).length} mat
                                      </span>
                                    </div>

                                    {secOpen && subs.length > 0 && (
                                      <div className="my-0.5 ml-5 flex flex-col gap-1 border-l-2 border-amber-200 pl-3 dark:border-amber-900">
                                        {subs.map((sub) => {
                                          const subSelected = selectedNodeCode === sub.code;
                                          return (
                                            <div
                                              key={sub.code}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => select(div.code, sub.code)}
                                              onKeyDown={(e) => { if (e.key === "Enter") select(div.code, sub.code); }}
                                              className={cn(
                                                "flex cursor-pointer items-center justify-between gap-2 rounded border border-transparent p-1.5 text-[11px] transition-colors",
                                                subSelected
                                                  ? "border-sky-300 bg-sky-100 font-bold text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200"
                                                  : "text-muted-foreground hover:bg-muted",
                                              )}
                                            >
                                              <div className="flex min-w-0 items-center gap-2">
                                                <FileCode className="h-3 w-3 shrink-0 text-sky-600" />
                                                <span className="font-mono text-[10px] font-semibold">{sub.code}</span>
                                                <span className="truncate">{sub.name}</span>
                                              </div>
                                              <span className="shrink-0 font-mono text-[10px] tabular-nums">{model.materialsIn(div.code, sub.code).length}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {unclassifiedCount > 0 && (
              <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
                {unclassifiedCount} material{unclassifiedCount === 1 ? "" : "s"} not in any division — a material takes its division from its category.
              </p>
            )}
          </div>

          {/* Inspector */}
          <div className="flex flex-col gap-4 bg-muted/30 p-5 lg:col-span-5">
            {!selectedDivision ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
                <Layers className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Select a division to see its sections, categories and materials.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hierarchy Inspector</span>
                  <div className="flex items-center gap-1">
                    {canEdit && !selectedNode && (
                      <Button variant="ghost" size="sm" onClick={() => setDivisionDialog({ edit: selectedDivision })}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    {canDelete && selectedNode && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteSection(selectedNode)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                    {canCreate && (
                      <Button variant="outline" size="sm" onClick={() => setSectionDialogOpen(true)}>
                        <Plus className="h-3.5 w-3.5" /> Add Section
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                  <span className="text-[11px] font-semibold text-muted-foreground">CSI MasterFormat path</span>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold">Division {selectedDivision.code}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold">{selectedDivision.name}</span>
                    {selectedNode?.parent_code && (
                      <>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{selectedNode.parent_code}</span>
                      </>
                    )}
                    {selectedNode && (
                      <>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">{selectedNode.code}</span>
                        <span className="font-medium">{selectedNode.name}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-xs">
                  <Row label="Group" value={selectedDivision.group_name ?? "—"} />
                  <Row label="Sections" value={String((model.sectionsByDivision.get(selectedDivision.code) ?? []).length)} mono />
                  <Row label="Categories in scope" value={String(scopeCategories.length)} mono />
                  <Row label="Materials in scope" value={String(scopeMaterials.length)} mono accent />
                  {!selectedDivision.is_active && <Badge variant="secondary" className="self-start">Inactive</Badge>}
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Categories ({scopeCategories.length})</span>
                  {scopeCategories.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground">
                      No Material Master category under this branch yet.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {scopeCategories.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{c.code ?? "—"} · {c.cost_code_prefix ?? "no cost code prefix"}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{(model.materialsByCategory.get(c.id) ?? []).length} mat</span>
                            {canEdit && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Remove from this division" onClick={() => void assignCategory(c.id, null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit && !selectedNode && categories.some((c) => c.division_code !== selectedDivision.code) && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) void assignCategory(e.target.value, selectedDivision.code); }}
                      className={cn(selectClass, "bg-card text-xs")}
                      aria-label="Add a category to this division"
                    >
                      <option value="">+ Add a category to division {selectedDivision.code}...</option>
                      {categories.filter((c) => c.division_code !== selectedDivision.code).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.division_code ? ` (now in ${c.division_code})` : " (no division)"}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Materials ({scopeMaterials.length})</span>
                    {scopeMaterials.length > 0 && (
                      <Link href={`/dashboard/qs/dwl-materials?division=${encodeURIComponent(selectedDivision.code)}`} className="text-[11px] font-medium text-primary hover:underline">
                        Open in Material Master
                      </Link>
                    )}
                  </div>
                  {scopeMaterials.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground">
                      No materials registered under this branch yet.
                    </div>
                  ) : (
                    <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
                      {scopeMaterials.map((m) => (
                        <Link
                          key={m.resource_id}
                          href={`/dashboard/qs/dwl-materials/${m.resource_id}`}
                          className={cn("flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs transition-colors hover:border-foreground/40", !m.is_active && "opacity-50")}
                        >
                          <span className="min-w-0 truncate">
                            <span className="mr-1.5 font-mono font-bold">{m.code}</span>
                            <span className="font-medium">{m.material_name}</span>
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{m.category_name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {divisionDialog && (
        <DivisionDialog
          edit={divisionDialog.edit}
          existingCodes={divisions.map((d) => d.code)}
          nextSortOrder={(divisions.at(-1)?.sort_order ?? 0) + 10}
          onClose={() => setDivisionDialog(null)}
          onSaved={async (code) => {
            setDivisionDialog(null);
            select(code, null);
            await loadData();
          }}
        />
      )}

      {sectionDialogOpen && selectedDivision && (
        <SectionDialog
          division={selectedDivision}
          parents={model.sectionsByDivision.get(selectedDivision.code) ?? []}
          defaultParentCode={selectedNode ? selectedNode.parent_code ?? selectedNode.code : ""}
          existingCodes={sections.map((s) => s.code)}
          onClose={() => setSectionDialogOpen(false)}
          onSaved={async (code, parentCode) => {
            setSectionDialogOpen(false);
            setExpanded((prev) => new Set([...prev, selectedDivision.code, ...(parentCode ? [parentCode] : [])]));
            select(selectedDivision.code, code);
            await loadData();
          }}
        />
      )}

      <Dialog open={deleteSection != null} onOpenChange={(open) => { if (!open) setDeleteSection(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteSection?.code}</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteSection?.name}&quot;{deleteSection && !deleteSection.parent_code ? " and its subclasses" : ""}? Categories and materials are not changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteSection(null)} disabled={saving}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDeleteSection()} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", mono && "font-mono", accent && "text-emerald-600")}>{value}</span>
    </div>
  );
}

function DivisionDialog({
  edit, existingCodes, nextSortOrder, onClose, onSaved,
}: {
  edit: DwlMaterialDivision | null;
  existingCodes: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [groupName, setGroupName] = useState(edit?.group_name ?? DIVISION_GROUPS[1]);
  const [isActive, setIsActive] = useState(edit?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode || !name.trim()) return;
    if (!edit && existingCodes.includes(trimmedCode)) {
      toast.error(`Division ${trimmedCode} already exists`);
      return;
    }
    setSaving(true);
    const { error } = edit
      ? await updateDwlMaterialDivisionByCode({ name: name.trim(), group_name: groupName, is_active: isActive }, edit.code)
      : await insertDwlMaterialDivision({ code: trimmedCode, name: name.trim(), group_name: groupName, is_active: isActive, sort_order: nextSortOrder });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(edit ? "Division updated" : "Division created");
    await onSaved(trimmedCode);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? `Edit Division ${edit.code}` : "New Division"}</DialogTitle>
          <DialogDescription>A MasterFormat division groups Material Master categories.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1 flex flex-col gap-1.5">
              <Label htmlFor="division-code">Code *</Label>
              <Input id="division-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="03" maxLength={4} disabled={!!edit} required className="font-mono" />
            </div>
            <div className="col-span-3 flex flex-col gap-1.5">
              <Label htmlFor="division-name">Name *</Label>
              <Input id="division-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Concrete" required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="division-group">Group</Label>
            <select id="division-group" value={groupName} onChange={(e) => setGroupName(e.target.value)} className={selectClass}>
              {[...new Set([...DIVISION_GROUPS, groupName])].map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} /> Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {edit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionDialog({
  division, parents, defaultParentCode, existingCodes, onClose, onSaved,
}: {
  division: DwlMaterialDivision;
  parents: DwlMaterialDivisionSection[];
  defaultParentCode: string;
  existingCodes: string[];
  onClose: () => void;
  onSaved: (code: string, parentCode: string | null) => Promise<void>;
}) {
  const [code, setCode] = useState(`${division.code} `);
  const [name, setName] = useState("");
  const [parentCode, setParentCode] = useState(defaultParentCode);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().replace(/\s+/g, " ");
    if (!trimmedCode || !name.trim()) return;
    if (existingCodes.includes(trimmedCode)) {
      toast.error(`Section ${trimmedCode} already exists`);
      return;
    }
    setSaving(true);
    const { error } = await insertDwlMaterialDivisionSection({
      division_code: division.code, code: trimmedCode, name: name.trim(), parent_code: parentCode || null,
      // Codes sort the same way MasterFormat orders them.
      sort_order: Number(trimmedCode.replace(/\D/g, "").slice(2, 6)) || 0,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Section created");
    await onSaved(trimmedCode, parentCode || null);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Section in Division {division.code}</DialogTitle>
          <DialogDescription>Add a section, or a subclass under an existing section.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="section-parent">Under</Label>
            <select id="section-parent" value={parentCode} onChange={(e) => setParentCode(e.target.value)} className={selectClass}>
              <option value="">Division {division.code} — {division.name} (new section)</option>
              {parents.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name} (new subclass)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 flex flex-col gap-1.5">
              <Label htmlFor="section-code">Code *</Label>
              <Input id="section-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${division.code} 10 00`} required className="font-mono" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="section-name">Title *</Label>
              <Input id="section-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Section title" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
