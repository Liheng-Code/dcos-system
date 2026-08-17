import { NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/auth";

interface ProfileRow {
  id: string;
  full_name: string | null;
}

interface LeaveTypeRow {
  id: string;
  leave_name: string | null;
}

interface ExpiringBalanceRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  fiscal_year: number;
  remaining_days: number | string | null;
  carried_over_days: number | string | null;
  carryover_expiry_date: string | null;
  carryover_forfeited: boolean | null;
  profiles: ProfileRow | ProfileRow[] | null;
  leave_types: LeaveTypeRow | LeaveTypeRow[] | null;
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function POST() {
  const auth = await requireHrAdmin();
  if (!auth.supabase || !auth.userId) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const today = todayDateString();

    const { data, error } = await auth.supabase
      .from("leave_balances")
      .select(`
        id, employee_id, leave_type_id, fiscal_year, remaining_days, carried_over_days, carryover_expiry_date, carryover_forfeited,
        profiles(id, full_name),
        leave_types(id, leave_name)
      `)
      .eq("carryover_forfeited", false)
      .gt("carried_over_days", 0)
      .lte("carryover_expiry_date", today);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ExpiringBalanceRow[];

    let forfeitedCount = 0;
    const forfeitedSummaries: string[] = [];

    for (const row of rows) {
      const carriedOverDays = numeric(row.carried_over_days);
      const remainingDays = numeric(row.remaining_days);
      const forfeited = Math.min(carriedOverDays, remainingDays);
      if (forfeited <= 0) continue;

      const newRemaining = remainingDays - forfeited;
      const forfeitedAt = new Date().toISOString();

      const { error: updateError } = await auth.supabase
        .from("leave_balances")
        .update({
          remaining_days: newRemaining,
          carryover_forfeited: true,
          carryover_forfeited_at: forfeitedAt,
        })
        .eq("id", row.id);

      if (updateError) throw new Error(updateError.message);

      const { error: logError } = await auth.supabase
        .from("leave_year_end_logs")
        .insert({
          from_year: row.fiscal_year,
          to_year: row.fiscal_year,
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          days_used: 0,
          days_remaining: newRemaining,
          days_carried: carriedOverDays,
          days_expired: forfeited,
          run_by: auth.userId,
          notes: "Carryover expired and forfeited",
        });

      if (logError) throw new Error(logError.message);

      forfeitedCount += 1;
      const employeeName = firstOf(row.profiles)?.full_name ?? "Unknown";
      const leaveTypeName = firstOf(row.leave_types)?.leave_name ?? "Unknown";
      forfeitedSummaries.push(`${employeeName} / ${leaveTypeName} (${forfeited} day${forfeited === 1 ? "" : "s"})`);
    }

    const detail = forfeitedSummaries.length > 0 ? ` Forfeited: ${forfeitedSummaries.join(", ")}.` : "";

    return NextResponse.json({
      success: true,
      message: `Carryover expiry sweep complete. ${forfeitedCount} balance${forfeitedCount === 1 ? "" : "s"} forfeited.${detail}`,
      forfeitedCount,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Carryover expiry sweep failed" }, { status: 500 });
  }
}
