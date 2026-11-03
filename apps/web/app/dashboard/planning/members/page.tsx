"use client";

import { PlanProjectMembers } from "@/components/planning/plan-project-members";
import { PlanWbsResponsibility } from "@/components/planning/plan-wbs-responsibility";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Users } from "lucide-react";

export default function PlanPlanningMembersPage() {
  return (
    <PlanPageShell title="Planning Members" description="Manage which project staff can view, edit, and approve the planning schedule" icon={Users}>
      <div className="space-y-8">
        <PlanProjectMembers />
        <div className="border-t pt-6">
          <PlanWbsResponsibility />
        </div>
      </div>
    </PlanPageShell>
  );
}
