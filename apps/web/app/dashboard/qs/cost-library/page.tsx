"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, BookTemplate, FolderOpen, Edit3, Save, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type View = "divisions" | "sections" | "items";

export default function CostLibraryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const [view, setView] = useState<View>("divisions");

  // Add division form
  const [showDivForm, setShowDivForm] = useState(false);
  const [divForm, setDivForm] = useState({ code: "", name: "" });

  // Add section form
  const [showSecForm, setShowSecForm] = useState(false);
  const [secForm, setSecForm] = useState({ code: "", name: "" });

  // Add item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({
    code: "", description: "", unit: "m2", base_rate: "0",
    labor_pct: "0", material_pct: "0", equipment_pct: "0",
  });

  // Inline edit for item rate
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditForm, setItemEditForm] = useState<any>({});

  useEffect(() => {
    supabase.from("qs_cost_divisions").select("*").order("seq").then(({ data }) => {
      if (data) setDivisions(data);
      setLoading(false);
    });
  }, [supabase]);

  function loadSections(divisionId: string) {
    setSelectedDivisionId(divisionId);
    setSelectedSectionId("");
    setItems([]);
    setView("sections");
    supabase.from("qs_cost_sections").select("*").eq("division_id", divisionId).order("seq").then(({ data }) => {
      if (data) setSections(data);
    });
  }

  function loadItems(sectionId: string) {
    setSelectedSectionId(sectionId);
    setView("items");
    supabase.from("qs_cost_items").select("*").eq("section_id", sectionId).order("code").then(({ data }) => {
      if (data) setItems(data);
    });
  }

  // ── Division CRUD ─────────────────────────────────────────────────────────────

  async function handleCreateDivision() {
    setSaving(true);
    const nextSeq = (divisions.length + 1) * 10;
    const { error } = await supabase.from("qs_cost_divisions").insert({
      code: divForm.code, name: divForm.name, seq: nextSeq,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Division added");
    setShowDivForm(false);
    setDivForm({ code: "", name: "" });
    const { data } = await supabase.from("qs_cost_divisions").select("*").order("seq");
    if (data) setDivisions(data);
    setSaving(false);
  }

  async function handleDeleteDivision(id: string) {
    if (!confirm("Delete this division and all its sections & items?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("qs_cost_divisions").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Division deleted");
    setDivisions(divisions.filter((d: any) => d.id !== id));
    if (selectedDivisionId === id) { setSelectedDivisionId(""); setSections([]); setItems([]); setView("divisions"); }
    setDeletingId(null);
  }

  // ── Section CRUD ──────────────────────────────────────────────────────────────

  async function handleCreateSection() {
    if (!selectedDivisionId) return;
    setSaving(true);
    const nextSeq = (sections.length + 1) * 10;
    const { error } = await supabase.from("qs_cost_sections").insert({
      division_id: selectedDivisionId, code: secForm.code, name: secForm.name, seq: nextSeq,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Section added");
    setShowSecForm(false);
    setSecForm({ code: "", name: "" });
    loadSections(selectedDivisionId);
    setSaving(false);
  }

  async function handleDeleteSection(id: string) {
    if (!confirm("Delete this section and all its items?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("qs_cost_sections").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Section deleted");
    setSections(sections.filter((s: any) => s.id !== id));
    if (selectedSectionId === id) { setSelectedSectionId(""); setItems([]); setView("sections"); }
    setDeletingId(null);
  }

  // ── Item CRUD ─────────────────────────────────────────────────────────────────

  async function handleCreateItem() {
    if (!selectedSectionId) return;
    setSaving(true);
    const { error } = await supabase.from("qs_cost_items").insert({
      section_id: selectedSectionId, code: itemForm.code, description: itemForm.description,
      unit: itemForm.unit, base_rate: parseFloat(itemForm.base_rate) || 0,
      labor_pct: parseFloat(itemForm.labor_pct) || 0,
      material_pct: parseFloat(itemForm.material_pct) || 0,
      equipment_pct: parseFloat(itemForm.equipment_pct) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Cost item added");
    setShowItemForm(false);
    setItemForm({ code: "", description: "", unit: "m2", base_rate: "0", labor_pct: "0", material_pct: "0", equipment_pct: "0" });
    loadItems(selectedSectionId);
    setSaving(false);
  }

  async function handleUpdateItem(id: string) {
    const form = itemEditForm[id];
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("qs_cost_items").update({
      base_rate: parseFloat(form.base_rate) || 0,
      labor_pct: parseFloat(form.labor_pct) || 0,
      material_pct: parseFloat(form.material_pct) || 0,
      equipment_pct: parseFloat(form.equipment_pct) || 0,
      description: form.description,
      unit: form.unit,
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Item updated");
    setEditingItemId(null);
    loadItems(selectedSectionId);
    setSaving(false);
  }

  async function handleDeleteItem(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("qs_cost_items").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Item deleted");
    setItems(items.filter((i: any) => i.id !== id));
    setDeletingId(null);
  }

  const selectedDivision = divisions.find((d: any) => d.id === selectedDivisionId);
  const selectedSection = sections.find((s: any) => s.id === selectedSectionId);

  const ROW_CLASS = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cost Library</h1>
        <p className="text-sm text-muted-foreground">Standard cost code library — divisions, sections, and rate items</p>
      </div>

      {/* ── Breadcrumb / Navigation ── */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => { setView("divisions"); setSelectedDivisionId(""); setSections([]); setItems([]); }}
          className={cn("hover:text-foreground transition-colors", view === "divisions" ? "text-foreground font-semibold" : "")}>
          Divisions
        </button>
        {selectedDivision && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <button onClick={() => { setView("sections"); setSelectedSectionId(""); setItems([]); }}
              className={cn("hover:text-foreground transition-colors", view === "sections" ? "text-foreground font-semibold" : "")}>
              {selectedDivision.code} {selectedDivision.name}
            </button>
          </>
        )}
        {selectedSection && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-semibold">{selectedSection.code} {selectedSection.name}</span>
          </>
        )}
        <div className="flex-1" />
        {view === "divisions" && (
          <Button size="sm" variant="outline" onClick={() => setShowDivForm(!showDivForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Division
          </Button>
        )}
        {view === "sections" && (
          <Button size="sm" variant="outline" onClick={() => setShowSecForm(!showSecForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Section
          </Button>
        )}
        {view === "items" && (
          <Button size="sm" variant="outline" onClick={() => setShowItemForm(!showItemForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Item
          </Button>
        )}
      </div>

      {/* ── DIVISIONS VIEW ── */}
      {view === "divisions" && (
        <div className="space-y-2">
          {showDivForm && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Division Code *</label>
                    <input value={divForm.code} onChange={e => setDivForm({...divForm, code: e.target.value})} className={ROW_CLASS} placeholder="02" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Division Name *</label>
                    <input value={divForm.name} onChange={e => setDivForm({...divForm, name: e.target.value})} className={ROW_CLASS} placeholder="Existing Conditions" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowDivForm(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateDivision} disabled={saving || !divForm.code.trim() || !divForm.name.trim()}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {divisions.map((d) => (
              <Card key={d.id} className={cn(
                "cursor-pointer transition-colors hover:bg-muted/50",
                selectedDivisionId === d.id && "ring-1 ring-primary"
              )}>
                <CardContent className="p-4" onClick={() => loadSections(d.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <BookTemplate className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Division {d.code}</p>
                        <p className="text-xs text-muted-foreground">{d.name}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDivision(d.id); }}
                      className="text-muted-foreground hover:text-red-600 shrink-0" disabled={deletingId === d.id}>
                      {deletingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTIONS VIEW ── */}
      {view === "sections" && (
        <div className="space-y-2">
          {showSecForm && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Section Code *</label>
                    <input value={secForm.code} onChange={e => setSecForm({...secForm, code: e.target.value})} className={ROW_CLASS} placeholder="01 10" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Section Name *</label>
                    <input value={secForm.name} onChange={e => setSecForm({...secForm, name: e.target.value})} className={ROW_CLASS} placeholder="Temporary Facilities" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowSecForm(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateSection} disabled={saving || !secForm.code.trim() || !secForm.name.trim()}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {sections.length === 0 && !showSecForm ? (
            <div className="rounded-lg border px-6 py-12 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto h-10 w-10 mb-2 text-muted-foreground/50" />
              No sections in this division
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sections.map((s) => (
                <Card key={s.id} className={cn(
                  "cursor-pointer transition-colors hover:bg-muted/50",
                  selectedSectionId === s.id && "ring-1 ring-primary"
                )}>
                  <CardContent className="p-4" onClick={() => loadItems(s.id)}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{s.code}</p>
                          <p className="text-xs text-muted-foreground">{s.name}</p>
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(s.id); }}
                        className="text-muted-foreground hover:text-red-600 shrink-0" disabled={deletingId === s.id}>
                        {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ITEMS VIEW ── */}
      {view === "items" && (
        <div className="space-y-2">
          {showItemForm && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Item Code *</label>
                    <input value={itemForm.code} onChange={e => setItemForm({...itemForm, code: e.target.value})} className={ROW_CLASS} placeholder="01 10 13" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit</label>
                    <select value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})} className={ROW_CLASS}>
                      <option value="m2">m2</option><option value="m3">m3</option><option value="m">m</option>
                      <option value="EA">EA</option><option value="kg">kg</option><option value="ton">ton</option>
                      <option value="hr">hr</option><option value="day">day</option><option value="LS">LS</option>
                      <option value="month">month</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Base Rate</label>
                    <input type="number" value={itemForm.base_rate} onChange={e => setItemForm({...itemForm, base_rate: e.target.value})} className={ROW_CLASS} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Labor %</label>
                    <input type="number" value={itemForm.labor_pct} onChange={e => setItemForm({...itemForm, labor_pct: e.target.value})} className={ROW_CLASS} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium">Description *</label>
                    <input value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} className={ROW_CLASS} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Material %</label>
                    <input type="number" value={itemForm.material_pct} onChange={e => setItemForm({...itemForm, material_pct: e.target.value})} className={ROW_CLASS} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Equipment %</label>
                    <input type="number" value={itemForm.equipment_pct} onChange={e => setItemForm({...itemForm, equipment_pct: e.target.value})} className={ROW_CLASS} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowItemForm(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateItem} disabled={saving || !itemForm.code.trim() || !itemForm.description.trim()}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {items.length === 0 && !showItemForm ? (
            <div className="rounded-lg border px-6 py-12 text-center text-sm text-muted-foreground">
              <BookTemplate className="mx-auto h-10 w-10 mb-2 text-muted-foreground/50" />
              No items in this section
            </div>
          ) : items.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-center px-3 py-2 font-medium w-16">Unit</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Base Rate</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Labor %</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Mat. %</th>
                    <th className="text-right px-3 py-2 font-medium w-16">Equip. %</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      {editingItemId === item.id ? (
                        <>
                          <td className="px-3 py-1.5 font-mono text-xs">{item.code}</td>
                          <td className="px-3 py-1.5">
                            <input value={itemEditForm[item.id]?.description ?? item.description}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], description: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={itemEditForm[item.id]?.unit ?? item.unit}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], unit: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                              <option value="m2">m2</option><option value="m3">m3</option><option value="m">m</option>
                              <option value="EA">EA</option><option value="kg">kg</option><option value="ton">ton</option>
                              <option value="hr">hr</option><option value="day">day</option><option value="LS">LS</option>
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" value={itemEditForm[item.id]?.base_rate ?? item.base_rate}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], base_rate: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" value={itemEditForm[item.id]?.labor_pct ?? item.labor_pct}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], labor_pct: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" value={itemEditForm[item.id]?.material_pct ?? item.material_pct}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], material_pct: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" value={itemEditForm[item.id]?.equipment_pct ?? item.equipment_pct}
                              onChange={e => setItemEditForm({...itemEditForm, [item.id]: {...itemEditForm[item.id], equipment_pct: e.target.value}})}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right" />
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleUpdateItem(item.id)} className="text-green-600 hover:text-green-700" disabled={saving}>
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => setEditingItemId(null)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-center">{item.unit}</td>
                          <td className="px-3 py-2 text-right font-semibold">${Number(item.base_rate).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{item.labor_pct}%</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{item.material_pct}%</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{item.equipment_pct}%</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingItemId(item.id); setItemEditForm({...itemEditForm, [item.id]: {}}); }}
                                className="text-muted-foreground hover:text-foreground">
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                                {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
