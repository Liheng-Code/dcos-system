import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { checkLeaveHistoryAccess, listLeaveHistoryEmployees } from "@/lib/hr/employee-leave-history";

// GET ?year=YYYY: employees with that year's leave totals. Owner accounts and
// admins get everyone (scope "all"); any other account gets only itself (scope "self").
export async function GET(req: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const canViewAll = await checkLeaveHistoryAccess(supabase, user.id);

  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 1900 ? yearParam : new Date().getFullYear();
  try {
    const employees = await listLeaveHistoryEmployees(supabase, year, canViewAll ? undefined : user.id);
    return NextResponse.json({ employees, scope: canViewAll ? "all" : "self", me: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load employees";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
