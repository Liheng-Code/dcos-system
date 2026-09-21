"use client";

import { PlanProjectMembers } from "@/components/planning/plan-project-members";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Users } from "lucide-react";

export default function PlanPlanningMembersPage() {
  return (
    <PlanPageShell title="Planning Members" description="Manage which project staff can view, edit, and approve the planning schedule" icon={Users}>
      <PlanProjectMembers />
    </PlanPageShell>
  );
}