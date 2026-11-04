"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaveHistoryView } from "@/components/hr/leave/leave-history-view";
import {
  fetchEmployeeLeaveHistory,
  fetchLeaveHistoryEmployees,
  type LeaveHistoryEmployeeList,
} from "@/lib/hr/leave-history-service";
import type { EmployeeLeaveHistory, LeaveHistoryEmployee } from "@/lib/hr/employee-leave-history";

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2, THIS_YEAR - 3];

function fmtDays(n: number) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function subtitle(e: LeaveHistoryEmployee) {
  return [e.employee_code, e.job_title, e.department].filter(Boolean).join(" · ");
}

// E-Leave > Leave History. Every account sees its own history; owner and admin
// accounts also get an employee picker and can open anyone's (enforced by
// /api/hr/leave/history).
export default function LeaveHistoryPage() {
  const [year, setYear] = useState<number | "all">(THIS_YEAR);
  // Each load remembers what it was for, so "loading" is derived rather than set in effects.
  const [list, setList] = useState<(LeaveHistoryEmployeeList & { year: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; history: EmployeeLeaveHistory | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [withLeaveOnly, setWithLeaveOnly] = useState(false);

  // Picker totals follow the selected year; "All years" keeps this year's totals.
  const listYear = year === "all" ? THIS_YEAR : year;
  const canViewAll = list?.scope === "all";
  const me = list?.me ?? null;
  // Opens on your own record; owner/admin can pick anyone else.
  const selectedId = (canViewAll ? pickedId : null) ?? me;
  const loadingList = list?.year !== listYear && !error;
  const loadingHistory = selectedId != null && loaded?.id !== selectedId;
  const history = loaded?.id === selectedId ? loaded.history : null;

  useEffect(() => {
    let cancelled = false;
    fetchLeaveHistoryEmployees(listYear)
      .then((res) => { if (!cancelled) { setList({ ...res, year: listYear }); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load employees"); });
    return () => { cancelled = true; };
  }, [listYear]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetchEmployeeLeaveHistory(selectedId)
      .then((h) => { if (!cancelled) setLoaded({ id: selectedId, history: h }); })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({ id: selectedId, history: null });
        setError(err instanceof Error ? err.message : "Failed to load leave history");
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  // You first, then everyone else by name; optionally only people with leave this year.
  const employees = useMemo(() => {
    const rows = (list?.employees ?? []).filter((e) => !withLeaveOnly || e.request_count > 0 || e.id === me);
    return [...rows].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  }, [list, withLeaveOnly, me]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => [e.full_name, e.employee_code, e.department, e.job_title].some((v) => v?.toLowerCase().includes(q)));
  }, [employees, query]);

  const selected = list?.employees.find((e) => e.id === selectedId) ?? null;
  const position = employees.findIndex((e) => e.id === selectedId);

  function pick(id: string) {
    setPickedId(id);
    setPickerOpen(false);
    setQuery("");
  }

  function step(delta: number) {
    if (employees.length === 0) return;
    const next = position < 0 ? 0 : (position + delta + employees.length) % employees.length;
    setPickedId(employees[next].id);
  }

  return (
    <div className="space-y-6">
      <div className="leave-page-header flex flex-wrap items-start justify-between gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Leave History</h2>
          <p className="text-muted-foreground">
            {canViewAll ? "Your leave history and every employee's" : "Your leave balances and requests"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([...YEARS, "all"] as const).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                year === y ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {y === "all" ? "All years" : y}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canViewAll ? (
        <Card className="py-0">
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Button variant="outline" size="icon" aria-label="Previous employee" onClick={() => step(-1)} disabled={employees.length < 2}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (!open) setQuery(""); }}>
                <PopoverTrigger
                  type="button"
                  className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-lg border border-input bg-background px-3 text-left hover:bg-muted/40 sm:max-w-md"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {selected ? (
                      <>
                        <span className="font-semibold">{selected.full_name}</span>
                        {selected.id === me && <span className="ml-1.5 text-muted-foreground">(You)</span>}
                        <span className="ml-2 text-xs text-muted-foreground">{selected.employee_code}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Search employee…</span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[26rem] max-w-[90vw] p-1.5">
                  <div className="relative mb-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0].id); }}
                      placeholder="Name, employee code or department…"
                      className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-hidden"
                    />
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {matches.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matching employees.</p>
                    ) : matches.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => pick(e.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted",
                          e.id === selectedId && "bg-primary/10",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", e.id === selectedId && "font-medium text-primary")}>
                            {e.full_name}
                            {e.id === me && <span className="ml-1.5 text-xs text-muted-foreground">(You)</span>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{subtitle(e) || "—"}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs">
                          <span className="block tabular-nums">{fmtDays(e.approved_days)} d</span>
                          {e.pending_count > 0 && <span className="block font-medium text-amber-600">{e.pending_count} pending</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" aria-label="Next employee" onClick={() => step(1)} disabled={employees.length < 2}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="whitespace-nowrap px-1 text-xs text-muted-foreground tabular-nums">
                {loadingList ? "…" : position < 0 ? `${employees.length} employees` : `${position + 1} of ${employees.length}`}
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={withLeaveOnly} onCheckedChange={(v) => setWithLeaveOnly(v === true)} />
              Only employees with leave in {listYear}
            </label>
          </CardContent>
        </Card>
      ) : null}

      <div className="min-w-0 space-y-4">
        {selected && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold">
              {selected.full_name}
              {selected.id === me && <span className="ml-2 text-sm font-normal text-muted-foreground">(You)</span>}
            </h3>
            <span className="text-sm text-muted-foreground">{subtitle(selected)}</span>
            <span className="text-sm text-muted-foreground">
              · {fmtDays(selected.approved_days)} day{selected.approved_days === 1 ? "" : "s"} approved in {listYear}
              {selected.pending_count > 0 && <span className="font-medium text-amber-600"> · {selected.pending_count} pending</span>}
            </span>
          </div>
        )}
        {loadingList || loadingHistory ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : history ? (
          <LeaveHistoryView history={history} year={year} />
        ) : null}
      </div>
    </div>
  );
}
