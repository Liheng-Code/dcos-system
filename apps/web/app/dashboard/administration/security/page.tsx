"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { SecurityOverviewPage } from "@/components/administration/security-overview-page";

// 02-USR Phase 4 — USR-05 Security Overview (global). Distinct from the per-user Security
// section inline in staff-edit-sheet.tsx (USR-04): this page is read-only and never
// initiates a per-user action (06-UI-UX-Design.md BR11.02).
export default function AdministrationSecurityPage() {
  const { checking } = useAdminOrHrGuard();

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Account status across the organization and recent security-relevant activity.
        </p>
      </div>
      <SecurityOverviewPage />
    </div>
  );
}
