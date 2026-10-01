"use client";

import { useEffect, useState } from "react";
import { deleteTenderSubmissionItemsBySubmissionId, insertTenderSubmissionItems, insertTenderSubmissionsReturning, listTenderInvitationsByTenderId, listTenderSubmissionItemsBySubmissionId, updateTenderInvitationById, updateTenderSubmissionById } from "@/lib/qs/qs-queries";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface SubmissionFormDialogProps {
  tenderId: string;
  tenderNo: string;
  onClose: () => void;
  onSaved: () => void;
  editSubmission?: {
    id: string;
    bidder_name: string;
    invitation_id: string | null;
    bid_amount: number;
    currency: string;
    is_alternative: boolean;
    alternative_details: string | null;
    submission_status: string;
    notes: string | null;
    documents_url: string | null;
  } | null;
}

interface Invitation {
  id: string;
  company_name: string;
  response: string | null;
  bid_submitted: boolean;
}

interface SubmissionItem {
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
}

export function SubmissionFormDialog({ tenderId, tenderNo, onClose, onSaved, editSubmission }: SubmissionFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const [form, setForm] = useState({
    bidder_name: editSubmission?.bidder_name ?? "",
    invitation_id: editSubmission?.invitation_id ?? "",
    bid_amount: editSubmission?.bid_amount?.toString() ?? "",
    currency: editSubmission?.currency ?? "USD",
    is_alternative: editSubmission?.is_alternative ?? false,
    alternative_details: editSubmission?.alternative_details ?? "",
    submission_status: editSubmission?.submission_status ?? "submitted",
    notes: editSubmission?.notes ?? "",
    documents_url: editSubmission?.documents_url ?? "",
  });

  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    listTenderInvitationsByTenderId(tenderId)
      .then(({ data }) => {
        if (data) setInvitations(data);
      });
  }, [tenderId]);

  // Load existing submission items when editing
  useEffect(() => {
    if (!editSubmission?.id) return;
    void (async () => {
      setLoadingItems(true);
      const { data } = await listTenderSubmissionItemsBySubmissionId(editSubmission.id, "item_code, description, unit, quantity, unit_rate");
      if (data) setItems(data);
      setLoadingItems(false);
    })();
  }, [editSubmission?.id]);

  function addItem() {
    setItems((prev) => [...prev, { item_code: "", description: "", unit: "ea", quantity: 0, unit_rate: 0 }]);
  }

  function updateItem(index: number, field: keyof SubmissionItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!form.bidder_name.trim()) {
      toast.error("Bidder name is required");
      return;
    }
    setSaving(true);

    const payload = {
      tender_id: tenderId,
      bidder_name: form.bidder_name.trim(),
      invitation_id: form.invitation_id || null,
      bid_amount: parseFloat(form.bid_amount) || 0,
      currency: form.currency,
      is_alternative: form.is_alternative,
      alternative_details: form.alternative_details || null,
      submission_status: form.submission_status,
      notes: form.notes || null,
      documents_url: form.documents_url || null,
    };

    if (editSubmission) {
      // Update existing submission
      const { error } = await updateTenderSubmissionById(payload, editSubmission.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }

      // Delete old items and re-insert
      await deleteTenderSubmissionItemsBySubmissionId(editSubmission.id);
      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          submission_id: editSubmission.id,
          item_code: item.item_code,
          description: item.description || null,
          unit: item.unit,
          quantity: item.quantity,
          unit_rate: item.unit_rate,
        }));
        const { error: itemErr } = await insertTenderSubmissionItems(itemRows);
        if (itemErr) toast.error(`Items save failed: ${itemErr.message}`);
      }

      // Mark invitation as bid_submitted if linked
      if (form.invitation_id) {
        await updateTenderInvitationById({ bid_submitted: true }, form.invitation_id);
      }

      toast.success("Submission updated");
    } else {
      // Create new submission
      const { data, error } = await insertTenderSubmissionsReturning(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }

      // Insert items
      if (items.length > 0 && data) {
        const itemRows = items.map((item) => ({
          submission_id: data.id,
          item_code: item.item_code,
          description: item.description || null,
          unit: item.unit,
          quantity: item.quantity,
          unit_rate: item.unit_rate,
        }));
        const { error: itemErr } = await insertTenderSubmissionItems(itemRows);
        if (itemErr) toast.error(`Items save failed: ${itemErr.message}`);
      }

      // Mark invitation as bid_submitted if linked
      if (form.invitation_id) {
        await updateTenderInvitationById({ bid_submitted: true }, form.invitation_id);
      }

      toast.success("Submission created");
    }

    onSaved();
  }

  const totalItems = items.reduce((sum, item) => sum + (item.quantity * item.unit_rate), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-background shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold">{editSubmission ? "Edit Submission" : "New Submission"}</h2>
            <p className="text-sm text-muted-foreground">{tenderNo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Invitation Link */}
          {invitations.length > 0 && (
            <div className="space-y-1.5">
              <Label>Link to Invitation (optional)</Label>
              <select
                value={form.invitation_id}
                onChange={(e) => {
                  const invId = e.target.value;
                  const inv = invitations.find((i) => i.id === invId);
                  setForm((prev) => ({
                    ...prev,
                    invitation_id: invId,
                    ...(inv && !editSubmission ? { bidder_name: inv.company_name } : {}),
                  }));
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">No invitation — manual entry</option>
                {invitations.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.company_name} ({inv.response ?? "no response"})
                    {inv.bid_submitted ? " — submitted" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bidder Name */}
          <div className="space-y-1.5">
            <Label>Bidder / Company Name *</Label>
            <input
              value={form.bidder_name}
              onChange={(e) => setForm((prev) => ({ ...prev, bidder_name: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              placeholder="e.g. ABC Construction Co."
            />
          </div>

          {/* Bid Amount + Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Bid Amount</Label>
              <input
                type="number"
                value={form.bid_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, bid_amount: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <select
                value={form.currency}
                onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              value={form.submission_status}
              onChange={(e) => setForm((prev) => ({ ...prev, submission_status: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="submitted">Submitted</option>
              <option value="responsive">Responsive</option>
              <option value="non_responsive">Non-Responsive</option>
              <option value="evaluated">Evaluated</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          {/* Alternative Toggle */}
          <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_alternative}
              onChange={(e) => setForm((prev) => ({ ...prev, is_alternative: e.target.checked }))}
              className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground"
            />
            <span>This is an alternative submission</span>
          </label>

          {form.is_alternative && (
            <div className="space-y-1.5">
              <Label>Alternative Details</Label>
              <textarea
                value={form.alternative_details}
                onChange={(e) => setForm((prev) => ({ ...prev, alternative_details: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                rows={2}
                placeholder="Describe the alternative proposal..."
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              rows={2}
              placeholder="Internal notes about this submission..."
            />
          </div>

          {/* Pricing Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pricing Items (optional)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            {loadingItems && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {items.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item Code</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">
                          <input value={item.item_code} onChange={(e) => updateItem(i, "item_code", e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-hidden focus:border-primary" placeholder="Code" />
                        </td>
                        <td className="px-2 py-1">
                          <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary" placeholder="Description" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" value={item.quantity || ""} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono outline-hidden focus:border-primary" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" value={item.unit_rate || ""} onChange={(e) => updateItem(i, "unit_rate", parseFloat(e.target.value) || 0)}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right font-mono outline-hidden focus:border-primary" />
                        </td>
                        <td className="px-2 py-1 text-xs text-right font-mono py-2.5 pr-3">
                          ${(item.quantity * item.unit_rate).toLocaleString()}
                        </td>
                        <td className="px-1 py-1">
                          <button type="button" onClick={() => removeItem(i)} className="p-1 text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Total from Items:</td>
                      <td className="px-3 py-2 text-xs font-bold text-right font-mono">${totalItems.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {items.length === 0 && !loadingItems && (
              <p className="text-xs text-muted-foreground text-center py-2">No pricing items added. Bid amount is used for totals.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4 sticky bottom-0 bg-background">
          <p className="text-xs text-muted-foreground">
            {items.length > 0 && `Items total: $${totalItems.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {editSubmission ? "Update" : "Create"} Submission
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
