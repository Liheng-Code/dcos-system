"use client";

import { Loader2 } from "lucide-react";
import { useAdminOrHrGuard } from "@/hooks/use-admin-or-hr-guard";
import { DepartmentsPage } from "@/components/administration/departments-page";

// 02-USR Phase 4 — USR-07 Departments CRUD (06-UI-UX-Design.md). Replaces the two hardcoded
// department text arrays in staff-list-page.tsx / staff-edit-sheet.tsx with a real
// public.departments-backed page now that profiles.department_id exists.
export default function AdministrationDepartmentsPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the department hierarchy used across staff profiles and reporting.
        </p>
      </div>
      <DepartmentsPage />
    </div>
  );
}
