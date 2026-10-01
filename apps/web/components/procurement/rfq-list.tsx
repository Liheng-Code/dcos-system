"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listRfqs } from "@/lib/procurement/procurement-queries";
import { Search, Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface RFQRecord {
  id: string;
  rfq_number: string;
  pr_id: string | null;
  response_deadline: string | null;
  status: string;
  created_at: string;
  procurement_prs: { pr_number: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  issued: "bg-blue-500/10 text-blue-600 border-blue-200",
  quotations_received: "bg-amber-500/10 text-amber-600 border-amber-200",
  under_evaluation: "bg-purple-500/10 text-purple-600 border-purple-200",
  awarded: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  rejected_all: "bg-red-500/10 text-red-600 border-red-200",
  cancelled: "bg-gray-500/10 text-gray-500 border-gray-200",
};

export function RFQList() {
  const router = useRouter();
  const [rfqs, setRfqs] = useState<RFQRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchRFQs = useCallback(() => {
    let query = listRfqs();

    if (search) {
      query = query.or(`rfq_number.ilike.%${search}%,procurement_prs.pr_number.ilike.%${search}%`);
    }
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    query.then(({ data }) => {
      if (data) setRfqs(data as unknown as RFQRecord[]);
      setLoading(false);
    });
  }, [search, statusFilter]);

  useEffect(() => { fetchRFQs(); }, [fetchRFQs]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search RFQs..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="quotations_received">Quotations Received</option>
            <option value="under_evaluation">Under Evaluation</option>
            <option value="awarded">Awarded</option>
            <option value="rejected_all">Rejected All</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <Button onClick={() => router.push("/dashboard/procurement/rfq/new")} className="gap-2">
          <Plus className="h-4 w-4" /> New RFQ
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">RFQ Number</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Source PR</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Deadline</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rfqs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No RFQs found.</td></tr>
            ) : (
              rfqs.map(rfq => (
                <tr key={rfq.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-medium">{rfq.rfq_number}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{rfq.procurement_prs?.pr_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[rfq.status] ?? ""} variant="outline">
                      {rfq.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">{rfq.response_deadline ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/procurement/rfq/${rfq.id}`)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
