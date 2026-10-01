"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import type { DwlPriceSubmissionRow, DwlSubmissionStatus } from "@/components/qs/dwl-types";
import { listDwlVPriceSubmissions } from "@/lib/qs/qs-queries";

type QueueFilter = "open" | "submitted" | "verified" | "rejected" | "all";

function money(v: number | null | undefined, ccy: string | null | undefined) {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: ccy || "USD", minimumFractionDigits: 2, maximumFractionDigits: 4,
    }).format(v);
  } catch { return `${ccy ?? "USD"} ${v.toFixed(4)}`; }
}
function date(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export default function DwlPriceApprovalsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [rows, setRows] = useState<DwlPriceSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const canVerify = can("qs_price_approval", "edit");
  const canApprove = can("qs_price_approval", "approve");
  const canReject = can("qs_price_approval", "reject");
  const canView = !permsLoaded || can("qs_price_approval", "view") || can("qs_libraries", "view");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await listDwlVPriceSubmissions();
    if (error) { setErrorMsg(error.message); setLoading(false); return; }
    setRows((data ?? []) as unknown as DwlPriceSubmissionRow[]);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "open") return rows.filter((r) => r.status === "submitted" || r.status === "verified");
    return rows.filter((r) => r.status === (filter as DwlSubmissionStatus));
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c = { open: 0, submitted: 0, verified: 0, rejected: 0 };
    for (const r of rows) {
      if (r.status === "submitted") { c.submitted++; c.open++; }
      else if (r.status === "verified") { c.verified++; c.open++; }
      else if (r.status === "rejected") c.rejected++;
    }
    return c;
  }, [rows]);

  async function runRpc(name: string, args: Record<string, unknown>, id: string, okMsg: string) {
    setBusyId(id);
    try {
      const { error } = await supabase.rpc(name, args);
      if (error) throw new Error(error.message);
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view price approvals.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Price Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Supplier prices submitted for approval. Verify → Approve promotes a submission to a permanent,
          append-only price record. Rejected submissions never create a price.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as QueueFilter)}>
          <TabsList>
            <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
            <TabsTrigger value="submitted">Submitted ({counts.submitted})</TabsTrigger>
            <TabsTrigger value="verified">Verified ({counts.verified})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load submissions: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nothing in this queue.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Effective</TableHead>
                <TableHead className="w-24">Valid from</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-56 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    <Link href={`/dashboard/qs/dwl-materials/${r.resource_id}`} className="hover:underline">
                      <span className="font-mono text-xs">{r.material_code}</span> {r.material_name}
                    </Link>
                    {r.notes && <span className="block text-[11px] text-muted-foreground line-clamp-1">{r.notes}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.supplier_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(r.unit_price, r.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">{money(r.effective_unit_cost, r.currency)}</TableCell>
                  <TableCell className="text-xs">{date(r.valid_from)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "approved" ? "outline" : r.status === "rejected" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                    {r.status === "rejected" && r.rejected_reason && (
                      <span className="block text-[10px] text-muted-foreground line-clamp-1">{r.rejected_reason}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      {r.status === "submitted" && canVerify && (
                        <Button size="sm" variant="outline" disabled={busyId === r.id}
                          onClick={() => runRpc("dwl_verify_price_submission", { p_submission_id: r.id }, r.id, "Verified")}>
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Verify
                        </Button>
                      )}
                      {r.status === "verified" && canApprove && (
                        <Button size="sm" disabled={busyId === r.id}
                          onClick={() => runRpc("dwl_approve_price_submission", { p_submission_id: r.id }, r.id, "Approved — price recorded")}>
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Approve
                        </Button>
                      )}
                      {(r.status === "submitted" || r.status === "verified") && canReject && (
                        <Button size="sm" variant="outline" disabled={busyId === r.id}
                          onClick={() => {
                            const reason = window.prompt("Rejection reason:");
                            if (reason && reason.trim()) {
                              void runRpc("dwl_reject_price_submission", { p_submission_id: r.id, p_reason: reason.trim() }, r.id, "Rejected");
                            }
                          }}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      )}
                      {r.status === "approved" && r.resulting_price_id && (
                        <span className="text-[11px] text-muted-foreground">price recorded</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
