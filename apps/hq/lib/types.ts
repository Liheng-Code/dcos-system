// Row shapes of the HQ tables used by the console
// (apps/hq/supabase/migrations/20261019100000_hq_init.sql).

export type LicenseType = "trial" | "subscription" | "enterprise";
export type LicenseStatus = "draft" | "active" | "suspended" | "revoked" | "superseded" | "terminated" | "discarded";
export type HqState = "active" | "suspended" | "revoked" | "terminated";

export interface Tenant {
  id: string;
  code: string;
  legal_name: string;
  display_name: string;
  country: string | null;
  billing_email: string | null;
  tax_id: string | null;
  status: "prospect" | "trial" | "customer" | "suspended" | "churned";
  notes: string | null;
  account_manager_id: string | null;
  created_at: string;
}

export interface Deployment {
  id: string;
  tenant_id: string;
  deployment_code: string;
  environment: "production" | "staging" | "demo";
  topology: "saas_dedicated" | "on_prem";
  base_url: string | null;
  region: string | null;
  app_version: string | null;
  status: "provisioning" | "healthy" | "degraded" | "unreachable" | "decommissioned";
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "billing" | "technical" | "license_admin" | "executive";
}

export interface Plan {
  id: string;
  code: string;
  display_name: string;
  license_type_default: LicenseType;
  default_duration_months: number;
  modules: string[];
  features: string[];
  limit_users: number | null;
  limit_viewers: number | null;
  limit_projects: number | null;
  grace_days: number;
  readonly_days: number;
  support_tier: "standard" | "premium";
  list_price: number | null;
  price_period: "monthly" | "annual" | "one_time" | null;
  currency: string;
  active: boolean;
  sort_order: number;
}

export interface License {
  id: string;
  tenant_id: string;
  deployment_id: string;
  subscription_id: string | null;
  number: string;
  revision: number;
  type: LicenseType;
  plan_id: string | null;
  status: LicenseStatus;
  hq_state: HqState;
  valid_from: string;
  valid_until: string;
  grace_days: number;
  readonly_days: number;
  modules: string[];
  features: string[];
  limit_users: number | null;
  limit_viewers: number | null;
  limit_projects: number | null;
  support_tier: "standard" | "premium";
  support_until: string | null;
  maintenance_until: string | null;
  suspend_mode: "readonly" | "locked" | null;
  notice: string | null;
  change_reason: string | null;
  supersedes_license_id: string | null;
  issued_at: string | null;
  created_at: string;
}

export interface SigningKey {
  id: string;
  kid: string;
  public_key: string;
  status: "active" | "retiring" | "retired" | "compromised";
  dev_only: boolean;
  activated_at: string;
}

export interface LicenseToken {
  id: string;
  license_id: string;
  jti: string;
  kid: string;
  profile: "online" | "offline";
  token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  delivered_at: string | null;
}
