"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBudgetConfirmationByPrId, getPrById, getProjectById, listBudgetConfirmationItemsByBcId, listProfilesByIds } from "@/lib/procurement/procurement-service";
import { Loader2, ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { printBudgetConfirmation } from "@/lib/print-service";

interface BCRecord {
  id: string;
  bc_number: string;
  bc_title: string | null;
  bc_type: string | null;
  ai_ref_no: string | null;
  to_name: string | null;
  to_role: string | null;
  cc: string | null;
  registered_after_approved: boolean;
  signature_pic: string | null;
  reason_design_defect: boolean;
  reason_design_missing: boolean;
  reason_design_change_vo: boolean;
  reason_change_order: boolean;
  reason_design_change_no_cost: boolean;
  reason_design_change_mgmt_no_cost: boolean;
  reason_other: string | null;
  budget_status: string | null;
  reason_over_budget: string | null;
  attachment_detail_comparison: boolean;
  attachment_quotation: boolean;
  attachment_detail_budget: boolean;
  attachment_drawing: boolean;
  attachment_other: string | null;
  prepared_by: string | null;
  prepared_by_position: string | null;
  prepared_at: string | null;
  verified_by: string | null;
  verified_by_position: string | null;
  verified_at: string | null;
  approved_by: string | null;
  approved_by_position: string | null;
  approved_at: string | null;
}

interface BCItem {
  id: string;
  line_no: number;
  budget_code: string | null;
  item_description: string;
  contract_target_budget: number | null;
  estimated_amount: number | null;
  remaining_work_amount: number | null;
}

const REASON_LABELS: [keyof BCRecord, string][] = [
  ["reason_design_defect", "Design Defect"],
  ["reason_design_missing", "Design Missing"],
  ["reason_design_change_vo", "Design change as per Client Comment (VO)"],
  ["reason_change_order", "Change Order"],
  ["reason_design_change_no_cost", "Design change as per Client Comment (No Cost Incur)"],
  ["reason_design_change_mgmt_no_cost", "Design change as per management Comment (No Cost Incur to client)"],
];

const ATTACHMENT_LABELS: [keyof BCRecord, string][] = [
  ["attachment_detail_comparison", "Detail Comparison"],
  ["attachment_quotation", "Quotation"],
  ["attachment_detail_budget", "Detail Budget"],
  ["attachment_drawing", "Drawing"],
];

export function BudgetConfirmationDetail({ prId }: { prId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bc, setBc] = useState<BCRecord | null>(null);
  const [items, setItems] = useState<BCItem[]>([]);
  const [prNumber, setPrNumber] = useState("");
  const [projectName, setProjectName] = useState("");
  const [names, setNames] = useState({ preparedBy: "", verifiedBy: "", approvedBy: "" });

  useEffect(() => {
    Promise.all([
      getPrById(prId, "pr_number, project_id"),
      getBudgetConfirmationByPrId(prId),
    ]).then(async ([prRes, bcRes]) => {
      if (prRes.data) {
        setPrNumber(prRes.data.pr_number);
        if (prRes.data.project_id) {
          const { data: proj } = await getProjectById(prRes.data.project_id, "project_name");
          if (proj) setProjectName(proj.project_name);
        }
      }
      if (bcRes.data) {
        const record = bcRes.data as BCRecord;
        setBc(record);

        const { data: itemsData } = await listBudgetConfirmationItemsByBcId(record.id);
        if (itemsData) setItems(itemsData as BCItem[]);

        const ids = [record.prepared_by, record.verified_by, record.approved_by].filter(Boolean) as string[];
        if (ids.length > 0) {
          const { data: profiles } = await listProfilesByIds(ids);
          const byId = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
          setNames({
            preparedBy: record.prepared_by ? byId.get(record.prepared_by) ?? "" : "",
            verifiedBy: record.verified_by ? byId.get(record.verified_by) ?? "" : "",
            approvedBy: record.approved_by ? byId.get(record.approved_by) ?? "" : "",
          });
        }
      }
      setLoading(false);
    });
  }, [prId]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!bc) return <div className="py-20 text-center text-muted-foreground">No budget confirmation found for this PR.</div>;

  const reasons = REASON_LABELS.filter(([key]) => bc[key]).map(([, label]) => label);
  const attachments = ATTACHMENT_LABELS.filter(([key]) => bc[key]).map(([, label]) => label);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/procurement/pr/${prId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{bc.bc_number}</h1>
          <Badge
            variant="outline"
            className={bc.budget_status === "over_budget"
              ? "bg-red-500/10 text-red-600 border-red-200"
              : "bg-emerald-500/10 text-emerald-600 border-emerald-200"}
          >
            {bc.budget_status === "over_budget" ? "Over Budget" : "Under Budget"}
          </Badge>
        </div>
        <Button size="sm" onClick={() => printBudgetConfirmation(bc, items, names, prNumber, projectName)} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold text-sm">Header</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">PR Reference</span><p className="font-medium font-mono">{prNumber}</p></div>
            <div><span className="text-muted-foreground">BC Type</span><p className="font-medium">{bc.bc_type ?? "—"}</p></div>
            <div><span className="text-muted-foreground">To</span><p className="font-medium">{[bc.to_name, bc.to_role].filter(Boolean).join(", ") || "—"}</p></div>
            <div><span className="text-muted-foreground">CC</span><p className="font-medium">{bc.cc ?? "—"}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">BC Title</span><p className="font-medium">{bc.bc_title ?? "—"}</p></div>
            <div><span className="text-muted-foreground">AI Ref No.</span><p className="font-medium">{bc.ai_ref_no ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Registered after Approved</span><p className="font-medium">{bc.registered_after_approved ? `Yes${bc.signature_pic ? ` — ${bc.signature_pic}` : ""}` : "No"}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-2">
          <h3 className="font-semibold text-sm">Reason of Budget Confirmation</h3>
          <p className="text-sm">{reasons.length > 0 ? reasons.join(", ") : "—"}{bc.reason_other ? ` · Other: ${bc.reason_other}` : ""}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="font-semibold text-sm mb-3">Summary Items Budget</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground">Budget Group</th>
                <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground">Contract Target Budget (A)</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">Amount raise PR (B)</th>
                <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground w-32 leading-tight">Remain Budget Amount (C=A-B)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-2 py-2 text-sm">{item.line_no}</td>
                  <td className="px-2 py-2 text-sm text-muted-foreground">{item.budget_code ?? "—"}</td>
                  <td className="px-2 py-2 text-sm">{item.item_description}</td>
                  <td className="px-2 py-2 text-sm text-right">${(item.contract_target_budget ?? 0).toLocaleString()}</td>
                  <td className="px-2 py-2 text-sm text-right">${(item.estimated_amount ?? 0).toLocaleString()}</td>
                  <td className={`px-2 py-2 text-right text-base font-bold ${(item.remaining_work_amount ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    ${(item.remaining_work_amount ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-2">
          <h3 className="font-semibold text-sm">Attachment</h3>
          <p className="text-sm">{attachments.length > 0 ? attachments.join(", ") : "—"}{bc.attachment_other ? ` · Other: ${bc.attachment_other}` : ""}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold text-sm">Signatures</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Prepared by</span>
              <p className="font-medium">{names.preparedBy || "—"}</p>
              <p className="text-xs text-muted-foreground">{bc.prepared_by_position ?? "—"} · {bc.prepared_at ?? "—"}</p>
            </div>
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Verify by</span>
              <p className="font-medium">{names.verifiedBy || "—"}</p>
              <p className="text-xs text-muted-foreground">{bc.verified_by_position ?? "—"} · {bc.verified_at ?? "—"}</p>
            </div>
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Approved by</span>
              <p className="font-medium">{names.approvedBy || "—"}</p>
              <p className="text-xs text-muted-foreground">{bc.approved_by_position ?? "—"} · {bc.approved_at ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
