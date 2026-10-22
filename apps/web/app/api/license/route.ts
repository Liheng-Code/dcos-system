import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getLicense, installLicenseToken } from "@/lib/licensing/server";
import { toLicenseSummary } from "@/lib/licensing/summary";

// Only administrators see license details and install tokens (design 9.2).
async function actor() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role_code").eq("user_id", user.id),
  ]);
  const codes = new Set(((roles ?? []) as { role_code: string }[]).map((r) => r.role_code));
  if (profile?.role) codes.add(profile.role as string);
  return { id: user.id, isAdmin: codes.has("admin"), db: admin };
}

// GET /api/license: the license summary for the signed-in user.
export async function GET(request: NextRequest) {
  const who = await actor();
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const loaded = await getLicense({ force });
  const summary = toLicenseSummary(loaded.effective);
  if (who.isAdmin) {
    const { data: events } = await who.db
      .from("license_local_events")
      .select("event_type, payload, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(20);
    summary.admin = {
      installedAt: loaded.installedAt,
      deploymentId: loaded.deploymentId,
      tokenError: loaded.effective.tokenError,
      events: events ?? [],
    };
  }
  return NextResponse.json(summary);
}

const installSchema = z.object({ token: z.string().min(20).max(20_000) });

// POST /api/license { token }: install a signed license token (administrators).
export async function POST(request: NextRequest) {
  const who = await actor();
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!who.isAdmin) {
    return NextResponse.json({ error: "Only administrators can install a license.", code: "USR_FORBIDDEN" }, { status: 403 });
  }

  const parsed = installSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste the full license token.", code: "LIC_INVALID_TOKEN" }, { status: 400 });
  }

  const result = await installLicenseToken(parsed.data.token, who.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: "LIC_INVALID_TOKEN" }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
