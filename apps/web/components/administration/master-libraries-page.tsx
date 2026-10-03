"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LevelTemplateEditor } from "./level-template-editor";
import { WbsTemplateEditor } from "./wbs-template-editor";
import { BookTemplate, Download, Loader2, Pencil, Plus, Search, ToggleLeft, ToggleRight, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import {
  csvRowsToMasterRecords,
  getMasterLibraryDefinition,
  listMasterLibraryItems,
  MASTER_LIBRARY_DEFINITIONS,
  masterLibraryCsvRows,
  parseCsv,
  setMasterLibraryActive,
  upsertMasterLibraryItem,
} from "@/lib/master-libraries";
import type { MasterLibraryRecord, MasterLibraryType, TaskTemplateMasterRecord } from "@/components/project/wbs/wbs-types";

type LibraryRecord = MasterLibraryRecord | TaskTemplateMasterRecord;

function emptyRecord(type: MasterLibraryType): Partial<TaskTemplateMasterRecord> {
  if (type === "task_template") {
    return {
      code: "",
      name: "",
      category: "Construction Tasks",
      default_duration: 1,
      duration_unit: "days",
      default_priority: "medium",
      milestone: false,
      approval_required: false,
      requires_document: false,
      requires_photo: false,
      requires_checklist: false,
      requires_inspection: false,
      is_active: true,
    };
  }
  return { code: "", name: "", type: "", category: "", discipline: "", description: "", sequence_no: 0, sort_order: 0, is_active: true };
}

function taskRequirementLabel(record: LibraryRecord) {
  const task = record as TaskTemplateMasterRecord;
  const requirements = [
    task.requires_document ? "Doc" : null,
    task.requires_photo ? "Photo" : null,
    task.requires_checklist ? "Checklist" : null,
    task.requires_inspection ? "Inspection" : null,
    task.approval_required ? "Approval" : null,
    task.milestone ? "Milestone" : null,
  ].filter(Boolean);
  return requirements.length ? requirements.join(", ") : "-";
}

export function MasterLibrariesPage() {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeType, setActiveType] = useState<MasterLibraryType>("phase");
  // Template tabs: Level Templates (level sets copied into a building) and WBS Templates (full WBS copied into a project).
  const [templateTab, setTemplateTab] = useState<"level_templates" | "wbs_templates" | null>(null);
  const [records, setRecords] = useState<LibraryRecord[]>([]);
  const [phaseOptions, setPhaseOptions] = useState<MasterLibraryRecord[]>([]);
  const [disciplineOptions, setDisciplineOptions] = useState<MasterLibraryRecord[]>([]);
  const [taskGroupOptions, setTaskGroupOptions] = useState<MasterLibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("");
  const [taskGroupFilter, setTaskGroupFilter] = useState<string>("");
  const [editing, setEditing] = useState<Partial<TaskTemplateMasterRecord> | null>(null);

  const definition = getMasterLibraryDefinition(activeType);
  const singularLabel = definition.label.slice(0, -1);

  async function load() {
    setLoading(true);
    try {
      setRecords(await listMasterLibraryItems(supabase, activeType));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load master library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listMasterLibraryItems(supabase, activeType)
      .then((items) => {
        if (!cancelled) setRecords(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load master library");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeType, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadReferenceOptions() {
      try {
        const [phases, disciplines, taskGroups] = await Promise.all([
          listMasterLibraryItems(supabase, "phase"),
          listMasterLibraryItems(supabase, "discipline"),
          listMasterLibraryItems(supabase, "task_group"),
        ]);
        if (cancelled) return;
        setPhaseOptions(phases.filter((item) => item.is_active));
        setDisciplineOptions(disciplines.filter((item) => item.is_active));
        setTaskGroupOptions(taskGroups.filter((item) => item.is_active));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load task template references");
      }
    }
    void loadReferenceOptions();
    return () => { cancelled = true; };
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (!showInactive && !record.is_active) return false;
      if (categoryFilter && record.category !== categoryFilter) return false;
      const task = record as TaskTemplateMasterRecord;
      if (disciplineFilter && task.discipline_code !== disciplineFilter) return false;
      if (taskGroupFilter && task.task_group_code !== taskGroupFilter) return false;
      if (!q) return true;
      return [
        record.code,
        record.name,
        record.type,
        record.category,
        record.discipline,
        record.description,
        task.default_priority,
        task.auto_assign_role,
        task.deliverable,
        task.required_document,
        task.phase_code,
        task.discipline_code,
        task.task_group_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [records, search, showInactive, categoryFilter, disciplineFilter, taskGroupFilter]);

  async function saveRecord() {
    if (!editing?.code?.trim() || !editing?.name?.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      await upsertMasterLibraryItem(supabase, activeType, editing as Partial<MasterLibraryRecord>);
      toast.success(editing.id ? "Library item updated" : "Library item created");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save library item");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(record: LibraryRecord) {
    try {
      await setMasterLibraryActive(supabase, activeType, record.id, !record.is_active);
      setRecords((prev) => prev.map((item) => item.id === record.id ? { ...item, is_active: !record.is_active } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update item");
    }
  }

  function exportCsv() {
    downloadCsv(`${activeType}-master-library.csv`, masterLibraryCsvRows(activeType, records));
  }

  async function importCsv(file: File) {
    try {
      const rows = parseCsv(await file.text());
      const parsed = csvRowsToMasterRecords(activeType, rows);
      const seen = new Set<string>();
      for (const record of parsed) {
        const key = record.code?.toUpperCase();
        if (!key) throw new Error("Every CSV row must include a code.");
        if (seen.has(key)) throw new Error(`Duplicate code in CSV: ${key}`);
        seen.add(key);
      }
      for (const record of parsed) {
        const existing = records.find((item) => item.code.toUpperCase() === record.code?.toUpperCase());
        await upsertMasterLibraryItem(supabase, activeType, { ...record, id: existing?.id });
      }
      toast.success(`${parsed.length} row${parsed.length !== 1 ? "s" : ""} imported`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to import CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const categoryOptions = useMemo(() => {
    const cats = new Set(records.map((r) => r.category).filter(Boolean));
    return [...cats].sort() as string[];
  }, [records]);

  function updateEditing(field: keyof TaskTemplateMasterRecord, value: string | boolean | number | null) {
    setEditing((prev) => ({ ...(prev ?? emptyRecord(activeType)), [field]: value }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <BookTemplate className="h-5 w-5 text-slate-500" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Master Libraries</h1>
            <p className="text-xs text-slate-500">PMO-maintained project generation libraries</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-2", templateTab && "hidden")}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }}
          />
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setEditing(emptyRecord(activeType))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New {singularLabel}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 pt-3">
          <div className="scrollbar-hidden flex gap-1 overflow-x-auto">
            {MASTER_LIBRARY_DEFINITIONS.map((item) => (
              <Fragment key={item.type}>
                <button
                  type="button"
                  onClick={() => { setTemplateTab(null); if (item.type !== activeType) setLoading(true); setActiveType(item.type); setEditing(null); setSearch(""); setCategoryFilter(""); setDisciplineFilter(""); setTaskGroupFilter(""); }}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    !templateTab && activeType === item.type
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </button>
                {item.type === "stage" && ([["level_templates", "Level Templates"], ["wbs_templates", "WBS Templates"]] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setTemplateTab(tab); setEditing(null); }}
                    className={cn(
                      "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      templateTab === tab
                        ? "border-slate-900 text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-900",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        {templateTab === "level_templates" ? <LevelTemplateEditor /> : templateTab === "wbs_templates" ? <WbsTemplateEditor /> : (
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{definition.label}</h2>
              <p className="text-xs text-slate-500">{filtered.length} visible of {records.length} total</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
                Show inactive
              </label>
              {(activeType === "task_template" || activeType === "task_group") && (
                <>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400"
                  >
                    <option value="">Category</option>
                    {categoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {activeType === "task_template" && (
                    <>
                      <select
                        value={disciplineFilter}
                        onChange={(event) => setDisciplineFilter(event.target.value)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400"
                      >
                        <option value="">Discipline</option>
                        {disciplineOptions.map((d) => <option key={d.id} value={d.code}>{d.code}</option>)}
                      </select>
                      <select
                        value={taskGroupFilter}
                        onChange={(event) => setTaskGroupFilter(event.target.value)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400"
                      >
                        <option value="">Task Group</option>
                        {taskGroupOptions.map((g) => <option key={g.id} value={g.code}>{g.code}</option>)}
                      </select>
                    </>
                  )}
                  {(categoryFilter || disciplineFilter || taskGroupFilter) && (
                    <button type="button" onClick={() => { setCategoryFilter(""); setDisciplineFilter(""); setTaskGroupFilter(""); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                  )}
                </>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search library..."
                  className="h-8 w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    {activeType === "task_template" ? (
                      <tr>
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Task Name</th>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2">Discipline</th>
                        <th className="px-4 py-2">Task Group</th>
                        <th className="px-4 py-2">Duration</th>
                        <th className="px-4 py-2">Priority</th>
                        <th className="px-4 py-2">Requirements</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    ) : activeType === "stage" ? (
                      <tr>
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Stage Name</th>
                        <th className="px-4 py-2">Order</th>
                        <th className="px-4 py-2">Description</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Category / Type</th>
                        <th className="px-4 py-2">Discipline</th>
                        <th className="px-4 py-2">Order</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        {activeType === "task_template" ? (
                          <>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{record.code}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{record.name}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{record.category ?? "-"}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{(record as TaskTemplateMasterRecord).discipline_code ?? "-"}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{(record as TaskTemplateMasterRecord).task_group_code ?? "-"}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">
                              {(record as TaskTemplateMasterRecord).default_duration ?? "-"} {(record as TaskTemplateMasterRecord).duration_unit ?? "days"}
                            </td>
                            <td className="px-4 py-2 text-xs capitalize text-slate-500">{(record as TaskTemplateMasterRecord).default_priority ?? "medium"}</td>
                            <td className="max-w-48 px-4 py-2 text-xs text-slate-500">{taskRequirementLabel(record)}</td>
                          </>
                        ) : activeType === "stage" ? (
                          <>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{record.code}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{record.name}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{record.sequence_no ?? "-"}</td>
                            <td className="max-w-80 px-4 py-2 text-xs text-slate-500">{record.description ?? "-"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{record.code}</td>
                            <td className="px-4 py-2 font-medium text-slate-900">{record.name}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{record.category ?? record.type ?? record.description ?? "-"}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{record.discipline ?? "-"}</td>
                            <td className="px-4 py-2 text-xs text-slate-500">{record.sequence_no ?? record.sort_order ?? "-"}</td>
                          </>
                        )}
                        <td className="px-4 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", record.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                            {record.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setEditing(record)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => void toggleActive(record)}>
                              {record.is_active ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={activeType === "task_template" ? 10 : activeType === "stage" ? 6 : 7} className="px-4 py-10 text-center text-sm text-slate-400">No library items found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className={cn("relative z-10 max-h-[90vh] w-full overflow-hidden rounded-xl bg-white shadow-xl", activeType === "task_template" ? "max-w-4xl" : "max-w-lg")}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">{editing.id ? "Edit" : "New"} {singularLabel}</h2>
              <button type="button" onClick={() => setEditing(null)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <div className="max-h-[calc(90vh-130px)] overflow-y-auto p-5">
              {activeType === "task_template" ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Task Code *</Label>
                      <input value={editing.code ?? ""} onChange={(event) => updateEditing("code", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Task Name *</Label>
                      <input value={editing.name ?? ""} onChange={(event) => updateEditing("name", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <Label className="text-xs">Category</Label>
                      <select value={editing.category ?? ""} onChange={(event) => updateEditing("category", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                        {["Design Tasks", "Procurement Tasks", "Construction Tasks", "QAQC Tasks", "HSE Tasks", "Inspection Tasks", "Testing Tasks", "Commissioning Tasks", "Handover Tasks", "Administration Tasks"].map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Phase</Label>
                      <select value={editing.phase_id ?? ""} onChange={(event) => updateEditing("phase_id", event.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                        <option value="">None</option>
                        {phaseOptions.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Discipline</Label>
                      <select value={editing.discipline_id ?? ""} onChange={(event) => updateEditing("discipline_id", event.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                        <option value="">None</option>
                        {disciplineOptions.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Task Group</Label>
                      <select value={editing.task_group_id ?? ""} onChange={(event) => updateEditing("task_group_id", event.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                        <option value="">None</option>
                        {taskGroupOptions.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <Label className="text-xs">Duration</Label>
                      <input type="number" min={0} value={editing.default_duration ?? 1} onChange={(event) => updateEditing("default_duration", Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <input value={editing.duration_unit ?? "days"} onChange={(event) => updateEditing("duration_unit", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Weight</Label>
                      <input type="number" min={0} step="0.01" value={editing.default_weight ?? ""} onChange={(event) => updateEditing("default_weight", event.target.value === "" ? null : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <select value={editing.default_priority ?? "medium"} onChange={(event) => updateEditing("default_priority", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                        {["low", "medium", "high", "critical"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs">Responsible Role</Label>
                      <input value={editing.auto_assign_role ?? ""} onChange={(event) => updateEditing("auto_assign_role", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Predecessor</Label>
                      <input value={editing.predecessor ?? ""} onChange={(event) => updateEditing("predecessor", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Successor</Label>
                      <input value={editing.successor ?? ""} onChange={(event) => updateEditing("successor", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs">Deliverable</Label>
                      <input value={editing.deliverable ?? ""} onChange={(event) => updateEditing("deliverable", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Required Document</Label>
                      <input value={editing.required_document ?? ""} onChange={(event) => updateEditing("required_document", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Approval Workflow</Label>
                      <input value={editing.approval_workflow ?? ""} onChange={(event) => updateEditing("approval_workflow", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
                    {[
                      ["milestone", "Milestone"],
                      ["approval_required", "Approval"],
                      ["requires_document", "Document"],
                      ["requires_photo", "Photo"],
                      ["requires_checklist", "Checklist"],
                      ["requires_inspection", "Inspection"],
                      ["is_active", "Active"],
                    ].map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        <input type="checkbox" checked={Boolean(editing[field as keyof TaskTemplateMasterRecord])} onChange={(event) => updateEditing(field as keyof TaskTemplateMasterRecord, event.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs">Dependency</Label>
                      <textarea value={editing.dependency ?? ""} onChange={(event) => updateEditing("dependency", event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <textarea value={editing.description ?? ""} onChange={(event) => updateEditing("description", event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Remarks</Label>
                      <textarea value={editing.remarks ?? ""} onChange={(event) => updateEditing("remarks", event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Code *</Label>
                      <input value={editing.code ?? ""} onChange={(event) => updateEditing("code", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                    <div>
                      <Label className="text-xs">Name *</Label>
                      <input value={editing.name ?? ""} onChange={(event) => updateEditing("name", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  </div>
                  {(definition.extraFields.includes("building_type") || definition.extraFields.includes("level_type")) && (
                    <div>
                      <Label className="text-xs">Type</Label>
                      <input value={editing.type ?? ""} onChange={(event) => updateEditing("type", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  )}
                  {definition.extraFields.includes("category") && (
                    <div>
                      <Label className="text-xs">Category</Label>
                      <input value={editing.category ?? ""} onChange={(event) => updateEditing("category", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  )}
                  {definition.extraFields.includes("discipline") && (
                    <div>
                      <Label className="text-xs">Discipline</Label>
                      <input value={editing.discipline ?? ""} onChange={(event) => updateEditing("discipline", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  )}
                  {(definition.extraFields.includes("sequence_no") || definition.extraFields.includes("sort_order")) && (
                    <div>
                      <Label className="text-xs">Order</Label>
                      <input type="number" value={editing.sequence_no ?? editing.sort_order ?? 0} onChange={(event) => updateEditing(definition.extraFields.includes("sequence_no") ? "sequence_no" : "sort_order", Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  )}
                  {definition.extraFields.includes("description") && (
                    <div>
                      <Label className="text-xs">Description</Label>
                      <textarea value={editing.description ?? ""} onChange={(event) => updateEditing("description", event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={editing.is_active ?? true} onChange={(event) => updateEditing("is_active", event.target.checked)} />
                    Active
                  </label>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button variant="outline" className="rounded-lg" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="rounded-lg bg-slate-900" onClick={() => void saveRecord()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
