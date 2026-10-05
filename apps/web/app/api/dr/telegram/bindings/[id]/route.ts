import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canReview, drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";
import { postLaunchMessage } from "@/lib/construction/daily-reporting/telegram/telegram-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ action: z.enum(["confirm_migration", "unbind", "reissue_launch"]) });

/** Confirms a migrated group, unbinds a group, or re-issues the launch button of a group. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!UUID.test(id) || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (parsed.data.action === "confirm_migration") {
    const { error } = await actor.admin.rpc("dr_tg_confirm_migration", { p_actor: actor.userId, p_binding_id: id });
    if (error) return drErrorResponse(error);
    // The new chat needs its own button; a failure here leaves the binding confirmed.
    const posted = await postLaunchMessage(actor.admin, id, actor.userId).then(
      () => true,
      () => false,
    );
    return NextResponse.json({ confirmed: true, launch_posted: posted });
  }

  if (parsed.data.action === "unbind") {
    const { error } = await actor.admin.rpc("dr_tg_unbind", { p_actor: actor.userId, p_binding_id: id });
    if (error) return drErrorResponse(error);
    return NextResponse.json({ unbound: true });
  }

  // reissue_launch: check the caller before anything is sent to the group.
  const { data: binding } = await actor.admin.from("dr_telegram_bindings").select("project_id").eq("id", id).maybeSingle();
  if (!binding) return NextResponse.json({ error: "Binding not found", code: "DR_NOT_FOUND" }, { status: 404 });
  if (!(await canReview(actor.admin, binding.project_id as string, actor.userId))) {
    return NextResponse.json(
      { error: "Only a project approver or administrator can issue a launch link", code: "DR_FORBIDDEN" },
      { status: 403 },
    );
  }
  try {
    await postLaunchMessage(actor.admin, id, actor.userId);
    return NextResponse.json({ launch_posted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/^DR_[A-Z_]+:/.test(message)) return drErrorResponse(e as Error);
    console.error("dr telegram reissue:", message);
    return NextResponse.json(
      {
        error: "The launch button could not be posted to the group. Check the bot is in the group and Telegram is configured.",
        code: "DR_TG_UNAVAILABLE",
      },
      { status: 502 },
    );
  }
}
