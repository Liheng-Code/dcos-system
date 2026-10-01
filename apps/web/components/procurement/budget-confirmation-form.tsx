"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPrById, getProfileById, getProjectById, insertBudgetConfirmation, insertBudgetConfirmationItems, listBudgetCodeGroups, listBudgetCodesByIds, listBudgetConfirmationsByProjectId, listPrItemsByPrId, listQsBoqItemsByIds, updatePrById } from "@/lib/procurement/procurement-service";

interface PRRecordForBC {
  id: string;
  pr_number: string;
  project_id: string | null;
  requested_by: string | null;
  preparation_date: string | null;
  notes: string | null;
}

interface PRItemForBC {
  id: string;
  budget_code: string | null;
  item_description: string;
  estimated_total: number | null;
  boq_item_id: string | null;
}

interface BCItemRow {
  key: string;
  pr_item_id: string | null;
  budget_code: string;
  budget_group_label: string;
  has_boq_link: boolean;
  is_auto_linked: boolean;
  is_baseline_provisional: boolean;
  item_description: string;
  contract_target_budget: number;
  estimated_amount: number;
}

const REASON_OPTIONS = [
  { key: "reason_design_defect", label: "Design Defect" },
  { key: "reason_design_missing", label: "Design Missing" },
  { key: "reason_design_change_vo", label: "Design change as per Client Comment (VO)" },
  { key: "reason_change_order", label: "Change Order" },
  { key: "reason_design_change_no_cost", label: "Design change as per Client Comment (No Cost Incur)" },
  { key: "reason_design_change_mgmt_no_cost", label: "Design change as per management Comment (No Cost Incur to client)" },
] as const;

const ATTACHMENT_OPTIONS = [
  { key: "attachment_detail_comparison", label: "Detail Comparison" },
  { key: "attachment_quotation", label: "Quotation" },
  { key: "attachment_detail_budget", label: "Detail Budget" },
  { key: "attachment_drawing", label: "Drawing" },
] as const;

export function BudgetConfirmationForm({ prId }: { prId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pr, setPr] = useState<PRRecordForBC | null>(null);
  const [projectInfo, setProjectInfo] = useState<{ project_name: string; project_code: string; company_code: string | null } | null>(null);
  const [preparedByName, setPreparedByName] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");

  const [form, setForm] = useState({
    to_name: "",
    to_role: "",
    cc: "",
    bc_title: "",
    bc_type: "GEN",
    ai_ref_no: "",
    registered_after_approved: false,
    signature_pic: "",
    reason_other: "",
    reason_over_budget: "",
    attachment_other: "",
    signatory_position: "QS",
  });
  const [reasons, setReasons] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<BCItemRow[]>([]);
  const [budgetGroups, setBudgetGroups] = useState<{ code_letter: string; name: string }[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [prRes, itemsRes, userRes] = await Promise.all([
        getPrById(prId, "id, pr_number, project_id, requested_by, preparation_date, notes"),
        listPrItemsByPrId(prId, "id, budget_code, item_description, estimated_total, boq_item_id"),
        supabase.auth.getUser(),
      ]);

      if (prRes.data) {
        const record = prRes.data as PRRecordForBC;
        setPr(record);
        setForm(prev => ({ ...prev, bc_title: record.notes ?? "" }));
        if (record.project_id) {
          getProjectById(record.project_id, "project_name, project_code, company_code").then(({ data }) => {
            if (data) setProjectInfo(data);
          });
        }
        if (record.requested_by) {
          getProfileById(record.requested_by).then(({ data }) => {
            if (data) setPreparedByName(data.full_name);
          });
        }
      }

      const prItems = (itemsRes.data ?? []) as PRItemForBC[];

      // Resolve Budget Group + Contract Target Budget from the linked BOQ item's
      // baseline (qs_boq_items.total_amount), falling back to the PR item's own
      // manually-chosen budget group when there is no BOQ link.
      const boqItemIds = prItems.map(i => i.boq_item_id).filter((v): v is string => !!v);
      const boqItemMap = new Map<string, { budget_code_id: string | null; total_amount: number | null; baseline_status: string | null }>();
      if (boqItemIds.length > 0) {
        const { data } = await listQsBoqItemsByIds(boqItemIds);
        for (const row of (data ?? []) as { id: string; budget_code_id: string | null; total_amount: number | null; baseline_status: string | null }[]) {
          boqItemMap.set(row.id, row);
        }
      }

      const budgetCodeIds = Array.from(new Set(Array.from(boqItemMap.values()).map(v => v.budget_code_id).filter((v): v is string => !!v)));
      const codeLetterByBudgetCodeId = new Map<string, string>();
      if (budgetCodeIds.length > 0) {
        const { data } = await listBudgetCodesByIds(budgetCodeIds);
        for (const row of (data ?? []) as { id: string; code_letter: string }[]) {
          codeLetterByBudgetCodeId.set(row.id, row.code_letter);
        }
      }

      const { data: groupsData } = await listBudgetCodeGroups();
      const groups = (groupsData ?? []) as { code_letter: string; name: string }[];
      setBudgetGroups(groups);
      const groupNameByLetter = new Map(groups.map(g => [g.code_letter, g.name]));

      setItems(prItems.map(i => {
        const boqItem = i.boq_item_id ? boqItemMap.get(i.boq_item_id) : undefined;
        const hasBoqLink = !!boqItem;
        const codeLetter = hasBoqLink
          ? (boqItem?.budget_code_id ? codeLetterByBudgetCodeId.get(boqItem.budget_code_id) ?? null : null)
          : (i.budget_code || null);
        const groupName = codeLetter ? groupNameByLetter.get(codeLetter) : undefined;
        const isAutoLinked = hasBoqLink && !!codeLetter;

        return {
          key: crypto.randomUUID(),
          pr_item_id: i.id,
          budget_code: codeLetter ?? "",
          budget_group_label: codeLetter ? `${codeLetter} — ${groupName ?? "..."}` : "—",
          has_boq_link: hasBoqLink,
          is_auto_linked: isAutoLinked,
          is_baseline_provisional: hasBoqLink && boqItem?.baseline_status !== "approved" && boqItem?.baseline_status !== "locked",
          item_description: i.item_description,
          contract_target_budget: hasBoqLink ? (boqItem?.total_amount ?? 0) : 0,
          estimated_amount: i.estimated_total ?? 0,
        };
      }));

      const user = userRes.data.user;
      if (user) {
        getProfileById(user.id).then(({ data }) => {
          if (data) setCurrentUserName(data.full_name);
        });
      }
      setLoading(false);
    }

    load();
  }, [prId]);

  function updateForm<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateItem(key: string, field: keyof BCItemRow, value: string | number) {
    setItems(prev => prev.map(item => item.key === key ? { ...item, [field]: value } : item));
  }

  function updateBudgetGroup(key: string, codeLetter: string) {
    const groupName = budgetGroups.find(g => g.code_letter === codeLetter)?.name;
    setItems(prev => prev.map(item => item.key === key ? {
      ...item,
      budget_code: codeLetter,
      budget_group_label: codeLetter ? `${codeLetter} — ${groupName ?? "..."}` : "—",
    } : item));
  }

  function addItem() {
    setItems(prev => [...prev, {
      key: crypto.randomUUID(), pr_item_id: null, budget_code: "", budget_group_label: "—", has_boq_link: false, is_auto_linked: false, is_baseline_provisional: false, item_description: "",
      contract_target_budget: 0, estimated_amount: 0,
    }]);
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function remainingWork(item: BCItemRow) {
    return (item.contract_target_budget || 0) - (item.estimated_amount || 0);
  }

  function totalRemainingWork() {
    return items.reduce((sum, item) => sum + remainingWork(item), 0);
  }

  function computedBudgetStatus(): "under_budget" | "over_budget" {
    return totalRemainingWork() < 0 ? "over_budget" : "under_budget";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pr) return;
    const budgetStatus = computedBudgetStatus();
    if (budgetStatus === "over_budget" && !form.reason_over_budget.trim()) {
      toast.error("Provide a reason for over budget");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); setSaving(false); return; }

    let bcNumber = `BC-${Date.now()}`;
    if (projectInfo && pr.project_id) {
      const companyCode = projectInfo.company_code ?? "DCOS";
      const prefix = `${projectInfo.project_code}-${companyCode}-BC-`;
      const { data: existing } = await listBudgetConfirmationsByProjectId(pr.project_id);
      let maxSeq = 0;
      for (const row of (existing ?? []) as { bc_number: string }[]) {
        if (row.bc_number.startsWith(prefix)) {
          const num = parseInt(row.bc_number.slice(prefix.length), 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      bcNumber = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: bcData, error: bcError } = await insertBudgetConfirmation({
        bc_number: bcNumber,
        pr_id: prId,
        project_id: pr.project_id,
        to_name: form.to_name || null,
        to_role: form.to_role || null,
        cc: form.cc || null,
        bc_title: form.bc_title || null,
        bc_type: form.bc_type,
        ai_ref_no: form.ai_ref_no || null,
        registered_after_approved: form.registered_after_approved,
        signature_pic: form.signature_pic || null,
        reason_design_defect: !!reasons.reason_design_defect,
        reason_design_missing: !!reasons.reason_design_missing,
        reason_design_change_vo: !!reasons.reason_design_change_vo,
        reason_change_order: !!reasons.reason_change_order,
        reason_design_change_no_cost: !!reasons.reason_design_change_no_cost,
        reason_design_change_mgmt_no_cost: !!reasons.reason_design_change_mgmt_no_cost,
        reason_other: form.reason_other || null,
        budget_status: budgetStatus,
        reason_over_budget: budgetStatus === "over_budget" ? form.reason_over_budget : null,
        attachment_detail_comparison: !!attachments.attachment_detail_comparison,
        attachment_quotation: !!attachments.attachment_quotation,
        attachment_detail_budget: !!attachments.attachment_detail_budget,
        attachment_drawing: !!attachments.attachment_drawing,
        attachment_other: form.attachment_other || null,
        prepared_by: pr.requested_by,
        prepared_by_position: "Requester",
        prepared_at: pr.preparation_date,
        verified_by: user.id,
        verified_by_position: form.signatory_position || null,
        verified_at: today,
        approved_by: user.id,
        approved_by_position: form.signatory_position || null,
        approved_at: today,
      });

    if (bcError) { toast.error(bcError.message); setSaving(false); return; }
    const bcId = (bcData as { id: string }).id;

    const itemInserts = items.map((item, idx) => ({
      bc_id: bcId,
      pr_item_id: item.pr_item_id,
      line_no: idx + 1,
      budget_code: item.budget_code || null,
      item_description: item.item_description,
      contract_target_budget: item.contract_target_budget || null,
      estimated_amount: item.estimated_amount || null,
      remaining_work_amount: remainingWork(item),
    }));

    const { error: itemsError } = await insertBudgetConfirmationItems(itemInserts);
    if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }

    const { error: prError } = await updatePrById({
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      budget_checked: true,
      budget_checked_by: user.id,
      budget_check_notes: form.bc_title || null,
      budget_confirmation_id: bcId,
    }, prId);

    if (prError) { toast.error(prError.message); setSaving(false); return; }

    toast.success(`Budget Confirmation ${bcNumber} created — PR approved`);
    router.push(`/dashboard/procurement/pr/${prId}`);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!pr) return <div className="py-20 text-center text-muted-foreground">PR not found.</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">Budget Confirmation</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Confirm &amp; Approve PR
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="font-semibold text-sm">Header</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>PR Reference</Label>
              <div className="flex items-center rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono">{pr.pr_number}</div>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <div className="flex items-center rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {projectInfo ? `${projectInfo.project_name} (${projectInfo.project_code})` : "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input value={form.to_name} onChange={e => updateForm("to_name", e.target.value)} placeholder="Recipient name" />
            </div>
            <div className="space-y-1.5">
              <Label>To (Role)</Label>
              <Input value={form.to_role} onChange={e => updateForm("to_role", e.target.value)} placeholder="e.g. General Manager" />
            </div>
            <div className="space-y-1.5">
              <Label>CC</Label>
              <Input value={form.cc} onChange={e => updateForm("cc", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>BC Type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.bc_type} onChange={e => updateForm("bc_type", e.target.value)}>
                <option value="ARC">ARC</option>
                <option value="STR">STR</option>
                <option value="MEP">MEP</option>
                <option value="GEN">GEN</option>
              </select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>BC Title</Label>
              <Input value={form.bc_title} onChange={e => updateForm("bc_title", e.target.value)} placeholder="Subject of this budget confirmation" />
            </div>
            <div className="space-y-1.5">
              <Label>AI Ref No.</Label>
              <Input value={form.ai_ref_no} onChange={e => updateForm("ai_ref_no", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Signature PIC (Register)</Label>
              <Input value={form.signature_pic} onChange={e => updateForm("signature_pic", e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2 flex items-center gap-2">
              <input type="checkbox" id="registered_after_approved" checked={form.registered_after_approved} onChange={e => updateForm("registered_after_approved", e.target.checked)} />
              <Label htmlFor="registered_after_approved">Registered after Approved</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold text-sm">Reason of Budget Confirmation</h3>
          <div className="grid grid-cols-2 gap-2">
            {REASON_OPTIONS.map(opt => (
              <label key={opt.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!reasons[opt.key]} onChange={e => setReasons(prev => ({ ...prev, [opt.key]: e.target.checked }))} />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Other</Label>
            <Input value={form.reason_other} onChange={e => updateForm("reason_other", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Summary Items Budget</h3>
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> Add Item</Button>
          </div>

          {items.map((item, idx) => (
            <div key={item.key} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.key)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Budget Group</Label>
                  {item.is_auto_linked ? (
                    <div className="h-8 flex items-center rounded-md border border-border bg-muted/30 px-2 text-xs font-medium">{item.budget_group_label}</div>
                  ) : (
                    <select className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={item.budget_code} onChange={e => updateBudgetGroup(item.key, e.target.value)}>
                      <option value="">— Select —</option>
                      {budgetGroups.map(g => (
                        <option key={g.code_letter} value={g.code_letter}>{g.code_letter} — {g.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-xs" value={item.item_description} onChange={e => updateItem(item.key, "item_description", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Contract Target Budget (A)
                    {item.is_baseline_provisional && <span className="ml-1 text-amber-600">· Not yet baselined</span>}
                  </Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={item.contract_target_budget} onChange={e => updateItem(item.key, "contract_target_budget", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount raise PR (B)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={item.estimated_amount} onChange={e => updateItem(item.key, "estimated_amount", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Remain Budget Amount (C=A-B)</Label>
                  <div className={`h-8 flex items-center text-base font-bold ${remainingWork(item) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    ${remainingWork(item).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="font-semibold text-sm">Budget Confirmation Status</h3>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`text-2xl font-bold px-6 py-3 ${computedBudgetStatus() === "over_budget"
                ? "bg-red-500/10 text-red-600 border-red-200"
                : "bg-emerald-500/10 text-emerald-600 border-emerald-200"}`}
            >
              {computedBudgetStatus() === "over_budget" ? "Over Budget" : "Under Budget"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Total Remain Budget Amount (ΣC): ${totalRemainingWork().toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Auto-determined from the items above — Under Budget when total Remain Budget Amount (C) is 0 or more; Over Budget once it goes negative.</p>
          {computedBudgetStatus() === "over_budget" && (
            <div className="space-y-1.5">
              <Label>Reason Over Budget *</Label>
              <Input value={form.reason_over_budget} onChange={e => updateForm("reason_over_budget", e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold text-sm">Attachment</h3>
          <div className="grid grid-cols-2 gap-2">
            {ATTACHMENT_OPTIONS.map(opt => (
              <label key={opt.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!attachments[opt.key]} onChange={e => setAttachments(prev => ({ ...prev, [opt.key]: e.target.checked }))} />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Other</Label>
            <Input value={form.attachment_other} onChange={e => updateForm("attachment_other", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="font-semibold text-sm">Signatures</h3>
          <div className="space-y-1.5 max-w-xs">
            <Label>Your Position (Verify &amp; Approve)</Label>
            <Input value={form.signatory_position} onChange={e => updateForm("signatory_position", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Prepared by</span>
              <p className="font-medium">{preparedByName || "—"}</p>
              <p className="text-xs text-muted-foreground">Requester · {pr.preparation_date ?? "—"}</p>
            </div>
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Verify by</span>
              <p className="font-medium">{currentUserName || "—"}</p>
              <p className="text-xs text-muted-foreground">{form.signatory_position} · {new Date().toISOString().slice(0, 10)}</p>
            </div>
            <div className="space-y-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Approved by</span>
              <p className="font-medium">{currentUserName || "—"}</p>
              <p className="text-xs text-muted-foreground">{form.signatory_position} · {new Date().toISOString().slice(0, 10)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
