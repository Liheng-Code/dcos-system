"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsClaimItem,
  type QsProgressClaim,
  recalculateClaimForCertification,
  updateClaimItemCertification,
  updateClaimStatus,
} from "@/lib/qs/qs-service";
import { printIpcCertificate } from "@/lib/print-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface CertLine {
  this_period: string;
  materials_stored: string;
  reason: string;
}

interface Props { claim: QsProgressClaim; items: QsClaimItem[] }

export function CertificationPage({ claim, items }: Props) {
  const router = useRouter();
  const proj = Array.isArray(claim.projects) ? claim.projects[0] : claim.projects;
  const projectName = proj?.project_name ?? claim.project_id;

  const [lines, setLines] = useState<Record<string, CertLine>>(() => {
    const init: Record<string, CertLine> = {};
    for (const item of items) {
      init[item.id] = {
        this_period: String(item.certified_this_period ?? item.this_period),
        materials_stored: String(item.certified_materials_stored ?? item.materials_stored),
        reason: item.certified_variance_reason ?? "",
      };
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);

  function updateLine(id: string, field: keyof CertLine, value: string) {
    setLines((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
  }

  function hasVariance(item: QsClaimItem): boolean {
    const l = lines[item.id];
    if (!l) return false;
    const certifiedTotal = (parseFloat(l.this_period) || 0) + (parseFloat(l.materials_stored) || 0);
    const claimedTotal = Number(item.this_period) + Number(item.materials_stored ?? 0);
    return Math.abs(certifiedTotal - claimedTotal) > 0.001;
  }

  const missingReasons = items.filter((item) => hasVariance(item) && !lines[item.id]?.reason.trim());
  const canSubmit = missingReasons.length === 0;

  async function handleSubmit() {
    if (!canSubmit) { toast.error("A reason is required for every line where certified differs from claimed."); return; }
    setSubmitting(true);
    try {
      await Promise.all(items.map((item) => {
        const l = lines[item.id];
        return updateClaimItemCertification(
          item.id,
          parseFloat(l.this_period) || 0,
          parseFloat(l.materials_stored) || 0,
          l.reason.trim() || null,
        );
      }));
      const paymentDue = await recalculateClaimForCertification(claim.id);
      await updateClaimStatus(claim.id, "certified", { certified_amount: paymentDue });
      toast.success(`IPC #${claim.claim_number} certified`);
      router.push("/dashboard/qs/claims");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to certify IPC");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/qs/claims")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Certify IPC #{claim.claim_number}</h1>
            <p className="text-xs text-slate-400">{projectName} · {claim.period_start} to {claim.period_end}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => printIpcCertificate(claim, items, projectName)} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || !canSubmit} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Confirm Certification
          </Button>
        </div>
      </div>

      {!canSubmit && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {missingReasons.length} line{missingReasons.length !== 1 ? "s" : ""} where certified differs from claimed require a reason before this IPC can be certified.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right w-24">Claimed (Period)</th>
              <th className="px-3 py-2 text-right w-24">Claimed (Stored)</th>
              <th className="px-3 py-2 text-right w-28">Certified (Period)</th>
              <th className="px-3 py-2 text-right w-28">Certified (Stored)</th>
              <th className="px-3 py-2 text-left w-52">Variance Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const l = lines[item.id];
              const variance = hasVariance(item);
              return (
                <tr key={item.id} className={cn("border-t border-slate-100", variance && "bg-amber-50/40")}>
                  <td className="px-3 py-2 text-slate-700">{item.description}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmt(Number(item.this_period))}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmt(Number(item.materials_stored ?? 0))}</td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="any" value={l?.this_period ?? ""}
                      onChange={(e) => updateLine(item.id, "this_period", e.target.value)}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-right text-xs outline-none focus:border-primary" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="any" value={l?.materials_stored ?? ""}
                      onChange={(e) => updateLine(item.id, "materials_stored", e.target.value)}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-right text-xs outline-none focus:border-primary" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={l?.reason ?? ""}
                      onChange={(e) => updateLine(item.id, "reason", e.target.value)}
                      placeholder={variance ? "Required…" : "—"}
                      className={cn(
                        "w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary",
                        variance && !l?.reason.trim() ? "border-red-300" : "border-input",
                      )} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
