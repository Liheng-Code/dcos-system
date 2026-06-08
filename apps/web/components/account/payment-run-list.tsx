"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Plus, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PaymentRun {
  id: string; run_no: string; run_date: string;
  description: string | null; total_amount: number;
  voucher_count: number; status: string; notes: string | null;
}

export function PaymentRunList() {
  const supabase = createClient();
  const [runs, setRuns] = useState<PaymentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    supabase.from("account_payment_runs").select("*").order("run_date", { ascending: false }).then(({ data }) => {
      if (data) setRuns(data as PaymentRun[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = runs.filter(r =>
    r.run_no.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleApprove(run: PaymentRun) {
    const { error } = await supabase.from("account_payment_runs").update({ status: "approved" }).eq("id", run.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment run approved");
    load();
  }

  async function handleComplete(run: PaymentRun) {
    const { error } = await supabase.from("account_payment_runs").update({ status: "completed" }).eq("id", run.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment run completed");
    load();
  }

  if (showForm) return <PaymentRunForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const statusColors: Record<string, string> = { draft: "bg-gray-100 text-gray-600", approved: "bg-blue-100 text-blue-700", completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search runs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Run
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Run No</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-center px-4 py-2">Vouchers</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No payment runs found.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-mono text-xs">{r.run_no}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.run_date}</td>
                <td className="px-4 py-2">{r.description ?? "—"}</td>
                <td className="px-4 py-2 text-center">{r.voucher_count}</td>
                <td className="px-4 py-2 text-right font-mono">${r.total_amount.toFixed(2)}</td>
                <td className="px-4 py-2 text-center">
                  <Badge className={`border-0 text-[10px] ${statusColors[r.status] || "bg-gray-100 text-gray-600"}`}>{r.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  {r.status === "draft" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleApprove(r)}>
                      <CheckCircle className="h-3 w-3" /> Approve
                    </Button>
                  )}
                  {r.status === "approved" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600" onClick={() => handleComplete(r)}>
                      <CheckCircle className="h-3 w-3" /> Complete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentRunForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const [runNo, setRunNo] = useState(`PR-${Date.now()}`);
  const [runDate, setRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("account_payment_runs").insert([{
      run_no: runNo, run_date: runDate,
      description: description.trim() || null,
      notes: notes.trim() || null,
      total_amount: 0, voucher_count: 0,
      status: "draft",
    }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Payment run created");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">New Payment Run</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Run No</Label>
                <Input value={runNo} onChange={e => setRunNo(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Run Date</Label>
                <Input type="date" value={runDate} onChange={e => setRunDate(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
