"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { deleteSubcontractVariationById, insertSubcontractVariation, listSubcontractVariationsByProjectId, listSubcontractsByProjectId, updateSubcontractVariationById } from "@/lib/qs/qs-queries";
import { AlertTriangle, CheckCircle, Clock, FileText, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VariationOrderList } from "@/components/qs/variation-order-list";

const SUB_TAB_IDS = ["main", "sub"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

interface SubVariation {
  id: string; subcontract_id: string;
  variation_no: string; description: string;
  type: string; amount: number;
  status: string; approved_date: string | null;
  schedule_impact_days: number | null;
  subcontracts: { subcontract_no: string } | null;
}

const SUB_VARIATION_COLUMNS =
  "id, subcontract_id, variation_no, description, type, amount, status, approved_date, schedule_impact_days, subcontracts!inner(project_id, subcontract_no)";

const EMPTY_SUB_VARIATION_FORM = {
  subcontract_id: "", variation_no: "", description: "",
  type: "addition", amount: "0", schedule_impact_days: "0",
};

// Only additions increase the subcontract sum; every other type reduces or is neutral-to-negative.
const signedAmount = (v: SubVariation) => (v.type === "addition" ? Number(v.amount) : -Number(v.amount));
const isCounted = (v: SubVariation) => v.status === "approved" || v.status === "implemented";
const isPending = (v: SubVariation) => !isCounted(v) && v.status !== "rejected";

function SubVariationList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<SubVariation[]>([]);
  const [subcontracts, setSubcontracts] = useState<{ id: string; subcontract_no: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_SUB_VARIATION_FORM);
  const setField = (key: keyof typeof EMPTY_SUB_VARIATION_FORM, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const itemsQuery = useCallback(
    () =>
      listSubcontractVariationsByProjectId(SUB_VARIATION_COLUMNS, projectId),
    [projectId],
  );

  useEffect(() => {
    listSubcontractsByProjectId(projectId)
      .then(({ data }) => {
        if (data) setSubcontracts(data);
      });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as unknown as SubVariation[]);
      setLoading(false);
    });
  }, [projectId, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await insertSubcontractVariation({
      subcontract_id: form.subcontract_id,
      variation_no: form.variation_no.trim(),
      description: form.description.trim(),
      type: form.type,
      amount: parseFloat(form.amount) || 0,
      schedule_impact_days: parseInt(form.schedule_impact_days) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Variation created");
    setShowForm(false);
    setForm(EMPTY_SUB_VARIATION_FORM);
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as unknown as SubVariation[]);
    });
    setSaving(false);
  }

  async function handleStatusUpdate(id: string, status: string) {
    const update: Record<string, string> = { status };
    if (status === "approved") update.approved_date = new Date().toISOString().split("T")[0];
    const { error } = await updateSubcontractVariationById(update, id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Variation ${status}`);
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as unknown as SubVariation[]);
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft variation?")) return;
    const { error } = await deleteSubcontractVariationById(id);
    if (error) { toast.error(error.message); return; }
    toast.success("Variation deleted");
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  const netChange = items.filter(isCounted).reduce((s, v) => s + signedAmount(v), 0);
  const pendingCount = items.filter(isPending).length;
  const scheduleDays = items.reduce((s, v) => s + (v.schedule_impact_days || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><FileText className="h-4 w-4" /></div>
            <div>
              <p className="text-xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              {netChange >= 0 ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </div>
            <div>
              <p className={cn("text-xl font-bold", netChange >= 0 ? "text-emerald-600" : "text-red-600")}>
                {netChange >= 0 ? "+" : ""}{netChange.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Net Change (approved)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></div>
            <div>
              <p className="text-xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-600"><Clock className="h-4 w-4" /></div>
            <div>
              <p className="text-xl font-bold">{scheduleDays}</p>
              <p className="text-xs text-muted-foreground">Schedule Impact (days)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} variation{items.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Variation
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subcontract *</label>
                <select value={form.subcontract_id} onChange={(e) => setField("subcontract_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Variation No *</label>
                <input value={form.variation_no} onChange={(e) => setField("variation_no", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.type} onChange={(e) => setField("type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="addition">Addition</option>
                  <option value="deduction">Deduction</option>
                  <option value="omission">Omission</option>
                  <option value="change_of_method">Change of Method</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description *</label>
                <textarea value={form.description} onChange={(e) => setField("description", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Amount</label>
                <input type="number" value={form.amount} onChange={(e) => setField("amount", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Schedule Impact (days)</label>
                <input type="number" value={form.schedule_impact_days} onChange={(e) => setField("schedule_impact_days", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={saving || !form.subcontract_id || !form.variation_no.trim() || !form.description.trim()}
              >
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <GitBranch className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No subcontractor variations</p>
        </div>
      ) : (
        items.map((v) => (
          <Card key={v.id}>
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  v.type === "addition" ? "bg-emerald-50 text-emerald-600" :
                  v.type === "deduction" ? "bg-red-50 text-red-600" :
                  v.type === "omission" ? "bg-amber-50 text-amber-600" :
                  "bg-blue-50 text-blue-600"
                )}>{v.type === "addition" ? "+" : v.type === "deduction" ? "−" : "△"}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {v.variation_no}
                    {v.subcontracts?.subcontract_no && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{v.subcontracts.subcontract_no}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{v.description} · {v.type.replace(/_/g, " ")}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-semibold", v.type === "addition" ? "text-emerald-600" : "text-red-600")}>
                    {v.type === "addition" ? "+" : "−"}{Number(v.amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{v.schedule_impact_days ? `${v.schedule_impact_days} days` : "—"}</p>
                </div>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  v.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                  v.status === "implemented" ? "bg-blue-50 text-blue-700" :
                  v.status === "rejected" ? "bg-red-50 text-red-700" :
                  v.status === "submitted" ? "bg-amber-50 text-amber-700" :
                  "bg-gray-50 text-gray-700"
                )}>{v.status}</span>
                {v.status === "draft" && (
                  <button onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-red-600" aria-label="Delete draft variation">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                {v.status === "draft" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(v.id, "submitted")}>Submit</Button>
                )}
                {v.status === "submitted" && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => handleStatusUpdate(v.id, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleStatusUpdate(v.id, "rejected")}>Reject</Button>
                  </>
                )}
                {v.status === "approved" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(v.id, "implemented")}>Implement</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

interface Props {
  projectId: string;
  projectName?: string;
}

export function MergedVariationsView({ projectId, projectName }: Props) {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const subTab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "main";

  return (
    <div className="space-y-4">
      {subTab === "main" && <VariationOrderList projectId={projectId} projectName={projectName} />}
      {subTab === "sub"  && <SubVariationList projectId={projectId} />}
    </div>
  );
}
