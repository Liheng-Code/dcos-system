import { NextRequest, NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/auth";
import { loadAttention } from "@/lib/hr/attention-service";
import { sendMessage } from "@/lib/hr/telegram/bot";
import { linkTelegramToEmployee } from "@/lib/hr/telegram/auto-link";

// HR "Needs attention" inbox.
// GET  → everything waiting for HR.
// POST → one action: resolve_days | leave_reversal_handled | telegram_link | telegram_dismiss.

export async function GET() {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await loadAttention(auth.supabase));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase || !auth.userId) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();

  switch (body.action) {
    case "resolve_days": {
      const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown): i is string => typeof i === "string") : [];
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (ids.length === 0) return NextResponse.json({ error: "No days selected" }, { status: 400 });
      // Accepting a flagged day as it is needs a reason on record: it is what lets payroll proceed.
      if (!note) return NextResponse.json({ error: "A note is required to resolve a day" }, { status: 400 });
      const { data, error } = await supabase
        .from("attendance_daily")
        .update({ review_resolved_by: auth.userId, review_resolved_at: now, review_note: note })
        .in("id", ids)
        .eq("needs_review", true)
        .is("review_resolved_at", null)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ resolved: data?.length ?? 0 });
    }

    case "leave_reversal_handled": {
      if (typeof body.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
      const { error } = await supabase.from("leave_requests").update({ payroll_reversal_needed: false, payroll_followup_handled_at: now }).eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "telegram_link": {
      if (typeof body.request_id !== "string" || typeof body.employee_id !== "string") {
        return NextResponse.json({ error: "request_id and employee_id are required" }, { status: 400 });
      }
      const { data: req } = await supabase
        .from("telegram_link_requests")
        .select("id, telegram_user_id, chat_id, status")
        .eq("id", body.request_id)
        .maybeSingle();
      if (!req || req.status !== "pending") return NextResponse.json({ error: "Request not found or already handled" }, { status: 404 });

      const failed = await linkTelegramToEmployee(supabase, body.employee_id, Number(req.telegram_user_id), Number(req.chat_id));
      if (failed === "conflict") return NextResponse.json({ error: "That Telegram account or employee is already linked" }, { status: 409 });
      if (failed) return NextResponse.json({ error: "Could not link" }, { status: 500 });

      await supabase.from("telegram_link_requests")
        .update({ status: "linked", linked_employee_id: body.employee_id, resolved_by: auth.userId, resolved_at: now })
        .eq("id", req.id);
      // Tell the person; the link is already saved, so a failed message is not an error.
      await sendMessage(Number(req.chat_id), "✅ HR has linked your Telegram to your employee record. You can now use /checkin and /checkout here.", { removeKeyboard: true }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    case "telegram_dismiss": {
      if (typeof body.request_id !== "string") return NextResponse.json({ error: "request_id is required" }, { status: 400 });
      const { error } = await supabase.from("telegram_link_requests")
        .update({ status: "dismissed", resolved_by: auth.userId, resolved_at: now })
        .eq("id", body.request_id).eq("status", "pending");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
