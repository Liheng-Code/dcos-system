"use client";

import { PlanningModuleShell } from "@/components/planning/planning-module-shell";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return <PlanningModuleShell>{children}</PlanningModuleShell>;
}
