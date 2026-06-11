import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

const NATIONALITIES = [
  "Cambodian", "Cambodian", "Cambodian", "Cambodian", "Cambodian",
  "Cambodian", "Cambodian", "Cambodian", "Cambodian", "Cambodian",
  "Cambodian", "Cambodian", "Cambodian", "Cambodian", "Cambodian",
  "Chinese", "Chinese", "Chinese", "Chinese",
  "Vietnamese", "Vietnamese", "Vietnamese",
  "Filipino", "Filipino",
  "Japanese", "Korean", "Thai", "Malaysian", "Indonesian",
  "Indian", "Bangladeshi", "Burmese", "British", "American",
  "Australian",
];

const PHONE_PREFIXES = [
  "10", "11", "12", "15", "16", "17", "18",
  "60", "61", "69",
  "77", "78",
  "80", "81", "85", "86", "87", "88", "89",
  "90", "92", "95", "96", "97", "98", "99",
];

const ADDRESSES = [
  "#12A, Street 63, Sangkat Tonle Bassac, Khan Chamkarmon, Phnom Penh",
  "#45, Street 110, Sangkat Srah Chak, Khan Daun Penh, Phnom Penh",
  "#78, Street 271, Sangkat Boeung Tumpun, Khan Mean Chey, Phnom Penh",
  "#101, Street 2004, Sangkat Kakab, Khan Pur SenChey, Phnom Penh",
  "#56, Street 598, Sangkat Boeung Kak II, Khan Toul Kork, Phnom Penh",
  "#23, Street 294, Sangkat Tonle Bassac, Khan Chamkarmon, Phnom Penh",
  "#89, Street 51, Sangkat Sras Chak, Khan Daun Penh, Phnom Penh",
  "#34, Street 123, Sangkat Veal Vong, Khan 7 Makara, Phnom Penh",
  "#67, Street 456, Sangkat Monorom, Khan 7 Makara, Phnom Penh",
  "#15, Street 789, Sangkat Mittapheap, Khan 7 Makara, Phnom Penh",
  "#92, Street 1003, Sangkat Phnom Penh Thmey, Khan Russey Keo, Phnom Penh",
  "#28, Street 2001, Sangkat Toek Thla, Khan Russey Keo, Phnom Penh",
  "#55, Street 2010, Sangkat Kilometre 6, Khan Russey Keo, Phnom Penh",
  "#19, Street 371, Sangkat Boeung Salang, Khan Toul Kork, Phnom Penh",
  "#73, Street 313, Sangkat Boeung Kak I, Khan Toul Kork, Phnom Penh",
  "#41, Street 1011, Sangkat Chrang Chamreh I, Khan Russey Keo, Phnom Penh",
  "#88, Street 1993, Sangkat Prek Leap, Khan Chroy Changvar, Phnom Penh",
  "#6, Street 68, Sangkat Phsar Thmey III, Khan Daun Penh, Phnom Penh",
  "#37, Street 242, Sangkat Chaktomuk, Khan Daun Penh, Phnom Penh",
  "#64, Street 155, Sangkat Psar Doeum Thkov, Khan Chamkarmon, Phnom Penh",
  "#50, Street 1, Preah Sihanouk Ville, Sihanoukville",
  "#22, Street 2, Group 12, Sangkat 4, Sihanoukville",
  "#11, Street Angkor Wat, Sangkat Svay Dangkum, Siem Reap",
  "#9, Street 6, Sangkat Slorkram, Siem Reap",
  "#33, Street 7, Sangkat Mondul 3, Siem Reap",
  "#17, National Road 5, Sangkat Prek Kdam, Kandal",
  "#8, National Road 3, Sangkat Kampong Samnanh, Kampot",
  "#21, Street Battambang, Sangkat Svay Por, Battambang",
  "#14, Street 2, Sangkat Kampong Kdei, Kampong Thom",
  "#25, National Road 6, Sangkat Kampong Cham, Kampong Cham",
];

const GRADES = ["L1", "L2", "L3", "L4", "L5", "L6"];
const GENDERS: Array<"male" | "female"> = ["male", "male", "male", "female", "female"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDOB(): string {
  const year = Math.floor(Math.random() * 38) + 1965; // 1965-2002
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function randomJoinDate(): string {
  const start = new Date("2014-01-01T00:00:00");
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const offset = Math.floor(Math.random() * (end.getTime() - start.getTime()));
  const date = new Date(start.getTime() + offset);
  return date.toISOString().slice(0, 10);
}

function randomPhone(): string {
  const prefix = pick(PHONE_PREFIXES);
  const suffix = String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0");
  return `+855 ${prefix} ${suffix.slice(0, 3)} ${suffix.slice(3)}`;
}

function randomProbationStatus(employmentType: string | null): string | null {
  if (!employmentType || employmentType === "permanent") {
    return pick(["not_applicable", "not_applicable", "completed"]);
  }
  return pick(["active", "active", "completed", "completed", "not_applicable"]);
}

function randomProbationEndDate(joinDate: string | null, probationStatus: string | null): string | null {
  if (probationStatus !== "active" || !joinDate) return null;
  const start = new Date(joinDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return null;
  const months = Math.floor(Math.random() * 4) + 3; // 3-6 months
  start.setMonth(start.getMonth() + months);
  return start.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { employee_ids, fields } = body as {
    employee_ids?: string[];
    fields: string[];
  };

  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "At least one field is required" }, { status: 400 });
  }

  const validFields = [
    "gender", "date_of_birth", "nationality", "phone", "address",
    "grade", "join_date", "probation_status", "probation_end_date",
    "avatar_url",
  ];

  const invalidFields = fields.filter((f) => !validFields.includes(f));
  if (invalidFields.length > 0) {
    return NextResponse.json({ error: `Invalid fields: ${invalidFields.join(", ")}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  const EXTENDED_COLUMNS = ["date_of_birth", "nationality", "phone", "address"];
  const ALL_COLUMNS = ["gender", "grade", "join_date", "probation_status", "probation_end_date", "avatar_url", ...EXTENDED_COLUMNS];

  const fieldColumnMap: Record<string, string> = {
    gender: "gender",
    date_of_birth: "date_of_birth",
    nationality: "nationality",
    phone: "phone",
    address: "address",
    grade: "grade",
    join_date: "join_date",
    probation_status: "probation_status",
    probation_end_date: "probation_end_date",
    avatar_url: "avatar_url",
  };

  const requestedColumns = [...new Set(fields.map((f) => fieldColumnMap[f]).filter(Boolean))];
  const selectColumns = ["id", "full_name", "employment_type", "join_date", ...requestedColumns];

  let query = supabase.from("profiles").select(selectColumns.join(", "));
  if (employee_ids && employee_ids.length > 0) {
    query = query.in("id", employee_ids);
  }
  const { data: profiles, error: fetchError } = await query;
  type ProfileRow = Record<string, unknown>;
  let profilesData = profiles as ProfileRow[] | null;

  if (fetchError) {
    const msg = fetchError.message ?? "";
    const missingColumns = ALL_COLUMNS.filter((col) => msg.includes(col));
    if (missingColumns.length === 0) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    const fallbackColumns = requestedColumns.filter((col) => !missingColumns.includes(col));
    const fallbackSelect = ["id", "full_name", "employment_type", "join_date", ...fallbackColumns];
    const result = await supabase.from("profiles").select(fallbackSelect.join(", "));
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    profilesData = (result.data as unknown) as ProfileRow[] | null;
  }

  const availableColumns = new Set(
    profilesData && profilesData.length > 0 ? Object.keys(profilesData[0]) : requestedColumns,
  );
  const fillableFields = fields.filter((f) => availableColumns.has(fieldColumnMap[f]));
  const skippedFields = fields.filter((f) => !availableColumns.has(fieldColumnMap[f]));

  if (!profilesData || profilesData.length === 0) {
    return NextResponse.json({ updated: 0, fields_filled: {} });
  }

  const fieldsFilled: Record<string, number> = {};
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  for (const profile of profilesData) {
    const updateData: Record<string, unknown> = {};

    for (const field of fillableFields) {
      const current = profile[field];
      if (current !== null && current !== undefined && current !== "") continue;

      let newValue: unknown = null;

      switch (field) {
        case "gender":
          newValue = pick(GENDERS);
          break;
        case "date_of_birth":
          newValue = randomDOB();
          break;
        case "nationality":
          newValue = pick(NATIONALITIES);
          break;
        case "phone":
          newValue = randomPhone();
          break;
        case "address":
          newValue = pick(ADDRESSES);
          break;
        case "grade":
          newValue = pick(GRADES);
          break;
        case "join_date":
          newValue = randomJoinDate();
          break;
        case "probation_status":
          newValue = randomProbationStatus(profile["employment_type"] as string | null);
          break;
        case "probation_end_date":
          newValue = randomProbationEndDate(
            (updateData.join_date ?? profile["join_date"]) as string | null,
            (updateData.probation_status ?? profile["probation_status"]) as string | null,
          );
          break;
        case "avatar_url":
          newValue = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile["full_name"] as string)}&background=random&size=128`;
          break;
      }

      if (newValue !== null && newValue !== current) {
        updateData[field] = newValue;
        fieldsFilled[field] = (fieldsFilled[field] ?? 0) + 1;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updates.push({ id: profile["id"] as string, data: updateData });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ updated: 0, fields_filled: fieldsFilled });
  }

  const updateResults = await Promise.all(
    updates.map((u) => supabase.from("profiles").update(u.data).eq("id", u.id)),
  );
  const updateError = updateResults.find((r) => r.error)?.error;
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const auditInserts = updates.map((u) => ({
    user_id: u.id,
    actor_id: user.id,
    event_type: "profile_bulk_fill",
    new_value: u.data,
    note: `Auto-filled missing fields: ${Object.keys(u.data).join(", ")}`,
  }));

  const { error: auditError } = await supabase.from("user_audit_logs").insert(auditInserts);
  if (auditError) {
    console.error("Audit log insert failed (non-fatal):", auditError.message);
  }

  return NextResponse.json({
    updated: updates.length,
    fields_filled: fieldsFilled,
    skipped_fields: skippedFields.length > 0 ? skippedFields : undefined,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fill missing error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
