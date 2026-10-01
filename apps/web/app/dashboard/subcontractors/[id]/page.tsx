"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { deleteSubcontractItemById, getSubcontractById, insertSubcontractItem, listSubcontractBackChargesBySubcontractId, listSubcontractIpcsBySubcontractId, listSubcontractItemsBySubcontractId, listSubcontractPerformanceNoticesBySubcontractId, listSubcontractVariationsBySubcontractId, updateSubcontractById } from "@/lib/qs/qs-queries";
import {
  Loader2, Save, FileText, AlertTriangle, DollarSign,
  ClipboardList, Tag, Percent, FileWarning, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Subcontract {
  id: string; project_id: string; subcontract_no: string;
  vendor_id: string | null; scope_of_work: string | null;
  contract_type: string; contract_value: number; currency: string;
  retention_pct: number; retention_reduced_pct: number | null;
  retention_reduction_trigger: string | null;
  advance_recovery: number; performance_bond: number;
  start_date: string | null; end_date: string | null;
  status: string; signed_date: string | null;
  completion_date: string | null; notes: string | null;
}

interface SubItem {
  id: string; item_code: string; description: string | null;
  unit: string; quantity: number; unit_rate: number;
  total_value: number; wbs_node_id: string | null;
}

interface SubIpc {
  id: string; ipc_no: string; period_start: string; period_end: string;
  claimed_amount: number; certified_amount: number;
  retention_deducted: number;
  net_payable: number; status: string;
}

interface BackCharge {
  id: string; charge_no: string; description: string;
  amount: number; category: string; status: string;
}

interface PerfNotice {
  id: string; notice_no: string; notice_type: string;
  subject: string; description: string; issued_date: string;
  response_due_date: string | null; status: string;
}

interface Variation {
  id: string; variation_no: string; description: string;
  type: string; amount: number; status: string;
  schedule_impact_days: number | null;
}

type Tab = "details" | "items" | "ipcs" | "back-charges" | "notices" | "variations";

const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: "details", label: "Details", icon: ClipboardList },
  { key: "items", label: "Items (BOQ)", icon: Tag },
  { key: "ipcs", label: "IPCs", icon: DollarSign },
  { key: "back-charges", label: "Back Charges", icon: AlertTriangle },
  { key: "notices", label: "Performance Notices", icon: FileWarning },
  { key: "variations", label: "Variations", icon: FileText },
];

export default function SubcontractDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [sub, setSub] = useState<Subcontract | null>(null);
  const [items, setItems] = useState<SubItem[]>([]);
  const [ipcs, setIpcs] = useState<SubIpc[]>([]);
  const [backCharges, setBackCharges] = useState<BackCharge[]>([]);
  const [notices, setNotices] = useState<PerfNotice[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    subcontract_no: "", scope_of_work: "", contract_type: "lump_sum",
    contract_value: "0", currency: "USD", retention_pct: "5.00",
    retention_reduced_pct: "", retention_reduction_trigger: "",
    start_date: "", end_date: "", notes: "",
  });
  const [showItemForm, setShowItemForm] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    item_code: "", description: "", unit: "ea", quantity: "0", unit_rate: "0", sort_order: "0",
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getSubcontractById(id),
      listSubcontractItemsBySubcontractId(id),
      listSubcontractIpcsBySubcontractId(id),
      listSubcontractBackChargesBySubcontractId(id),
      listSubcontractPerformanceNoticesBySubcontractId(id),
      listSubcontractVariationsBySubcontractId(id),
    ]).then(([sRes, iRes, ipcRes, bcRes, pnRes, vRes]) => {
      if (sRes.data) {
        const d = sRes.data as Subcontract;
        setSub(d);
        setEditForm({
          subcontract_no: d.subcontract_no,
          scope_of_work: d.scope_of_work || "",
          contract_type: d.contract_type,
          contract_value: String(d.contract_value),
          currency: d.currency,
          retention_pct: String(d.retention_pct),
          retention_reduced_pct: d.retention_reduced_pct ? String(d.retention_reduced_pct) : "",
          retention_reduction_trigger: d.retention_reduction_trigger || "",
          start_date: d.start_date || "",
          end_date: d.end_date || "",
          notes: d.notes || "",
        });
      }
      if (iRes.data) setItems(iRes.data as SubItem[]);
      if (ipcRes.data) setIpcs(ipcRes.data as SubIpc[]);
      if (bcRes.data) setBackCharges(bcRes.data as BackCharge[]);
      if (pnRes.data) setNotices(pnRes.data as PerfNotice[]);
      if (vRes.data) setVariations(vRes.data as Variation[]);
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    const { error } = await updateSubcontractById({
      subcontract_no: editForm.subcontract_no,
      scope_of_work: editForm.scope_of_work || null,
      contract_type: editForm.contract_type,
      contract_value: parseFloat(editForm.contract_value) || 0,
      currency: editForm.currency,
      retention_pct: parseFloat(editForm.retention_pct) || 5,
      retention_reduced_pct: editForm.retention_reduced_pct ? parseFloat(editForm.retention_reduced_pct) : null,
      retention_reduction_trigger: editForm.retention_reduction_trigger || null,
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      notes: editForm.notes || null,
    }, id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Subcontract updated");
    setEditing(false);
    setSaving(false);
    getSubcontractById(id).then(({ data }) => {
      if (data) { setSub(data as Subcontract); }
    });
  }

  async function handleCreateItem() {
    setSavingItem(true);
    const { error } = await insertSubcontractItem({
      subcontract_id: id,
      item_code: itemForm.item_code,
      description: itemForm.description || null,
      unit: itemForm.unit,
      quantity: parseFloat(itemForm.quantity) || 0,
      unit_rate: parseFloat(itemForm.unit_rate) || 0,
      sort_order: parseInt(itemForm.sort_order) || 0,
    });
    if (error) { toast.error(error.message); setSavingItem(false); return; }
    toast.success("Item added");
    setShowItemForm(false);
    setItemForm({ item_code: "", description: "", unit: "ea", quantity: "0", unit_rate: "0", sort_order: "0" });
    listSubcontractItemsBySubcontractId(id).then(({ data }) => {
      if (data) setItems(data as SubItem[]);
    });
    setSavingItem(false);
  }

  async function handleDeleteItem(itemId: string) {
    const { error } = await deleteSubcontractItemById(itemId);
    if (error) { toast.error(error.message); return; }
    toast.success("Item deleted");
    listSubcontractItemsBySubcontractId(id).then(({ data }) => {
      if (data) setItems(data as SubItem[]);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
        Subcontract not found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{sub.subcontract_no}</h1>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            sub.status === "active" ? "bg-emerald-50 text-emerald-700" :
            sub.status === "awarded" ? "bg-blue-50 text-blue-700" :
            sub.status === "completed" ? "bg-gray-50 text-gray-700" :
            sub.status === "terminated" ? "bg-red-50 text-red-700" :
            "bg-amber-50 text-amber-700"
          )}>{sub.status}</span>
        </div>
        <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><DollarSign className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{sub.currency} {Number(sub.contract_value).toLocaleString()}</p><p className="text-xs text-muted-foreground">Contract Value</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Percent className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{sub.retention_pct}%{sub.retention_reduced_pct ? ` → ${sub.retention_reduced_pct}%` : ""}</p><p className="text-xs text-muted-foreground">Retention{sub.retention_reduced_pct ? " (reduced)" : ""}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600"><DollarSign className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{Number(ipcs.reduce((s, i) => s + Number(i.retention_deducted), 0)).toLocaleString()}</p><p className="text-xs text-muted-foreground">Retention Deducted</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><FileText className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{variations.filter(v => v.status === "approved" || v.status === "implemented").length}</p><p className="text-xs text-muted-foreground">Approved Variations</p></div>
        </CardContent></Card>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <div className="space-y-4">
          {editing ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Subcontract No</label>
                    <input value={editForm.subcontract_no} onChange={e => setEditForm({...editForm, subcontract_no: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Contract Type</label>
                    <select value={editForm.contract_type} onChange={e => setEditForm({...editForm, contract_type: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="lump_sum">Lump Sum</option>
                      <option value="remeasurement">Re-measurement</option>
                      <option value="cost_plus">Cost Plus</option>
                      <option value="target_price">Target Price</option>
                      <option value="schedule_of_rates">Schedule of Rates</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Contract Value</label>
                    <input type="number" value={editForm.contract_value} onChange={e => setEditForm({...editForm, contract_value: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Currency</label>
                    <input value={editForm.currency} onChange={e => setEditForm({...editForm, currency: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Retention %</label>
                    <input type="number" step="0.01" value={editForm.retention_pct} onChange={e => setEditForm({...editForm, retention_pct: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Retention Reduced % (after release)</label>
                    <input type="number" step="0.01" value={editForm.retention_reduced_pct} onChange={e => setEditForm({...editForm, retention_reduced_pct: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium">Retention Reduction Trigger</label>
                    <input value={editForm.retention_reduction_trigger} onChange={e => setEditForm({...editForm, retention_reduction_trigger: e.target.value})}
                      placeholder="e.g. Practical completion achieved"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Start Date</label>
                    <input type="date" value={editForm.start_date} onChange={e => setEditForm({...editForm, start_date: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">End Date</label>
                    <input type="date" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium">Scope of Work</label>
                    <textarea value={editForm.scope_of_work} onChange={e => setEditForm({...editForm, scope_of_work: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || !editForm.subcontract_no.trim()}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    <Save className="mr-1 h-4 w-4" /> Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-muted-foreground">Subcontract No</dt><dd className="font-medium">{sub.subcontract_no}</dd></div>
                  <div><dt className="text-muted-foreground">Contract Type</dt><dd className="font-medium capitalize">{sub.contract_type.replace(/_/g, " ")}</dd></div>
                  <div><dt className="text-muted-foreground">Contract Value</dt><dd className="font-medium">{sub.currency} {Number(sub.contract_value).toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">Retention</dt><dd className="font-medium">{sub.retention_pct}%{sub.retention_reduced_pct ? ` → ${sub.retention_reduced_pct}% after release` : ""}</dd></div>
                  <div><dt className="text-muted-foreground">Retention Deducted</dt><dd className="font-medium">{Number(ipcs.reduce((s, i) => s + Number(i.retention_deducted), 0)).toLocaleString()}</dd></div>
                  {sub.retention_reduction_trigger && <div className="col-span-2"><dt className="text-muted-foreground">Reduction Trigger</dt><dd className="font-medium">{sub.retention_reduction_trigger}</dd></div>}
                  <div><dt className="text-muted-foreground">Period</dt><dd className="font-medium">{sub.start_date || "—"} → {sub.end_date || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Currency</dt><dd className="font-medium">{sub.currency}</dd></div>
                  {sub.scope_of_work && <div className="col-span-2"><dt className="text-muted-foreground">Scope of Work</dt><dd className="font-medium">{sub.scope_of_work}</dd></div>}
                  {sub.notes && <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="font-medium">{sub.notes}</dd></div>}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "items" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""} · Total: {Number(items.reduce((s, i) => s + Number(i.total_value), 0)).toLocaleString()}</p>
            <Button size="sm" variant="outline" onClick={() => setShowItemForm(!showItemForm)}>
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          </div>

          {showItemForm && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Item Code *</label>
                    <input value={itemForm.item_code} onChange={e => setItemForm({...itemForm, item_code: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit</label>
                    <select value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="ea">Each</option>
                      <option value="m">Metre</option>
                      <option value="m2">Square Metre</option>
                      <option value="m3">Cubic Metre</option>
                      <option value="kg">Kg</option>
                      <option value="ton">Ton</option>
                      <option value="hr">Hour</option>
                      <option value="day">Day</option>
                      <option value="lot">Lot</option>
                      <option value="ls">Lump Sum</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Sort Order</label>
                    <input type="number" value={itemForm.sort_order} onChange={e => setItemForm({...itemForm, sort_order: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-xs font-medium">Description</label>
                    <input value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Quantity</label>
                    <input type="number" value={itemForm.quantity} onChange={e => setItemForm({...itemForm, quantity: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit Rate</label>
                    <input type="number" value={itemForm.unit_rate} onChange={e => setItemForm({...itemForm, unit_rate: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Total</label>
                    <p className="pt-2 text-sm font-semibold">{((parseFloat(itemForm.quantity) || 0) * (parseFloat(itemForm.unit_rate) || 0)).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowItemForm(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleCreateItem} disabled={savingItem || !itemForm.item_code.trim()}>
                    {savingItem && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {items.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No BOQ items added yet
            </div>
          ) : (
            items.map((it) => (
              <Card key={it.id}>
                <CardContent className="flex items-center gap-4 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-xs font-medium">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{it.item_code}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.description || "—"} · {it.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{Number(it.total_value).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} × {Number(it.unit_rate).toLocaleString()}</p>
                  </div>
                  <button onClick={() => handleDeleteItem(it.id)} className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "ipcs" && (
        <div className="space-y-2">
          {ipcs.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No IPCs for this subcontract
            </div>
          ) : (
            ipcs.map((ipc) => (
              <Card key={ipc.id}>
                <CardContent className="flex items-center gap-4 p-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    ipc.status === "certified" ? "bg-emerald-50 text-emerald-600" :
                    ipc.status === "paid" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                  )}>{ipc.status.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{ipc.ipc_no}</p>
                    <p className="text-xs text-muted-foreground">{ipc.period_start} → {ipc.period_end}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{Number(ipc.net_payable).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Claimed: {Number(ipc.claimed_amount).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "back-charges" && (
        <div className="space-y-2">
          {backCharges.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No back charges for this subcontract
            </div>
          ) : (
            backCharges.map((bc) => (
              <Card key={bc.id}>
                <CardContent className="flex items-center gap-4 p-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    bc.status === "deducted" ? "bg-red-50 text-red-600" :
                    bc.status === "accepted" ? "bg-emerald-50 text-emerald-600" :
                    bc.status === "disputed" ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-600"
                  )}>{bc.status.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{bc.charge_no}</p>
                    <p className="text-xs text-muted-foreground truncate">{bc.description} · {bc.category.replace(/_/g, " ")}</p>
                  </div>
                  <p className="text-sm font-semibold text-red-600">-{Number(bc.amount).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "notices" && (
        <div className="space-y-2">
          {notices.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No performance notices for this subcontract
            </div>
          ) : (
            notices.map((pn) => (
              <Card key={pn.id}>
                <CardContent className="flex flex-col gap-2 p-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                      pn.notice_type === "default" || pn.notice_type === "termination" ? "bg-red-50 text-red-600" :
                      pn.notice_type === "warning" ? "bg-amber-50 text-amber-600" :
                      "bg-blue-50 text-blue-600"
                    )}>{pn.notice_type.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{pn.notice_no}</p>
                      <p className="text-xs text-muted-foreground truncate">{pn.subject}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      pn.status === "closed" ? "bg-emerald-50 text-emerald-700" :
                      pn.status === "escalated" ? "bg-red-50 text-red-700" :
                      pn.status === "acknowledged" ? "bg-blue-50 text-blue-700" :
                      "bg-amber-50 text-amber-700"
                    )}>{pn.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pn.description}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "variations" && (
        <div className="space-y-2">
          {variations.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No variations for this subcontract
            </div>
          ) : (
            variations.map((v) => (
              <Card key={v.id}>
                <CardContent className="flex items-center gap-4 p-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    v.type === "addition" ? "bg-emerald-50 text-emerald-600" :
                    v.type === "deduction" ? "bg-red-50 text-red-600" :
                    v.type === "omission" ? "bg-amber-50 text-amber-600" :
                    "bg-blue-50 text-blue-600"
                  )}>{v.type === "addition" ? "+" : v.type === "deduction" ? "−" : "△"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{v.variation_no}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.description}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-semibold", v.type === "addition" ? "text-emerald-600" : "text-red-600")}>
                      {v.type === "addition" ? "+" : "−"}{Number(v.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.schedule_impact_days ? `${v.schedule_impact_days} days` : "—"}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
