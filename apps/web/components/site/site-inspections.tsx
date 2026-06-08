"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  scheduled: "bg-yellow-100 text-yellow-700",
  inspected: "bg-purple-100 text-purple-700",
  passed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  closed: "bg-gray-200 text-gray-500",
};

export function SiteInspections() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [irNumber, setIrNumber] = useState("");
  const [location, setLocation] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("inspection_requests")
      .select("*")
      .order("request_date", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setIrNumber(""); setLocation(""); setInspectorName(""); setInspectionDate(""); setStatus("draft"); setNotes("");
    setEditing(null);
  }

  function openEdit(row: any) {
    setIrNumber(row.ir_number || ""); setLocation(row.location || "");
    setInspectorName(row.inspector_name || ""); setInspectionDate(row.inspection_date?.slice(0, 10) || "");
    setStatus(row.status || "draft"); setNotes(row.notes || "");
    setEditing(row); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      ir_number: irNumber,
      location: location || null,
      inspector_name: inspectorName || null,
      inspection_date: inspectionDate || null,
      status,
      notes: notes || null,
    };
    const { error } = editing
      ? await supabase.from("inspection_requests").update(payload).eq("id", editing.id)
      : await supabase.from("inspection_requests").insert([{ ...payload, project_id: crypto.randomUUID(), request_date: new Date().toISOString().slice(0, 10) }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r =>
    !search || r.ir_number?.toLowerCase().includes(search.toLowerCase()) || r.location?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search IR number..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New IR"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>IR Number *</Label><Input value={irNumber} onChange={e => setIrNumber(e.target.value)} placeholder="IR-001" required /></div>
              <div className="space-y-1.5"><Label>Inspection Date</Label><Input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Inspector</Label><Input value={inspectorName} onChange={e => setInspectorName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {["draft","submitted","scheduled","inspected","passed","failed","closed"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Notes</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} /></div>
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
              <th className="px-3 py-2 text-left font-medium">IR#</th>
              <th className="px-3 py-2 text-left font-medium">Location</th>
              <th className="px-3 py-2 text-left font-medium">Inspector</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.ir_number}</td>
                <td className="px-3 py-2">{r.location}</td>
                <td className="px-3 py-2">{r.inspector_name}</td>
                <td className="px-3 py-2">{r.inspection_date?.slice(0, 10) || r.request_date?.slice(0, 10)}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge></td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No inspection requests yet.</p>}
      </div>
    </div>
  );
}
