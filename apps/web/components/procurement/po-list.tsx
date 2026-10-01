"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listPosNewestFirst, updatePosByIds } from "@/lib/procurement/procurement-queries";
import { Search, Plus, Loader2, Eye, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PO {
  id: string;
  po_number: string;
  supplier_id: string | null;
  project_id: string | null;
  total_amount: number | null;
  grand_total: number | null;
  status: string;
  delivery_date_expected: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  submitted: "bg-blue-500/10 text-blue-600 border-blue-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  issued: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  partially_delivered: "bg-amber-500/10 text-amber-600 border-amber-200",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  closed: "bg-slate-500/10 text-slate-600 border-slate-200",
  on_hold: "bg-orange-500/10 text-orange-600 border-orange-200",
  cancelled: "bg-red-500/10 text-red-600 border-red-200",
};

export function POList() {
  const router = useRouter();
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState("");

  function fetchPOs() {
    listPosNewestFirst().then(({ data }) => {
      if (data) setPos(data as PO[]);
      setLoading(false);
    });
  }

  useEffect(() => { fetchPOs(); }, []);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) { setSelected(new Set()); return; }
    setSelected(new Set(filtered.map(p => p.id)));
  }

  async function bulkClose() {
    if (selected.size === 0) { toast.error("Select POs to close"); return; }
    const valid = filtered.filter(p => selected.has(p.id) && (p.status === "delivered" || p.status === "under_invoice_match"));
    if (valid.length === 0) { toast.error("Only delivered POs can be closed"); return; }
    setBulkLoading("close");
    const { error } = await updatePosByIds({ status: "closed" }, valid.map(p => p.id));
    if (error) { toast.error(error.message); setBulkLoading(""); return; }
    toast.success(`${valid.length} POs closed`);
    setSelected(new Set());
    setBulkLoading("");
    fetchPOs();
  }

  const filtered = pos.filter(po => {
    const q = search.toLowerCase();
    if (q && !po.po_number.toLowerCase().includes(q)) return false;
    if (statusFilter && po.status !== statusFilter) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="issued">Issued</option>
            <option value="partially_delivered">Partially Delivered</option>
            <option value="delivered">Delivered</option>
            <option value="closed">Closed</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="outline" className="text-slate-600" onClick={bulkClose} disabled={bulkLoading === "close"}>
              {bulkLoading === "close" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Close ({selected.size})
            </Button>
          )}
          <Button onClick={() => router.push("/dashboard/procurement/po/new")} className="gap-2"><Plus className="h-4 w-4" /> New PO</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 w-10">
                <input type="checkbox" className="h-4 w-4" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} />
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expected Delivery</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No purchase orders found.</td></tr>
            ) : filtered.map(po => (
              <tr key={po.id} className={`border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${selected.has(po.id) ? "bg-muted/30" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest(".stop-click")) return; router.push(`/dashboard/procurement/po/${po.id}`); }}>
                <td className="px-4 py-3 stop-click">
                  <input type="checkbox" className="h-4 w-4" checked={selected.has(po.id)} onChange={() => toggleSelect(po.id)} />
                </td>
                <td className="px-4 py-3 text-sm font-medium">{po.po_number}</td>
                <td className="px-4 py-3"><Badge className={STATUS_COLORS[po.status] ?? ""} variant="outline">{po.status.replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-3 text-sm">{po.delivery_date_expected ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-right">{po.grand_total != null ? `$${Number(po.grand_total).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-right stop-click">
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/procurement/po/${po.id}`)}><Eye className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
