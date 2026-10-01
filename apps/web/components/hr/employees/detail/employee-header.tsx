"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, XCircle } from "lucide-react";
import { initials, labelize, STATUS_BADGE } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

// Archived banner, identity header, setup-completion chips and lifecycle actions.
export function EmployeeHeader({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, profile, isArchived, hasPayrollProfile, hasTaxProfile, hasNSSFProfile, hasBankAccount, runLifecycleAction } = c;
  return (
    <>
      {/* Archived read-only banner */}
      {isArchived && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <XCircle className="h-4 w-4 shrink-0 text-gray-400" />
          <span>This account is <strong>Archived</strong> — all records are read-only. Changes cannot be saved.</span>
        </div>
      )}
      {/* Header */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-background via-background to-muted/30 p-5">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="-ml-2 mt-0.5 shrink-0">
            <Link href="/dashboard/hr/employees"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex flex-1 items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 ring-2 ring-border ring-offset-2 ring-offset-background">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials(profile.full_name)}</AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background",
                profile.status === "active" ? "bg-emerald-500" : "bg-amber-400"
              )} />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">
                {profile.employee_id ?? "—"} · {profile.job_title ?? labelize(profile.department)} · {profile.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className={cn("capitalize text-xs", STATUS_BADGE[profile.status] ?? "")}>
                  {profile.status}
                </Badge>
              </div>
            </div>
          </div>
          {/* Profile completion mini-bar */}
          <div className="hidden sm:flex sm:items-center sm:gap-3">
            {[
              { label: "Payroll", ok: hasPayrollProfile },
              { label: "Tax", ok: hasTaxProfile },
              { label: "NSSF", ok: hasNSSFProfile },
              { label: "Bank", ok: hasBankAccount },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5">
                <div className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-500" : "bg-amber-300")} />
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
        {!isArchived && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("submit", "Submitted for approval")}>Submit</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("approve", "Approved")}>Approve</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("activate", "Activated")}>Activate</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("suspend", "Suspended")}>Suspend</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("resign", "Resigned")}>Resign</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("terminate", "Terminated")}>Terminate</Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => runLifecycleAction("archive", "Archived")}>Archive</Button>
          </div>
        )}
      </div>
    </>
  );
}
