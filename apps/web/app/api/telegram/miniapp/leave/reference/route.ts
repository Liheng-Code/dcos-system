import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/hr/telegram/miniapp-auth";
import {
  getActiveLeaveTypes,
  getActivePublicHolidayDates,
  getLeaveApplicantProfile,
  getLeaveBalanceSummary,
  getLeaveEmploymentPolicies,
  getOccupiedLeaveRanges,
} from "@/lib/hr/leave";

// Combined initial-load payload for the Mini App's Apply Leave screen —
// mirrors the data the web form's initial `useEffect`s fetch
// (leave-request-form.tsx lines 202-301): active leave types, the
// applicant's balances + gender/probation for client-side pre-filtering,
// public holidays for the current + next year, the applicant's own
// employment-policy rows (for probation-locked-balance display), and their
// existing occupied date ranges (for a client-side conflict preview before
// they even submit).
export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { profile: authProfile } = result;

    const applicant = await getLeaveApplicantProfile(admin, authProfile.id);
    if (!applicant) {
      return NextResponse.json({ error: "not_linked" }, { status: 403 });
    }

    const currentYear = new Date().getFullYear();

    const [leaveTypes, balances, holidayDates, occupiedRanges, employmentPolicies, teammatesResult] = await Promise.all([
      getActiveLeaveTypes(admin),
      getLeaveBalanceSummary(admin, authProfile.id, currentYear),
      getActivePublicHolidayDates(admin, [currentYear, currentYear + 1]),
      getOccupiedLeaveRanges(admin, authProfile.id),
      getLeaveEmploymentPolicies(admin, applicant.employment_type ?? "permanent", applicant.probation_status ?? "not_applicable"),
      admin
        .from("profiles")
        .select("id, full_name, department")
        .neq("id", authProfile.id)
        .order("full_name"),
    ]);

    return NextResponse.json({
      leaveTypes,
      balances,
      publicHolidays: [...holidayDates],
      occupiedRanges,
      employmentPolicies,
      teammates: teammatesResult.data ?? [],
      applicant: {
        gender: applicant.gender,
        probationStatus: applicant.probation_status,
        employmentType: applicant.employment_type,
      },
    });
  } catch (err) {
    console.error("Telegram mini app leave reference error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
