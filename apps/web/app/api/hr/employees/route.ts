import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { full_name, email, ...profileFields } = body;

  if (!full_name || !email) {
    return NextResponse.json({ error: "full_name and email are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const password = body.password ?? crypto.randomUUID().slice(0, 12) + "Ab1!";

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 409 });
  }

  const newId = authData.user.id;

  const updateFields: Record<string, unknown> = {};
  if (full_name) updateFields.full_name = full_name;
  if (profileFields.employee_id != null) updateFields.employee_id = profileFields.employee_id;
  if (profileFields.gender != null) updateFields.gender = profileFields.gender;
  if (profileFields.date_of_birth != null) updateFields.date_of_birth = profileFields.date_of_birth;
  if (profileFields.nationality != null) updateFields.nationality = profileFields.nationality;
  if (profileFields.phone != null) updateFields.phone = profileFields.phone;
  if (profileFields.address != null) updateFields.address = profileFields.address;
  if (profileFields.department != null) updateFields.department = profileFields.department;
  if (profileFields.job_title != null) updateFields.job_title = profileFields.job_title;
  if (profileFields.level != null) updateFields.level = profileFields.level;
  if (profileFields.report_to != null) updateFields.report_to = profileFields.report_to;
  if (profileFields.employment_type != null) updateFields.employment_type = profileFields.employment_type;
  if (profileFields.work_location != null) updateFields.work_location = profileFields.work_location;
  if (profileFields.join_date != null) updateFields.join_date = profileFields.join_date;
  // Default to 'pending' until the employee completes first login
  updateFields.status = profileFields.status ?? "pending";
  if (profileFields.role != null) updateFields.role = profileFields.role;

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase.from("profiles").update(updateFields).eq("id", newId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: newId, employee_id: profileFields.employee_id ?? null }, { status: 201 });
}
