"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import type { Project } from "@/lib/project/projects/project-types";
import { listProjectClaims, listProjectVariations } from "@/lib/project/projects/overview-queries";
import { summariseCommercial, type ClaimRow, type VariationRow } from "@/lib/project/projects/commercial-summary";

function useCommercialRows(projectId: string) {
  const [rows, setRows] = useState<{ vos: VariationRow[]; claims: ClaimRow[] } | null>(null);
  useEffect(() => {
    Promise.all([listProjectVariations(projectId), listProjectClaims(projectId)])
      .then(([vos, claims]) => setRows({ vos, claims }))
      .catch(() => setRows({ vos: [], claims: [] }));
  }, [projectId]);
  return rows;
}

const money = (currency: string, v: number | null | undefined) =>
  v == null ? "—" : `${currency} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const label = (s: string) => s.replace(/_/g, " ");

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  implemented: "bg-emerald-50 text-emerald-700 border-emerald-200",
  certified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-blue-50 text-blue-700 border-blue-200",
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_TONE[status] ?? "bg-muted text-muted-foreground border-border")}>
      {label(status)}
    </span>
  );
}

/** Headline commercial figures on the Overview. */
export function CommercialStrip({ project }: { project: Project }) {
  const rows = useCommercialRows(project.id);
  if (!rows) return <div className="h-20 animate-pulse rounded-xl bg-muted" />;
  const s = summariseCommercial(project.contract_value, rows.vos, rows.claims);
  const c = project.currency ?? "USD";
  const latest = s.latestClaim;
  const figures: { label: string; value: string; sub?: string }[] = [
    { label: "Contract value", value: money(c, s.contractValue) },
    { label: "Approved variations", value: money(c, s.approvedVariations.amount), sub: `${s.approvedVariations.count} VO${s.approvedVariations.count === 1 ? "" : "s"}` },
    { label: "Pending variations", value: money(c, s.pendingVariations.amount), sub: `${s.pendingVariations.count} awaiting approval` },
    { label: "Certified to date", value: money(c, s.certifiedToDate), sub: `${money(c, s.paidToDate)} paid` },
    { label: "Certified, unpaid", value: money(c, s.certifiedUnpaid) },
    { label: "Latest claim", value: latest ? `IPC ${latest.claim_number}` : "—", sub: latest ? `${label(latest.status)} · period to ${day(latest.period_end)}` : "No claims yet" },
  ];
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
      {figures.map((f) => (
        <div key={f.label} className="bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</p>
          <p className="mt-1 truncate text-base font-semibold tabular-nums">{f.value}</p>
          {f.sub && <p className="truncate text-xs capitalize text-muted-foreground">{f.sub}</p>}
        </div>
      ))}
    </section>
  );
}

function TabFrame({ title, href, projectId, linkLabel, children }: { title: string; href: string; projectId: string; linkLabel: string; children: ReactNode }) {
  const { setSelectedProjectId } = useProject();
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="outline" size="sm" asChild>
          <Link href={href} onClick={() => setSelectedProjectId(projectId)}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> {linkLabel}
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

const th = "px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const td = "px-4 py-2";

export function VariationsTab({ project }: { project: Project }) {
  const rows = useCommercialRows(project.id);
  const c = project.currency ?? "USD";
  return (
    <TabFrame title="Variations" href="/dashboard/qs/variations" projectId={project.id} linkLabel="Open in QS">
      {!rows ? <Empty>Loading…</Empty> : rows.vos.length === 0 ? <Empty>No variation orders yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>VO</th><th className={th}>Title</th><th className={th}>Status</th><th className={th}>Submitted</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
            <tbody className="divide-y">
              {rows.vos.map((v) => (
                <tr key={v.id}>
                  <td className={cn(td, "font-mono text-xs")}>{v.vo_number}</td>
                  <td className={td}>{v.title ?? "—"}</td>
                  <td className={td}><StatusPill status={v.status} /></td>
                  <td className={cn(td, "text-muted-foreground")}>{day(v.submitted_at)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(c, v.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TabFrame>
  );
}

export function ClaimsTab({ project }: { project: Project }) {
  const rows = useCommercialRows(project.id);
  const c = project.currency ?? "USD";
  return (
    <TabFrame title="Progress claims" href="/dashboard/qs/claims?sub=claims" projectId={project.id} linkLabel="Open in QS">
      {!rows ? <Empty>Loading…</Empty> : rows.claims.length === 0 ? <Empty>No progress claims yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>IPC</th><th className={th}>Period</th><th className={th}>Status</th><th className={cn(th, "text-right")}>This claim</th><th className={cn(th, "text-right")}>Certified</th></tr></thead>
            <tbody className="divide-y">
              {rows.claims.map((r) => (
                <tr key={r.id}>
                  <td className={cn(td, "font-medium")}>IPC {r.claim_number}</td>
                  <td className={cn(td, "text-muted-foreground")}>{day(r.period_start)} → {day(r.period_end)}</td>
                  <td className={td}><StatusPill status={r.status} /></td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(c, r.current_payment_due)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.certified_amount != null ? money(c, r.certified_amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TabFrame>
  );
}

export function PaymentsTab({ project }: { project: Project }) {
  const rows = useCommercialRows(project.id);
  const c = project.currency ?? "USD";
  const payable = rows?.claims.filter((r) => r.status === "certified" || r.status === "paid") ?? [];
  const s = rows ? summariseCommercial(project.contract_value, rows.vos, rows.claims) : null;
  return (
    <TabFrame title="Payments" href="/dashboard/qs/claims?sub=payments" projectId={project.id} linkLabel="Open in QS">
      {s && (
        <div className="grid grid-cols-3 gap-px border-b bg-border text-sm">
          {[["Certified to date", s.certifiedToDate], ["Paid", s.paidToDate], ["Certified, unpaid", s.certifiedUnpaid]].map(([l, v]) => (
            <div key={l as string} className="bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</p>
              <p className="font-semibold tabular-nums">{money(c, v as number)}</p>
            </div>
          ))}
        </div>
      )}
      {!rows ? <Empty>Loading…</Empty> : payable.length === 0 ? <Empty>No certified claims yet. Payment vouchers are created when an IPC is marked as paid.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40"><tr><th className={th}>IPC</th><th className={th}>Certified</th><th className={th}>Paid</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
            <tbody className="divide-y">
              {payable.map((r) => (
                <tr key={r.id}>
                  <td className={cn(td, "font-medium")}>IPC {r.claim_number}</td>
                  <td className={cn(td, "text-muted-foreground")}>{day(r.certified_at)}</td>
                  <td className={td}>{r.paid_at ? day(r.paid_at) : <StatusPill status="certified" />}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{money(c, r.certified_amount ?? r.current_payment_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TabFrame>
  );
}
