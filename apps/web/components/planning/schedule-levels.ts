import type { GanttZoom } from "./gantt-types";

export type ScheduleLevel = 1 | 2 | 3 | 4 | 5;

export interface ScheduleLevelConfig {
  level: ScheduleLevel;
  label: string;
  shortLabel: string;
  description: string;
  defaultZoom: GanttZoom;
  updateFrequency: string;
  sortOrder: number;
}

export const SCHEDULE_LEVELS: ScheduleLevelConfig[] = [
  {
    level: 1,
    label: "Executive Schedule",
    shortLabel: "Executive",
    description: "Portfolio reporting and high-level oversight",
    defaultZoom: "month",
    updateFrequency: "monthly",
    sortOrder: 1,
  },
  {
    level: 2,
    label: "Master Schedule",
    shortLabel: "Master",
    description: "Complete project overview with phases and milestones",
    defaultZoom: "month",
    updateFrequency: "bi-weekly",
    sortOrder: 2,
  },
  {
    level: 3,
    label: "Control Schedule",
    shortLabel: "Control",
    description: "Granular project control and tracking with CPM",
    defaultZoom: "week",
    updateFrequency: "weekly",
    sortOrder: 3,
  },
  {
    level: 4,
    label: "Execution Schedule",
    shortLabel: "Execution",
    description: "Comprehensive execution planning (work packages)",
    defaultZoom: "day",
    updateFrequency: "daily",
    sortOrder: 4,
  },
  {
    level: 5,
    label: "Look-ahead Schedule",
    shortLabel: "Look-ahead",
    description: "Daily and weekly tactical planning",
    defaultZoom: "day",
    updateFrequency: "daily",
    sortOrder: 5,
  },
];

export const SCHEDULE_LEVEL_MAP = new Map<ScheduleLevel, ScheduleLevelConfig>(
  SCHEDULE_LEVELS.map((c) => [c.level, c]),
);

export function getScheduleLevelConfig(level: ScheduleLevel): ScheduleLevelConfig {
  return SCHEDULE_LEVEL_MAP.get(level) ?? SCHEDULE_LEVELS[2];
}

export function getTaskLevelLabel(level: ScheduleLevel): string {
  return getScheduleLevelConfig(level).shortLabel;
}

export function getLevelZoom(level: ScheduleLevel): GanttZoom {
  return getScheduleLevelConfig(level).defaultZoom;
}

export function isPortfolioLevel(level: ScheduleLevel): boolean {
  return level === 1;
}

export function isLookaheadLevel(level: ScheduleLevel): boolean {
  return level === 5;
}

export function showSummaryBars(level: ScheduleLevel): boolean {
  return level === 2;
}

export function showDetailedBars(level: ScheduleLevel): boolean {
  return level >= 3;
}

export function getDefaultScheduleLevel(): ScheduleLevel {
  return 3;
}
