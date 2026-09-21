"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  idle: "bg-yellow-100 text-yellow-700",
  under_maintenance: "bg-red-100 text-red-700",
  off_site: "bg-gray-100 text-gray-700",
};

export function SiteEquipment() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [eqType, setEqType] = useState("");
  const [operator, setOperator] = useState("");
  const [status, setStatus] = useState("active");
  const [hoursOp, setHoursOp] = useState("");
  const [fuel, setFuel] = useState("");
  const [eqLocation, setEqLocation] = useState("");
  const [eqNotes, setEqNotes] = useState("");

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("site_equipment")
      .select("*")
      .eq("project_id", selectedProjectId)
      .order("date", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [selectedProjectId]);

  function resetForm() {
    setDate(""); setName(""); setCode(""); setEqType(""); setOperator("");
    setStatus("active"); setHoursOp(""); setFuel(""); setEqLocation(""); setEqNotes("");
    setEditing(null);
  }

  function openEdit(row: any) {
    setDate(row.date?.slice(0, 10) || ""); setName(row.equipment_name || ""); setCode(row.equipment_code || "");
    setEqType(row.equipment_type || ""); setOperator(row.operator || ""); setStatus(row.status || "active");
    setHoursOp(row.hours_operated?.toString() || "0"); setFuel(row.fuel_litres?.toString() || "0");
    setEqLocation(row.location || ""); setEqNotes(row.notes || "");
    setEditing(row); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) { toast.error("Select a project first"); return; }
    setSaving(true);
    const payload: Record<string, any> = {
      date, equipment_name: name, equipment_code: code || null, equipment_type: eqType || null,
      operator: operator || null, status, hours_operated: parseFloat(hoursOp) || 0,
      fuel_litres: parseFloat(fuel) || 0, location: eqLocation || null, notes: eqNotes || null,
    };
    const { error } = editing
      ? await supabase.from("site_equipment").update(payload).eq("id", editing.id)
      : await supabase.from("site_equipment").insert([{ ...payload, project_id: selectedProjectId }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r =>
    !search || r.equipment_name?.toLowerCase().includes(search.toLowerCase()) || r.equipment_code?.toLowerCase().includes(search.toLowerCase())
  );

  if (projectLoading || loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to record site equipment.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search equipment..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "Add Equipment"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Equipment Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Excavator CAT 320" required /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="EQ-001" /></div>
              <div className="space-y-1.5"><Label>Type</Label><Input value={eqType} onChange={e => setEqType(e.target.value)} placeholder="Excavator, Crane..." /></div>
              <div className="space-y-1.5"><Label>Operator</Label><Input value={operator} onChange={e => setOperator(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="active">Active</option><option value="idle">Idle</option>
                  <option value="under_maintenance">Under Maintenance</option><option value="off_site">Off Site</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Hours Operated</Label><Input type="number" step="0.1" value={hoursOp} onChange={e => setHoursOp(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fuel (L)</Label><Input type="number" step="0.1" value={fuel} onChange={e => setFuel(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={eqLocation} onChange={e => setEqLocation(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Notes</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={eqNotes} onChange={e => setEqNotes(e.target.value)} /></div>
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
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Equipment</th>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Operator</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 text-right font-medium">Fuel (L)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">{r.date?.slice(0, 10)}</td>
                <td className="px-3 py-2 font-medium">{r.equipment_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.equipment_code}</td>
                <td className="px-3 py-2">{r.operator}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status?.replace(/_/g, " ")}</Badge></td>
                <td className="px-3 py-2 text-right">{r.hours_operated}</td>
                <td className="px-3 py-2 text-right">{r.fuel_litres}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No equipment entries yet.</p>}
      </div>
    </div>
  );
}
