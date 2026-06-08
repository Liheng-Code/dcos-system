"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function SiteManpower() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [reportDate, setReportDate] = useState("");
  const [trade, setTrade] = useState("");
  const [contractor, setContractor] = useState("");
  const [foreman, setForeman] = useState("");
  const [total, setTotal] = useState("");
  const [skilled, setSkilled] = useState("");
  const [unskilled, setUnskilled] = useState("");
  const [regularHrs, setRegularHrs] = useState("");
  const [otHrs, setOtHrs] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_manpower")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setReportDate(""); setTrade(""); setContractor(""); setForeman("");
    setTotal(""); setSkilled(""); setUnskilled(""); setRegularHrs(""); setOtHrs(""); setNotes("");
    setEditing(null);
  }

  function openEdit(row: any) {
    setReportDate(row.report_date?.slice(0, 10) || "");
    setTrade(row.trade || "");
    setContractor(row.contractor || "");
    setForeman(row.foreman || "");
    setTotal(row.total_workers?.toString() || "");
    setSkilled(row.skilled?.toString() || "0");
    setUnskilled(row.unskilled?.toString() || "0");
    setRegularHrs(row.regular_hours?.toString() || "0");
    setOtHrs(row.ot_hours?.toString() || "0");
    setNotes(row.notes || "");
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      report_date: reportDate,
      trade,
      contractor: contractor || null,
      foreman: foreman || null,
      total_workers: parseInt(total) || 0,
      skilled: parseInt(skilled) || 0,
      unskilled: parseInt(unskilled) || 0,
      regular_hours: parseFloat(regularHrs) || 0,
      ot_hours: parseFloat(otHrs) || 0,
      notes: notes || null,
    };
    const { error } = editing
      ? await supabase.from("site_manpower").update(payload).eq("id", editing.id)
      : await supabase.from("site_manpower").insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r =>
    !search || r.trade?.toLowerCase().includes(search.toLowerCase()) || r.contractor?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search trade or contractor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "Add Entry"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Trade *</Label><Input value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. Carpentry" required /></div>
              <div className="space-y-1.5"><Label>Contractor</Label><Input value={contractor} onChange={e => setContractor(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Foreman</Label><Input value={foreman} onChange={e => setForeman(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Total Workers *</Label><Input type="number" value={total} onChange={e => setTotal(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Skilled</Label><Input type="number" value={skilled} onChange={e => setSkilled(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Unskilled</Label><Input type="number" value={unskilled} onChange={e => setUnskilled(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Regular Hours</Label><Input type="number" step="0.1" value={regularHrs} onChange={e => setRegularHrs(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>OT Hours</Label><Input type="number" step="0.1" value={otHrs} onChange={e => setOtHrs(e.target.value)} /></div>
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
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Trade</th>
              <th className="px-3 py-2 text-left font-medium">Contractor</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Skilled</th>
              <th className="px-3 py-2 text-right font-medium">Unskilled</th>
              <th className="px-3 py-2 text-right font-medium">Reg Hrs</th>
              <th className="px-3 py-2 text-right font-medium">OT Hrs</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">{r.report_date?.slice(0, 10)}</td>
                <td className="px-3 py-2 font-medium">{r.trade}</td>
                <td className="px-3 py-2">{r.contractor}</td>
                <td className="px-3 py-2 text-right">{r.total_workers}</td>
                <td className="px-3 py-2 text-right">{r.skilled}</td>
                <td className="px-3 py-2 text-right">{r.unskilled}</td>
                <td className="px-3 py-2 text-right">{r.regular_hours}</td>
                <td className="px-3 py-2 text-right">{r.ot_hours}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No entries yet.</p>}
      </div>
    </div>
  );
}
