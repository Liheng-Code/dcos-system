"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { LicensePage } from "@/components/administration/license/license-page";

// Licensing Phase 1 — tenant License & Subscription page (design 9.2). Reachable in
// every license state, so an administrator can always renew.
export default function AdministrationLicensePage() {
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
        <h1 className="text-2xl font-bold tracking-tight">License &amp; Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What this DCOS deployment is licensed for, and how much of it is in use.
        </p>
      </div>
      <LicensePage />
    </div>
  );
}
