"use client";

import { useParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  User,
  Briefcase,
  DollarSign,
  Receipt,
  Shield,
  Building2,
  Clock,
  FileText,
  History,
  KeyRound,
  ClipboardCheck,
  FolderTree,
  MapPin,
} from "lucide-react";
import { useEmployeeDetail, type LoadedEmployeeDetail } from "@/components/hr/employees/detail/use-employee-detail";
import { EmployeeHeader } from "@/components/hr/employees/detail/employee-header";
import { PersonalTab } from "@/components/hr/employees/detail/personal-tab";
import { EmploymentTab } from "@/components/hr/employees/detail/employment-tab";
import { ComplianceTab } from "@/components/hr/employees/detail/compliance-tab";
import { DocumentsTab } from "@/components/hr/employees/detail/documents-tab";
import { AssignmentsTab } from "@/components/hr/employees/detail/assignments-tab";
import { AttendanceAssetsTab } from "@/components/hr/employees/detail/attendance-assets-tab";
import { SystemAccessTab } from "@/components/hr/employees/detail/system-access-tab";
import { PayrollProfileTab } from "@/components/hr/employees/detail/payroll-profile-tab";
import { TaxProfileTab } from "@/components/hr/employees/detail/tax-profile-tab";
import { NssfProfileTab } from "@/components/hr/employees/detail/nssf-profile-tab";
import { BankInfoTab } from "@/components/hr/employees/detail/bank-info-tab";
import { SalaryHistoryTab } from "@/components/hr/employees/detail/salary-history-tab";
import { PayslipsTab } from "@/components/hr/employees/detail/payslips-tab";
import { AuditHistoryTab } from "@/components/hr/employees/detail/audit-history-tab";
import { ProbationConfirmDialog } from "@/components/hr/employees/detail/probation-confirm-dialog";

// Employee Master detail. State and actions live in useEmployeeDetail; each tab
// is a component under components/hr/employees/detail that renders from it.
export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const controller = useEmployeeDetail(id);

  if (controller.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!controller.profile) return null;
  const c = controller as LoadedEmployeeDetail;

  return (
    <>
    <div className="space-y-6">
      <EmployeeHeader c={c} />

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/40 p-1.5 rounded-xl border border-border">
          {[
            { value: "personal", icon: User, label: "Personal Info" },
            { value: "employment", icon: Briefcase, label: "Employment" },
            { value: "system-access", icon: KeyRound, label: "System Access" },
            { value: "compliance", icon: Shield, label: "Compliance" },
            { value: "documents", icon: ClipboardCheck, label: "Documents" },
            { value: "assignments", icon: FolderTree, label: "Assignments" },
            { value: "attendance-assets", icon: MapPin, label: "Leave / Assets" },
            { value: "payroll", icon: DollarSign, label: "Payroll Profile" },
            { value: "tax", icon: Receipt, label: "Tax Profile" },
            { value: "nssf", icon: Shield, label: "NSSF Profile" },
            { value: "bank", icon: Building2, label: "Bank Info" },
            { value: "salary-history", icon: Clock, label: "Salary History" },
            { value: "payslips", icon: FileText, label: "Payslips" },
            { value: "audit", icon: History, label: "Audit History" },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted-foreground/10 data-[active]:bg-emerald-50 data-[active]:text-emerald-700 data-[active]:shadow-sm data-[active]:ring-1 data-[active]:ring-emerald-200"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <PersonalTab c={c} />
        <EmploymentTab c={c} />
        <ComplianceTab c={c} />
        <DocumentsTab c={c} />
        <AssignmentsTab c={c} />
        <AttendanceAssetsTab c={c} />
        <SystemAccessTab c={c} />
        <PayrollProfileTab c={c} />
        <TaxProfileTab c={c} />
        <NssfProfileTab c={c} />
        <BankInfoTab c={c} />
        <SalaryHistoryTab c={c} />
        <PayslipsTab c={c} />
        <AuditHistoryTab c={c} />
      </Tabs>
    </div>

      <ProbationConfirmDialog c={c} />
    </>
  );
}
