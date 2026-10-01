"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ShieldAlert, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_LABELS, formatRelative, type AccountSummary } from "@/components/administration/security-overview-page";
import { getProfileById, listUserRolesByUserId } from "@/lib/administration/administration-queries";

const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);

const STATUS_TILES: { key: keyof AccountSummary["counts"]; label: string; cls: string }[] = [
  { key: "ACTIVE", label: "Active", cls: "text-emerald-600" },
  { key: "INVITED", label: "Invited", cls: "text-amber-600" },
  { key: "LOCKED", label: "Locked", cls: "text-red-600" },
  { key: "SUSPENDED", label: "Suspended", cls: "text-orange-600" },
  { key: "DISABLED", label: "Disabled", cls: "text-gray-500" },
];

// USR-11 — Admin Dashboard Widget: compact counts-by-status tiles + a short recent-activity
// list, with a "View all" link to USR-05 (Security Overview). Self-contained: silently
// renders nothing for a non-admin/HR viewer rather than redirecting, since it's embedded on
// a shared landing page other roles also use.
export function AdminDashboardWidget() {
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) { setChecked(true); return; }
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        getProfileById(userData.user.id),
        listUserRolesByUserId(userData.user.id),
      ]);
      const codes = new Set((roleRows ?? []).map((r: { role_code: string }) => r.role_code));
      if (profile?.role) codes.add(profile.role as string);
      setAllowed([...codes].some((c) => HR_ROLE_CODES.has(c)));
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!allowed) return;
    // Kicking off a one-time fetch on mount/allowed-change, matching the fetch-on-mount
    // pattern used throughout this codebase's list/dashboard pages (e.g. qs/audit-log.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/admin/dashboard/account-summary")
      .then((res) => res.json())
      .then((json) => setData(json as AccountSummary))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [allowed]);

  if (!checked || !allowed) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Account Security</h3>
        </div>
        <Link href="/dashboard/administration/security" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-2">
            {STATUS_TILES.map((tile) => (
              <Link
                key={tile.key}
                href={`/dashboard/administration/users?account_status=${tile.key}`}
                className="rounded-lg border border-border/70 px-2 py-2 text-center transition-colors hover:bg-muted/50"
              >
                <p className={cn("text-lg font-bold tabular-nums", tile.cls)}>{data.counts[tile.key]}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
              </Link>
            ))}
          </div>
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            {data.recent_activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent account activity.</p>
            ) : (
              data.recent_activity.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">
                    <span className="font-medium text-foreground">{EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ")}</span>
                    {" — "}
                    {entry.user_name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatRelative(entry.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
