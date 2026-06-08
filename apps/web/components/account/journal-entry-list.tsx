"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Plus, Loader2, Eye, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface JeEntry {
  id: string; entry_no: string; entry_date: string;
  period_id: string | null; description: string | null;
  source: string; is_approved: boolean;
}

export function JournalEntryList() {
  const supabase = createClient();
  const [entries, setEntries] = useState<JeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JeEntry | null>(null);

  useEffect(() => {
    supabase.from("account_journal_entries").select("*").order("entry_date", { ascending: false }).then(({ data }) => {
      if (data) setEntries(data as JeEntry[]);
      setLoading(false);
    });
  }, []);

  const filtered = entries.filter(e =>
    e.entry_no.toLowerCase().includes(search.toLowerCase()) ||
    (e.description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (showForm) {
    return <JournalEntryForm entry={editing} onSaved={() => { setShowForm(false); setEditing(null); }} onCancel={() => { setShowForm(false); setEditing(null); }} />;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Entry No</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Source</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-center px-4 py-2">Approved</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No journal entries found.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-mono text-xs">{e.entry_no}</td>
                <td className="px-4 py-2 text-muted-foreground">{e.entry_date}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{e.source}</Badge></td>
                <td className="px-4 py-2">{e.description ?? "—"}</td>
                <td className="px-4 py-2 text-center">
                  {e.is_approved ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Yes</Badge> : <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">No</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditing(e); setShowForm(true); }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JournalEntryForm({ entry: raw, onSaved, onCancel }: { entry: JeEntry | null; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const isNew = !raw?.id;
  const [entryNo, setEntryNo] = useState(raw?.entry_no ?? `JE-${Date.now()}`);
  const [entryDate, setEntryDate] = useState(raw?.entry_date ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(raw?.description ?? "");
  const [source, setSource] = useState(raw?.source ?? "manual");
  const [lines, setLines] = useState<{ account_id: string; debit: number; credit: number; line_desc: string }[]>([{ account_id: "", debit: 0, credit: 0, line_desc: "" }]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("account_coa").select("id, code, name").order("code").then(({ data }) => {
      if (data) setAccounts(data as { id: string; code: string; name: string }[]);
    });
  }, []);

  function addLine() { setLines(prev => [...prev, { account_id: "", debit: 0, credit: 0, line_desc: "" }]); }

  function updateLine(i: number, field: string, value: string | number) {
    setLines(prev => {
      const next = [...prev];
      (next[i] as Record<string, unknown>)[field] = value;
      return next;
    });
  }

  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)); }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced) { toast.error("Debit and credit totals must balance"); return; }
    if (lines.some(l => !l.account_id)) { toast.error("All lines must have an account"); return; }
    setSaving(true);

    const payload = {
      entry_no: entryNo,
      entry_date: entryDate,
      description: description.trim() || null,
      source,
    };

    if (isNew) {
      const { data, error } = await supabase.from("account_journal_entries").insert([payload]).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }

      const linePayload = lines.map(l => ({
        entry_id: data!.id,
        account_id: l.account_id,
        debit_amount: l.debit,
        credit_amount: l.credit,
        description: l.line_desc.trim() || null,
      }));
      const { error: lineErr } = await supabase.from("account_journal_lines").insert(linePayload);
      if (lineErr) { toast.error(lineErr.message); setSaving(false); return; }
      toast.success("Journal entry created");
    } else {
      const { error } = await supabase.from("account_journal_entries").update(payload).eq("id", raw!.id);
      if (error) { toast.error(error.message); setSaving(false); return; }

      await supabase.from("account_journal_lines").delete().eq("entry_id", raw!.id);
      const linePayload = lines.map(l => ({
        entry_id: raw!.id,
        account_id: l.account_id,
        debit_amount: l.debit,
        credit_amount: l.credit,
        description: l.line_desc.trim() || null,
      }));
      const { error: lineErr } = await supabase.from("account_journal_lines").insert(linePayload);
      if (lineErr) { toast.error(lineErr.message); setSaving(false); return; }
      toast.success("Journal entry updated");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">{isNew ? "New Journal Entry" : "Edit Journal Entry"}</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Entry No</Label>
                <Input value={entryNo} disabled className="bg-muted/30" />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={source} onChange={e => setSource(e.target.value)}>
                  {["manual", "ap_invoice", "ar_invoice", "payment", "revaluation", "closing", "other"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Entry description" />
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground">
                    <th className="text-left px-3 py-2">Account</th>
                    <th className="text-right px-3 py-2 w-32">Debit</th>
                    <th className="text-right px-3 py-2 w-32">Credit</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-center px-3 py-2 w-10">×</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <select className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs" value={line.account_id} onChange={e => updateLine(i, "account_id", e.target.value)}>
                          <option value="">Select account</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" step="0.01" min="0" className="h-8 text-xs text-right" value={line.debit || ""} onChange={e => updateLine(i, "debit", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" step="0.01" min="0" className="h-8 text-xs text-right" value={line.credit || ""} onChange={e => updateLine(i, "credit", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input className="h-8 text-xs" value={line.line_desc} onChange={e => updateLine(i, "line_desc", e.target.value)} placeholder="Line desc" />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button type="button" className="text-red-500 text-xs" onClick={() => removeLine(i)} disabled={lines.length <= 1}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t flex items-center justify-between">
                <button type="button" className="text-xs text-primary font-medium" onClick={addLine}>+ Add Line</button>
                <span className={`text-xs font-semibold ${isBalanced ? "text-green-600" : "text-red-600"}`}>
                  Debit: ${totalDebit.toFixed(2)} &nbsp; Credit: ${totalCredit.toFixed(2)} &nbsp;
                  {isBalanced ? "✓ Balanced" : "✗ Not balanced"}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving || !isBalanced} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isNew ? "Create" : "Update"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
