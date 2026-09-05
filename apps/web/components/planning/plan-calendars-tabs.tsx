"use client";

import { useSearchParams } from "next/navigation";
import { PlanCalendarList } from "@/components/planning/plan-calendar-list";
import { PlanCalendarExceptions } from "@/components/planning/plan-calendar-exceptions";
import { PlanTaskCalendar } from "@/components/planning/plan-task-calendar";

const SUB_TAB_IDS = ["tasks", "settings"] as const;
type CalendarsTab = (typeof SUB_TAB_IDS)[number];

export function PlanCalendarsTabs() {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as CalendarsTab | null;
  const tab: CalendarsTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "tasks";

  if (tab === "settings") {
    return (
      <div className="space-y-8">
        <PlanCalendarList />
        <div className="border-t pt-8">
          <h2 className="text-lg font-semibold mb-4">Calendar Exceptions</h2>
          <PlanCalendarExceptions />
        </div>
      </div>
    );
  }

  return <PlanTaskCalendar />;
}
