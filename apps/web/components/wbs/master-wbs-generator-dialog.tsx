"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, Search, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MASTER_LIBRARY_DEFINITIONS, WBS_MASTER_LIBRARY_DEFINITIONS, listMasterLibraryItems } from "@/lib/master-libraries";
import { createClient } from "@/lib/supabase/client";
import type { MasterLibraryRecord, MasterLibraryType, TaskTemplateMasterRecord, WbsNodeRecord } from "@/components/wbs/wbs-types";

interface MasterWbsGeneratorDialogProps {
  projectId: string;
  onClose: () => void;
  onGenerated: (targetNodeId?: string | null) => void | Promise<void>;
}

type Step = "select-items" | "select-target" | "confirm" | "placing" | "done";
type LibraryItemsByType = Record<MasterLibraryType, MasterLibraryRecord[]>;
type LibrarySelections = Record<MasterLibraryType, string[]>;

const LIBRARY_TYPES = MASTER_LIBRARY_DEFINITIONS.map((d) => d.type);
const WBS_LIBRARY_TYPES = WBS_MASTER_LIBRARY_DEFINITIONS.map((d) => d.type);

function emptyItems(): LibraryItemsByType {
  return Object.fromEntries(LIBRARY_TYPES.map((t) => [t, []])) as unknown as LibraryItemsByType;
}

function emptySelections(): LibrarySelections {
  return Object.fromEntries(LIBRARY_TYPES.map((t) => [t, []])) as unknown as LibrarySelections;
}

function selectedCount(selections: LibrarySelections) {
  return LIBRARY_TYPES.reduce((sum, t) => sum + selections[t].length, 0);
}

function previewNodeCount(selections: LibrarySelections) {
  let total = 0;
  let branch = 1;
  let hasAny = false;
  for (const t of WBS_LIBRARY_TYPES) {
    const n = selections[t].length;
    if (n === 0) continue;
    hasAny = true;
    branch *= n;
    total += branch;
  }
  return hasAny ? total : 0;
}

function buildGenerationPayload(selections: LibrarySelections) {
  return Object.fromEntries(LIBRARY_TYPES.map((t) => [`${t}_ids`, selections[t]]));
}

function previewTaskCount(selections: LibrarySelections, targetNodeId: string | null | undefined) {
  const taskCount = selections.task_template.length;
  if (taskCount === 0) return 0;
  if (targetNodeId) return taskCount;
  return Math.max(1, previewNodeCount(selections)) * taskCount;
}

function nodeDepth(node: WbsNodeRecord): number {
  if (!node.full_path) return 0;
  return node.full_path.split(" / ").length - 1;
}

const WIZARD_STEPS: { key: Step; label: string }[] = [
  { key: "select-items", label: "Select Items" },
  { key: "select-target", label: "Select Target" },
  { key: "confirm", label: "Confirm" },
];

function StepIndicator({ current }: { current: Step }) {
  const activeIndex = WIZARD_STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 shrink-0">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <span className={`text-xs font-medium ${active ? "text-slate-900" : "text-slate-400"}`}>
                {s.label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        );
      })}
    </div>
  );
}

export function MasterWbsGeneratorDialog({ projectId, onClose, onGenerated }: MasterWbsGeneratorDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  // Step 1: library selection
  const [step, setStep] = useState<Step>("select-items");
  const [activeType, setActiveType] = useState<MasterLibraryType>("phase");
  const [items, setItems] = useState<LibraryItemsByType>(emptyItems);
  const [selections, setSelections] = useState<LibrarySelections>(emptySelections);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [libLoading, setLibLoading] = useState(true);

  // Step 2: target node selection
  const [wbsNodes, setWbsNodes] = useState<WbsNodeRecord[]>([]);
  const [wbsLoading, setWbsLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null | undefined>(undefined); // undefined = nothing chosen yet

  // Done
  const [createdCount, setCreatedCount] = useState(0);

  const activeDef = MASTER_LIBRARY_DEFINITIONS.find((d) => d.type === activeType) ?? MASTER_LIBRARY_DEFINITIONS[0];
  const activeItems = items[activeType];
  const categoryOptions = useMemo(() => {
    return Array.from(new Set(activeItems.map((item) => item.category).filter(Boolean).map(String))).sort();
  }, [activeItems]);
  const disciplineOptions = useMemo(() => {
    return Array.from(new Set(activeItems.map((item) => {
      const task = item as TaskTemplateMasterRecord;
      return task.discipline_code ?? item.discipline;
    }).filter(Boolean).map(String))).sort();
  }, [activeItems]);
  const filteredItems = activeItems.filter((item) => {
    const term = query.trim().toLowerCase();
    const task = item as TaskTemplateMasterRecord;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (disciplineFilter && (task.discipline_code ?? item.discipline) !== disciplineFilter) return false;
    if (!term) return true;
    return `${item.code} ${item.name} ${item.type ?? ""} ${item.category ?? ""} ${item.discipline ?? ""} ${task.default_priority ?? ""} ${task.auto_assign_role ?? ""}`.toLowerCase().includes(term);
  });
  const totalSelected = selectedCount(selections);
  const previewCount = previewNodeCount(selections);
  const taskPreviewCount = previewTaskCount(selections, selectedTargetId);
  const hasTaskSelections = selections.task_template.length > 0;
  const hasWbsSelections = WBS_LIBRARY_TYPES.some((type) => selections[type].length > 0);
  const tasksOnlyWithoutTarget = hasTaskSelections && !hasWbsSelections && selectedTargetId === null;

  // Load master libraries on mount
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLibLoading(true);
      try {
        const entries = await Promise.all(
          LIBRARY_TYPES.map(async (type) => {
            const records = await listMasterLibraryItems(supabase, type);
            return [type, records.filter((r) => r.is_active)] as const;
          }),
        );
        if (!mounted) return;
        setItems(Object.fromEntries(entries) as LibraryItemsByType);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unable to load Master Libraries");
      } finally {
        if (mounted) setLibLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [supabase]);

  // Load WBS nodes when entering step 2
  async function loadWbsNodes() {
    if (wbsNodes.length > 0) return; // already loaded
    setWbsLoading(true);
    try {
      const { data, error } = await supabase
        .from("wbs_nodes")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      setWbsNodes((data as WbsNodeRecord[]) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load WBS nodes");
    } finally {
      setWbsLoading(false);
    }
  }

  function toggleItem(type: MasterLibraryType, itemId: string) {
    setSelections((prev) => ({
      ...prev,
      [type]: prev[type].includes(itemId)
        ? prev[type].filter((id) => id !== itemId)
        : [...prev[type], itemId],
    }));
  }

  function selectVisible(type: MasterLibraryType) {
    const ids = filteredItems.map((i) => i.id);
    setSelections((prev) => ({ ...prev, [type]: Array.from(new Set([...prev[type], ...ids])) }));
  }

  function clearType(type: MasterLibraryType) {
    setSelections((prev) => ({ ...prev, [type]: [] }));
  }

  async function generate() {
    if (tasksOnlyWithoutTarget) {
      toast.error("Task templates must be generated under an existing WBS node. Select a WBS target first.");
      setStep("select-target");
      return;
    }

    setStep("placing");
    const { data, error } = await supabase.rpc("generate_wbs_from_master_library_items", {
      p_project_id: projectId,
      p_target_node_id: selectedTargetId ?? null,
      p_selections: buildGenerationPayload(selections),
    });

    if (error) {
      toast.error(error.message);
      setStep("confirm");
      return;
    }

    const result = Number(data ?? 0);
    if (result === -1) {
      toast.error("Select at least one library item first");
      setStep("confirm");
      return;
    }
    setCreatedCount(result);
    await onGenerated(selectedTargetId ?? null);
    setStep("done");
  }

  const canClose = step !== "placing";

  const targetNode = wbsNodes.find((n) => n.id === selectedTargetId);
  const targetLabel =
    selectedTargetId === null
      ? "Project Root"
      : targetNode
      ? `${targetNode.wbs_code} · ${targetNode.wbs_name}`
      : "—";

  const showIndicator = step === "select-items" || step === "select-target" || step === "confirm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={canClose ? onClose : undefined} />
      <div className="relative z-10 flex max-h-[92vh] w-[96vw] max-w-7xl flex-col rounded-xl bg-white shadow-2xl">

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Wand2 className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Generate from Libraries</h2>
          </div>
          <div className="flex items-center gap-4">
            {showIndicator && <StepIndicator current={step} />}
            {canClose && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">

          {/* STEP 1: Select Items */}
          {step === "select-items" && (
            <div className="space-y-5">
              {/* Library type tabs */}
              <div className="scrollbar-hidden flex items-center gap-2 overflow-x-auto border-b border-slate-200">
                {MASTER_LIBRARY_DEFINITIONS.map((def) => {
                  const type = def.type;
                  const sel = selections[type].length;
                  const active = activeType === type;
                  return (
                    <button
                      key={def.type}
                      type="button"
                      onClick={() => { setActiveType(type); setQuery(""); setCategoryFilter(""); setDisciplineFilter(""); }}
                      className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                        active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <span>{def.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>
                        {sel}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Controls row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{activeDef.label}</p>
                  <p className="text-xs text-slate-500">
                    {activeItems.length} active item{activeItems.length !== 1 ? "s" : ""}, {selections[activeType].length} selected
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search"
                      className="h-9 w-56 rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-slate-400"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-slate-400"
                    disabled={categoryOptions.length === 0}
                  >
                    <option value="">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <select
                    value={disciplineFilter}
                    onChange={(e) => setDisciplineFilter(e.target.value)}
                    className="h-9 w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-slate-400"
                    disabled={disciplineOptions.length === 0}
                  >
                    <option value="">All disciplines</option>
                    {disciplineOptions.map((discipline) => (
                      <option key={discipline} value={discipline}>{discipline}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => selectVisible(activeType)} disabled={filteredItems.length === 0}>
                    Select Visible
                  </Button>
                  <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => clearType(activeType)} disabled={selections[activeType].length === 0}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Item grid */}
              <div className="min-h-72 rounded-lg border border-slate-200 bg-slate-50 p-2">
                {libLoading ? (
                  <div className="flex h-72 items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Master Libraries...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-slate-400">No active items found</div>
                ) : (
                  <div className="grid max-h-[36vh] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
                    {filteredItems.map((item) => {
                      const checked = selections[activeType].includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${
                            checked ? "border-slate-900" : "border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(activeType, item.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{item.code}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600">{item.name}</span>
                            {(item.type || item.category || item.discipline || (item as TaskTemplateMasterRecord).discipline_code) && (
                              <span className="mt-1 block truncate text-[10px] uppercase text-slate-400">
                                {[item.type, item.category, (item as TaskTemplateMasterRecord).discipline_code ?? item.discipline].filter(Boolean).join(" / ")}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preview count */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {previewCount.toLocaleString()} WBS nodes and {taskPreviewCount.toLocaleString()} tasks will be generated
                    </p>
                    <p className="text-xs text-slate-500">Task templates apply to generated leaf nodes, or to the selected target node if no new WBS nodes are selected.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{totalSelected}</p>
                    <p className="text-xs text-slate-500">library selections</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Select Target */}
          {step === "select-target" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Choose where to place the generated nodes</p>
                <p className="mt-0.5 text-xs text-slate-500">Select a WBS node as the parent, or choose Project Root to attach at the top level.</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50">
                {wbsLoading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading WBS tree...
                  </div>
                ) : (
                  <div className="max-h-[52vh] overflow-y-auto divide-y divide-slate-100">
                    {/* Project Root option */}
                    <button
                      type="button"
                      onClick={() => setSelectedTargetId(null)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selectedTargetId === null
                          ? "bg-slate-900 text-white"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        selectedTargetId === null ? "border-white bg-white" : "border-slate-400"
                      }`}>
                        {selectedTargetId === null && <span className="h-2 w-2 rounded-full bg-slate-900" />}
                      </span>
                      <span>
                        <span className={`block text-sm font-semibold ${selectedTargetId === null ? "text-white" : "text-slate-900"}`}>
                          Project Root
                        </span>
                        <span className={`text-xs ${selectedTargetId === null ? "text-slate-300" : "text-slate-500"}`}>
                          {hasTaskSelections && !hasWbsSelections ? "Unavailable when generating only task templates" : "Attach at top level of the WBS"}
                        </span>
                      </span>
                    </button>

                    {/* WBS nodes */}
                    {wbsNodes.length === 0 ? (
                      <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                        No WBS nodes yet — items will be added at Project Root
                      </div>
                    ) : (
                      wbsNodes.map((node) => {
                        const depth = nodeDepth(node);
                        const isSelected = selectedTargetId === node.id;
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => setSelectedTargetId(node.id)}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                              isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                            }`}
                            style={{ paddingLeft: `${16 + depth * 20}px` }}
                          >
                            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              isSelected ? "border-white bg-white" : "border-slate-400"
                            }`}>
                              {isSelected && <span className="h-2 w-2 rounded-full bg-slate-900" />}
                            </span>
                            <span className="min-w-0">
                              <span className={`block truncate text-sm font-medium ${isSelected ? "text-white" : "text-slate-900"}`}>
                                {node.wbs_code} · {node.wbs_name}
                              </span>
                              {node.full_path && (
                                <span className={`block truncate text-[11px] ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                                  {node.full_path}
                                </span>
                              )}
                            </span>
                            {node.node_type && (
                              <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                                isSelected ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"
                              }`}>
                                {node.node_type}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Confirm */}
          {step === "confirm" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Review and generate</p>
                <p className="mt-0.5 text-xs text-slate-500">Confirm your selections before generating the WBS hierarchy.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Library selections summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Library Items Selected</p>
                  <div className="space-y-2">
                    {MASTER_LIBRARY_DEFINITIONS.filter((def) => selections[def.type].length > 0).map((def) => {
                      const type = def.type;
                      return (
                        <div key={def.type} className="flex items-center justify-between">
                          <span className="text-sm text-slate-700">{def.label}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {selections[type].length}
                          </span>
                        </div>
                      );
                    })}
                    {totalSelected === 0 && (
                      <p className="text-sm text-slate-400">No items selected</p>
                    )}
                  </div>
                </div>

                {/* Target node summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Target Location</p>
                  <p className="text-sm font-semibold text-slate-900">{targetLabel}</p>
                  {targetNode?.full_path && (
                    <p className="mt-1 text-xs text-slate-500">{targetNode.full_path}</p>
                  )}
                  {selectedTargetId === null && (
                    <p className={tasksOnlyWithoutTarget ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-slate-500"}>
                      {tasksOnlyWithoutTarget ? "Select an existing WBS node for task templates." : "Generated nodes will appear at the top level"}
                    </p>
                  )}
                </div>
              </div>

              {/* Node count */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      {previewCount.toLocaleString()} WBS nodes and {taskPreviewCount.toLocaleString()} tasks will be generated
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      from {totalSelected} library selection{totalSelected !== 1 ? "s" : ""} across{" "}
                      {MASTER_LIBRARY_DEFINITIONS.filter((d) => selections[d.type].length > 0).length} type{MASTER_LIBRARY_DEFINITIONS.filter((d) => selections[d.type].length > 0).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-700">{(previewCount + taskPreviewCount).toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-600">items</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PLACING */}
          {step === "placing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              <p className="mt-3 text-sm text-slate-600">Generating WBS hierarchy and tasks...</p>
            </div>
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">Library items generated</p>
              <p className="mt-1 text-sm text-slate-500">{createdCount.toLocaleString()} nodes/tasks created under {targetLabel}.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
          <div>
            {step === "select-target" && (
              <Button variant="outline" className="rounded-lg" onClick={() => setStep("select-items")}>
                ← Back
              </Button>
            )}
            {step === "confirm" && (
              <Button variant="outline" className="rounded-lg" onClick={() => setStep("select-target")}>
                ← Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {(step === "select-items" || step === "select-target" || step === "confirm") && (
              <Button variant="outline" className="rounded-lg" onClick={onClose}>
                Cancel
              </Button>
            )}

            {step === "select-items" && (
              <Button
                className="rounded-lg bg-slate-900"
                disabled={libLoading || totalSelected === 0}
                onClick={async () => {
                  await loadWbsNodes();
                  setStep("select-target");
                }}
              >
                Next →
              </Button>
            )}

            {step === "select-target" && (
              <Button
                className="rounded-lg bg-slate-900"
                disabled={selectedTargetId === undefined || tasksOnlyWithoutTarget}
                onClick={() => setStep("confirm")}
              >
                Next →
              </Button>
            )}

            {step === "confirm" && (
              <Button
                className="rounded-lg bg-slate-900"
                disabled={totalSelected === 0 || tasksOnlyWithoutTarget}
                onClick={() => void generate()}
              >
                Generate
              </Button>
            )}

            {step === "done" && (
              <Button
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
                onClick={onClose}
              >
                Open WBS
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
