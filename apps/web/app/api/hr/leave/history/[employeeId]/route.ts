import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { checkLeaveHistoryAccess, getEmployeeLeaveHistory } from "@/lib/hr/employee-leave-history";

type Params = { params: Promise<{ employeeId: string }> };

// GET: one employee's leave balances (all years) and leave requests (all statuses).
// Your own history, or anyone's for owner accounts and admins.
export async function GET(_req: NextRequest, { params }: Params) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { employeeId } = await params;
  if (employeeId !== user.id && !(await checkLeaveHistoryAccess(supabase, user.id))) {
    return NextResponse.json({ error: "You can only view your own leave history" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getEmployeeLeaveHistory(supabase, employeeId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load leave history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
