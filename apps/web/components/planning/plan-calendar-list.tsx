"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Pencil, Trash2, Search } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

export function PlanCalendarList() {
  const { selectedProjectId } = useProject();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [dayFlags, setDayFlags] = useState<Record<string, boolean>>({
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
    saturday: false, sunday: false,
  });
  const [isDefault, setIsDefault] = useState(false);

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("plan_calendars").select("*").eq("project_id", selectedProjectId).order("name");
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [selectedProjectId]);

  function resetForm() {
    setName(""); setDesc(""); setIsDefault(false);
    setDayFlags({ monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false });
    setEditing(null);
  }

  function openEdit(row: any) {
    setName(row.name); setDesc(row.description || ""); setIsDefault(row.is_default);
    const flags: Record<string, boolean> = {};
    for (const d of DAYS) flags[d] = row[d] ?? false;
    setDayFlags(flags);
    setEditing(row); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = { name, description: desc || null, is_default: isDefault };
    for (const d of DAYS) payload[d] = dayFlags[d];
    const { error } = editing
      ? await supabase.from("plan_calendars").update(payload).eq("id", editing.id)
      : await supabase.from("plan_calendars").insert([{ ...payload, project_id: selectedProjectId }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("plan_calendars").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  }

  const filtered = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Input placeholder="Search calendars..." value={search} onChange={e => setSearch(e.target.value)} className="pl-3" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Calendar"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={e => setDesc(e.target.value)} /></div>
              <div className="col-span-2">
                <Label>Work Days</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {DAYS.map(d => (
                    <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={dayFlags[d]} onChange={e => setDayFlags(prev => ({ ...prev, [d]: e.target.checked }))} />
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
                  Default calendar
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-left font-medium">Work Days</th>
              <th className="px-3 py-2 text-center font-medium">Default</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {DAYS.map(d => r[d] ? <Badge key={d} variant="outline" className="text-[10px] px-1">{d.slice(0, 3)}</Badge> : null)}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">{r.is_default ? "✓" : ""}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No calendars yet.</p>}
      </div>
    </div>
  );
}
