"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanCalendarsTabs } from "@/components/planning/plan-calendars-tabs";
import { CalendarDays, Loader2 } from "lucide-react";

export default function CalendarsPage() {
  return (
    <PlanPageShell title="Calendars" description="Task calendar, work calendars, and holiday exceptions" icon={CalendarDays} iconColor="text-green-600" iconBg="bg-green-50">
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <PlanCalendarsTabs />
      </Suspense>
    </PlanPageShell>
  );
}
