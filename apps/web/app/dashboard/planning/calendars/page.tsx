"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanCalendarList } from "@/components/planning/plan-calendar-list";
import { PlanCalendarExceptions } from "@/components/planning/plan-calendar-exceptions";
import { CalendarDays } from "lucide-react";

export default function CalendarsPage() {
  return (
    <PlanPageShell title="Calendars" description="Work calendars and holiday exceptions" icon={CalendarDays} iconColor="text-green-600" iconBg="bg-green-50">
      <div className="space-y-8">
        <PlanCalendarList />
        <div className="border-t pt-8">
          <h2 className="text-lg font-semibold mb-4">Calendar Exceptions</h2>
          <PlanCalendarExceptions />
        </div>
      </div>
    </PlanPageShell>
  );
}
