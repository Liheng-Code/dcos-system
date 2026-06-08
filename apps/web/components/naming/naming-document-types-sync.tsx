"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface DocType {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const CONVENTION_DOC_TYPES = [
  // Construction Site Documents
  { code: "MCL", name: "Main Contractor Letter", category: "Site" },
  { code: "CL", name: "Client Letter", category: "Site" },
  { code: "RFI", name: "Request for Information", category: "Site" },
  { code: "AFI", name: "Available for Inspection", category: "Site" },
  { code: "ITP", name: "Inspection & Test Plan", category: "Site" },
  { code: "DR", name: "Daily Report", category: "Site" },
  { code: "WR", name: "Weekly Report", category: "Site" },
  { code: "MR", name: "Monthly Report", category: "Site" },
  { code: "SCH", name: "Schedule", category: "Site" },
  { code: "NCR", name: "Non-Conformance Report", category: "Site" },
  { code: "MOM", name: "Minutes of Meeting", category: "Site" },
  { code: "MSRA", name: "Method Statement — Request for Approval", category: "Site" },
  { code: "MRA", name: "Material Request for Approval", category: "Site" },
  { code: "NOD", name: "Notice of Delay", category: "Site" },
  { code: "NOC", name: "Notice of Claim", category: "Site" },
  { code: "CVI", name: "Confirmation of Verbal Instruction", category: "Site" },
  { code: "AI", name: "Architect Instruction", category: "Site" },
  { code: "NPCC", name: "Notice of Potential Contra Charge", category: "Site" },
  // Commercial & Financial
  { code: "IPC", name: "Interim Payment Certificate", category: "Commercial" },
  { code: "BQ", name: "Bill of Quantities", category: "Commercial" },
  { code: "PR", name: "Purchase Requisition", category: "Commercial" },
  { code: "PO", name: "Purchase Order", category: "Commercial" },
  { code: "INV", name: "Invoice", category: "Commercial" },
  { code: "PAY", name: "Payment Certificate", category: "Commercial" },
  { code: "VO", name: "Variation Order", category: "Commercial" },
  { code: "FA", name: "Final Account", category: "Commercial" },
  { code: "RET", name: "Retention Statement", category: "Commercial" },
  // Procurement
  { code: "EOI", name: "Expression of Interest", category: "Procurement" },
  { code: "PQ", name: "Prequalification", category: "Procurement" },
  { code: "TDP", name: "Tender Package", category: "Procurement" },
  { code: "TDO", name: "Tender Opening", category: "Procurement" },
  { code: "TDI", name: "Tender Interview", category: "Procurement" },
  { code: "SV", name: "Site Visit", category: "Procurement" },
  { code: "TER", name: "Tender Evaluation Report", category: "Procurement" },
  { code: "TDA", name: "Tender Committee Approval", category: "Procurement" },
  { code: "SCA", name: "Subcontract Agreement", category: "Procurement" },
  { code: "MSA", name: "Master Service Agreement", category: "Procurement" },
  { code: "KOMI", name: "Kickoff Meeting — Internal", category: "Procurement" },
  { code: "KOMX", name: "Kickoff Meeting — External", category: "Procurement" },
];

export function NamingDocumentTypesSync() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [existing, setExisting] = useState<DocType[]>([]);
  const [diff, setDiff] = useState<{ code: string; name: string; action: "add" | "exists" }[]>([]);

  useEffect(() => {
    supabase.from("document_types").select("*").order("code").then(({ data, error }) => {
      if (data) {
        setExisting(data as DocType[]);
        computeDiff(data as DocType[]);
      }
      if (error) toast.error("Failed to load document types");
      setLoading(false);
    });
  }, [supabase]);

  function computeDiff(existingTypes: DocType[]) {
    const existingCodes = new Set(existingTypes.map((d) => d.code));
    const d = CONVENTION_DOC_TYPES.map((ct) => ({
      code: ct.code,
      name: ct.name,
      action: existingCodes.has(ct.code) ? "exists" as const : "add" as const,
    }));
    setDiff(d);
  }

  async function handleSync() {
    const toAdd = CONVENTION_DOC_TYPES.filter(
      (ct) => !existing.some((e) => e.code === ct.code)
    );
    if (toAdd.length === 0) {
      toast.info("All convention document types already exist");
      return;
    }
    setSyncing(true);
    const { error } = await supabase.from("document_types").insert(
      toAdd.map((t) => ({ code: t.code, name: t.name }))
    );
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${toAdd.length} document type(s) added`);
      const { data } = await supabase.from("document_types").select("*").order("code");
      if (data) {
        setExisting(data as DocType[]);
        computeDiff(data as DocType[]);
      }
    }
    setSyncing(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const addCount = diff.filter((d) => d.action === "add").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {addCount > 0
            ? `${addCount} convention document type(s) not yet in the database`
            : "All convention document types are present"}
        </p>
        <Button onClick={handleSync} disabled={syncing || addCount === 0}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : addCount > 0 ? `Add ${addCount} missing` : "Up to date"}
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((d) => (
              <tr key={d.code} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2">
                  {d.action === "add" ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
                      Missing
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-medium">
                      Synced
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-sm">{d.code}</td>
                <td className="px-4 py-2 text-sm">{d.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
