"use client";

import { useEffect, useState, useCallback } from "react";
import { deleteQsBoqItemById, deleteQsBoqSectionById, listQsBoqItemsByProjectId, listQsBoqSectionsByProjectId } from "@/lib/procurement/procurement-queries";
import { Search, Plus, Loader2, Pencil, Trash2, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BoqItemEditor } from "./boq-item-editor";
import { BoqSectionForm } from "./boq-section-form";
import { useProject } from "@/components/dashboard/project-context";

interface Section {
  id: string;
  project_id: string;
  section_code: string | null;
  title: string;
  seq: number;
  description: string | null;
}

interface BoqItem {
  id: string;
  project_id: string;
  boq_section_id: string | null;
  wbs_node_id: string | null;
  seq: number;
  item_no: string | null;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  notes: string | null;
}

export function BoqList() {
  const { selectedProjectId, selectedProject } = useProject();
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<BoqItem | null>(null);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const fetchData = useCallback(() => {
    if (!selectedProjectId) { setSections([]); setItems([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      listQsBoqSectionsByProjectId(selectedProjectId, "*"),
      listQsBoqItemsByProjectId(selectedProjectId),
    ]).then(([sRes, iRes]) => {
      if (sRes.data) setSections(sRes.data as Section[]);
      if (iRes.data) setItems(iRes.data as BoqItem[]);
      setLoading(false);
    });
  }, [selectedProjectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sectionTotals = sections.map(s => ({
    ...s,
    count: items.filter(i => i.boq_section_id === s.id).length,
    total: items.filter(i => i.boq_section_id === s.id).reduce((sum, i) => sum + Number(i.total_amount), 0),
  }));

  const grandTotal = items.reduce((sum, i) => sum + Number(i.total_amount), 0);

  const filteredItems = (sectionId: string) => {
    const sectionItems = items.filter(i => i.boq_section_id === sectionId);
    if (!search) return sectionItems;
    return sectionItems.filter(i =>
      (i.item_no || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.item_code || "").toLowerCase().includes(search.toLowerCase())
    );
  };

  function toggleSection(id: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Delete this BOQ item?")) return;
    const { error } = await deleteQsBoqItemById(id);
    if (error) { toast.error(error.message); return; }
    toast.success("Item deleted");
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleDeleteSection(id: string) {
    const hasItems = items.some(i => i.boq_section_id === id);
    if (hasItems) { toast.error("Remove all items from this section first"); return; }
    if (!confirm("Delete this section?")) return;
    const { error } = await deleteQsBoqSectionById(id);
    if (error) { toast.error(error.message); return; }
    toast.success("Section deleted");
    setSections(prev => prev.filter(s => s.id !== id));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onItemSaved(data: any) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === data.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = data as unknown as BoqItem;
        return next;
      }
      return [...prev, data as unknown as BoqItem];
    });
    setEditingItem(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSectionSaved(section: any) {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === section.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = section as unknown as Section; return next; }
      return [...prev, section as unknown as Section];
    });
    setShowSectionForm(false);
    setEditingSection(null);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (editingItem) {
    return (
      <BoqItemEditor
        item={editingItem}
        sections={sections}
        onSaved={onItemSaved}
        onCancel={() => setEditingItem(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Project indicator + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedProject ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{selectedProject.project_name}</span>
              <span className="font-mono text-xs text-muted-foreground">({selectedProject.project_code})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>No project selected</span>
            </div>
          )}
          {selectedProjectId && (
            <>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Badge variant="outline" className="text-sm">Total: ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Badge>
            </>
          )}
        </div>
        {selectedProjectId && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditingSection(null); setShowSectionForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Section
            </Button>
            <Button size="sm" onClick={() => setEditingItem({ project_id: selectedProjectId } as unknown as BoqItem)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
        )}
      </div>

      {/* Section form dialog */}
      {showSectionForm && (
        <BoqSectionForm
          section={editingSection}
          projectId={selectedProjectId}
          onSaved={onSectionSaved}
          onCancel={() => { setShowSectionForm(false); setEditingSection(null); }}
        />
      )}

      {/* No project selected */}
      {!selectedProjectId && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Select a project from the top bar to view its Bill of Quantities.
        </div>
      )}

      {/* BOQ sections with items */}
      {selectedProjectId && sections.length === 0 && items.length === 0 && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          No BOQ data yet. Add a section to get started.
        </div>
      )}

      {selectedProjectId && sectionTotals.map(section => {
        const sectionItems = filteredItems(section.id);
        const isExpanded = expandedSections.has(section.id);
        return (
          <div key={section.id} className="rounded-lg border">
            {/* Section header */}
            <div
              className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors border-b"
              onClick={() => toggleSection(section.id)}
            >
              <span className="text-muted-foreground">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
              <span className="font-semibold text-sm">{section.section_code ?? section.seq}</span>
              <span className="text-sm">{section.title}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {section.count} items — ${section.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); setEditingSection(section); setShowSectionForm(true); }}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); handleDeleteSection(section.id); }}>
                <Trash2 className="h-3 w-3 text-red-500" />
              </Button>
            </div>

            {/* Items table */}
            {isExpanded && (
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-2 w-20">Item No</th>
                    <th className="text-left px-4 py-2 w-24">Code</th>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-4 py-2 w-16">Unit</th>
                    <th className="text-right px-4 py-2 w-24">Quantity</th>
                    <th className="text-right px-4 py-2 w-28">Unit Rate</th>
                    <th className="text-right px-4 py-2 w-28">Total</th>
                    <th className="text-right px-4 py-2 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionItems.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-xs text-muted-foreground">No items in this section.</td></tr>
                  ) : sectionItems.map(i => (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                      <td className="px-4 py-2 font-mono text-xs">{i.item_no ?? i.seq}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{i.item_code ?? "—"}</td>
                      <td className="px-4 py-2">{i.description}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{i.unit}</td>
                      <td className="px-4 py-2 text-right font-medium">{Number(i.quantity).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">${Number(i.unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right font-semibold">${Number(i.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingItem(i)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDeleteItem(i.id)}>
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
