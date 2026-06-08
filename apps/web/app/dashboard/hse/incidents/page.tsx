"use client";

import { HsePageShell } from "@/components/hse/hse-page-shell";
import { HseIncidents } from "@/components/hse/hse-incidents";
import { AlertTriangle } from "lucide-react";

export default function IncidentsPage() {
  return (
    <HsePageShell title="Incidents" description="Incident and near-miss register" icon={AlertTriangle}>
      <HseIncidents />
    </HsePageShell>
  );
}
