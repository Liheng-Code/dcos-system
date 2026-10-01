"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Send, CheckCircle, XCircle, Printer, Plus, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { printPO } from "@/lib/print-service";
import { amountInWords } from "@/lib/number-to-words";
import { getPoById, getPrById, getProjectById, insertPoRevision, listPoItemsByPoId, listPoRevisionsByPoId, listSuppliers, updatePoById } from "@/lib/procurement/procurement-service";

interface PORecord {
  id: string;
  po_number: string;
  supplier_id: string;
  project_id: string | null;
  wbs_node_id: string | null;
  pr_id: string | null;
  po_date: string | null;
  vendor_address: string | null;
  vendor_contact_person: string | null;
  vendor_contact_no: string | null;
  delivery_date_expected: string | null;
  delivery_address: string | null;
  currency: string;
  total_amount: number | null;
  tax_amount: number | null;
  grand_total: number | null;
  vat_rate: number | null;
  advance_payment_terms: string | null;
  other_payment_terms: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  issued_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface POItem {
  id: string;
  line_no: number;
  item_type: string;
  item_code: string | null;
  item_description: string;
  materials_code: string | null;
  brand: string | null;
  country: string | null;
  unit: string | null;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_accepted: number;
  unit_rate_labor: number | null;
  unit_rate_materials: number | null;
  unit_price: number;
  total_price: number;
  delivery_date_expected: string | null;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

interface Revision {
  id: string;
  rev_no: number;
  description: string;
  rev_date: string;
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

const STATUS_ACTIONS: Record<string, { label: string; nextStatus: string; icon: LucideIcon; color: string }[]> = {
  draft: [
    { label: "Submit for Approval", nextStatus: "submitted", icon: Send, color: "bg-blue-600 hover:bg-blue-700" },
  ],
  submitted: [
    { label: "Approve", nextStatus: "approved", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Reject", nextStatus: "cancelled", icon: XCircle, color: "bg-red-600 hover:bg-red-700" },
  ],
  approved: [
    { label: "Issue to Supplier", nextStatus: "issued", icon: Send, color: "bg-indigo-600 hover:bg-indigo-700" },
  ],
  issued: [],
  partially_delivered: [],
  delivered: [
    { label: "Close PO", nextStatus: "closed", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
  ],
  closed: [],
  on_hold: [],
  cancelled: [],
};

interface PODetailProps {
  id: string;
}

export function PODetail({ id }: PODetailProps) {
  const router = useRouter();
  const [po, setPo] = useState<PORecord | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [prNumber, setPrNumber] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ description: "", rev_date: new Date().toISOString().slice(0, 10) });
  const [savingRevision, setSavingRevision] = useState(false);

  const fetchDetail = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      getPoById(id),
      listPoItemsByPoId(id, "*"),
      listSuppliers(),
      listPoRevisionsByPoId(id),
    ]).then(([poRes, itemsRes, supRes, revRes]) => {
      if (poRes.data) {
        const record = poRes.data as PORecord;
        setPo(record);
        if (record.pr_id) {
          getPrById(record.pr_id, "pr_number").then(({ data }) => {
            if (data) setPrNumber(data.pr_number);
          });
        }
        if (record.project_id) {
          getProjectById(record.project_id, "project_name, project_code").then(({ data }) => {
            if (data) setProjectName(`${data.project_name} (${data.project_code})`);
          });
        }
      }
      if (itemsRes.data) setItems(itemsRes.data as POItem[]);
      if (supRes.data) {
        const map: Record<string, string> = {};
        for (const s of supRes.data as Supplier[]) map[s.id] = s.supplier_name;
        setSuppliers(map);
      }
      if (revRes.data) setRevisions(revRes.data as Revision[]);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleAction(nextStatus: string) {
    const supabase = createClient();
    const update: Record<string, string | null> = { status: nextStatus };

    if (nextStatus === "approved") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        (update as Record<string, string>).approved_by = user.id;
        (update as Record<string, string>).approved_at = new Date().toISOString();
      }
    }
    if (nextStatus === "issued") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) (update as Record<string, string>).issued_by = user.id;
      (update as Record<string, string>).issued_date = new Date().toISOString().split("T")[0];
    }

    const { error } = await updatePoById(update, id);
    if (error) { toast.error(error.message); return; }
    toast.success(`PO ${nextStatus.replace(/_/g, " ")}`);
    fetchDetail();
  }

  async function handleAddRevision() {
    if (!revisionForm.description.trim()) { toast.error("Enter a description"); return; }
    setSavingRevision(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const nextRevNo = revisions.reduce((max, r) => Math.max(max, r.rev_no), 0) + 1;

    const { error } = await insertPoRevision({
      po_id: id,
      rev_no: nextRevNo,
      description: revisionForm.description,
      rev_date: revisionForm.rev_date,
      created_by: user?.id ?? null,
    });

    if (error) { toast.error(error.message); setSavingRevision(false); return; }
    toast.success("Revision logged");
    setRevisionForm({ description: "", rev_date: new Date().toISOString().slice(0, 10) });
    setShowRevisionDialog(false);
    setSavingRevision(false);
    fetchDetail();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!po) return <div className="py-20 text-center text-muted-foreground">PO not found.</div>;

  const possibleActions = STATUS_ACTIONS[po.status] ?? [];
  const supplierName = suppliers[po.supplier_id] ?? "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/procurement/po")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{po.po_number}</h1>
          <Badge className={STATUS_COLORS[po.status] ?? ""} variant="outline">{po.status.replace(/_/g, " ")}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => printPO(po, items, revisions, supplierName, projectName, prNumber)}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          {possibleActions.map(action => (
            <Button key={action.nextStatus} className={action.color} size="sm" onClick={() => handleAction(action.nextStatus)}>
              <action.icon className="h-4 w-4 mr-1" /> {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {projectName && <div className="col-span-2"><span className="text-muted-foreground">Project</span><p className="font-medium">{projectName}</p></div>}
              <div><span className="text-muted-foreground">PR No.</span><p className="font-medium">{prNumber ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Date</span><p className="font-medium">{po.po_date ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{supplierName}</p></div>
              <div><span className="text-muted-foreground">Currency</span><p className="font-medium">{po.currency}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Vendor Address</span><p className="font-medium whitespace-pre-line">{po.vendor_address ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Contact Person</span><p className="font-medium">{po.vendor_contact_person ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Contact No.</span><p className="font-medium">{po.vendor_contact_no ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Ship To</span><p className="font-medium">{po.delivery_address ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Expected Delivery</span><p className="font-medium">{po.delivery_date_expected ?? "—"}</p></div>
              {(po.advance_payment_terms || po.other_payment_terms) ? (
                <>
                  <div><span className="text-muted-foreground">Advance Payment</span><p className="font-medium">{po.advance_payment_terms ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Other Payment</span><p className="font-medium">{po.other_payment_terms ?? "—"}</p></div>
                </>
              ) : (
                <div><span className="text-muted-foreground">Payment Terms</span><p className="font-medium">{po.payment_terms ?? "—"}</p></div>
              )}
              <div><span className="text-muted-foreground">Delivery Terms</span><p className="font-medium">{po.delivery_terms ?? "—"}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Financial Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Amount</span><span className="font-medium">{po.currency} {po.total_amount?.toLocaleString() ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT ({po.vat_rate ?? 0}%)</span><span className="font-medium">{po.currency} {po.tax_amount?.toLocaleString() ?? "—"}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Grand Total</span><span className="font-bold">{po.currency} {po.grand_total?.toLocaleString() ?? "—"}</span></div>
              <p className="text-xs text-muted-foreground pt-1">Amount in Text: {amountInWords(po.grand_total ?? 0, po.currency)}</p>
            </div>

            <h3 className="font-semibold text-sm pt-2">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(po.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Updated</span><span>{new Date(po.updated_at).toLocaleString()}</span></div>
              {po.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span>{new Date(po.approved_at).toLocaleString()}</span></div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="font-semibold text-sm mb-3">Items</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Materials Code</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Brand</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Country</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Ordered</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Delivered</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Rate (Labor)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Rate (Materials)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => item.item_type === "section" ? (
                <tr key={item.id} className="border-b last:border-0">
                  <td colSpan={10} className="px-3 py-2 text-sm font-semibold bg-muted/30">{item.item_description}</td>
                </tr>
              ) : (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-sm">{item.line_no}</td>
                  <td className="px-3 py-2 text-sm whitespace-pre-line">{item.item_description}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{item.materials_code ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{item.brand ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{item.country ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity_ordered} {item.unit}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity_delivered}</td>
                  <td className="px-3 py-2 text-sm text-right">${(item.unit_rate_labor ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-sm text-right">${(item.unit_rate_materials ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-sm text-right font-medium">${item.total_price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Revision History</h3>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowRevisionDialog(true)}>
              <Plus className="h-3 w-3" /> Add Revision
            </Button>
          </div>
          {revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No revisions logged.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Rev</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Date</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-sm">{r.rev_no}</td>
                    <td className="px-3 py-2 text-sm">{r.description}</td>
                    <td className="px-3 py-2 text-sm">{r.rev_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground">Adds a note describing what changed. It does not modify the PO&apos;s stored fields, items, or totals.</p>
        </CardContent>
      </Card>

      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Revision</DialogTitle>
            <DialogDescription>Log a note describing what changed on this PO.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[80px]"
                value={revisionForm.description}
                onChange={e => setRevisionForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={revisionForm.rev_date} onChange={e => setRevisionForm(prev => ({ ...prev, rev_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionDialog(false)} disabled={savingRevision}>Cancel</Button>
            <Button onClick={handleAddRevision} disabled={savingRevision}>
              {savingRevision && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
