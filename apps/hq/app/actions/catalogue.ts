"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AVAILABLE_FEATURES, LICENSABLE_MODULES } from "@dcos/licensing";
import { requirePermission } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { fail, ok, toFailure, type ActionResult } from "./result";

const limit = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(0).nullable(),
);

const planSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, "Plan code: 2-20 letters, digits or _"),
  display_name: z.string().trim().min(2).max(80),
  license_type_default: z.enum(["trial", "subscription", "enterprise"]),
  default_duration_months: z.coerce.number().int().min(1).max(60),
  modules: z.array(z.enum(LICENSABLE_MODULES as [string, ...string[]])),
  features: z.array(z.enum(AVAILABLE_FEATURES as [string, ...string[]])),
  limit_users: limit,
  limit_viewers: limit,
  limit_projects: limit,
  grace_days: z.coerce.number().int().min(0).max(180),
  readonly_days: z.coerce.number().int().min(0).max(180),
  support_tier: z.enum(["standard", "premium"]),
  list_price: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).nullable()),
  price_period: z.preprocess((v) => (v === "" ? null : v), z.enum(["monthly", "annual", "one_time"]).nullable()),
  currency: z.string().trim().toUpperCase().length(3),
  active: z.boolean(),
});

// Editing a plan never changes issued licenses: each revision froze its own set (design 9.1.8).
export async function savePlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("managePlans");
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the plan.");
    const { id, ...fields } = parsed.data;
    const db = serviceClient();
    if (id) {
      const { data: before } = await db.from("plans").select("*").eq("id", id).single();
      const { error } = await db.from("plans").update(fields).eq("id", id);
      if (error) return fail(error.code === "23505" ? "Another plan has this code." : error.message);
      await audit(db, { actorId: user.authUserId, action: "plan.update", entityType: "plan", entityId: id, before, after: fields });
      revalidatePath("/plans");
      return ok({ id });
    }
    const { data, error } = await db.from("plans").insert(fields).select("id").single();
    if (error) return fail(error.code === "23505" ? "Another plan has this code." : error.message);
    await audit(db, { actorId: user.authUserId, action: "plan.create", entityType: "plan", entityId: data.id, after: fields });
    revalidatePath("/plans");
    return ok({ id: data.id });
  } catch (err) {
    return toFailure(err, "savePlan");
  }
}

const keySchema = z.object({
  kid: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,40}$/, "Key id: 3-41 lowercase letters, digits or dashes"),
  public_key: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, "Public key: the 43-character x value printed by new-signing-key.mjs"),
  dev_only: z.boolean(),
});

// Registers the PUBLIC half of a signing key. The private key never comes to HQ.
export async function registerKey(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageKeys");
    const parsed = keySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the key.");
    const db = serviceClient();
    const { data, error } = await db
      .from("signing_keys")
      .insert({ ...parsed.data, created_by: user.authUserId })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "A key with this id is already registered." : error.message);
    await audit(db, { actorId: user.authUserId, action: "key.register", entityType: "signing_key", entityId: data.id, after: parsed.data });
    revalidatePath("/keys");
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "registerKey");
  }
}

const keyStatusSchema = z.object({ id: z.uuid(), status: z.enum(["active", "retiring", "retired", "compromised"]) });

export async function setKeyStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageKeys");
    const parsed = keyStatusSchema.parse(input);
    const db = serviceClient();
    const { data: before } = await db.from("signing_keys").select("kid, status").eq("id", parsed.id).single();
    if (!before) return fail("Key not found.");
    const { error } = await db.from("signing_keys").update({ status: parsed.status }).eq("id", parsed.id);
    if (error) return fail(error.message);
    await audit(db, {
      actorId: user.authUserId,
      action: "key.status",
      entityType: "signing_key",
      entityId: parsed.id,
      before,
      after: { status: parsed.status },
    });
    revalidatePath("/keys");
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "setKeyStatus");
  }
}
