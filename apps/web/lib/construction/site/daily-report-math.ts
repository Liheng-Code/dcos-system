import type {
  ActivityExecutionStatus,
  DelayCategory,
  DailyReportActivityInput,
  SiteDailyReport,
  StepProgressItem,
} from "./daily-report-service";

/**
 * Calculates weighted average progress across a list of steps.
 * If sum of weights is zero, calculates an unweighted arithmetic average.
 * Result is clamped between 0 and 100 and rounded to 2 decimal places.
 */
export function calculateWeightedProgress(steps: StepProgressItem[]): number {
  if (!steps || steps.length === 0) return 0;

  const totalWeight = steps.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  let rawProgress = 0;
  if (totalWeight > 0) {
    const weightedSum = steps.reduce(
      (sum, s) => sum + (Number(s.progress) || 0) * (Number(s.weight) || 0),
      0
    );
    rawProgress = weightedSum / totalWeight;
  } else {
    // Unweighted average if all weights are zero
    const sum = steps.reduce((s, item) => s + (Number(item.progress) || 0), 0);
    rawProgress = sum / steps.length;
  }

  const clamped = Math.min(100, Math.max(0, rawProgress));
  return Math.round(clamped * 100) / 100;
}

/**
 * Derives an activity execution status based on current progress and delay flags.
 */
export function deriveActivityStatus(
  progressToday: number,
  hasDelay: boolean = false,
  _progressBefore = 0
): ActivityExecutionStatus {
  if (progressToday >= 100) {
    return "completed";
  }
  if (hasDelay) {
    return "hindered";
  }
  if (progressToday > 0) {
    return "in_progress";
  }
  return "not_started";
}

/**
 * Calculates total man-hours spent for a given crew headcount and hours per person.
 */
export function calculateTotalHours(
  headcount?: number | null,
  normalHours?: number | null,
  otHours?: number | null
): number {
  const crew = Math.max(0, Number(headcount) || 0);
  const normal = Math.max(0, Number(normalHours) || 0);
  const ot = Math.max(0, Number(otHours) || 0);
  return crew * (normal + ot);
}

/**
 * Calculates output rate (quantity done per total man-hour).
 */
export function calculateProductivityRate(
  quantityDone: number | null | undefined,
  totalManHours: number
): number | null {
  if (quantityDone == null || totalManHours <= 0) return null;
  const rate = quantityDone / totalManHours;
  return Math.round(rate * 10000) / 10000;
}

/**
 * Evaluates whether a delay is considered excusable (time extension justified)
 * or non-excusable under standard contract delay analysis.
 */
export function isExcusableDelay(category: DelayCategory | null | undefined): boolean {
  if (!category) return false;
  return ["weather", "client", "rfi_design"].includes(category);
}

/**
 * Validates a site daily report and its activity payload prior to submission.
 */
export function validateDailyReportPayload(
  report: Partial<SiteDailyReport>,
  activities: DailyReportActivityInput[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!report.report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report.report_date)) {
    errors.push("A valid report date in YYYY-MM-DD format is required.");
  }

  if (activities.length === 0) {
    errors.push("At least one activity must be included in the daily report.");
  }

  activities.forEach((act, index) => {
    const actLabel = `Activity #${index + 1}`;
    if (!act.task_id) {
      errors.push(`${actLabel} is missing a valid planning task linkage.`);
    }

    if (act.progress_today < 0 || act.progress_today > 100) {
      errors.push(`${actLabel} progress must be between 0% and 100%.`);
    }

    if (act.has_delay) {
      if (!act.delay_reason || act.delay_reason.trim() === "") {
        errors.push(`${actLabel} flags a delay but has no delay reason.`);
      }
      if (!act.delay_category) {
        errors.push(`${actLabel} flags a delay but has no delay category.`);
      }
    }

    if (act.step_progress && act.step_progress.length > 0) {
      for (const step of act.step_progress) {
        if (step.progress < 0 || step.progress > 100) {
          errors.push(
            `${actLabel} Step "${step.step_name}" progress must be between 0% and 100%.`
          );
        }
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
