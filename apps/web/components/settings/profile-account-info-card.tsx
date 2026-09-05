"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IdCard } from "lucide-react";
import type { AccountStatus } from "@/lib/admin-users/admin-users-service";

export interface AccountInfoFields {
  employee_id: string | null;
  full_name: string;
  email: string;
  department_id: string | null;
  job_title: string | null;
  role: string;
  account_status: AccountStatus;
  last_login_at: string | null;
  // Read-only here (not in personal-info-card.tsx's self-editable set): both carry
  // legal/compliance weight (KYC, work permits/visas elsewhere on `profiles`) and should be
  // HR/Admin-mediated via staff-edit-sheet.tsx, not free self-service text — same reasoning
  // already used to exclude passport/visa/national-ID fields from self-edit.
  date_of_birth: string | null;
  nationality: string | null;
}

interface DepartmentOption {
  id: string;
  department_name: string;
}

interface ProfileAccountInfoCardProps {
  profile: AccountInfoFields;
  departments: DepartmentOption[];
}

// Mirrors staff-edit-sheet.tsx's ACCOUNT_STATUS_COLORS (USR-04 badge convention) — duplicated
// locally rather than imported since neither staff-edit-sheet.tsx nor staff-list-page.tsx
// exports it (both already duplicate this map themselves).
const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  INVITED: "bg-amber-500/10 text-amber-600 border-amber-200",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  LOCKED: "bg-red-500/10 text-red-600 border-red-200",
  SUSPENDED: "bg-orange-500/10 text-orange-600 border-orange-200",
  DISABLED: "bg-gray-500/10 text-gray-500 border-gray-200",
};

// Mirrors staff-edit-sheet.tsx's formatDateTime().
function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

// Mirrors staff-edit-sheet.tsx's ROLES <option> humanization.
function humanizeRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function ProfileAccountInfoCard({ profile, departments }: ProfileAccountInfoCardProps) {
  const departmentName =
    departments.find((d) => d.id === profile.department_id)?.department_name ?? "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <IdCard className="h-4 w-4 text-muted-foreground" />
          Account Information
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <InfoRow label="Employee ID">{profile.employee_id ?? "—"}</InfoRow>
        <InfoRow label="Full Name">{profile.full_name}</InfoRow>
        <InfoRow label="Email">{profile.email}</InfoRow>
        <InfoRow label="Department">{departmentName}</InfoRow>
        <InfoRow label="Position / Job Title">{profile.job_title ?? "—"}</InfoRow>
        <InfoRow label="Role">{humanizeRole(profile.role)}</InfoRow>
        <InfoRow label="Account Status">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              ACCOUNT_STATUS_COLORS[profile.account_status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
            )}
          >
            {profile.account_status ?? "—"}
          </span>
        </InfoRow>
        <InfoRow label="Last Login">{formatDateTime(profile.last_login_at)}</InfoRow>
        <InfoRow label="Date of Birth">{formatDate(profile.date_of_birth)}</InfoRow>
        <InfoRow label="Nationality">{profile.nationality ?? "—"}</InfoRow>
      </CardContent>
    </Card>
  );
}
