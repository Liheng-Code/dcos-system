"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getTenderCoverSummary, getBidSummaries, getTenderSubmissionData, type TenderCoverSummary, type TenderBidSummary } from "@/lib/tender-cost-service";
import { printTenderCoverSummary, printTenderSubmission } from "@/lib/print-service";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TenderHeader {
  tender_no: string;
  title: string;
  project_location: string | null;
  client_name: string | null;
  contractor_name: string | null;
}

export function CoverSummaryTab({ tenderId }: { tenderId: string }) {
  const [tender, setTender] = useState<TenderHeader | null>(null);
  const [summary, setSummary] = useState<TenderCoverSummary | null>(null);
  const [revisions, setRevisions] = useState<TenderBidSummary[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [printingSubmission, setPrintingSubmission] = useState(false);

  const { can } = useTenderPermissions();

  const load = useCallback(async (bidSummaryId?: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [{ data: t }, revs, s] = await Promise.all([
        supabase.from("tender_register").select("tender_no, title, project_location, client_name, contractor_name").eq("id", tenderId).single(),
        getBidSummaries(tenderId),
        getTenderCoverSummary(tenderId, bidSummaryId),
      ]);
      setTender(t as TenderHeader);
      setRevisions(revs);
      setSummary(s);
      setSelectedRevisionId(s.bidSummary?.id ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load cover summary");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  function handlePrint() {
    if (!summary || !tender) return;
    printTenderCoverSummary(summary, tender, {
      client: tender.client_name ?? undefined,
      contractor: tender.contractor_name ?? undefined,
    });
  }

  async function handlePrintSubmission() {
    setPrintingSubmission(true);
    try {
      const submissionData = await getTenderSubmissionData(tenderId, selectedRevisionId || undefined);
      printTenderSubmission(submissionData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate submission");
    } finally {
      setPrintingSubmission(false);
    }
  }

  if (loading || !summary || !tender) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const bs = summary.bidSummary;
  const preVatSubtotal = bs
    ? Number(bs.direct_cost) + Number(bs.preliminaries) + Number(bs.subcontract_cost) + Number(bs.overhead_amount) + Number(bs.profit_amount) + Number(bs.contingency) + Number(bs.risk_allowance)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Bid Revision:</label>
          <select
            value={selectedRevisionId}
            onChange={(e) => load(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {revisions.map((r) => <option key={r.id} value={r.id}>Revision {r.revision_no} — {r.status}</option>)}
          </select>
        </div>
        {can("tender_cover", "export") && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handlePrint} disabled={!bs}>
            <Printer className="mr-1 h-4 w-4" /> Print Cost Summary
          </Button>
          <Button size="sm" variant="default" onClick={handlePrintSubmission} disabled={printingSubmission}>
            {printingSubmission ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />} Print Full Submission
          </Button>
        </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-1">TENDER COST SUMMARY — {tender.tender_no}</h3>
        <p className="text-xs text-muted-foreground mb-3">{tender.title} {tender.project_location ? `· ${tender.project_location}` : ""}</p>

        <p className="text-xs font-semibold text-muted-foreground mb-2">1. Elemental Cost Summary</p>
        <div className="rounded-lg border border-border overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Code</th>
                <th className="text-left px-3 py-1.5 font-medium">Description</th>
                <th className="text-right px-3 py-1.5 font-medium">Amount</th>
                <th className="text-left px-3 py-1.5 font-medium">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.elementalCostSummary.map((g) => (
                <tr key={g.codeLetter}>
                  <td className="px-3 py-1.5">{g.codeLetter}</td>
                  <td className="px-3 py-1.5">{g.groupName}</td>
                  <td className="px-3 py-1.5 text-right">{g.priced ? `$ ${fmt(g.amount)}` : "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{g.priced ? "Priced" : "Excluded"}</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={2} className="px-3 py-1.5">DIRECT WORKS COST (A)</td>
                <td className="px-3 py-1.5 text-right">$ {fmt(summary.directWorksTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs font-semibold text-muted-foreground mb-2">2. Commercial Build-up to Tender Price</p>
        {bs ? (
          <table className="text-sm max-w-md">
            <tbody>
              <tr><td className="py-1 pr-6">Direct Works Cost (A)</td><td className="py-1 text-right">$ {fmt(summary.directWorksTotal)}</td></tr>
              <tr><td className="py-1 pr-6">Add: Preliminaries & General (Z)</td><td className="py-1 text-right">$ {fmt(summary.preliminariesTotal)}</td></tr>
              <tr><td className="py-1 pr-6">Add: Subcontract Cost</td><td className="py-1 text-right">$ {fmt(bs.subcontract_cost)}</td></tr>
              <tr><td className="py-1 pr-6">Add: Head Office Overhead ({bs.overhead_pct}%)</td><td className="py-1 text-right">$ {fmt(bs.overhead_amount)}</td></tr>
              <tr><td className="py-1 pr-6">Add: Risk & Contingency</td><td className="py-1 text-right">$ {fmt(Number(bs.contingency) + Number(bs.risk_allowance))}</td></tr>
              <tr><td className="py-1 pr-6">Add: Profit ({bs.profit_pct}%)</td><td className="py-1 text-right">$ {fmt(bs.profit_amount)}</td></tr>
              <tr className="font-semibold border-t border-border"><td className="py-1 pr-6">Subtotal before VAT</td><td className="py-1 text-right">$ {fmt(preVatSubtotal)}</td></tr>
              <tr><td className="py-1 pr-6">Add: VAT ({bs.vat_pct}%)</td><td className="py-1 text-right">$ {fmt(bs.vat_amount)}</td></tr>
              <tr className="font-bold text-base border-t-2 border-border"><td className="py-2 pr-6">TENDER PRICE (USD)</td><td className="py-2 text-right">$ {fmt(bs.total_bid_price)}</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No bid summary revision yet — create one in the Bid Summary tab.</p>
        )}
      </div>
    </div>
  );
}
