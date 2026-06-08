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

const SEVERITY_COLORS: Record<string, string> = {
  minor: "bg-yellow-100 text-yellow-700",
  major: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  corrective_action: "bg-orange-100 text-orange-700",
  reinspection: "bg-yellow-100 text-yellow-700",
  closed: "bg-green-100 text-green-700",
  voided: "bg-gray-100 text-gray-700",
};

export function SiteNcrs() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [ncrNumber, setNcrNumber] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("open");
  const [closureComment, setClosureComment] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ncrs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setNcrNumber(""); setDescription(""); setSeverity("minor"); setResponsibleParty("");
    setDueDate(""); setStatus("open"); setClosureComment("");
    setEditing(null);
  }

  function openEdit(row: any) {
    setNcrNumber(row.ncr_number || ""); setDescription(row.description || "");
    setSeverity(row.severity || "minor"); setResponsibleParty(row.responsible_party || "");
    setDueDate(row.due_date?.slice(0, 10) || ""); setStatus(row.status || "open");
    setClosureComment(row.closure_comment || "");
    setEditing(row); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      ncr_number: ncrNumber,
      description,
      severity,
      responsible_party: responsibleParty || null,
      due_date: dueDate || null,
      status,
      closure_comment: closureComment || null,
    };
    const { error } = editing
      ? await supabase.from("ncrs").update(payload).eq("id", editing.id)
      : await supabase.from("ncrs").insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r =>
    !search || r.ncr_number?.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search NCR..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New NCR"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>NCR Number *</Label><Input value={ncrNumber} onChange={e => setNcrNumber(e.target.value)} placeholder="NCR-001" required /></div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={severity} onChange={e => setSeverity(e.target.value)}>
                  {["minor","major","critical"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Description *</Label><textarea className="flex h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Responsible Party</Label><Input value={responsibleParty} onChange={e => setResponsibleParty(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {["open","corrective_action","reinspection","closed","voided"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Closure Comment</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={closureComment} onChange={e => setClosureComment(e.target.value)} /></div>
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
              <th className="px-3 py-2 text-left font-medium">NCR#</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-left font-medium">Severity</th>
              <th className="px-3 py-2 text-left font-medium">Responsible</th>
              <th className="px-3 py-2 text-left font-medium">Due</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.ncr_number}</td>
                <td className="px-3 py-2 max-w-xs truncate">{r.description}</td>
                <td className="px-3 py-2"><Badge className={SEVERITY_COLORS[r.severity] || ""}>{r.severity}</Badge></td>
                <td className="px-3 py-2">{r.responsible_party}</td>
                <td className="px-3 py-2">{r.due_date?.slice(0, 10)}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status.replace(/_/g, " ")}</Badge></td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No NCRs yet.</p>}
      </div>
    </div>
  );
}
