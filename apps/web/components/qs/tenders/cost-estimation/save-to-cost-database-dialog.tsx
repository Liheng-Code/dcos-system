"use client";

// Save the tender's whole BOQ as a new named version in QS → Cost Database.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { countTenderCostDatabasesBySourceTenderId, getProjectPrecontractDetailByProjectId, getTenderRegisterById } from "@/lib/qs/qs-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAGE_LABELS, type TenderStage } from "@/lib/qs/tender-lifecycle";
import { saveTenderToCostDatabase } from "@/lib/qs/tender-cost-database";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SaveToCostDatabaseDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenderId: string;
  itemCount: number;
  total: number;
}) {
  return props.open ? <SaveBody {...props} /> : null;
}

function SaveBody({ open, onOpenChange, tenderId, itemCount, total }: {
  open: boolean; onOpenChange: (open: boolean) => void; tenderId: string; itemCount: number; total: number;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Default name: "<tender no> · <stage> · v<n> · <date>"
  useEffect(() => {
    void (async () => {
      const { data: t } = await getTenderRegisterById(tenderId, "tender_no, project_id");
      const [{ data: pd }, { count }] = await Promise.all([
        t?.project_id
          ? getProjectPrecontractDetailByProjectId(t.project_id)
          : Promise.resolve({ data: null }),
        countTenderCostDatabasesBySourceTenderId(tenderId),
      ]);
      const stage = pd?.tender_stage ? STAGE_LABELS[pd.tender_stage as TenderStage] ?? pd.tender_stage : null;
      const parts = [t?.tender_no ?? "Tender BOQ", stage, `v${(count ?? 0) + 1}`, new Date().toISOString().slice(0, 10)];
      setName((cur) => cur || parts.filter(Boolean).join(" · "));
    })();
  }, [tenderId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveTenderToCostDatabase(tenderId, name.trim(), notes.trim() || null);
      toast.success(`Saved ${itemCount} lines to the Cost Database`, {
        action: { label: "Open", onClick: () => window.location.assign("/dashboard/qs/cost-database") },
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save to the Cost Database");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save to Cost Database</DialogTitle>
          <DialogDescription>
            Saves a frozen copy of this BOQ — {itemCount} lines, total {fmt(total)} — as a new version. Later changes to the
            tender don&apos;t alter it. Review or reuse it under{" "}
            <Link href="/dashboard/qs/cost-database" className="underline">Quantity Surveying → Cost Database</Link>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="cdb-name">Version name</label>
            <Input id="cdb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PRJ-2026-005 · Submitted · v2" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="cdb-notes">Notes (optional)</label>
            <textarea
              id="cdb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What this version is — e.g. rates after supplier quotes, basis, exclusions"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || itemCount === 0}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Database className="mr-1 h-4 w-4" />}
            Save Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
