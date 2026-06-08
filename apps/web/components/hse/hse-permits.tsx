"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const PERMIT_TYPES = ["hot_work","confined_space","work_at_height","excavation","electrical","lifting","chemical","cold_work","general"];
const STATUSES = ["draft","submitted","approved","active","closed","cancelled","rejected"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700", active: "bg-teal-100 text-teal-700",
  closed: "bg-gray-200 text-gray-500", cancelled: "bg-red-100 text-red-700", rejected: "bg-red-200 text-red-800",
};

export function HsePermits() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [permitNumber, setPermitNumber] = useState("");
  const [permitType, setPermitType] = useState("general");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [location, setLocation] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [conditions, setConditions] = useState("");
  const [measures, setMeasures] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("hse_permits").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setPermitNumber(""); setPermitType("general"); setTitle(""); setDesc(""); setLocation("");
    setRequestedBy(""); setStartDate(""); setEndDate(""); setStatus("draft"); setConditions(""); setMeasures("");
    setEditing(null);
  }

  function openEdit(r: any) {
    setPermitNumber(r.permit_number); setPermitType(r.permit_type); setTitle(r.title);
    setDesc(r.description || ""); setLocation(r.location || ""); setRequestedBy(r.requested_by || "");
    setStartDate(r.start_date?.slice(0, 10) || ""); setEndDate(r.end_date?.slice(0, 10) || "");
    setStatus(r.status); setConditions(r.permit_conditions || ""); setMeasures(r.safety_measures || "");
    setEditing(r); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      permit_number: permitNumber, permit_type: permitType, title,
      description: desc || null, location: location || null, requested_by: requestedBy || null,
      start_date: startDate || null, end_date: endDate || null, status,
      permit_conditions: conditions || null, safety_measures: measures || null,
    };
    const { error } = editing
      ? await supabase.from("hse_permits").update(payload).eq("id", editing.id)
      : await supabase.from("hse_permits").insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r => !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.permit_number?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search permits..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Permit"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Permit # *</Label><Input value={permitNumber} onChange={e => setPermitNumber(e.target.value)} required /></div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={permitType} onChange={e => setPermitType(e.target.value)}>
                  {PERMIT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="col-span-2 space-y-1.5"><Label>Description</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={desc} onChange={e => setDesc(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Requested By</Label><Input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Permit Conditions</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={conditions} onChange={e => setConditions(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Safety Measures</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={measures} onChange={e => setMeasures(e.target.value)} /></div>
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
          <thead><tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Permit#</th>
            <th className="px-3 py-2 text-left font-medium">Title</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Location</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-center font-medium">Start</th>
            <th className="px-3 py-2 text-center font-medium">End</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.permit_number}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2"><Badge variant="outline">{r.permit_type?.replace(/_/g, " ")}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{r.location}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge></td>
                <td className="px-3 py-2 text-center">{r.start_date?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-center">{r.end_date?.slice(0, 10)}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No permits yet.</p>}
      </div>
    </div>
  );
}
