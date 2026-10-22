"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Award, CheckCircle, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  buildRfqComparison,
  requiredReasonLength,
  type RfqComparison as RfqComparisonResult,
  type ComparisonQuotationInput,
  type ComparisonPrLine,
} from "@/lib/procurement/rfq-comparison";
import { getRfqComparisonData, awardRfq } from "@/lib/procurement/procurement-queries";
import { formatBangkok } from "@/lib/procurement/sealed-bids";
import { procErrorMessage } from "@/lib/procurement/procurement-transitions";

type LoadResult = Awaited<ReturnType<typeof getRfqComparisonData>>;
type ComparisonData = NonNullable<LoadResult["data"]>;

interface RfqComparisonProps {
  rfqId: string;
  canAward: boolean;
  // Bump to force a reload (parent changed quotations, scores or RFQ status).
  refreshKey?: number;
  onAwarded?: () => void;
  // When set, bids are sealed until this instant: amounts are hidden and award is disabled.
  sealedUntil?: Date | null;
}

function SealedBanner({ until }: { until: Date }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
      <Lock className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Bids sealed until {formatBangkok(until)} (Bangkok)</p>
        <p className="text-xs">
          Quotation amounts are hidden from everyone until the response deadline has passed. You can see only the
          quotations you recorded yourself. Scoring and award open once the bids are open.
        </p>
      </div>
    </div>
  );
}

const EXCEPTION_LABEL: Record<string, string> = {
  fewer_than_3_quotes: "Fewer than 3 valid quotations",
  single_source: "Single source",
};

// UTC date, because the award RPC evaluates quotation validity against the UTC date.
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeComparison(res: ComparisonData): RfqComparisonResult {
  return buildRfqComparison({
    evaluationMethod: res.rfq.evaluation_method ?? null,
    prLines: res.prLines as ComparisonPrLine[],
    quotations: res.quotations as ComparisonQuotationInput[],
    today: todayUtc(),
    includeRejected: res.rfq.status === "awarded",
  });
}

function money(value: number | null | undefined, currency: string): string {
  if (value == null) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function dateText(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

const AMBER_BADGE = "bg-amber-500/10 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-500/30";
const RED_BADGE = "bg-red-500/10 text-red-600 border-red-200 dark:text-red-400 dark:border-red-500/30";
const GREEN_BADGE = "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-500/30";
const BLUE_BADGE = "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-500/30";

export function RfqComparison({ rfqId, canAward, refreshKey = 0, onAwarded, sealedUntil = null }: RfqComparisonProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apply = useCallback(({ data: res, error: err }: LoadResult): ComparisonData | null => {
    setLoading(false);
    if (err || !res) {
      setError(err ? procErrorMessage(err) : "Failed to load comparison");
      setData(null);
      return null;
    }
    setError(null);
    setData(res);
    return res;
  }, []);

  const load = useCallback(async () => apply(await getRfqComparisonData(rfqId)), [apply, rfqId]);

  // Reload when the RFQ changes or the parent bumps refreshKey.
  useEffect(() => {
    let active = true;
    getRfqComparisonData(rfqId).then((r) => { if (active) apply(r); });
    return () => { active = false; };
  }, [rfqId, refreshKey, apply]);

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: u }) => {
      if (active) setUserId(u.user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  const comparison: RfqComparisonResult | null = useMemo(
    () => (data ? computeComparison(data) : null),
    [data],
  );

  const reasonInfo = useMemo(() => {
    if (!comparison || !selectedId) return { min: 1, why: [] as string[] };
    return requiredReasonLength({ comparison, quotationId: selectedId });
  }, [comparison, selectedId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !comparison) {
    return (
      <Card>
        <CardContent className="pt-5 flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-red-600">{error ?? "Failed to load comparison"}</p>
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { rfq } = data;
  const suppliers = comparison.suppliers;
  const isAwarded = rfq.status === "awarded" || !!rfq.awarded_supplier_id || suppliers.some(s => s.isAwarded);

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold text-sm">Quotation Comparison</h3>
          {sealedUntil && <SealedBanner until={sealedUntil} />}
          <p className="text-sm text-muted-foreground py-6 text-center">
            {sealedUntil
              ? "No quotations are visible to you while bids are sealed."
              : "No quotations received yet. Record a quotation from an invited supplier to start the comparison."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // After award, the recommendation and exception come from the stored snapshot, not a live recompute.
  const isFinal = rfq.status === "awarded";
  const recommendedId = isFinal ? rfq.recommended_quotation_id : comparison.recommendedQuotationId;
  const exceptionKey = isFinal ? rfq.award_exception : comparison.quoteCountException;
  const isCreator = !!userId && rfq.created_by === userId;

  const recommended = suppliers.find(s => s.quotationId === recommendedId) ?? null;
  const selected = suppliers.find(s => s.quotationId === selectedId) ?? null;
  const awardedSupplier = suppliers.find(s => s.isAwarded)
    ?? suppliers.find(s => s.supplierId === rfq.awarded_supplier_id)
    ?? null;
  const baseCurrency = comparison.baseCurrency;

  const eligibleTotals = suppliers.filter(s => s.eligible === true && s.compareTotal > 0).map(s => s.compareTotal);
  const lowestTotal = eligibleTotals.length > 0 ? Math.min(...eligibleTotals) : null;

  const gapPct = (s: { compareTotal: number } | null): number | null => {
    if (!s || !recommended || recommended.compareTotal <= 0) return null;
    return ((s.compareTotal - recommended.compareTotal) / recommended.compareTotal) * 100;
  };

  const uncoveredLines = selected
    ? comparison.lines.filter(l => !l.cells[selected.quotationId])
    : [];

  const overriding = !!selected && !!recommended && selected.quotationId !== recommended.quotationId;
  const noRecommendation = !!selected && !recommended;
  // Code points after trimming, matching Postgres char_length(btrim(reason)).
  const reasonLen = [...reason.trim()].length;
  const reasonOk = !!selected && reasonLen >= reasonInfo.min && reasonLen <= 2000;

  async function openDialog() {
    setOpening(true);
    // Reload first so the recommendation (and the reason minimum) is fresh.
    const fresh = await load();
    setOpening(false);
    if (!fresh) return;
    // No recommendation: select nothing, the user must choose.
    setSelectedId(computeComparison(fresh).recommendedQuotationId ?? "");
    setReason("");
    setDialogOpen(true);
  }

  async function submitAward() {
    if (!selected || !reasonOk) return;
    setSubmitting(true);
    const { data: res, error: err } = await awardRfq(rfqId, selected.quotationId, reason.trim());
    setSubmitting(false);
    if (err || !res) {
      toast.error(err ? procErrorMessage(err) : "Award failed");
      return;
    }
    toast.success(`Supplier awarded. Draft PO ${res.po_number} created.`);
    setDialogOpen(false);
    await load();
    onAwarded?.();
  }

  const stickyCell = "sticky left-0 z-10 bg-background border-r";

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">Quotation Comparison</h3>
            <p className="text-xs text-muted-foreground">
              Compared in {baseCurrency ?? "-"} on {comparison.lines.length} line{comparison.lines.length === 1 ? "" : "s"}.
              {exceptionKey && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  {EXCEPTION_LABEL[exceptionKey] ?? exceptionKey} - award needs a documented reason.
                </span>
              )}
            </p>
          </div>
          {canAward && !sealedUntil && !isAwarded && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => void openDialog()}
                disabled={isCreator || opening}
              >
                {opening ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Award className="h-4 w-4 mr-1" />} Award
              </Button>
              {isCreator && (
                <p className="text-xs text-muted-foreground max-w-xs text-right">
                  You created this RFQ, so another authorised user must award it.
                </p>
              )}
            </div>
          )}
        </div>

        {sealedUntil && <SealedBanner until={sealedUntil} />}

        {isAwarded && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 p-4 space-y-2 dark:border-emerald-500/30">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Awarded to {awardedSupplier?.supplierName ?? "supplier"}
              {rfq.award_overrides_recommendation && (
                <Badge variant="outline" className={AMBER_BADGE}>Overrode recommendation</Badge>
              )}
              {rfq.award_exception && (
                <Badge variant="outline" className={AMBER_BADGE}>{EXCEPTION_LABEL[rfq.award_exception] ?? rfq.award_exception}</Badge>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Awarded at</dt>
                <dd>{dateText(rfq.awarded_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Awarded by</dt>
                <dd>{rfq.awarded_by_name ?? (rfq.awarded_by ? "User" : "-")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Awarded total</dt>
                <dd>{awardedSupplier ? money(awardedSupplier.compareTotal, awardedSupplier.currency) : "-"}</dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-muted-foreground text-xs">Reason</dt>
                <dd className="whitespace-pre-wrap">{rfq.award_reason ?? "-"}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 280 + suppliers.length * 200 }}>
            <thead>
              <tr>
                <th className={cn(stickyCell, "border-b bg-muted text-left px-3 py-2 text-xs font-semibold text-muted-foreground min-w-[240px] align-bottom")}>
                  Line / Item
                </th>
                {suppliers.map(s => (
                  <th
                    key={s.quotationId}
                    className={cn(
                      "border-b bg-muted px-3 py-2 text-left align-top min-w-[190px] font-normal",
                      s.isAwarded && "bg-emerald-500/10",
                    )}
                  >
                    <div className="font-semibold text-foreground">{s.supplierName}</div>
                    <div className="text-xs text-muted-foreground mb-1">{s.currency}</div>
                    <div className="flex flex-wrap gap-1">
                      {s.quotationId === recommendedId && (
                        <Badge variant="outline" className={GREEN_BADGE}>Recommended</Badge>
                      )}
                      {s.isAwarded && <Badge variant="outline" className={BLUE_BADGE}>Awarded</Badge>}
                      {!s.fullCoverage && (
                        <Badge variant="outline" className={AMBER_BADGE}>Partial {s.coveredLines}/{s.totalLines}</Badge>
                      )}
                      {s.expired && <Badge variant="outline" className={RED_BADGE}>Expired</Badge>}
                      {!s.expired && s.expiringSoon && <Badge variant="outline" className={AMBER_BADGE}>Expiring soon</Badge>}
                      {!s.comparable && <Badge variant="outline" className={AMBER_BADGE}>Currency not comparable</Badge>}
                      {s.totalMismatch && <Badge variant="outline" className={RED_BADGE}>Total mismatch</Badge>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.lines.map(line => (
                <tr key={line.key}>
                  <td className={cn(stickyCell, "border-b px-3 py-2 align-top")}>
                    <div className="flex gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{line.lineNo}</span>
                      <div className="min-w-0">
                        <div className="font-medium">{line.description}</div>
                        <div className="text-xs text-muted-foreground">{line.quantity.toLocaleString()} {line.unit}</div>
                      </div>
                    </div>
                  </td>
                  {suppliers.map(s => {
                    const cell = line.cells[s.quotationId];
                    if (!cell) {
                      return (
                        <td key={s.quotationId} className="border-b px-3 py-2 align-top text-xs italic text-muted-foreground">
                          Not quoted
                        </td>
                      );
                    }
                    const lead = cell.leadTimeDays != null
                      ? `${cell.leadTimeDays} days`
                      : cell.deliveryDate ?? null;
                    return (
                      <td
                        key={s.quotationId}
                        className={cn(
                          "border-b px-3 py-2 align-top",
                          cell.isLowest && "bg-emerald-500/10",
                          !s.comparable && "opacity-70",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn("tabular-nums font-medium", cell.isLowest && "text-emerald-600 dark:text-emerald-400 font-bold")}>
                            {money(cell.unitPrice, s.currency)}
                          </span>
                          {cell.isLowest && (
                            <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">Lowest</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          Amount {money(cell.total, s.currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">Lead: {lead ?? "-"}</div>
                        {cell.notes && (
                          <div className="text-xs text-muted-foreground max-w-[170px] truncate" title={cell.notes}>
                            {cell.notes}
                          </div>
                        )}
                        {cell.qtyMismatch && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400">
                            Qty {cell.quantity.toLocaleString()} differs from request
                          </div>
                        )}
                        {cell.lineTotalMismatch && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400">Line total differs from qty x rate</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={cn(stickyCell, "border-b bg-muted px-3 py-2 font-semibold")}>Compare total{baseCurrency ? ` (${baseCurrency})` : ""}</td>
                {suppliers.map(s => {
                  const isLowest = lowestTotal != null && s.eligible === true && s.compareTotal === lowestTotal;
                  return (
                    <td key={s.quotationId} className={cn("border-b px-3 py-2 font-semibold tabular-nums bg-muted/50", isLowest && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                      {money(s.compareTotal, s.currency)}
                      {isLowest && <span className="ml-1 text-[10px] font-semibold uppercase">Lowest</span>}
                      {s.totalMismatch && (
                        <div className="text-[11px] font-normal text-red-600 dark:text-red-400">
                          Header total {money(s.headerTotal, s.currency)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className={cn(stickyCell, isFinal ? "bg-muted" : "border-b bg-muted", "px-3 py-2 text-muted-foreground")}>Lines covered</td>
                {suppliers.map(s => (
                  <td key={s.quotationId} className={cn("px-3 py-2 tabular-nums bg-muted/50", !isFinal && "border-b")}>
                    {s.coveredLines}/{s.totalLines}
                  </td>
                ))}
              </tr>
              {!isFinal && (
                <tr>
                  <td className={cn(stickyCell, "bg-muted px-3 py-2 text-muted-foreground")}>Rank</td>
                  {suppliers.map(s => (
                    <td key={s.quotationId} className="px-3 py-2 tabular-nums bg-muted/50">
                      {s.rank != null ? `#${s.rank}` : <span className="text-muted-foreground">Not ranked</span>}
                    </td>
                  ))}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!submitting) setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Award RFQ {rfq.rfq_number}</DialogTitle>
            <DialogDescription>
              Choose the winning quotation. A draft purchase order is created from its lines.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2" role="radiogroup" aria-label="Supplier">
            {suppliers.map(s => {
              const gap = gapPct(s);
              const checked = s.quotationId === selectedId;
              return (
                <label
                  key={s.quotationId}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer",
                    checked && "border-primary bg-muted/50",
                    s.expired && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <input
                    type="radio"
                    name="award-quotation"
                    className="mt-1"
                    checked={checked}
                    disabled={s.expired || submitting}
                    onChange={() => setSelectedId(s.quotationId)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.supplierName}</span>
                      {s.quotationId === recommendedId && (
                        <Badge variant="outline" className={GREEN_BADGE}>Recommended</Badge>
                      )}
                      {s.expired && <Badge variant="outline" className={RED_BADGE}>Expired</Badge>}
                      {!s.comparable && <Badge variant="outline" className={AMBER_BADGE}>Currency not comparable</Badge>}
                      {!s.fullCoverage && <Badge variant="outline" className={AMBER_BADGE}>Partial {s.coveredLines}/{s.totalLines}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Compare total {money(s.compareTotal, s.currency)}
                      {gap != null && s.quotationId !== recommended?.quotationId && (
                        <span> ({gap >= 0 ? "+" : ""}{gap.toFixed(1)}% vs recommended)</span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {noRecommendation && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No quotation qualifies for a system recommendation. This award will be recorded as an exception.</span>
            </div>
          )}
          {overriding && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                You are overriding the system recommendation ({recommended?.supplierName}).
                {gapPct(selected) != null && ` This supplier is ${gapPct(selected)! >= 0 ? "+" : ""}${gapPct(selected)!.toFixed(1)}% against the recommended total.`}
                {" "}Explain the reason below.
              </span>
            </div>
          )}
          {selected && uncoveredLines.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm dark:border-amber-500/30">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                This quotation does not cover {uncoveredLines.length} requested line{uncoveredLines.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {uncoveredLines.map(l => (
                  <li key={l.key}>Line {l.lineNo}: {l.description} ({l.quantity.toLocaleString()} {l.unit})</li>
                ))}
              </ul>
            </div>
          )}
          {exceptionKey && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{EXCEPTION_LABEL[exceptionKey] ?? exceptionKey}: the award is recorded as an exception.</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="award-reason" className="text-sm font-medium">Basis of award / reason</label>
            <textarea
              id="award-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={submitting}
              placeholder="State why this supplier is selected"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
              <ul className="text-muted-foreground list-disc pl-4">
                {reasonInfo.why.length === 0
                  ? <li>A reason is required.</li>
                  : reasonInfo.why.map(w => <li key={w}>Minimum {reasonInfo.min} characters because {w}.</li>)}
              </ul>
              <span className={cn("tabular-nums", reasonLen >= reasonInfo.min ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {reasonLen} / {reasonInfo.min} min
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={submitAward}
              disabled={!reasonOk || submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Award className="h-4 w-4 mr-1" />}
              Confirm award
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
