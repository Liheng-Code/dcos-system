"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { fail, ok, toFailure, type ActionResult } from "./result";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional());

const tenantSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "Code: 2-20 letters, digits or dashes"),
  legal_name: z.string().trim().min(2).max(200),
  display_name: z.string().trim().min(2).max(120),
  country: optionalText,
  billing_email: z.preprocess(emptyToNull, z.email().nullable().optional()),
  tax_id: optionalText,
  notes: optionalText,
});

export async function createTenant(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("manageTenants");
    const parsed = tenantSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const db = serviceClient();
    const { data, error } = await db
      .from("tenants")
      .insert({ ...parsed.data, created_by: user.authUserId, account_manager_id: user.authUserId })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "A tenant with this code already exists." : error.message);
    await audit(db, { actorId: user.authUserId, action: "tenant.create", entityType: "tenant", entityId: data.id, tenantId: data.id, after: parsed.data });
    revalidatePath("/tenants");
    return ok({ id: data.id });
  } catch (err) {
    return toFailure(err, "createTenant");
  }
}

const deploymentSchema = z.object({
  tenant_id: z.uuid(),
  deployment_code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^dep_[a-z0-9_]{3,40}$/, "Deployment id: dep_ followed by 3-40 lowercase letters, digits or _"),
  environment: z.enum(["production", "staging", "demo"]),
  topology: z.enum(["saas_dedicated", "on_prem"]),
  base_url: z.preprocess(emptyToNull, z.url().nullable().optional()),
  region: optionalText,
  status: z.enum(["provisioning", "healthy", "degraded", "unreachable", "decommissioned"]).default("provisioning"),
});

export async function addDeployment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission("manageTenants");
    const parsed = deploymentSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const db = serviceClient();
    const { data, error } = await db
      .from("tenant_deployments")
      .insert({ ...parsed.data, created_by: user.authUserId })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "That deployment id is already used." : error.message);
    await audit(db, {
      actorId: user.authUserId,
      action: "deployment.create",
      entityType: "deployment",
      entityId: data.id,
      tenantId: parsed.data.tenant_id,
      after: parsed.data,
    });
    revalidatePath(`/tenants/${parsed.data.tenant_id}`);
    return ok({ id: data.id });
  } catch (err) {
    return toFailure(err, "addDeployment");
  }
}

const deploymentStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["provisioning", "healthy", "degraded", "unreachable", "decommissioned"]),
});

export async function setDeploymentStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageTenants");
    const parsed = deploymentStatusSchema.parse(input);
    const db = serviceClient();
    const { data: before } = await db.from("tenant_deployments").select("tenant_id, status").eq("id", parsed.id).single();
    if (!before) return fail("Deployment not found.");
    const { error } = await db.from("tenant_deployments").update({ status: parsed.status }).eq("id", parsed.id);
    if (error) return fail(error.message);
    await audit(db, {
      actorId: user.authUserId,
      action: "deployment.status",
      entityType: "deployment",
      entityId: parsed.id,
      tenantId: before.tenant_id,
      before: { status: before.status },
      after: { status: parsed.status },
    });
    revalidatePath(`/tenants/${before.tenant_id}`);
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "setDeploymentStatus");
  }
}

const contactSchema = z.object({
  tenant_id: z.uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.preprocess(emptyToNull, z.email().nullable().optional()),
  phone: optionalText,
  role: z.enum(["billing", "technical", "license_admin", "executive"]),
});

export async function addContact(input: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageTenants");
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const db = serviceClient();
    const { data, error } = await db.from("tenant_contacts").insert(parsed.data).select("id").single();
    if (error) return fail(error.message);
    await audit(db, {
      actorId: user.authUserId,
      action: "contact.create",
      entityType: "contact",
      entityId: data.id,
      tenantId: parsed.data.tenant_id,
      after: parsed.data,
    });
    revalidatePath(`/tenants/${parsed.data.tenant_id}`);
    return ok(undefined);
  } catch (err) {
    return toFailure(err, "addContact");
  }
}
