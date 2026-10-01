"use client";

import { Settings, Users, TrendingUp, Calendar, Globe } from "lucide-react";
import { YearEndRunWizard } from "@/components/hr/leave/year-end-run-wizard";
import type { ActiveSection } from "@/lib/hr/leave-admin-types";
import { useLeaveAdmin } from "@/components/hr/leave/admin/use-leave-admin";
import { LeaveTypesSection } from "@/components/hr/leave/admin/leave-types-section";
import { TeamCapacitySection } from "@/components/hr/leave/admin/team-capacity-section";
import { SeniorityRulesSection } from "@/components/hr/leave/admin/seniority-rules-section";
import { PublicHolidaysSection } from "@/components/hr/leave/admin/public-holidays-section";
import { YearEndSection } from "@/components/hr/leave/admin/year-end-section";
import { LeaveTypeDeleteDialog } from "@/components/hr/leave/admin/leave-type-delete-dialog";
import { HolidayDeleteDialog } from "@/components/hr/leave/admin/holiday-delete-dialog";
import { HolidayFormDialog } from "@/components/hr/leave/admin/holiday-form-dialog";
import { LeaveTypeFormDialog } from "@/components/hr/leave/admin/leave-type-form-dialog";

// Leave Admin Setup. State and actions live in useLeaveAdmin; each section and
// dialog is a component under components/hr/leave/admin that renders from it.
export default function LeaveAdminPage() {
  const c = useLeaveAdmin();
  const { activeSection, setActiveSection, loading, yearEndWizardOpen, setYearEndWizardOpen, yearEndPreview, confirmYearEnd } = c;

  const SECTIONS = [
    { key: "leave_types"     as ActiveSection, label: "Leave Types",     icon: Settings   },
    { key: "capacity"        as ActiveSection, label: "Team Capacity",   icon: Users      },
    { key: "seniority"       as ActiveSection, label: "Seniority Rules", icon: TrendingUp },
    { key: "year_end"        as ActiveSection, label: "Year-End",        icon: Calendar   },
    { key: "public_holidays" as ActiveSection, label: "Public Holidays", icon: Globe      },
  ];

  return (
    <div className="space-y-6">
      <div className="leave-page-header">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Leave Admin Setup</h2>
          <p className="text-muted-foreground">Configure leave types, approver chains, capacity limits, and year-end processing</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-border px-4 pt-3">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
        {loading ? (
          <p className="text-muted-foreground">Loading configuration...</p>
        ) : (
          <>
          <LeaveTypesSection c={c} />
          <TeamCapacitySection c={c} />
          <SeniorityRulesSection c={c} />
          <PublicHolidaysSection c={c} />
          <YearEndSection c={c} />
          </>
        )}
        </div>
      </div>

      <LeaveTypeDeleteDialog c={c} />
      <HolidayDeleteDialog c={c} />
      <HolidayFormDialog c={c} />
      <LeaveTypeFormDialog c={c} />

      <YearEndRunWizard open={yearEndWizardOpen} onOpenChange={setYearEndWizardOpen} preview={yearEndPreview} onConfirm={confirmYearEnd} />

    </div>
  );
}
