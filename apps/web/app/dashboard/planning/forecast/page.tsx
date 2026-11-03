"use client";

import { LineChart } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanForecast } from "@/components/planning/forecast/plan-forecast";

export default function PlanForecastPage() {
  return (
    <PlanPageShell
      title="Forecast"
      description="Record the forecast with its assumptions, follow how the finish moves between records, and see what moved"
      icon={LineChart}
    >
      <PlanForecast />
    </PlanPageShell>
  );
}
