"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Users, TrendingUp, Calendar, Globe, GitBranch, BarChart2 } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WhoIsOnLeaveToday } from "@/components/hr/leave/who-is-on-leave-today";

const ADMIN_LINKS = [
  { href: "/dashboard/administration/leave-types",    label: "Leave Types",     icon: Settings },
  { href: "/dashboard/hr/leave/approval-chains",       label: "Approval Chains", icon: GitBranch },
  { href: "/dashboard/administration/team-capacity",  label: "Team Capacity",   icon: Users },
  { href: "/dashboard/hr/leave/seniority-rules", label: "Seniority Rules", icon: TrendingUp },
  { href: "/dashboard/hr/leave/reports",               label: "Leave Reports",   icon: BarChart2 },
  { href: "/dashboard/administration/year-end",       label: "Year-End Run",    icon: Calendar },
  { href: "/dashboard/hr/leave/public-holidays",       label: "Public Holidays", icon: Globe },
];

// ── Color map (matches admin page) ────────────────────────────────────────────
const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface DisplayRow {
  id: string;
  leave_type_id: string;
  leave_name: string;
  color: string;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  carried_over_days: number;
}

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  leave_types: { leave_name: string };
}

interface LeaveTypeRow {
  id: string;
  leave_name: string;
  color: string | null;
  max_days_per_year: number | null;
  gender_restriction: string | null;
}

interface BalanceSourceRow {
  id: string;
  leave_type_id: string;
  allocated_days: number | null;
  used_days: number | null;
  remaining_days: number | null;
  carried_over_days: number | null;
}

interface UsageRow {
  leave_type_id: string;
  days_requested: number;
  status: "approved" | "pending_cancellation" | "submitted";
}

// ── Circular ring SVG ─────────────────────────────────────────────────────────
function CircleRing({ remaining, total, color }: { remaining: number; total: number; color: string }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const pct = total > 0 ? Math.min(remaining / total, 1) : 0;
  const offset = C * (1 - pct);

  return (
    <div className="relative my-6 flex justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={C} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground leading-none">{remaining}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">remaining</span>
      </div>
    </div>
  );
}

// ── Balance card ──────────────────────────────────────────────────────────────
function BalanceCard({ row, pendingDays, href }: { row: DisplayRow; pendingDays: number; href: string }) {
  const total = row.allocated_days + row.carried_over_days;

  return (
    <Link href={href} className="block group">
      <Card className="rounded-xl group-hover:shadow-md group-hover:border-primary/20 transition-all cursor-pointer">
        <CardContent className="pt-5 pb-5 px-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-sm font-semibold text-foreground">{row.leave_name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{row.allocated_days} days per year</span>
          </div>

          {/* Ring */}
          <CircleRing remaining={row.remaining_days} total={total} color={row.color} />

          {/* Stats */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                <span className="text-muted-foreground">Taken</span>
              </div>
              <span className="font-medium">{row.used_days} days</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full flex-shrink-0 bg-amber-400" />
                <span className="text-muted-foreground">Pending</span>
              </div>
              <span className={`font-medium ${pendingDays > 0 ? "text-amber-600" : ""}`}>
                {pendingDays} days
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full flex-shrink-0 bg-gray-300" />
                <span className="text-muted-foreground">Remaining</span>
              </div>
              <span className="font-medium">{row.remaining_days} days</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LeaveDashboardPage() {
  const [displayRows, setDisplayRows] = useState<DisplayRow[]>([]);
  const [upcoming, setUpcoming] = useState<LeaveRequest[]>([]);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [pendingMap, setPendingMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return;
      const uid = userData.user.id;

      // Check admin/HR Manager role
      supabase.from("user_roles").select("role_code")
        .eq("user_id", uid).in("role_code", ["HR_Manager", "admin"])
        .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));

      const [balRes, upcomingRes, pendingRes, usageRes, typesRes, profileRes] = await Promise.all([
        // Fix: order by direct column (not embedded FK column — PostgREST limitation)
        supabase
          .from("leave_balances")
          .select("id, leave_type_id, allocated_days, used_days, remaining_days, carried_over_days")
          .eq("employee_id", uid)
          .eq("fiscal_year", currentYear)
          .order("leave_type_id"),

        supabase
          .from("leave_requests")
          .select("id, start_date, end_date, days_requested, leave_types(leave_name)")
          .eq("employee_id", uid)
          .eq("status", "approved")
          .gte("start_date", today)
          .order("start_date")
          .limit(5),

        supabase
          .from("leave_requests")
          .select("id, start_date, end_date, days_requested, leave_types(leave_name)")
          .eq("employee_id", uid)
          .eq("status", "submitted")
          .order("submission_date", { ascending: false })
          .limit(5),

        supabase
          .from("leave_requests")
          .select("leave_type_id, days_requested, status")
          .eq("employee_id", uid)
          .in("status", ["approved", "pending_cancellation", "submitted"])
          .gte("start_date", `${currentYear}-01-01`)
          .lte("start_date", `${currentYear}-12-31`),

        // Fetch all active leave types (drives the card grid even when no balance records)
        supabase
          .from("leave_types")
          .select("id, leave_name, color, max_days_per_year, gender_restriction")
          .eq("is_active", true)
          .order("leave_name"),

        // Fetch current user's gender for leave type filtering
        supabase
          .from("profiles")
          .select("gender")
          .eq("id", uid)
          .single(),
      ]);

      // Pending days map: leave_type_id → total submitted days
      const usedMap: Record<string, number> = {};
      const map: Record<string, number> = {};
      for (const row of (usageRes.data || []) as UsageRow[]) {
        if (row.status === "submitted") {
          map[row.leave_type_id] = (map[row.leave_type_id] ?? 0) + row.days_requested;
        } else {
          usedMap[row.leave_type_id] = (usedMap[row.leave_type_id] ?? 0) + row.days_requested;
        }
      }

      // Strict gender filtering:
      // - restriction "all"    → visible to everyone
      // - restriction "female" → maternity, visible only to female staff
      // - restriction "male"   → paternity, visible only to male staff
      // - gender not set on profile → gender-restricted types are hidden
      const userGender: string | null = (profileRes.data as { gender?: string } | null)?.gender ?? null;
      const visibleTypes = ((typesRes.data || []) as LeaveTypeRow[]).filter((lt) => {
        const restriction = lt.gender_restriction ?? "all";
        if (restriction === "all") return true;
        if (!userGender) return false;
        return restriction === userGender;
      });

      // Merge: for each visible leave type, use balance data or synthesise zeros
      const balMap = new Map(
        ((balRes.data || []) as BalanceSourceRow[]).map((b) => [b.leave_type_id, b]),
      );
      const rows: DisplayRow[] = visibleTypes.map((lt) => {
        const bal = balMap.get(lt.id);
        const carriedOverDays = bal?.carried_over_days ?? 0;
        const allocatedDays = bal?.allocated_days ?? lt.max_days_per_year ?? 0;
        const totalEntitlement = allocatedDays + carriedOverDays;
        const usedDays = usedMap[lt.id] ?? bal?.used_days ?? 0;
        const pendingDays = map[lt.id] ?? 0;

        return {
          id:               bal?.id ?? lt.id,
          leave_type_id:    lt.id,
          leave_name:       lt.leave_name,
          color:            COLOR_HEX[lt.color as string] ?? COLOR_HEX.blue,
          allocated_days:   allocatedDays,
          used_days:        usedDays,
          remaining_days:   Math.max(totalEntitlement - usedDays - pendingDays, 0),
          carried_over_days: carriedOverDays,
        };
      });

      setDisplayRows(rows);
      setUpcoming((upcomingRes.data || []) as unknown as LeaveRequest[]);
      setPending((pendingRes.data || []) as unknown as LeaveRequest[]);
      setPendingMap(map);
      setLoading(false);
    });
  }, [currentYear, today]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {/* Header */}
        <div className="leave-page-header flex items-start justify-between">
          <div className="-ml-[4rem]">
            <h2 className="text-2xl font-bold tracking-tight">Leave Balance</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              View your leave balances for the current year
            </p>
          </div>
          <Button onClick={() => router.push("/dashboard/hr/leave/apply")} className="gap-2">
            <Plus className="h-4 w-4" />
            Apply Leave
          </Button>
        </div>

        {/* Balance cards */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Loading balances...</div>
        ) : displayRows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No active leave types configured. Contact HR to set up leave types.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {displayRows.map((row) => (
              <BalanceCard
                key={row.leave_type_id}
                row={row}
                pendingDays={pendingMap[row.leave_type_id] ?? 0}
                href={`/dashboard/hr/leave/my-requests?type=${row.leave_type_id}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Who's on Leave Today */}
      <WhoIsOnLeaveToday />

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Upcoming approved leave */}
        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 px-5">
            <h3 className="font-semibold text-sm mb-3">Upcoming approved leave</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{(req.leave_types as { leave_name: string })?.leave_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(req.start_date), "dd MMM")} –{" "}
                        {format(new Date(req.end_date), "dd MMM yyyy")}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending requests */}
        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 px-5">
            <h3 className="font-semibold text-sm mb-3">Pending requests</h3>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{(req.leave_types as { leave_name: string })?.leave_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(req.start_date), "dd MMM")} –{" "}
                        {format(new Date(req.end_date), "dd MMM yyyy")}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin shortcuts */}
      {isAdmin && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin</h3>
          <div className="grid grid-cols-4 gap-3">
            {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card className="rounded-xl hover:shadow-md hover:border-primary/20 transition-all cursor-pointer">
                  <CardContent className="py-3 px-4 flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
