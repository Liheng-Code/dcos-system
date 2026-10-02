"use client";

import { HsePageShell } from "@/components/construction/hse/hse-page-shell";
import { HseIncidents } from "@/components/construction/hse/hse-incidents";
import { AlertTriangle } from "lucide-react";

export default function IncidentsPage() {
  return (
    <HsePageShell title="Incidents" description="Incident and near-miss register" icon={AlertTriangle}>
      <HseIncidents />
    </HsePageShell>
  );
}
