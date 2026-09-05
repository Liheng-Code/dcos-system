"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Lock, Unlock, PauseCircle, Ban, Mail, KeyRound, UserPlus, History, Loader2, Search, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLogEntry {
  id: string;
  event_type: string;
  actor_name: string;
  actor_id: string | null;
  user_name: string;
  user_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

const EVENT_TYPES = [
  "account_invited",
  "account_activated",
  "password_changed",
  "password_reset_requested",
  "password_reset_completed",
  "force_reset_triggered",
  "account_locked",
  "account_unlocked",
  "account_suspended",
  "account_disabled",
  "account_auto_disabled_inactivity",
  "session_revoked",
  "employment_status_changed",
] as const;

const EVENT_META: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  account_invited: { label: "Account invited", icon: UserPlus, cls: "bg-blue-50 text-blue-600" },
  account_activated: { label: "Account activated", icon: UserPlus, cls: "bg-emerald-50 text-emerald-600" },
  password_changed: { label: "Password changed", icon: KeyRound, cls: "bg-sky-50 text-sky-600" },
  password_reset_requested: { label: "Password reset requested", icon: Mail, cls: "bg-amber-50 text-amber-600" },
  password_reset_completed: { label: "Password reset completed", icon: KeyRound, cls: "bg-emerald-50 text-emerald-600" },
  force_reset_triggered: { label: "Force reset triggered", icon: KeyRound, cls: "bg-amber-50 text-amber-600" },
  account_locked: { label: "Account locked", icon: Lock, cls: "bg-red-50 text-red-600" },
  account_unlocked: { label: "Account unlocked", icon: Unlock, cls: "bg-emerald-50 text-emerald-600" },
  account_suspended: { label: "Account suspended", icon: PauseCircle, cls: "bg-orange-50 text-orange-600" },
  account_disabled: { label: "Account disabled", icon: Ban, cls: "bg-gray-100 text-gray-600" },
  account_auto_disabled_inactivity: { label: "Auto-disabled (90-day inactivity)", icon: Ban, cls: "bg-gray-100 text-gray-600" },
  session_revoked: { label: "Session revoked", icon: Lock, cls: "bg-red-50 text-red-600" },
  employment_status_changed: { label: "Employment status changed", icon: History, cls: "bg-purple-50 text-purple-600" },
};

function summarizeValue(v: Record<string, unknown> | null): string | null {
  if (!v) return null;
  const entries = Object.entries(v);
  if (entries.length === 0) return null;
  return entries.map(([k, val]) => `${k}: ${String(val)}`).join(", ");
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (eventType) params.set("event_type", eventType);
      if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("date_to", end.toISOString());
      }
      params.set("limit", "200");
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Failed to load audit logs");
      setEntries(json.logs ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch-on-filter-change, matching the fetch-on-mount pattern used throughout this
    // codebase's list pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) => e.user_name.toLowerCase().includes(q) || e.actor_name.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const hasFilters = !!(search || eventType || dateFrom || dateTo);
  function clearFilters() {
    setSearch("");
    setEventType("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Search affected user or actor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden focus:border-primary"
          />
        </div>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="rounded-lg border border-border bg-background py-2 px-3 text-sm outline-hidden focus:border-primary"
        >
          <option value="">All Event Types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{EVENT_META[t]?.label ?? t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-border bg-background py-2 px-3 text-sm outline-hidden focus:border-primary"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-border bg-background py-2 px-3 text-sm outline-hidden focus:border-primary"
          aria-label="To date"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {total} entries
          </p>
          <div className="rounded-lg border border-border">
            {filtered.length === 0 ? (
              <div className="px-6 py-20 text-center text-sm text-muted-foreground">No audit entries found.</div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((entry) => {
                  const meta = EVENT_META[entry.event_type];
                  const Icon = meta?.icon ?? Clock;
                  const summary = summarizeValue(entry.new_value) ?? summarizeValue(entry.old_value);
                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0 mt-0.5", meta?.cls ?? "bg-gray-50 text-gray-600")}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{meta?.label ?? entry.event_type.replace(/_/g, " ")}</span>
                          <span className="text-sm text-muted-foreground">— {entry.user_name}</span>
                        </div>
                        {summary && <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>}
                        {entry.note && <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{entry.note}&rdquo;</p>}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-muted-foreground">by {entry.actor_name}</span>
                          <span className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
