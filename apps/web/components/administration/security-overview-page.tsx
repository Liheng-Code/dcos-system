"use client";

import { useEffect, useState } from "react";
import { Users, UserCheck, Mail, Lock, PauseCircle, Ban, History, RotateCcw, Loader2 } from "lucide-react";
import { KPICard } from "@/components/ui/kpi-card";

export interface AccountSummary {
  counts: {
    INVITED: number;
    ACTIVE: number;
    LOCKED: number;
    SUSPENDED: number;
    DISABLED: number;
  };
  total: number;
  recent_activity: {
    id: string;
    event_type: string;
    actor_name: string;
    actor_id: string | null;
    user_name: string;
    user_id: string;
    created_at: string;
  }[];
}

export const EVENT_LABELS: Record<string, string> = {
  account_invited: "Account invited",
  account_activated: "Account activated",
  password_changed: "Password changed",
  password_reset_requested: "Password reset requested",
  password_reset_completed: "Password reset completed",
  force_reset_triggered: "Force reset triggered",
  account_locked: "Account locked",
  account_unlocked: "Account unlocked",
  account_suspended: "Account suspended",
  account_disabled: "Account disabled",
  account_auto_disabled_inactivity: "Auto-disabled (90-day inactivity)",
  session_revoked: "Session revoked",
};

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SecurityOverviewPage() {
  const [data, setData] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard/account-summary");
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Failed to load security overview");
      setData(json as AccountSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch-on-mount, matching the fetch-on-mount pattern used throughout this codebase's
    // list/dashboard pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-sm text-destructive">{error ?? "Failed to load security overview"}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Total Users"
          value={data.total}
          icon={Users}
          iconBg="bg-slate-500/10"
          iconColor="text-slate-600"
          href="/dashboard/administration/users"
        />
        <KPICard
          label="Active"
          value={data.counts.ACTIVE}
          icon={UserCheck}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600"
          href="/dashboard/administration/users?account_status=ACTIVE"
        />
        <KPICard
          label="Invited"
          value={data.counts.INVITED}
          icon={Mail}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600"
          href="/dashboard/administration/users?account_status=INVITED"
        />
        <KPICard
          label="Locked"
          value={data.counts.LOCKED}
          icon={Lock}
          iconBg="bg-red-500/10"
          iconColor="text-red-600"
          href="/dashboard/administration/users?account_status=LOCKED"
        />
        <KPICard
          label="Suspended"
          value={data.counts.SUSPENDED}
          icon={PauseCircle}
          iconBg="bg-orange-500/10"
          iconColor="text-orange-600"
          href="/dashboard/administration/users?account_status=SUSPENDED"
        />
        <KPICard
          label="Disabled"
          value={data.counts.DISABLED}
          icon={Ban}
          iconBg="bg-gray-500/10"
          iconColor="text-gray-600"
          href="/dashboard/administration/users?account_status=DISABLED"
        />
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Account Activity</h3>
          </div>
          <a href="/dashboard/administration/audit-logs" className="text-xs font-medium text-primary hover:underline">
            View all
          </a>
        </div>
        {data.recent_activity.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No recent account activity.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.recent_activity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ")}
                    <span className="text-muted-foreground font-normal"> — {entry.user_name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">by {entry.actor_name}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
