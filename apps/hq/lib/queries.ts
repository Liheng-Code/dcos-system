import "server-only";
import { serviceClient } from "@/lib/supabase";
import { displayState, type DisplayState } from "@/lib/license-claims";
import type { Deployment, License, Plan, Tenant } from "@/lib/types";

export interface LicenseRow extends License {
  tenant: Pick<Tenant, "id" | "code" | "display_name" | "account_manager_id">;
  subscription: { number: string; net_amount: number | null; currency: string; po_reference: string | null } | null;
  ownerName: string | null;
  deployment: Pick<Deployment, "deployment_code" | "environment" | "base_url">;
  plan: Pick<Plan, "code" | "display_name"> | null;
  state: DisplayState;
  daysToExpiry: number | null;
}

const LICENSE_SELECT =
  "*, tenant:tenants!inner(id, code, display_name, account_manager_id, deleted_at), deployment:tenant_deployments(deployment_code, environment, base_url), plan:plans(code, display_name), subscription:subscriptions(number, net_amount, currency, po_reference)";

type RawLicenseRow = Omit<LicenseRow, "state" | "daysToExpiry" | "ownerName">;

export async function staffNames(): Promise<Map<string, string>> {
  const { data } = await serviceClient().from("hq_users").select("auth_user_id, display_name");
  return new Map((data ?? []).map((u) => [u.auth_user_id as string, u.display_name as string]));
}

async function withState(rows: RawLicenseRow[]): Promise<LicenseRow[]> {
  const now = Date.now();
  const names = await staffNames();
  return rows.map((r) => ({
    ...r,
    subscription: r.subscription ? { ...r.subscription, net_amount: r.subscription.net_amount === null ? null : Number(r.subscription.net_amount) } : null,
    ownerName: r.tenant.account_manager_id ? (names.get(r.tenant.account_manager_id) ?? null) : null,
    ...displayState(r, now),
  }));
}

// The current revision of each license: its live revision, or its open draft
// when it has never been issued.
export async function currentLicenses(): Promise<LicenseRow[]> {
  const { data, error } = await serviceClient()
    .from("licenses")
    .select(LICENSE_SELECT)
    .in("status", ["active", "suspended", "revoked", "draft"])
    .is("tenant.deleted_at", null)
    .order("valid_until", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = await withState((data ?? []) as RawLicenseRow[]);
  // A draft revision of an issued license is shown on that license, not as its own row.
  const issued = new Set(rows.filter((r) => r.status !== "draft").map((r) => r.number));
  return rows.filter((r) => r.status !== "draft" || !issued.has(r.number));
}

export async function licenseRevisions(number: string): Promise<LicenseRow[]> {
  const { data, error } = await serviceClient()
    .from("licenses")
    .select(LICENSE_SELECT)
    .eq("number", number)
    .order("revision", { ascending: false });
  if (error) throw new Error(error.message);
  return withState((data ?? []) as RawLicenseRow[]);
}

export async function licenseById(id: string): Promise<LicenseRow | null> {
  const { data } = await serviceClient().from("licenses").select(LICENSE_SELECT).eq("id", id).maybeSingle();
  return data ? (await withState([data as RawLicenseRow]))[0] : null;
}

export async function allPlans(): Promise<Plan[]> {
  const { data, error } = await serviceClient().from("plans").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Plan[];
}

export async function allTenants(): Promise<Tenant[]> {
  const { data, error } = await serviceClient().from("tenants").select("*").is("deleted_at", null).order("display_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Tenant[];
}

export async function allDeployments(): Promise<Deployment[]> {
  const { data, error } = await serviceClient().from("tenant_deployments").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Deployment[];
}
