"use client";

import { HsePageShell } from "@/components/hse/hse-page-shell";
import { HseObservations } from "@/components/hse/hse-observations";
import { Eye } from "lucide-react";

export default function ObservationsPage() {
  return (
    <HsePageShell title="Observations" description="Safety observations and inspections" icon={Eye} iconColor="text-purple-600" iconBg="bg-purple-50">
      <HseObservations />
    </HsePageShell>
  );
}
