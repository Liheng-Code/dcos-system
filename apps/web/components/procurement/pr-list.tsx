"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listProjectsByIds, listPrs, updatePrsByIds } from "@/lib/procurement/procurement-queries";
import { Search, Plus, Loader2, Eye, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PR {
  id: string;
  pr_number: string;
  project_id: string | null;
  requested_by: string | null;
  required_date: string | null;
  priority: string;
  approval_status: string;
  total_estimated_cost: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  submitted: "bg-blue-500/10 text-blue-600 border-blue-200",
  under_budget_review: "bg-amber-500/10 text-amber-600 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  returned: "bg-orange-500/10 text-orange-600 border-orange-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
  closed: "bg-slate-500/10 text-slate-600 border-slate-200",
  cancelled: "bg-gray-500/10 text-gray-500 border-gray-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  normal: "bg-gray-100 text-gray-600",
  high: "bg-amber-100 text-amber-600",
  urgent: "bg-red-100 text-red-600",
  emergency: "bg-red-100 text-red-600",
};

export function PRList() {
  const router = useRouter();
  const [prs, setPrs] = useState<PR[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, { project_code: string; project_name: string }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState("");

  function fetchPRs() {
    listPrs().then(({ data }) => {
      const records = (data ?? []) as PR[];
      setPrs(records);
      const projectIds = [...new Set(records.map(r => r.project_id).filter(Boolean))] as string[];
      if (projectIds.length > 0) {
        listProjectsByIds(projectIds).then(({ data: projs }) => {
          if (projs) {
            const map: Record<string, { project_code: string; project_name: string }> = {};
            projs.forEach(p => { map[p.id] = p; });
            setProjectsMap(map);
          }
        });
      }
      setLoading(false);
    });
  }

  useEffect(() => { fetchPRs(); }, []);

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

  async function bulkApprove() {
    if (selected.size === 0) { toast.error("Select PRs to approve"); return; }
    const valid = filtered.filter(p => selected.has(p.id) && (p.approval_status === "submitted" || p.approval_status === "under_budget_review"));
    if (valid.length === 0) { toast.error("None of the selected PRs are ready for approval"); return; }
    setBulkLoading("approve");
    const ids = valid.map(p => p.id);
    const { error } = await updatePrsByIds({ approval_status: "approved", approved_at: new Date().toISOString() }, ids);
    if (error) { toast.error(error.message); setBulkLoading(""); return; }
    toast.success(`${ids.length} PRs approved`);
    setSelected(new Set());
    setBulkLoading("");
    fetchPRs();
  }

  async function bulkClose() {
    if (selected.size === 0) { toast.error("Select PRs to close"); return; }
    const valid = filtered.filter(p => selected.has(p.id) && p.approval_status === "approved");
    if (valid.length === 0) { toast.error("Only approved PRs can be closed"); return; }
    setBulkLoading("close");
    const { error } = await updatePrsByIds({ approval_status: "closed" }, valid.map(p => p.id));
    if (error) { toast.error(error.message); setBulkLoading(""); return; }
    toast.success(`${valid.length} PRs closed`);
    setSelected(new Set());
    setBulkLoading("");
    fetchPRs();
  }

  const filtered = prs.filter(pr => {
    const q = search.toLowerCase();
    if (q && !pr.pr_number.toLowerCase().includes(q)) return false;
    if (statusFilter && pr.approval_status !== statusFilter) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search PRs..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_budget_review">Budget Review</option>
            <option value="approved">Approved</option>
            <option value="returned">Returned</option>
            <option value="rejected">Rejected</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" className="text-emerald-600" onClick={bulkApprove} disabled={bulkLoading === "approve"}>
                {bulkLoading === "approve" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Approve ({selected.size})
              </Button>
              <Button size="sm" variant="outline" className="text-slate-600" onClick={bulkClose} disabled={bulkLoading === "close"}>
                {bulkLoading === "close" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Close ({selected.size})
              </Button>
            </>
          )}
          <Button onClick={() => router.push("/dashboard/procurement/pr/new")} className="gap-2"><Plus className="h-4 w-4" /> New PR</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left font-medium text-muted-foreground py-3 px-4 w-10">
                <input type="checkbox" className="h-4 w-4" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} />
              </th>
              <th className="text-left font-medium text-muted-foreground py-3 px-4">PR #</th>
              <th className="text-left font-medium text-muted-foreground py-3 px-4">Project</th>
              <th className="text-left font-medium text-muted-foreground py-3 px-4">Priority</th>
              <th className="text-left font-medium text-muted-foreground py-3 px-4">Required</th>
              <th className="text-right font-medium text-muted-foreground py-3 px-4">Total</th>
              <th className="text-center font-medium text-muted-foreground py-3 px-4">Status</th>
              <th className="text-center font-medium text-muted-foreground py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No purchase requisitions found.</td></tr>
            ) : filtered.map(pr => (
              <tr key={pr.id} className={`border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${selected.has(pr.id) ? "bg-muted/30" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest(".stop-click")) return; router.push(`/dashboard/procurement/pr/${pr.id}`); }}>
                <td className="px-4 py-3 stop-click">
                  <input type="checkbox" className="h-4 w-4" checked={selected.has(pr.id)} onChange={() => toggleSelect(pr.id)} />
                </td>
                <td className="px-4 py-3 text-sm font-medium">{pr.pr_number}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {pr.project_id && projectsMap[pr.project_id]
                    ? `${projectsMap[pr.project_id].project_code}`
                    : "—"}
                </td>
                <td className="px-4 py-3"><Badge className={PRIORITY_COLORS[pr.priority] ?? ""}>{pr.priority}</Badge></td>
                <td className="px-4 py-3 text-sm">{pr.required_date ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-right">{pr.total_estimated_cost != null ? `$${Number(pr.total_estimated_cost).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-center"><Badge className={STATUS_COLORS[pr.approval_status] ?? ""} variant="outline">{pr.approval_status.replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-3 text-right stop-click">
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/procurement/pr/${pr.id}`)}><Eye className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
