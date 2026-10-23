"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LicenseClaims } from "@dcos/licensing";
import { verifyLicenseToken, decodeTokenUnverified } from "@dcos/licensing/verify";
import { requirePermission } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { audit, licenseEvent } from "@/lib/audit";
import { claimsForSigning, claimsMismatch, type ClaimsInput } from "@/lib/license-claims";
import { checkLicenseForm, licenseFormSchema } from "@/lib/license-rules";
import type { Deployment, License, Plan, SigningKey, Tenant } from "@/lib/types";
import { fail, ok, toFailure, type ActionResult } from "./result";

// Statuses that occupy a deployment.
const LIVE = ["active", "suspended"];

async function loadClaimsInput(licenseId: string): Promise<ClaimsInput & { license: License }> {
  const db = serviceClient();
  const { data: license, error } = await db.from("licenses").select("*").eq("id", licenseId).single<License>();
  if (error || !license) throw new Error("License revision not found.");
  const [{ data: tenant }, { data: deployment }, { data: plan }] = await Promise.all([
    db.from("tenants").select("code, display_name").eq("id", license.tenant_id).single<Pick<Tenant, "code" | "display_name">>(),
    db.from("tenant_deployments").select("deployment_code, topology").eq("id", license.deployment_id).single<Pick<Deployment, "deployment_code" | "topology">>(),
    license.plan_id
      ? db.from("plans").select("code, display_name").eq("id", license.plan_id).single<Pick<Plan, "code" | "display_name">>()
      : Promise.resolve({ data: null }),
  ]);
  if (!tenant || !deployment) throw new Error("The license's tenant or deployment is missing.");
  return { license, tenant, deployment, plan };
}

// ---------------------------------------------------------------------------
// Create a license (revision 1) or a new revision of an existing one, as a draft.
// ---------------------------------------------------------------------------
export async function saveLicenseDraft(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("manageLicenses");
    const parsed = licenseFormSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const form = parsed.data;
    const db = serviceClient();

    const [{ data: deployment }, { data: busy }, { data: trials }, { data: plan }] = await Promise.all([
      db.from("tenant_deployments").select("tenant_id, status").eq("id", form.deploymentId).maybeSingle(),
      db.from("licenses").select("id").eq("deployment_id", form.deploymentId).in("status", [...LIVE, "draft"]).limit(1),
      db.from("licenses").select("id").eq("tenant_id", form.tenantId).eq("type", "trial").neq("status", "discarded").limit(1),
      form.planId ? db.from("plans").select("*").eq("id", form.planId).maybeSingle<Plan>() : Promise.resolve({ data: null }),
    ]);

    let previous: License | null = null;
    if (form.fromLicenseId) {
      const { data } = await db.from("licenses").select("*").eq("id", form.fromLicenseId).single<License>();
      if (!data || !LIVE.includes(data.status)) return fail("Only a live license can be revised.");
      if (data.deployment_id !== form.deploymentId) return fail("A revision stays on the same deployment.");
      const { data: openDraft } = await db.from("licenses").select("id").eq("number", data.number).eq("status", "draft").limit(1);
      if (openDraft && openDraft.length > 0) return fail("This license already has an unsigned draft revision. Sign or discard it first.");
      previous = data;
    }

    const check = checkLicenseForm(form, {
      deploymentTenantId: deployment?.tenant_id ?? null,
      deploymentStatus: deployment?.status ?? null,
      deploymentBusy: (busy?.length ?? 0) > 0,
      tenantHadTrial: (trials?.length ?? 0) > 0,
      planModules: plan?.modules ?? null,
      planFeatures: plan?.features ?? null,
      previous: previous ? { validFrom: previous.valid_from, validUntil: previous.valid_until } : null,
    });
    if (!check.ok) return fail(check.error);

    let subscriptionId = previous?.subscription_id ?? null;
    if (!subscriptionId) {
      const { data: sub, error } = await db
        .from("subscriptions")
        .insert({
          tenant_id: form.tenantId,
          plan_id: form.planId,
          type: form.type,
          status: "draft",
          start_date: form.validFrom,
          current_period_end: check.term.validUntil,
          net_amount: form.netAmount,
          currency: form.currency,
          po_reference: form.poReference ?? null,
          created_by: user.authUserId,
        })
        .select("id")
        .single();
      if (error) return fail(error.message);
      subscriptionId = sub.id;
    } else if (form.netAmount !== null || form.poReference) {
      await db
        .from("subscriptions")
        .update({ net_amount: form.netAmount, currency: form.currency, po_reference: form.poReference ?? null })
        .eq("id", subscriptionId);
    }

    let number = previous?.number;
    if (!number) {
      const { data, error } = await db.rpc("next_license_number");
      if (error) return fail(error.message);
      number = data as string;
    }
    const revision = previous ? previous.revision + 1 : 1;

    const row = {
      tenant_id: form.tenantId,
      deployment_id: form.deploymentId,
      subscription_id: subscriptionId,
      number,
      revision,
      type: form.type,
      plan_id: form.planId,
      status: "draft",
      hq_state: "active",
      valid_from: form.validFrom,
      valid_until: check.term.validUntil,
      grace_days: form.graceDays,
      readonly_days: form.readonlyDays,
      modules: [...new Set(form.modules)].sort(),
      features: [...new Set(form.features)].sort(),
      limit_users: form.limitUsers,
      limit_viewers: form.limitViewers,
      limit_projects: form.limitProjects,
      support_tier: form.supportTier,
      support_until: form.supportUntil ?? check.term.validUntil,
      maintenance_until: form.maintenanceUntil ?? check.term.validUntil,
      notice: form.notice ?? null,
      change_reason: form.changeReason ?? (previous ? null : "New license"),
      supersedes_license_id: previous?.id ?? null,
      created_by: user.authUserId,
    };
    const { data, error } = await db.from("licenses").insert(row).select("id").single();
    if (error) return fail(error.message);

    await licenseEvent(db, {
      tenantId: form.tenantId,
      licenseId: data.id,
      eventType: previous ? "revision_drafted" : "created",
      payload: { number, revision, reason: row.change_reason },
      actorId: user.authUserId,
    });
    await audit(db, {
      actorId: user.authUserId,
      action: previous ? "license.revise" : "license.create",
      entityType: "license",
      entityId: data.id,
      tenantId: form.tenantId,
      before: previous,
      after: row,
    });
    revalidatePath("/licenses");
    return ok({ id: data.id });
  } catch (err) {
    return toFailure(err, "saveLicenseDraft");
  }
}

// ---------------------------------------------------------------------------
// Suspend, resume, revoke: a new revision of the live one with only the HQ state
// changed. Like every revision it takes effect once signed and installed.
// ---------------------------------------------------------------------------
const stateChangeSchema = z.object({
  licenseId: z.uuid(),
  action: z.enum(["suspend", "resume", "revoke"]),
  reason: z.string().trim().min(15, "Give a reason of at least 15 characters."),
  suspendMode: z.enum(["readonly", "locked"]).optional(),
  notice: z.string().trim().max(300).optional(),
});

export async function draftStateChange(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("manageLicenses");
    const parsed = stateChangeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const { licenseId, action, reason, suspendMode, notice } = parsed.data;
    const db = serviceClient();
    const { data: live } = await db.from("licenses").select("*").eq("id", licenseId).single<License>();
    if (!live || !LIVE.includes(live.status)) return fail("Only a live license can be changed.");
    if (action === "suspend" && live.hq_state === "suspended") return fail("This license is already suspended.");
    if (action === "resume" && live.hq_state !== "suspended") return fail("Only a suspended license can be resumed.");
    const { data: openDraft } = await db.from("licenses").select("id").eq("number", live.number).eq("status", "draft").limit(1);
    if (openDraft && openDraft.length > 0) return fail("This license already has an unsigned draft revision. Sign or discard it first.");

    const hqState = action === "suspend" ? "suspended" : action === "revoke" ? "revoked" : "active";
    const { id: _id, created_at: _c, issued_at: _i, status: _s, ...copy } = live;
    const row = {
      ...copy,
      revision: live.revision + 1,
      status: "draft",
      hq_state: hqState,
      suspend_mode: action === "suspend" ? (suspendMode ?? "readonly") : null,
      notice: action === "resume" ? null : (notice ?? null),
      change_reason: `${action[0].toUpperCase()}${action.slice(1)}: ${reason}`,
      supersedes_license_id: live.id,
      created_by: user.authUserId,
      issued_by: null,
      updated_at: undefined,
    };
    const { data, error } = await db.from("licenses").insert(row).select("id").single();
    if (error) return fail(error.message);
    await licenseEvent(db, {
      tenantId: live.tenant_id,
      licenseId: data.id,
      eventType: `${action}_drafted`,
      payload: { number: live.number, revision: row.revision, reason },
      actorId: user.authUserId,
    });
    await audit(db, {
      actorId: user.authUserId,
      action: `license.${action}`,
      entityType: "license",
      entityId: data.id,
      tenantId: live.tenant_id,
      before: { hq_state: live.hq_state },
      after: { hq_state: hqState, reason },
    });
    revalidatePath("/licenses");
    return ok({ id: data.id });
  } catch (err) {
    return toFailure(err, "draftStateChange");
  }
}

export async function discardDraft(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageLicenses");
    const { licenseId } = z.object({ licenseId: z.uuid() }).parse(input);
    const db = serviceClient();
    const { data: draft } = await db.from("licenses").select("*").eq("id", licenseId).single<License>();
    if (!draft || draft.status !== "draft") return fail("Only a draft can be discarded.");
    const { error } = await db.from("licenses").update({ status: "discarded" }).eq("id", licenseId);
    if (error) return fail(error.message);
    if (draft.revision === 1 && draft.subscription_id) {
      await db.from("subscriptions").update({ status: "cancelled" }).eq("id", draft.subscription_id);
    }
    await licenseEvent(db, {
      tenantId: draft.tenant_id,
      licenseId,
      eventType: "draft_discarded",
      payload: { number: draft.number, revision: draft.revision },
      actorId: user.authUserId,
    });
    await audit(db, { actorId: user.authUserId, action: "license.discard", entityType: "license", entityId: licenseId, tenantId: draft.tenant_id });
    revalidatePath("/licenses");
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "discardDraft");
  }
}

// ---------------------------------------------------------------------------
// Signing. HQ prepares the claims; the owner's browser signs them with the
// encrypted key file; HQ verifies the signature and the claims, then issues.
// ---------------------------------------------------------------------------
export async function prepareSigning(input: unknown): Promise<ActionResult<{ claims: LicenseClaims; keys: { kid: string; x: string }[] }>> {
  try {
    await requirePermission("manageLicenses");
    const { licenseId } = z.object({ licenseId: z.uuid() }).parse(input);
    const claimsInput = await loadClaimsInput(licenseId);
    if (claimsInput.license.status !== "draft") return fail("This revision is already issued.");
    const { data: keys } = await serviceClient()
      .from("signing_keys")
      .select("kid, public_key, dev_only")
      .eq("status", "active");
    const usable = (keys ?? []).filter((k) => process.env.NODE_ENV !== "production" || !k.dev_only);
    if (usable.length === 0) return fail("No active signing key is registered. Register its public key under Keys first.");
    return ok({ claims: claimsForSigning(claimsInput), keys: usable.map((k) => ({ kid: k.kid, x: k.public_key })) });
  } catch (err) {
    return toFailure(err, "prepareSigning");
  }
}

export async function submitSignedToken(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageLicenses");
    const { licenseId, token } = z.object({ licenseId: z.uuid(), token: z.string().min(50).max(20_000) }).parse(input);
    const db = serviceClient();
    const claimsInput = await loadClaimsInput(licenseId);
    if (claimsInput.license.status !== "draft") return fail("This revision is already issued.");

    const decoded = decodeTokenUnverified(token);
    const kid = (decoded?.header as { kid?: string } | undefined)?.kid;
    const { data: key } = await db.from("signing_keys").select("*").eq("kid", kid ?? "").maybeSingle<SigningKey>();
    if (!key || key.status !== "active") return fail("The token is signed with a key that is not active in HQ.");
    if (key.dev_only && process.env.NODE_ENV === "production") return fail("Development keys cannot sign customer licenses.");

    const now = Date.now();
    const verified = verifyLicenseToken(token, {
      keys: [{ kid: key.kid, x: key.public_key }],
      deploymentId: claimsInput.deployment.deployment_code,
      now,
    });
    if (!verified.ok) return fail(verified.error);
    const mismatch = claimsMismatch(verified.claims, claimsInput, now);
    if (mismatch) return fail(mismatch);

    const { error } = await db.rpc("issue_license", {
      p_license_id: licenseId,
      p_token: token,
      p_jti: verified.claims.jti,
      p_kid: key.kid,
      p_claims: verified.claims,
      p_expires_at: new Date(verified.claims.exp * 1000).toISOString(),
      p_actor: user.authUserId,
    });
    if (error) return fail(error.message);

    await audit(db, {
      actorId: user.authUserId,
      action: "license.sign",
      entityType: "license",
      entityId: licenseId,
      tenantId: claimsInput.license.tenant_id,
      after: { jti: verified.claims.jti, kid: key.kid, number: claimsInput.license.number, revision: claimsInput.license.revision },
    });
    revalidatePath("/licenses");
    revalidatePath(`/licenses/${licenseId}`);
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "submitSignedToken");
  }
}

// Recorded when someone copies or downloads a token for delivery (audited, design 9.1.3).
export async function markTokenDelivered(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageLicenses");
    const { tokenId } = z.object({ tokenId: z.uuid() }).parse(input);
    const db = serviceClient();
    const { data: tok } = await db.from("license_tokens").select("license_id, tenant_id, jti, delivered_at").eq("id", tokenId).single();
    if (!tok) return fail("Token not found.");
    if (!tok.delivered_at) await db.from("license_tokens").update({ delivered_at: new Date().toISOString() }).eq("id", tokenId);
    await audit(db, {
      actorId: user.authUserId,
      action: "license.token_copied",
      entityType: "license_token",
      entityId: tokenId,
      tenantId: tok.tenant_id,
      after: { jti: tok.jti },
    });
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "markTokenDelivered");
  }
}
