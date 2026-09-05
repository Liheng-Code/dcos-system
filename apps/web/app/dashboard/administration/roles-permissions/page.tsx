"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { RolePermissionsPage } from "@/components/settings/role-permissions-page";

// 02-USR Phase 4 — RolePermissionsPage relocated wholesale from the /dashboard/settings
// "Roles & Permissions" tab to its own route (00-Master.md §6 / 06-UI-UX-Design.md §1).
export default function AdministrationRolesPermissionsPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage RBAC roles and the module/action permission matrix.
        </p>
      </div>
      <RolePermissionsPage />
    </div>
  );
}
