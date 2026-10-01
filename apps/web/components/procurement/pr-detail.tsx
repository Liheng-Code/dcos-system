"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Send, CheckCircle, XCircle, RotateCcw, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useProcurementPermissions } from "@/components/procurement/use-procurement-permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deletePrById, getBudgetCodeGroupByCodeLetter, getBudgetConfirmationById, getPrById, getProjectById, listPrItemsByPrId, updatePrById } from "@/lib/procurement/procurement-service";

interface PRRecord {
  id: string;
  pr_number: string;
  project_id: string | null;
  wbs_node_id: string | null;
  task_id: string | null;
  requested_by: string | null;
  preparation_date: string | null;
  required_date: string | null;
  ship_to: string | null;
  delivery_location: string | null;
  priority: string;
  budget_code: string | null;
  budget_checked: boolean;
  budget_checked_by: string | null;
  budget_check_notes: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  total_estimated_cost: number | null;
  notes: string | null;
  budget_confirmation_id: string | null;
  created_at: string;
  updated_at: string;
}

interface BCSummary {
  id: string;
  bc_number: string;
  budget_status: string | null;
}

interface PRItem {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string;
  unit: string;
  quantity: number;
  estimated_unit_price: number | null;
  estimated_total: number | null;
  budget_code: string | null;
  notes: string | null;
  boq_item_id: string | null;
  qs_boq_items?: { item_no: string | null; item_code: string | null; description: string } | null;
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

const STATUS_ACTIONS: Record<string, { label: string; nextStatus: string; icon: LucideIcon; color: string }[]> = {
  draft: [
    { label: "Submit for Approval", nextStatus: "submitted", icon: Send, color: "bg-blue-600 hover:bg-blue-700" },
  ],
  submitted: [
    { label: "Send to Budget Review", nextStatus: "under_budget_review", icon: Send, color: "bg-amber-600 hover:bg-amber-700" },
    { label: "Override Approve", nextStatus: "approved", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Return for Revision", nextStatus: "returned", icon: RotateCcw, color: "bg-orange-600 hover:bg-orange-700" },
    { label: "Reject", nextStatus: "rejected", icon: XCircle, color: "bg-red-600 hover:bg-red-700" },
  ],
  under_budget_review: [
    { label: "Budget Check Passed", nextStatus: "approved", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Return for Revision", nextStatus: "returned", icon: RotateCcw, color: "bg-orange-600 hover:bg-orange-700" },
    { label: "Reject", nextStatus: "rejected", icon: XCircle, color: "bg-red-600 hover:bg-red-700" },
  ],
  returned: [
    { label: "Submit for Approval", nextStatus: "submitted", icon: Send, color: "bg-blue-600 hover:bg-blue-700" },
  ],
  approved: [],
  rejected: [],
  closed: [],
  cancelled: [],
};

interface PRDetailProps {
  id: string;
}

export function PRDetail({ id }: PRDetailProps) {
  const router = useRouter();
  const { can } = useProcurementPermissions(["pr"]);
  const [pr, setPr] = useState<PRRecord | null>(null);
  const [items, setItems] = useState<PRItem[]>([]);
  const [projectInfo, setProjectInfo] = useState<{ project_name: string; project_code: string } | null>(null);
  const [budgetGroupName, setBudgetGroupName] = useState<string | null>(null);
  const [budgetConfirmation, setBudgetConfirmation] = useState<BCSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchDetail = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      getPrById(id, "*"),
      listPrItemsByPrId(id, "*, qs_boq_items(item_no, item_code, description)"),
    ]).then(([prRes, itemsRes]) => {
      if (prRes.data) {
        const record = prRes.data as PRRecord;
        setPr(record);
        if (record.budget_code) {
          getBudgetCodeGroupByCodeLetter(record.budget_code).then(({ data }) => {
            if (data) setBudgetGroupName(data.name);
          });
        }
        if (record.project_id) {
          getProjectById(record.project_id, "project_name, project_code").then(({ data }) => {
            if (data) setProjectInfo(data);
          });
        }
        if (record.budget_confirmation_id) {
          getBudgetConfirmationById(record.budget_confirmation_id).then(({ data }) => {
            if (data) setBudgetConfirmation(data as BCSummary);
          });
        }
      }
      if (itemsRes.data) setItems(itemsRes.data as PRItem[]);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleAction(nextStatus: string) {
    if (nextStatus === "rejected" || nextStatus === "returned") {
      const reason = prompt(`Reason for ${nextStatus}:`);
      if (reason === null) return;
    }

    const supabase = createClient();
    const update: Record<string, string | null | boolean> = { approval_status: nextStatus };

    if (nextStatus === "approved") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        update.approved_by = user.id;
        update.approved_at = new Date().toISOString();
      }
    }

    const { error } = await updatePrById(update, id);
    if (error) { toast.error(error.message); return; }
    toast.success(`PR ${nextStatus.replace(/_/g, " ")}`);
    fetchDetail();
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await deletePrById(id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Purchase requisition deleted");
    router.push("/dashboard/procurement/pr");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!pr) return <div className="py-20 text-center text-muted-foreground">PR not found.</div>;

  const isBudgetReviewStage = pr.approval_status === "under_budget_review";
  const canBudgetReview = can("pr", "approve");
  const possibleActions = isBudgetReviewStage && !canBudgetReview ? [] : (STATUS_ACTIONS[pr.approval_status] ?? []);
  const canEdit = pr.approval_status === "draft" || pr.approval_status === "returned";
  const canDelete = pr.approval_status === "draft";

  function handleActionClick(action: { nextStatus: string }) {
    if (action.nextStatus === "approved" && isBudgetReviewStage) {
      router.push(`/dashboard/procurement/pr/${id}/budget-confirmation/new`);
      return;
    }
    handleAction(action.nextStatus);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/procurement/pr")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{pr.pr_number}</h1>
          <Badge className={STATUS_COLORS[pr.approval_status] ?? ""} variant="outline">
            {pr.approval_status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/procurement/pr/${id}/edit`)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          {isBudgetReviewStage && !canBudgetReview && (
            <span className="text-sm text-muted-foreground">Awaiting QS budget review</span>
          )}
          {possibleActions.map(action => (
            <Button key={action.nextStatus} className={action.color} size="sm" onClick={() => handleActionClick(action)}>
              <action.icon className="h-4 w-4 mr-1" /> {action.label}
            </Button>
          ))}
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase requisition?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {pr.pr_number} and all of its line items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {projectInfo && (
                <div className="col-span-2"><span className="text-muted-foreground">Project</span><p className="font-medium">{projectInfo.project_name} ({projectInfo.project_code})</p></div>
              )}
              <div><span className="text-muted-foreground">Priority</span><p className="font-medium capitalize">{pr.priority}</p></div>
              <div><span className="text-muted-foreground">Date Prepared</span><p className="font-medium">{pr.preparation_date ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Required Date</span><p className="font-medium">{pr.required_date ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Ship To</span><p className="font-medium">{pr.ship_to ?? pr.delivery_location ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Budget Group</span><p className="font-medium">{pr.budget_code ? `${pr.budget_code} — ${budgetGroupName ?? "..."}` : "—"}</p></div>
              <div><span className="text-muted-foreground">Budget Check</span><p className="font-medium">{pr.budget_checked ? "Checked ✓" : "Not checked"}</p></div>
              {pr.budget_checked && pr.budget_check_notes && <div className="col-span-2"><span className="text-muted-foreground">Budget Notes</span><p className="font-medium">{pr.budget_check_notes}</p></div>}
              <div><span className="text-muted-foreground">Est. Total</span><p className="font-bold">${pr.total_estimated_cost?.toLocaleString() ?? "—"}</p></div>
            </div>
            {pr.notes && <div className="text-sm"><span className="text-muted-foreground">Purpose</span><p>{pr.notes}</p></div>}
            {budgetConfirmation && (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Budget Confirmation</span>
                  <p className="font-medium font-mono">{budgetConfirmation.bc_number}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/procurement/pr/${id}/budget-confirmation`)}>
                  View
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(pr.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(pr.updated_at).toLocaleString()}</span>
              </div>
              {pr.approved_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span>{new Date(pr.approved_at).toLocaleString()}</span>
                </div>
              )}
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
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Code</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">BOQ Ref</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit Price</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-sm">{item.line_no}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{item.item_code ?? "—"}</td>
                  <td className="px-3 py-2 text-sm">{item.item_description}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.qs_boq_items ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-mono">
                        {item.qs_boq_items.item_no ?? item.qs_boq_items.item_code ?? "—"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity} {item.unit}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.estimated_unit_price != null ? `$${item.estimated_unit_price.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2 text-sm text-right font-medium">{item.estimated_total != null ? `$${item.estimated_total.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={6} className="px-3 py-2 text-sm text-right">Total</td>
                <td className="px-3 py-2 text-sm text-right">
                  ${items.reduce((s, i) => s + (i.estimated_total ?? 0), 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
