"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Copy, ListChecks, ShieldAlert, Search, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  deleteTemplate,
  listActivityStepTemplates,
  listTemplateItems,
  saveTemplate,
  totalWeight,
  type ActivityStepTemplate,
  type DurationBasis,
  type StepDraft,
} from "@/lib/planning/activity-steps-service";
import { PROJECT_SECTORS, sectorLabel } from "@/lib/project-categories";
import { TemplateSectorFields } from "@/components/administration/template-sector-fields";

interface EditableTemplate {
  id?: string;
  group_name: string;
  template_name: string;
  description: string;
  is_active: boolean;
  /** Sector slug; "" = common to every building type. */
  template_category: string;
  building_types: string[];
}

function emptyTemplate(defaultGroup: string): EditableTemplate {
  return { group_name: defaultGroup, template_name: "", description: "", is_active: true, template_category: "", building_types: [] };
}

/** Sector filter values besides the sector slugs. */
const ALL_SECTORS = "__all__";
const COMMON = "__common__";

function reorder(items: StepDraft[]): StepDraft[] {
  return items.map((it, i) => ({ ...it, step_no: i + 1 }));
}

export function PlanActivityStepTemplates() {
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<ActivityStepTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableTemplate>(emptyTemplate("Architectural Finishes"));
  const [items, setItems] = useState<StepDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("__all__");
  const [sectorFilter, setSectorFilter] = useState<string>(ALL_SECTORS);
  const [showInactive, setShowInactive] = useState(true);

  // ?template=<id> (e.g. from an Activity Master's Planning card) opens that template on first load;
  // ?new=<name> (from an activity's Activity Steps picker) starts a new template with that name
  const params = useSearchParams();
  const requestedId = params.get("template");
  const newName = params.get("new");

  async function reload(openRequested = false) {
    setLoading(true);
    try {
      const list = await listActivityStepTemplates(supabase);
      setTemplates(list);
      const requested = openRequested && requestedId ? list.find((t) => t.id === requestedId) : null;
      if (requested) void selectTemplate(requested);
      else if (openRequested && newName !== null) {
        setSelectedId(null);
        setForm({ ...emptyTemplate([...list.map((t) => t.group_name)].sort()[0] ?? "Architectural Finishes"), template_name: newName });
        setItems([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() flips its own loading flag
  useEffect(() => { void reload(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const set = new Set(templates.map((t) => t.group_name));
    return [...set].sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (groupFilter !== "__all__" && t.group_name !== groupFilter) return false;
      if (sectorFilter === COMMON && t.template_category) return false;
      if (sectorFilter !== ALL_SECTORS && sectorFilter !== COMMON && t.template_category !== sectorFilter) return false;
      if (!showInactive && !t.is_active) return false;
      if (!q) return true;
      return (
        t.template_name.toLowerCase().includes(q) ||
        t.group_name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [templates, search, groupFilter, sectorFilter, showInactive]);

  const sectorOptions = useMemo(() => {
    const used = new Set(templates.map((t) => t.template_category).filter((c): c is string => !!c));
    const ordered = PROJECT_SECTORS.map((s) => s.value).filter((v) => used.has(v));
    return [...ordered, ...[...used].filter((v) => !ordered.includes(v)).sort()];
  }, [templates]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityStepTemplate[]>();
    for (const t of filteredTemplates) {
      const list = map.get(t.group_name) ?? [];
      list.push(t);
      map.set(t.group_name, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTemplates]);

  async function selectTemplate(t: ActivityStepTemplate) {
    setSelectedId(t.id);
    setForm({
      id: t.id, group_name: t.group_name, template_name: t.template_name, description: t.description ?? "", is_active: t.is_active,
      template_category: t.template_category ?? "", building_types: t.building_types,
    });
    setLoadingItems(true);
    try {
      const rows = await listTemplateItems(supabase, t.id);
      setItems(rows.map((r) => ({
        step_no: r.step_no,
        step_name: r.step_name,
        weight: r.weight,
        discipline: r.discipline,
        resource_crew: r.resource_crew,
        est_duration_days: r.est_duration_days,
        duration_basis: r.duration_basis,
        duration_share_pct: r.duration_share_pct,
        inspection_hold_point: r.inspection_hold_point,
        notes: r.notes,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load steps");
    } finally {
      setLoadingItems(false);
    }
  }

  function startNew() {
    setSelectedId(null);
    setForm(emptyTemplate(groups[0] ?? "Architectural Finishes"));
    setItems([]);
  }

  function startDuplicate() {
    if (!selectedId) return;
    setSelectedId(null);
    setForm({ ...form, id: undefined, template_name: `${form.template_name} (Copy)` });
  }

  const weightTotal = totalWeight(items);
  const weightOk = Math.round(weightTotal) === 100;
  const scaledItems = items.filter((it) => it.duration_basis !== "fixed");
  const shareTotal = Math.round(scaledItems.reduce((sum, it) => sum + (Number(it.duration_share_pct) || 0), 0) * 10) / 10;
  const shareOk = scaledItems.length === 0 || Math.round(shareTotal) === 100;
  const fixedDaysTotal = items.filter((it) => it.duration_basis === "fixed").reduce((sum, it) => sum + (Number(it.est_duration_days) || 0), 0);

  async function handleSave() {
    if (!form.group_name.trim() || !form.template_name.trim()) {
      toast.error("Group and template name are required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one step");
      return;
    }
    setSaving(true);
    try {
      const id = await saveTemplate(
        supabase,
        {
          id: form.id, group_name: form.group_name.trim(), template_name: form.template_name.trim(),
          description: form.description.trim() || null, is_active: form.is_active,
          template_category: form.template_category || null, building_types: form.building_types,
        },
        items,
      );
      toast.success("Template saved");
      await reload();
      setSelectedId(id);
      setForm((f) => ({ ...f, id }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!confirm(`Delete template "${form.template_name}"? Activities that already have these steps copied are unaffected.`)) return;
    try {
      await deleteTemplate(supabase, selectedId);
      toast.success("Template deleted");
      startNew();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete template");
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: template list */}
      <div className="flex w-[420px] shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Templates</h2>
          <Button size="sm" className="h-7 rounded-lg px-2" onClick={startNew}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-2 border-b border-border px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates, groups, notes…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-7 text-xs outline-none focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background py-1.5 pl-7 pr-2 text-[11px] outline-none focus:border-primary"
              >
                <option value="__all__">All groups ({templates.length})</option>
                {groups.map((g) => (
                  <option key={g} value={g}>{g} ({templates.filter((t) => t.group_name === g).length})</option>
                ))}
              </select>
            </div>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              aria-label="Sector"
              className="w-28 shrink-0 appearance-none rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:border-primary"
            >
              <option value={ALL_SECTORS}>All sectors</option>
              <option value={COMMON}>Common ({templates.filter((t) => !t.template_category).length})</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>{sectorLabel(s)} ({templates.filter((t) => t.template_category === s).length})</option>
              ))}
            </select>
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
          </div>
          {(search || groupFilter !== "__all__" || sectorFilter !== ALL_SECTORS) && (
            <p className="text-[10px] text-muted-foreground">
              {filteredTemplates.length} of {templates.length} template{templates.length === 1 ? "" : "s"} match
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No templates yet</p>
          ) : grouped.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No templates match your search.</p>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group} className="mb-3">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void selectTemplate(t)}
                    title={t.description ? `${t.template_name} — ${t.description}` : t.template_name}
                    className={cn(
                      "flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                      selectedId === t.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                      !t.is_active && selectedId !== t.id && "opacity-50",
                    )}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="font-medium leading-snug">{t.template_name}</span>
                      {t.template_category && (
                        <span className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                          selectedId === t.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}>
                          {sectorLabel(t.template_category)}
                        </span>
                      )}
                    </span>
                    {t.description && (
                      <span className={cn(
                        "w-full truncate text-[10px] leading-snug",
                        selectedId === t.id ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}>
                        {t.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: template editor */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Group</Label>
            <input
              list="step-template-groups"
              value={form.group_name}
              onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
              placeholder="e.g. Architectural Finishes"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <datalist id="step-template-groups">
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Template name</Label>
            <input
              value={form.template_name}
              onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))}
              placeholder="e.g. Blockwork / Masonry – Typical Floor"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mb-4 space-y-1">
          <Label className="text-[11px]">Description (optional)</Label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <TemplateSectorFields
            sector={form.template_category}
            buildingTypes={form.building_types}
            onChange={(v) => setForm((f) => ({ ...f, template_category: v.sector, building_types: v.buildingTypes }))}
          />
          {!form.template_category && (
            <p className="self-end pb-2 text-xs text-muted-foreground">No sector = common steps, offered for every building type.</p>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Steps</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", weightOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              Total weight: {weightTotal}{weightOk ? "" : " (should be 100)"}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", shareOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              Time: {Math.round(fixedDaysTotal * 10) / 10} d fixed + {shareTotal}% shared{shareOk ? "" : " (shares should total 100)"}
            </span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>

        {loadingItems ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[820px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-2 py-1.5 text-left">#</th>
                  <th className="min-w-[160px] px-2 py-1.5 text-left">Step name</th>
                  <th className="w-16 px-2 py-1.5 text-left">Weight</th>
                  <th className="w-32 px-2 py-1.5 text-left">Discipline</th>
                  <th className="w-36 px-2 py-1.5 text-left">Resource / Crew</th>
                  <th className="w-44 px-2 py-1.5 text-left" title="Fixed: same days on every activity. Scaled: share of the activity's time left after fixed steps, so it grows with quantity.">Duration</th>
                  <th className="w-16 px-2 py-1.5 text-center">Hold pt.</th>
                  <th className="min-w-[140px] px-2 py-1.5 text-left">Notes</th>
                  <th className="w-8 px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-1 text-muted-foreground">{it.step_no}</td>
                    <td className="px-2 py-1">
                      <input
                        value={it.step_name}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, step_name: e.target.value } : p)))}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-border"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        value={it.weight}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, weight: Number(e.target.value) || 0 } : p)))}
                        className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={it.discipline ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, discipline: e.target.value || null } : p)))}
                        placeholder="e.g. Electrical"
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-muted-foreground outline-none focus:border-border"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={it.resource_crew ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, resource_crew: e.target.value || null } : p)))}
                        placeholder="e.g. Masonry Crew"
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-muted-foreground outline-none focus:border-border"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <select
                          value={it.duration_basis ?? "scaled"}
                          onChange={(e) => {
                            const basis = e.target.value as DurationBasis;
                            setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, duration_basis: basis } : p)));
                          }}
                          className="rounded border border-border bg-background px-1 py-0.5 text-[11px] outline-none focus:border-primary"
                        >
                          <option value="scaled">Scaled</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        {it.duration_basis === "fixed" ? (
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={it.est_duration_days ?? ""}
                            onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, est_duration_days: e.target.value === "" ? null : Number(e.target.value) } : p)))}
                            className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={it.duration_share_pct ?? ""}
                            onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, duration_share_pct: e.target.value === "" ? null : Number(e.target.value) } : p)))}
                            className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border"
                          />
                        )}
                        <span className="text-[10px] text-muted-foreground">{it.duration_basis === "fixed" ? "d" : "%"}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={it.inspection_hold_point ?? false}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, inspection_hold_point: e.target.checked } : p)))}
                        title="Inspection hold point"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={it.notes ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((p, pi) => (pi === i ? { ...p, notes: e.target.value } : p)))}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-muted-foreground outline-none focus:border-border"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => reorder(prev.filter((_, pi) => pi !== i)))}
                        className="text-muted-foreground/50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => setItems((prev) => reorder([...prev, { step_no: 0, step_name: "", weight: 0, discipline: null, resource_crew: null, est_duration_days: null, duration_basis: "scaled", duration_share_pct: null, inspection_hold_point: false, notes: null }]))}
              className="flex w-full items-center gap-1.5 border-t border-border px-2 py-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" /> &quot;Hold pt.&quot; marks a QA/QC inspection hold point — work should not proceed past this step without sign-off.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Duration: <span className="font-semibold">Fixed</span> steps take the same days on every activity (setting out, inspection, curing).{" "}
            <span className="font-semibold">Scaled</span> steps share the activity&apos;s remaining time by %, so they grow with its quantity.
            Example: an activity of 10 d with 1.5 d fixed gives a 25% step 2.1 d; at 20 d it gets 4.6 d.
          </p>
          </>
        )}

        <div className="mt-5 flex items-center gap-2">
          <Button size="sm" className="rounded-lg" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Template
          </Button>
          {selectedId && (
            <>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={startDuplicate}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50" onClick={handleDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
