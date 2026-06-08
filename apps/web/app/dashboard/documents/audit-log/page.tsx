"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Clock, FileText, AlertTriangle, Filter, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  document_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  user_id: string | null;
  created_at: string;
  profiles?: { full_name: string }[] | null;
  documents?: { document_number: string; title: string }[] | null;
}

const ACTION_COLORS: Record<string, string> = {
  created: "bg-blue-50 text-blue-600",
  updated: "bg-gray-50 text-gray-600",
  status_change: "bg-amber-50 text-amber-600",
  revision_uploaded: "bg-purple-50 text-purple-600",
  viewed: "bg-green-50 text-green-600",
  downloaded: "bg-teal-50 text-teal-600",
  transmitted: "bg-indigo-50 text-indigo-600",
  commented: "bg-sky-50 text-sky-600",
};

export default function DocumentAuditLogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    supabase.from("document_audit_log")
      .select("*, profiles:user_id(full_name), documents:document_id(document_number, title)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setEntries(data as AuditEntry[]);
        setLoading(false);
      });
  }, [supabase]);

  const filtered = entries.filter((e) => {
    if (search && !e.documents?.[0]?.document_number?.toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter && e.action !== actionFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document Audit Log</h1>
          <p className="text-sm text-muted-foreground">{entries.length} total entries</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Search document number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden focus:border-primary"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-border bg-background py-2 px-3 text-sm outline-hidden focus:border-primary"
        >
          <option value="">All Actions</option>
          {["created", "updated", "status_change", "revision_uploaded", "viewed", "downloaded", "transmitted", "commented"].map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
        {(search || actionFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setActionFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 inline mr-1" />
            Clear
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No entries found</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0 mt-0.5", ACTION_COLORS[entry.action] ?? "bg-gray-50 text-gray-600")}>
                  {entry.action === "status_change" ? <AlertTriangle className="h-3.5 w-3.5" /> :
                   entry.action === "created" ? <FileText className="h-3.5 w-3.5" /> :
                   <Clock className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{entry.action.replace(/_/g, " ")}</span>
                    {entry.documents?.[0] && (
                      <span className="text-sm text-muted-foreground">
                        — {entry.documents[0].document_number}
                      </span>
                    )}
                  </div>
                  {entry.documents?.[0]?.title && (
                    <p className="text-xs text-muted-foreground truncate">{entry.documents[0].title}</p>
                  )}
                  {entry.old_value && entry.new_value && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.field_name}: <span className="line-through">{entry.old_value}</span> → <span className="font-medium">{entry.new_value}</span>
                    </p>
                  )}
                  {entry.comment && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.comment}"</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground">{entry.profiles?.[0]?.full_name || "Unknown"}</span>
                    <span className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
