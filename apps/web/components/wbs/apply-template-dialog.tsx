"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, ChevronRight, LayoutTemplate, Building2,
  Factory, Hospital, TreePine, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TemplateNodeTree } from "@/components/wbs/template-node-tree";
import type { WbsTemplateRecord, WbsTemplateNodeRecord } from "@/components/wbs/wbs-types";

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Building2 }> = {
  building:       { label: "Building",       color: "bg-blue-100 text-blue-700",      icon: Building2 },
  residential:    { label: "Residential",    color: "bg-purple-100 text-purple-700",  icon: Building2 },
  industrial:     { label: "Industrial",     color: "bg-amber-100 text-amber-700",    icon: Factory },
  hospital:       { label: "Hospital",       color: "bg-rose-100 text-rose-700",      icon: Hospital },
  infrastructure: { label: "Infrastructure", color: "bg-emerald-100 text-emerald-700", icon: TreePine },
  other:          { label: "Other",          color: "bg-slate-100 text-slate-600",    icon: LayoutTemplate },
};

type Step = "select" | "preview" | "cloning" | "done";

interface ApplyTemplateDialogProps {
  projectId: string;
  existingNodeCount: number;
  onClose: () => void;
  onApplied: () => void;
}

export function ApplyTemplateDialog({ projectId, existingNodeCount, onClose, onApplied }: ApplyTemplateDialogProps) {
  const [step, setStep] = useState<Step>("select");
  const [templates, setTemplates] = useState<WbsTemplateRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WbsTemplateRecord | null>(null);
  const [previewNodes, setPreviewNodes] = useState<WbsTemplateNodeRecord[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [cloningResult, setCloningResult] = useState<number>(0);

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("wbs_templates")
      .select("*")
      .eq("is_active", true)
      .order("template_name")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setTemplates(data ?? []);
        setLoadingTemplates(false);
      });
  }, [supabase]);

  async function handleSelectTemplate(t: WbsTemplateRecord) {
    setSelectedTemplate(t);
    setLoadingPreview(true);
    setStep("preview");
    const { data, error } = await supabase
      .from("wbs_template_nodes")
      .select("*")
      .eq("template_id", t.id)
      .order("sort_order");
    if (error) toast.error(error.message);
    else setPreviewNodes(data ?? []);
    setLoadingPreview(false);
  }

  async function handleClone() {
    if (!selectedTemplate) return;
    setStep("cloning");

    // Delete existing draft/active nodes first if user confirmed
    if (existingNodeCount > 0) {
      await supabase.from("wbs_nodes").delete().eq("project_id", projectId).eq("status", "active");
    }

    const { data, error } = await supabase.rpc("clone_wbs_template_to_project", {
      p_template_id: selectedTemplate.id,
      p_project_id: projectId,
    });

    if (error) {
      toast.error(error.message);
      setStep("preview");
      return;
    }

    setCloningResult(data as number);
    setStep("done");
  }

  const categories = ["all", ...Array.from(new Set(templates.map((t) => t.template_category ?? "other")))];
  const filtered = categoryFilter === "all" ? templates : templates.filter((t) => (t.template_category ?? "other") === categoryFilter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={step === "cloning" ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-slate-900 text-sm">Apply WBS Template</span>
          </div>
          {step !== "cloning" && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          {(["select", "preview", "done"] as Step[]).map((s, i) => {
            const labels = ["Select", "Preview", "Done"];
            const current = step === "cloning" ? "done" : step;
            const done = (current === "preview" && i === 0) || (current === "done" && i < 2);
            const active = current === s || (s === "done" && step === "cloning");
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                <div className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  active ? "text-slate-900" : done ? "text-emerald-600" : "text-slate-400"
                )}>
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    active ? "bg-slate-900 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {done ? "✓" : i + 1}
                  </span>
                  {labels[i]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Select */}
          {step === "select" && (
            <div className="p-5">
              {existingNodeCount > 0 && (
                <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    This project has <strong>{existingNodeCount}</strong> existing WBS node{existingNodeCount > 1 ? "s" : ""}.
                    Applying a template will replace all active nodes. Closed nodes are preserved.
                  </span>
                </div>
              )}

              {/* Category filter */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {categories.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={cn(
                        "text-xs px-3 py-1 rounded-full font-medium transition-colors",
                        categoryFilter === cat
                          ? "bg-slate-900 text-white"
                          : meta ? meta.color : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {cat === "all" ? "All" : (meta?.label ?? cat)}
                    </button>
                  );
                })}
              </div>

              {loadingTemplates ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((t) => {
                    const cat = CATEGORY_META[t.template_category ?? "other"] ?? CATEGORY_META.other;
                    const Icon = cat.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t)}
                        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-left"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Icon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                          <span className="font-medium text-slate-900 text-sm truncate flex-1">{t.template_name}</span>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0", cat.color)}>
                            {cat.label}
                          </span>
                        </div>
                        {t.template_desc && (
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{t.template_desc}</p>
                        )}
                        <span className="text-[10px] text-slate-400 mt-auto">Click to preview →</span>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="col-span-2 py-8 text-center text-sm text-slate-400">
                      No active templates in this category
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && selectedTemplate && (
            <div className="p-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                <LayoutTemplate className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-slate-900 text-sm">{selectedTemplate.template_name}</p>
                  {selectedTemplate.template_desc && (
                    <p className="text-xs text-slate-500 mt-0.5">{selectedTemplate.template_desc}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Node structure preview</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto p-2">
                  {loadingPreview ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <TemplateNodeTree nodes={previewNodes} editable={false} />
                  )}
                </div>
              </div>
              {!loadingPreview && (
                <p className="text-xs text-slate-400 mt-2 text-right">
                  {previewNodes.length} nodes will be created
                </p>
              )}
            </div>
          )}

          {/* Step 3: Cloning */}
          {step === "cloning" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              <p className="text-sm text-slate-600">Cloning template nodes into project…</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Template applied!</p>
                <p className="text-sm text-slate-500 mt-1">
                  <strong>{cloningResult}</strong> WBS node{cloningResult !== 1 ? "s" : ""} created from{" "}
                  <strong>{selectedTemplate?.template_name}</strong>.
                </p>
                <p className="text-xs text-slate-400 mt-1">Rename and adjust the nodes to match your project.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <div>
            {step === "preview" && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setStep("select")}>
                ← Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step !== "cloning" && step !== "done" && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
                Cancel
              </Button>
            )}
            {step === "preview" && (
              <Button
                size="sm"
                className="rounded-xl bg-slate-900"
                onClick={handleClone}
                disabled={loadingPreview || previewNodes.length === 0}
              >
                Apply Template
              </Button>
            )}
            {step === "done" && (
              <Button
                size="sm"
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                onClick={() => { onApplied(); onClose(); }}
              >
                Open WBS →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
