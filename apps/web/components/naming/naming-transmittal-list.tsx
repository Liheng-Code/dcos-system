"use client";

import { useEffect, useState, useMemo } from "react";
import { listCompaniesByIds, listStakeholderAbbreviationsByStakeholderIds, listTransmittalsByProjectId } from "@/lib/naming/naming-queries";
import { Loader2, Search, X, Plus, Inbox, Send, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { TransmittalCreate } from "./naming-transmittal-create";
import { TransmittalDetail } from "./naming-transmittal-detail";

interface TransmittalRow {
  id: string;
  transmittal_code: string;
  issuer_company_id: string;
  receiver_stakeholder_id: string;
  subject: string;
  status: string;
  sent_at: string;
  created_at: string;
  created_by: string;
  issuer_code?: string;
  receiver_abbr?: string;
}

export function TransmittalListPage() {
  const { selectedProjectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [transmittals, setTransmittals] = useState<TransmittalRow[]>([]);
  const [viewFilter, setViewFilter] = useState<"all" | "outgoing" | "incoming">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function fetchTransmittals() {
    if (!selectedProjectId) return;
    listTransmittalsByProjectId(selectedProjectId)
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return; }
        const rows = data as TransmittalRow[];
        const companyIds = [...new Set(rows.map((r) => r.issuer_company_id))];
        const stakeholderIds = [...new Set(rows.map((r) => r.receiver_stakeholder_id))];

        const [compRes, stakeRes] = await Promise.all([
          listCompaniesByIds(companyIds),
          listStakeholderAbbreviationsByStakeholderIds(stakeholderIds),
        ]);

        const compMap: Record<string, string> = {};
        if (compRes.data) for (const c of compRes.data as { id: string; code: string }[]) compMap[c.id] = c.code;

        const stakeMap: Record<string, string> = {};
        if (stakeRes.data) for (const s of stakeRes.data as { stakeholder_id: string; abbreviation: string }[]) stakeMap[s.stakeholder_id] = s.abbreviation;

        setTransmittals(rows.map((r) => ({
          ...r,
          issuer_code: compMap[r.issuer_company_id] ?? "—",
          receiver_abbr: stakeMap[r.receiver_stakeholder_id] ?? "—",
        })));
        setLoading(false);
      });
  }

  useEffect(() => {
    if (selectedProjectId) fetchTransmittals();
    else setLoading(false);
  }, [selectedProjectId]);

  const filtered = useMemo(() => {
    return transmittals.filter((t) => {
      if (searchQuery && !t.transmittal_code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });
  }, [transmittals, searchQuery, statusFilter]);

  if (showCreate) {
    return (
      <div className="max-w-2xl mx-auto">
        <TransmittalCreate
          onClose={() => setShowCreate(false)}
          onCreated={fetchTransmittals}
        />
      </div>
    );
  }

  if (selectedId) {
    return (
      <TransmittalDetail
        transmittalId={selectedId}
        projectId={selectedProjectId}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {transmittals.length} transmittal{transmittals.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Transmittal
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "outgoing", "incoming"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setViewFilter(v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              viewFilter === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground bg-muted/30"
            )}
          >
            {v === "all" ? "All" : v === "outgoing" ? "Outbox" : "Inbox"}
          </button>
        ))}
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Search transmittals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-3 text-xs outline-hidden placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background py-1.5 px-2 text-xs appearance-none outline-hidden focus:border-primary"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mb-2 opacity-30" />
          {transmittals.length === 0 ? "No transmittals yet" : "No transmittals match your filters"}
        </div>
      ) : (
        <div className="rounded-xl border divide-y">
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{t.transmittal_code}</span>
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    t.status === "sent"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                      : "bg-gray-500/10 text-gray-500 border-gray-200"
                  }`}>
                    {t.status}
                  </span>
                </div>
                {t.subject && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                )}
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                <div>{t.issuer_code} → {t.receiver_abbr}</div>
                <div>{t.sent_at ? new Date(t.sent_at).toLocaleDateString() : new Date(t.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
