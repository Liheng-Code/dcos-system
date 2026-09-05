"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { StaffListPage } from "@/components/settings/staff-list-page";

// 02-USR Phase 4 — first-time mount of StaffListPage (00-Master.md §6 / 06-UI-UX-Design.md
// §1, USR-01). StaffListPage exists as a built, exported component but was not imported by
// any page.tsx before this.
export default function AdministrationUsersPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite staff, manage account access, and control login/security state.
        </p>
      </div>
      <StaffListPage />
    </div>
  );
}
