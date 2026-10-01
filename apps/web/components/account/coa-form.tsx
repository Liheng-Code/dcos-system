"use client";

import { useEffect, useState } from "react";
import { createCoaAccount, listCoaParentOptions, updateCoaAccount } from "@/lib/account/account-service";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface CoaNode {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  normal_balance: string;
  is_active: boolean;
  sort_order: number;
}

export function CoaForm({ account: raw, onSaved, onCancel }: { account: CoaNode | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !raw?.id;
  const [parents, setParents] = useState<CoaNode[]>([]);
  const [code, setCode] = useState(raw?.code ?? "");
  const [name, setName] = useState(raw?.name ?? "");
  const [type, setType] = useState(raw?.type ?? "expense");
  const [parentId, setParentId] = useState(raw?.parent_id ?? "");
  const [normalBalance, setNormalBalance] = useState(raw?.normal_balance ?? "debit");
  const [sortOrder, setSortOrder] = useState(raw?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(raw?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCoaParentOptions().then(({ data }) => {
      if (data) setParents(data as CoaNode[]);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    setSaving(true);

    const payload = {
      code: code.trim(),
      name: name.trim(),
      type,
      parent_id: parentId || null,
      normal_balance: normalBalance,
      sort_order: sortOrder,
      is_active: isActive,
    };

    if (isNew) {
      const { error } = await createCoaAccount(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Account created");
    } else {
      const { error } = await updateCoaAccount(raw!.id, payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Account updated");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{isNew ? "New Account" : "Edit Account"}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4" /></Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. 1.1.1" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cash on Hand" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={type} onChange={e => setType(e.target.value)}>
                {["asset", "liability", "equity", "income", "expense"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Normal Balance</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={normalBalance} onChange={e => setNormalBalance(e.target.value)}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Parent Account</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">None (top-level)</option>
                {parents.filter(p => p.id !== raw?.id).map(p => (
                  <option key={p.id} value={p.id}>[{p.type}] {p.code} — {p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isNew ? "Create" : "Update"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
