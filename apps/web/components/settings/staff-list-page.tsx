"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { listDepartments, listProfiles } from "@/lib/settings/settings-queries";
import { Search, Loader2, Filter, X, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StaffEditSheet } from "@/components/settings/staff-edit-sheet";
import { StaffInviteSheet } from "@/components/settings/staff-invite-sheet";
import type { AccountStatus } from "@/lib/admin-users/admin-users-service";

export interface StaffProfile {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  department_id: string | null;
  level: string | null;
  role: string;
  status: string;
  report_to: string | null;
  account_status: AccountStatus;
  last_login_at: string | null;
  password_changed_at: string | null;
  first_login_at: string | null;
}

interface DepartmentOption {
  id: string;
  department_name: string;
}

const STATUS_OPTIONS = ["active", "inactive", "resigned"] as const;

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-amber-500/10 text-amber-600 border-amber-200",
  resigned: "bg-gray-500/10 text-gray-500 border-gray-200",
};

// USR-01 — account_status badge colour convention (06-UI-UX-Design.md).
const ACCOUNT_STATUS_OPTIONS: AccountStatus[] = ["INVITED", "ACTIVE", "LOCKED", "SUSPENDED", "DISABLED"];
const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  INVITED: "bg-amber-500/10 text-amber-600 border-amber-200",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  LOCKED: "bg-red-500/10 text-red-600 border-red-200",
  SUSPENDED: "bg-orange-500/10 text-orange-600 border-orange-200",
  DISABLED: "bg-gray-500/10 text-gray-500 border-gray-200",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDay = Math.round(diffMs / 86_400_000);
  if (diffDay <= 0) return "Today";
  if (diffDay === 1) return "1 day ago";
  if (diffDay < 30) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString();
}

function StaffListPageInner() {
  const searchParams = useSearchParams();
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<string>(
    () => searchParams.get("account_status") ?? "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data, error: err }, { data: depts }] = await Promise.all([
      listProfiles(),
      listDepartments(),
    ]);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setProfiles((data ?? []) as StaffProfile[]);
    setDepartments((depts ?? []) as DepartmentOption[]);
    setLoading(false);
  }

  useEffect(() => {
    // Fetch-on-mount, matching the fetch-on-mount pattern used throughout this codebase's
    // list pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.full_name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !(p.employee_id ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (deptFilter && p.department_id !== deptFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (accountStatusFilter && p.account_status !== accountStatusFilter) return false;
      return true;
    });
  }, [profiles, search, deptFilter, statusFilter, accountStatusFilter]);

  function handleUpdate(updated: StaffProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedId(null);
  }

  function handleInvited() {
    setInviteOpen(false);
    load();
  }

  const selected = selectedId ? profiles.find((p) => p.id === selectedId) ?? null : null;
  const hasFilters = !!(search || deptFilter || statusFilter || accountStatusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search name, email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-border bg-background py-2 pl-7 pr-8 text-sm appearance-none outline-hidden focus:border-primary"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <select
            value={accountStatusFilter}
            onChange={(e) => setAccountStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
          >
            <option value="">All Account Status</option>
            {ACCOUNT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
          >
            <option value="">All HR Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSearch(""); setDeptFilter(""); setStatusFilter(""); setAccountStatusFilter(""); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
          <Button size="sm" className="ml-auto" onClick={() => setInviteOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New User
          </Button>
        </div>

        {/* Staff Table */}
        {filtered.length === 0 && !hasFilters ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No users yet</p>
            <p className="text-xs text-muted-foreground">Start by inviting your first team member.</p>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New User
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">ID</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Job Title</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Role</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Account Status</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">HR Status</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                      No staff found
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        selectedId === p.id && "bg-primary/5",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {p.employee_id ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {p.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{p.full_name}</p>
                            <p className="text-xs text-muted-foreground">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {departments.find((d) => d.id === p.department_id)?.department_name ?? p.department ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {p.job_title ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="capitalize text-xs text-muted-foreground">
                          {p.role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          ACCOUNT_STATUS_COLORS[p.account_status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                        )}>
                          {p.account_status ? p.account_status.charAt(0) + p.account_status.slice(1).toLowerCase() : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                          STATUS_COLORS[p.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                        )}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {formatRelative(p.last_login_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {profiles.length} staff members
        </p>
      </div>

      {selected && (
        <StaffEditSheet
          profile={selected}
          departments={departments}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdate}
        />
      )}

      {inviteOpen && (
        <StaffInviteSheet
          departments={departments}
          onClose={() => setInviteOpen(false)}
          onInvited={handleInvited}
        />
      )}
    </>
  );
}

export function StaffListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <StaffListPageInner />
    </Suspense>
  );
}
