"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { AuditLogPage } from "@/components/administration/audit-log-page";

// 02-USR Phase 4 — USR-06 Audit Log Page, reading the Phase 4 gap-fill
// GET /api/admin/audit-logs endpoint (see admin-users-schemas.ts's auditLogsQuerySchema doc
// comment for why that endpoint was added). Read-only, append-only — matches SOP §23.
export default function AdministrationAuditLogsPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only account-lifecycle activity across the organization.
        </p>
      </div>
      <AuditLogPage />
    </div>
  );
}
