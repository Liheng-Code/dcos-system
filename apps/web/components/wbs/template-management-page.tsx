"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Building2,
  Factory, Hospital, TreePine, LayoutTemplate, FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TemplateNodeTree } from "@/components/wbs/template-node-tree";
import { TemplateNodeEditSheet } from "@/components/wbs/template-node-edit-sheet";
import { TemplateUpsertDialog } from "@/components/wbs/template-upsert-dialog";
import type { WbsTemplateRecord, WbsTemplateNodeRecord } from "@/components/wbs/wbs-types";
import { deleteWbsTemplateById, deleteWbsTemplateNodeById, getProfileByIdOfRole, listWbsTemplateNodesByTemplateId, listWbsTemplates, updateWbsTemplateById } from "@/lib/wbs/wbs-queries";

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Building2 }> = {
  building:       { label: "Building",       color: "bg-blue-100 text-blue-700",   icon: Building2 },
  residential:    { label: "Residential",    color: "bg-purple-100 text-purple-700", icon: Building2 },
  industrial:     { label: "Industrial",     color: "bg-amber-100 text-amber-700",  icon: Factory },
  hospital:       { label: "Hospital",       color: "bg-rose-100 text-rose-700",    icon: Hospital },
  infrastructure: { label: "Infrastructure", color: "bg-emerald-100 text-emerald-700", icon: TreePine },
  other:          { label: "Other",          color: "bg-slate-100 text-slate-600",  icon: LayoutTemplate },
};

export function TemplateManagementPage() {
  const [templates, setTemplates] = useState<WbsTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<WbsTemplateNodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // dialog state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WbsTemplateRecord | null>(null);
  const [showNodeSheet, setShowNodeSheet] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsTemplateNodeRecord | null>(null);
  const [addingNodeParentId, setAddingNodeParentId] = useState<string | null>(null);

  const supabase = createClient();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listWbsTemplates();
    if (error) toast.error(error.message);
    else setTemplates(data ?? []);
    setLoading(false);
  }, [supabase]);

  const loadNodes = useCallback(async (templateId: string) => {
    setNodesLoading(true);
    const { data, error } = await listWbsTemplateNodesByTemplateId(templateId);
    if (error) toast.error(error.message);
    else setNodes(data ?? []);
    setNodesLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadTemplates();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        getProfileByIdOfRole(data.user.id)
          .then(({ data: p }) => setIsAdmin(p?.role === "admin"));
      }
    });
  }, [loadTemplates, supabase]);

  useEffect(() => {
    if (selectedId) loadNodes(selectedId);
    else setNodes([]);
  }, [selectedId, loadNodes]);

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  async function toggleActive(t: WbsTemplateRecord) {
    if (!isAdmin) return;
    const { error } = await updateWbsTemplateById({ is_active: !t.is_active }, t.id);
    if (error) toast.error(error.message);
    else {
      toast.success(t.is_active ? "Template deactivated" : "Template activated");
      loadTemplates();
    }
  }

  async function handleDeleteTemplate(t: WbsTemplateRecord) {
    if (!isAdmin) return;
    if (!confirm(`Delete template "${t.template_name}"? This will also delete all its nodes.`)) return;
    const { error } = await deleteWbsTemplateById(t.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Template deleted");
      if (selectedId === t.id) setSelectedId(null);
      loadTemplates();
    }
  }

  async function handleDeleteNode(nodeId: string) {
    if (!isAdmin) return;
    if (!confirm("Delete this node and all its children?")) return;
    const { error } = await deleteWbsTemplateNodeById(nodeId);
    if (error) toast.error(error.message);
    else {
      toast.success("Node deleted");
      if (selectedId) loadNodes(selectedId);
    }
  }

  function openAddNode(parentId: string | null) {
    setEditingNode(null);
    setAddingNodeParentId(parentId);
    setShowNodeSheet(true);
  }

  function openEditNode(node: WbsTemplateNodeRecord) {
    setEditingNode(node);
    setAddingNodeParentId(node.parent_id);
    setShowNodeSheet(true);
  }

  const nodeCount = (id: string) => nodes.filter((n) => n.template_id === id || true).length;

  return (
    <div className="flex h-screen flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-900 text-sm">WBS Templates</span>
          <span className="text-xs text-slate-400 ml-1">PMO-managed master structures</span>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            className="rounded-xl bg-slate-900"
            onClick={() => { setEditingTemplate(null); setShowTemplateDialog(true); }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Template
          </Button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: template list */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="flex justify-center pt-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : templates.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No templates yet</div>
            ) : (
              templates.map((t) => {
                const cat = CATEGORY_META[t.template_category ?? "other"] ?? CATEGORY_META.other;
                const Icon = cat.icon;
                const isSelected = t.id === selectedId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "group mx-2 mb-1 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
                      isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", isSelected ? "text-slate-300" : "text-slate-400")} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", isSelected ? "text-white" : "text-slate-800")}>
                          {t.template_name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", isSelected ? "bg-white/20 text-white" : cat.color)}>
                            {cat.label}
                          </span>
                          {!t.is_active && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", isSelected ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500")}>
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                          <button
                            className={cn("rounded p-1 hover:bg-slate-200", isSelected && "hover:bg-white/20")}
                            onClick={(e) => { e.stopPropagation(); setEditingTemplate(t); setShowTemplateDialog(true); }}
                            title="Edit template"
                          >
                            <Pencil className={cn("h-3 w-3", isSelected ? "text-slate-300" : "text-slate-400")} />
                          </button>
                          <button
                            className={cn("rounded p-1 hover:bg-slate-200", isSelected && "hover:bg-white/20")}
                            onClick={(e) => { e.stopPropagation(); toggleActive(t); }}
                            title={t.is_active ? "Deactivate" : "Activate"}
                          >
                            {t.is_active
                              ? <ToggleRight className={cn("h-3.5 w-3.5", isSelected ? "text-green-300" : "text-green-600")} />
                              : <ToggleLeft className={cn("h-3.5 w-3.5", isSelected ? "text-slate-300" : "text-slate-400")} />
                            }
                          </button>
                          <button
                            className={cn("rounded p-1 hover:bg-red-100", isSelected && "hover:bg-red-500/30")}
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t); }}
                            title="Delete template"
                          >
                            <Trash2 className={cn("h-3 w-3", isSelected ? "text-red-300" : "text-red-400")} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: node tree */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FolderTree className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a template to view its node structure</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
                <div>
                  <p className="font-medium text-slate-900 text-sm">{selectedTemplate?.template_name}</p>
                  {selectedTemplate?.template_desc && (
                    <p className="text-xs text-slate-500 mt-0.5">{selectedTemplate.template_desc}</p>
                  )}
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => openAddNode(null)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Root Node
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {nodesLoading ? (
                  <div className="flex justify-center pt-12">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                ) : (
                  <TemplateNodeTree
                    nodes={nodes}
                    editable={isAdmin}
                    onAdd={openAddNode}
                    onEdit={openEditNode}
                    onDelete={handleDeleteNode}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Template upsert dialog */}
      {showTemplateDialog && (
        <TemplateUpsertDialog
          template={editingTemplate}
          onClose={() => setShowTemplateDialog(false)}
          onSave={(id) => {
            setShowTemplateDialog(false);
            loadTemplates();
            setSelectedId(id);
          }}
        />
      )}

      {/* Node edit sheet */}
      {showNodeSheet && selectedId && (
        <TemplateNodeEditSheet
          node={editingNode}
          templateId={selectedId}
          parentId={addingNodeParentId}
          onClose={() => setShowNodeSheet(false)}
          onSave={() => {
            setShowNodeSheet(false);
            loadNodes(selectedId);
          }}
        />
      )}
    </div>
  );
}
