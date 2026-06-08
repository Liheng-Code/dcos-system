"use client";

import { useState, useCallback } from "react";
import { GanttView } from "./gantt-view";
import type { ScheduleLevel } from "./gantt-types";
import { getDefaultScheduleLevel } from "./schedule-levels";

interface PlanGanttChartProps {
  initialLevel?: ScheduleLevel;
}

export function PlanGanttChart({ initialLevel }: PlanGanttChartProps) {
  const [scheduleLevel, setScheduleLevel] = useState<ScheduleLevel>(
    initialLevel ?? getDefaultScheduleLevel(),
  );

  const handleLevelChange = useCallback((level: ScheduleLevel) => {
    setScheduleLevel(level);
  }, []);

  return (
    <GanttView
      mode="full"
      scheduleLevel={scheduleLevel}
      onScheduleLevelChange={handleLevelChange}
    />
  );
}
