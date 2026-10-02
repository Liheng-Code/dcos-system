"use client";

import { HsePageShell } from "@/components/construction/hse/hse-page-shell";
import { HsePermits } from "@/components/construction/hse/hse-permits";
import { FileText } from "lucide-react";

export default function PermitsPage() {
  return (
    <HsePageShell title="Work Permits" description="Permit-to-work system" icon={FileText} iconColor="text-blue-600" iconBg="bg-blue-50">
      <HsePermits />
    </HsePageShell>
  );
}
