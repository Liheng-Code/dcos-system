import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { exchangeMiniAppSession } from "@/lib/construction/daily-reporting/telegram/telegram-server";

/**
 * Telegram Mini App entry: `Authorization: tma <initData>` in, a DCOS Mini App
 * session for one reporting unit out. The launch token is taken from the
 * start parameter inside the signed initData. The session is accepted only by
 * the report-form routes (forms, drafts, evidence upload, submit).
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("tma ")) {
    return NextResponse.json({ error: "Open the report from Telegram.", code: "DR_TG_INIT_DATA" }, { status: 401 });
  }
  try {
    const result = await exchangeMiniAppSession(createAdminClient(), header.slice(4));
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    return NextResponse.json({
      token: result.token,
      expires_at: result.expires_at,
      unit: result.unit,
      report_date: result.report_date,
    });
  } catch (e) {
    console.error("dr telegram session:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unexpected error", code: "DR_INTERNAL" }, { status: 500 });
  }
}
