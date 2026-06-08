"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Plus, Loader2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type TableConfig = {
  title: string; table: string; orderField: string;
  fields: { key: string; label: string; type?: string; width?: string }[];
};

export function GenericSchedule({ config }: { config: TableConfig }) {
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    supabase.from(config.table).select("*").order(config.orderField).then(({ data }) => { if (data) setItems(data); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter((r: any) => config.fields.some(f => String(r[f.key] || "").toLowerCase().includes(search.toLowerCase())));

  function openForm(item: any | null) {
    setEditing(item);
    setFormData(item ? Object.fromEntries(config.fields.map(f => [f.key, String(item[f.key] ?? "")])) : Object.fromEntries(config.fields.map(f => [f.key, ""])));
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = Object.fromEntries(Object.entries(formData).filter(([k]) => k !== "id").map(([k, v]) => [k, v || null]));
    for (const f of config.fields) {
      if (f.type === "number" && payload[f.key]) payload[f.key] = parseFloat(payload[f.key] as string);
    }
    const { error } = editing
      ? await supabase.from(config.table).update(payload).eq("id", editing.id)
      : await supabase.from(config.table).insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); load();
  }

  if (showForm) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button><h2 className="text-lg font-semibold">{editing ? `Edit ${config.title}` : `New ${config.title}`}</h2></div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {config.fields.filter(f => f.key !== "id").map(f => (
              <div key={f.key} className={f.width === "full" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label>{f.label}</Label>
                {f.type === "textarea" ? (
                  <textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={formData[f.key] || ""} onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))} />
                ) : (
                  <Input type={f.type || "text"} value={formData[f.key] || ""} onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Update" : "Create"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );

  if (loading) return <Loader2 className="h-8 w-8 animate-spin mx-auto py-20" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={() => openForm(null)} className="gap-2"><Plus className="h-4 w-4" /> New</Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {config.fields.map(f => <th key={f.key} className="text-left px-3 py-2">{f.label}</th>)}
            <th className="text-right px-3 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={config.fields.length + 1} className="text-center py-8 text-muted-foreground">No records found.</td></tr>
            : filtered.map((r: any) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                {config.fields.map(f => (
                  <td key={f.key} className="px-3 py-2 text-xs">{f.type === "number" && r[f.key] ? Number(r[f.key]).toFixed(2) : r[f.key] ?? "—"}</td>
                ))}
                <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(r)}><Pencil className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ArcDoorSchedule() { return <GenericSchedule config={{ title: "Door Schedule", table: "design_arc_door_schedule", orderField: "door_no", fields: [{ key: "door_no", label: "Door No" }, { key: "door_type", label: "Type" }, { key: "width_mm", label: "Width (mm)", type: "number" }, { key: "height_mm", label: "Height (mm)", type: "number" }, { key: "material", label: "Material" }, { key: "finish", label: "Finish" }, { key: "fire_rating", label: "Fire Rating" }] }} />; }
export function ArcWindowSchedule() { return <GenericSchedule config={{ title: "Window Schedule", table: "design_arc_window_schedule", orderField: "window_no", fields: [{ key: "window_no", label: "Window No" }, { key: "window_type", label: "Type" }, { key: "width_mm", label: "Width (mm)", type: "number" }, { key: "height_mm", label: "Height (mm)", type: "number" }, { key: "frame_material", label: "Frame" }, { key: "glass_type", label: "Glass" }] }} />; }
export function ArcFinishSchedule() { return <GenericSchedule config={{ title: "Finish Schedule", table: "design_arc_finish_schedule", orderField: "location", fields: [{ key: "location", label: "Location" }, { key: "element", label: "Element" }, { key: "finish_material", label: "Material" }, { key: "finish_code", label: "Code" }, { key: "color", label: "Color" }, { key: "brand", label: "Brand" }] }} />; }
export function ArcMaterialApproval() { return <GenericSchedule config={{ title: "Material Approval", table: "design_arc_material_approval", orderField: "material_name", fields: [{ key: "material_name", label: "Material" }, { key: "category", label: "Category" }, { key: "manufacturer", label: "Manufacturer" }, { key: "brand", label: "Brand" }, { key: "supplier", label: "Supplier" }, { key: "status", label: "Status" }] }} />; }
