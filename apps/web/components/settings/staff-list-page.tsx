"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffEditSheet } from "@/components/settings/staff-edit-sheet";

interface StaffProfile {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  level: string | null;
  role: string;
  status: string;
  report_to: string | null;
}

const DEPARTMENTS = [
  "management",
  "architecture",
  "structural",
  "procurement",
  "construction",
  "hr",
  "accounting",
  "mep",
] as const;

const STATUS_OPTIONS = ["active", "inactive", "resigned"] as const;

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-amber-500/10 text-amber-600 border-amber-200",
  resigned: "bg-gray-500/10 text-gray-500 border-gray-200",
};

export function StaffListPage() {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("employee_id", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (data) setProfiles(data as StaffProfile[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.full_name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !(p.employee_id ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (deptFilter && p.department !== deptFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [profiles, search, deptFilter, statusFilter]);

  function handleUpdate(updated: StaffProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedId(null);
  }

  const selected = selectedId ? profiles.find((p) => p.id === selectedId) ?? null : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {(search || deptFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setDeptFilter(""); setStatusFilter(""); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Staff Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">ID</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Level</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Job Title</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Role</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Reports to</th>
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
                    <td className="px-3 py-2.5 text-muted-foreground capitalize">
                      {p.department ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                        {p.level ?? "—"}
                      </span>
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
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                        STATUS_COLORS[p.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                      )}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {p.report_to ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {profiles.length} staff members
        </p>
      </div>

      {selected && (
        <StaffEditSheet
          profile={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdate}
        />
      )}
    </>
  );
}
