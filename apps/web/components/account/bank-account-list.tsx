"use client";

import { useEffect, useState } from "react";
import { createBankAccount, deleteBankAccount, listBankAccounts, updateBankAccount } from "@/lib/account/account-service";
import { Search, Plus, Loader2, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface BankAccount {
  id: string; bank_name: string; account_name: string;
  account_number: string; currency: string;
  opening_balance: number; current_balance: number;
  is_active: boolean; notes: string | null;
}

export function BankAccountList() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  function load() {
    setLoading(true);
    listBankAccounts().then(({ data }) => {
      if (data) setAccounts(data as BankAccount[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = accounts.filter(a =>
    a.bank_name.toLowerCase().includes(search.toLowerCase()) ||
    a.account_name.toLowerCase().includes(search.toLowerCase()) ||
    a.account_number.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!confirm("Delete this bank account?")) return;
    const { error } = await deleteBankAccount(id);
    if (error) { toast.error(error.message); return; }
    toast.success("Bank account deleted");
    load();
  }

  if (showForm) {
    return <BankAccountForm account={editing} onSaved={() => { setShowForm(false); setEditing(null); load(); }} onCancel={() => { setShowForm(false); setEditing(null); }} />;
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search bank accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Account
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Bank</th>
              <th className="text-left px-4 py-2">Account Name</th>
              <th className="text-left px-4 py-2">Number</th>
              <th className="text-left px-4 py-2">Currency</th>
              <th className="text-right px-4 py-2">Balance</th>
              <th className="text-center px-4 py-2">Active</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No bank accounts found.</td></tr>
            ) : filtered.map(a => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-medium">{a.bank_name}</td>
                <td className="px-4 py-2">{a.account_name}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.account_number}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{a.currency}</Badge></td>
                <td className="px-4 py-2 text-right font-mono">${a.current_balance.toFixed(2)}</td>
                <td className="px-4 py-2 text-center">
                  {a.is_active ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Yes</Badge> : <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">No</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(a); setShowForm(true); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3 w-3" />
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

function BankAccountForm({ account, onSaved, onCancel }: { account: BankAccount | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !account?.id;
  const [bankName, setBankName] = useState(account?.bank_name ?? "");
  const [accName, setAccName] = useState(account?.account_name ?? "");
  const [accNumber, setAccNumber] = useState(account?.account_number ?? "");
  const [currency, setCurrency] = useState(account?.currency ?? "USD");
  const [openingBalance, setOpeningBalance] = useState(account?.opening_balance ?? 0);
  const [currentBalance, setCurrentBalance] = useState(account?.current_balance ?? 0);
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { bank_name: bankName, account_name: accName, account_number: accNumber, currency, opening_balance: openingBalance, current_balance: currentBalance, is_active: isActive, notes: notes.trim() || null };
    const { error } = isNew
      ? await createBankAccount(payload)
      : await updateBankAccount(account!.id, payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(isNew ? "Bank account created" : "Bank account updated");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">{isNew ? "New Bank Account" : "Edit Bank Account"}</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input value={accName} onChange={e => setAccName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Account Number</Label>
                <Input value={accNumber} onChange={e => setAccNumber(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} onChange={e => setCurrency(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Current Balance</Label>
                <Input type="number" step="0.01" value={currentBalance} onChange={e => setCurrentBalance(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-gray-300" />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : isNew ? "Create" : "Update"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
