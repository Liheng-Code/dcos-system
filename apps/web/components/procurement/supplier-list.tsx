"use client";

import { useEffect, useState } from "react";
import { deleteSupplierById, listSuppliersByName } from "@/lib/procurement/procurement-service";
import { Search, Plus, Loader2, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SupplierForm } from "@/components/procurement/supplier-form";

interface Supplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_type: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  currency: string;
  payment_terms: string | null;
  status: string;
  notes: string | null;
  pq_status: string;
  pq_score: number | null;
  pq_expires_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-gray-500/10 text-gray-500 border-gray-200",
  blacklisted: "bg-red-500/10 text-red-600 border-red-200",
  suspended: "bg-amber-500/10 text-amber-600 border-amber-200",
};

const PQ_COLORS: Record<string, string> = {
  not_started: "bg-slate-500/10 text-slate-600 border-slate-200",
  draft: "bg-blue-500/10 text-blue-600 border-blue-200",
  submitted: "bg-amber-500/10 text-amber-600 border-amber-200",
  under_review: "bg-violet-500/10 text-violet-600 border-violet-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
  expired: "bg-orange-500/10 text-orange-600 border-orange-200",
  suspended: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  blacklisted: "bg-red-600/10 text-red-700 border-red-200",
};

function formatExpiry(date: string | null) {
  return date ? new Date(date).toLocaleDateString() : "No expiry";
}

export function SupplierList() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  function fetchSuppliers() {
    listSuppliersByName().then(({ data }) => {
      if (data) setSuppliers(data as Supplier[]);
      setLoading(false);
    });
  }

  useEffect(() => { fetchSuppliers(); }, []);

  const filtered = suppliers.filter(s =>
    !search || s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    s.supplier_code.toLowerCase().includes(search.toLowerCase())
  );

  function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    deleteSupplierById(id).then(({ error }) => {
      if (error) { toast.error(error.message); return; }
      toast.success("Supplier deleted");
      setSuppliers(prev => prev.filter(s => s.id !== id));
    });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (showForm || editing) {
    return (
      <SupplierForm
        supplier={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={() => { setShowForm(false); setEditing(null); fetchSuppliers(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Supplier</Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PQ</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No suppliers found.</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{s.supplier_code}</td>
                <td className="px-4 py-3 text-sm">{s.supplier_name}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{s.supplier_type ?? "—"}</td>
                <td className="px-4 py-3 text-sm">{s.contact_person ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{s.email ?? "—"}</td>
                <td className="px-4 py-3"><Badge className={STATUS_COLORS[s.status] ?? ""} variant="outline">{s.status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Badge className={PQ_COLORS[s.pq_status] ?? ""} variant="outline">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {(s.pq_status ?? "not_started").replaceAll("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.pq_score ?? "-"} / 100 | {formatExpiry(s.pq_expires_at)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
