// Licensing core, server side (design section 7.3, E1): loads the installed
// token from license_state, verifies it, and computes the effective license.
// One source of truth for proxy.ts, API routes and the License page.
//
// Env:
//   DCOS_LICENSE_MODE   off (default) | report | enforce
//   DCOS_DEPLOYMENT_ID  this deployment's id; a token's aud must equal it

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeEffective, type EffectiveLicense, type LicenseMode, type Usage } from "@/lib/licensing/effective";
import { verifyLicenseToken } from "@/lib/licensing/token";
import { trustedKeys } from "@/lib/licensing/keys";
import type { LicenseDenial } from "@/lib/licensing/errors";

export function licenseMode(): LicenseMode {
  const raw = (process.env.DCOS_LICENSE_MODE ?? "off").trim().toLowerCase();
  return raw === "enforce" || raw === "report" ? raw : "off";
}

export function deploymentId(): string | null {
  return process.env.DCOS_DEPLOYMENT_ID?.trim() || null;
}

interface LicenseStateRow {
  token: string | null;
  lic_rev: number;
  token_jti: string | null;
  installed_at: string | null;
  enforcement_mode: LicenseMode;
  high_water_at: string | null;
  suspended: boolean;
  suspend_mode: "readonly" | "locked" | null;
  revoked_jtis: string[];
  compromised_kids: string[];
}

export interface LoadedLicense {
  effective: EffectiveLicense;
  installedAt: string | null;
  deploymentId: string | null;
}

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CACHE_TTL_MS = 60_000;
const HIGH_WATER_STEP_MS = 60_000;
let cache: { at: number; value: LoadedLicense } | null = null;

// Copies DCOS_LICENSE_MODE into license_state once per server process, so the
// database checks follow the env var even when no page has loaded the license
// (switching the mode to off must also switch the project-limit trigger off).
let modeSynced: LicenseMode | null = null;
export async function syncEnforcementMode(): Promise<void> {
  const mode = licenseMode();
  if (modeSynced === mode) return;
  const { error } = await serviceClient()
    .from("license_state")
    .update({ enforcement_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", true)
    .neq("enforcement_mode", mode);
  // Try once per process either way: a database without the licensing migration
  // must not cost every API request a failed query.
  modeSynced = mode;
  if (error) console.error("[licensing] could not sync the enforcement mode:", error.message);
}

export function invalidateLicenseCache() {
  cache = null;
}

async function loadUsage(db: SupabaseClient): Promise<Usage> {
  const { data, error } = await db.rpc("license_usage");
  if (error) throw new Error(`license_usage: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Usage | undefined;
  return row ?? { users: 0, viewers: 0, projects: 0 };
}

export async function getLicense(opts: { force?: boolean } = {}): Promise<LoadedLicense> {
  if (!opts.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const mode = licenseMode();
  const db = serviceClient();
  const [{ data: row, error }, usage] = await Promise.all([
    db.from("license_state").select("*").eq("id", true).maybeSingle<LicenseStateRow>(),
    loadUsage(db),
  ]);
  if (error) throw new Error(`license_state: ${error.message}`);

  const wallNow = Date.now();
  const highWater = row?.high_water_at ? Date.parse(row.high_water_at) : 0;
  const now = Math.max(wallNow, highWater);

  // Keep the database's copy of the mode and clock high-water mark current; the
  // project-limit trigger reads both.
  const patch: Record<string, unknown> = {};
  if (row && row.enforcement_mode !== mode) patch.enforcement_mode = mode;
  if (row && wallNow - highWater > HIGH_WATER_STEP_MS) patch.high_water_at = new Date(wallNow).toISOString();
  if (Object.keys(patch).length > 0) {
    await db.from("license_state").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  }

  const depId = deploymentId();
  let claims = null;
  let tokenError: string | null = null;
  if (row?.token) {
    if (!depId) {
      tokenError = "DCOS_DEPLOYMENT_ID is not set on this deployment.";
    } else {
      const result = verifyLicenseToken(row.token, {
        keys: trustedKeys(),
        deploymentId: depId,
        now,
        revokedJtis: row.revoked_jtis,
        compromisedKids: row.compromised_kids,
      });
      if (result.ok) {
        claims = result.claims;
        // Reduce-only status from HQ overrides the signed state.
        if (row.suspended) {
          claims = { ...claims, lic: { ...claims.lic, hq_state: "suspended" as const, suspend_mode: row.suspend_mode ?? "locked" } };
        }
      } else {
        tokenError = result.error;
      }
    }
  }

  const value: LoadedLicense = {
    effective: computeEffective(mode, claims, now, usage, tokenError),
    installedAt: row?.installed_at ?? null,
    deploymentId: depId,
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function logLicenseEvent(eventType: string, payload: Record<string, unknown>, actorId?: string | null) {
  const db = serviceClient();
  const { error } = await db
    .from("license_local_events")
    .insert({ event_type: eventType, payload, actor_id: actorId ?? null });
  if (error) console.error("[licensing] failed to log event:", error.message);
}

// Report mode logs each distinct would-be denial at most once an hour per process.
const reported = new Map<string, number>();
export async function reportDenial(denial: LicenseDenial, context: Record<string, unknown>) {
  const key = `${denial.code}:${JSON.stringify(context)}`;
  const last = reported.get(key) ?? 0;
  if (Date.now() - last < 3_600_000) return;
  reported.set(key, Date.now());
  await logLicenseEvent("would_deny", { code: denial.code, ...context });
}

export type InstallResult = { ok: true; licenseId: string; rev: number } | { ok: false; error: string };

export async function installLicenseToken(token: string, actorId: string): Promise<InstallResult> {
  const depId = deploymentId();
  if (!depId) return { ok: false, error: "DCOS_DEPLOYMENT_ID is not set on this deployment." };

  const db = serviceClient();
  const { data: row, error } = await db
    .from("license_state")
    .select("lic_rev, high_water_at, revoked_jtis, compromised_kids")
    .eq("id", true)
    .maybeSingle<Pick<LicenseStateRow, "lic_rev" | "high_water_at" | "revoked_jtis" | "compromised_kids">>();
  if (error) return { ok: false, error: error.message };

  const now = Math.max(Date.now(), row?.high_water_at ? Date.parse(row.high_water_at) : 0);
  const result = verifyLicenseToken(token, {
    keys: trustedKeys(),
    deploymentId: depId,
    now,
    minRev: row?.lic_rev ?? 0,
    revokedJtis: row?.revoked_jtis,
    compromisedKids: row?.compromised_kids,
  });
  if (!result.ok) {
    await logLicenseEvent("install_rejected", { error: result.error }, actorId);
    return { ok: false, error: result.error };
  }

  const { claims, kid } = result;
  const { error: upErr } = await db
    .from("license_state")
    .update({
      token: token.trim(),
      claims,
      lic_id: claims.lic.id,
      lic_rev: claims.lic.rev,
      token_kid: kid,
      token_jti: claims.jti,
      installed_at: new Date().toISOString(),
      installed_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (upErr) return { ok: false, error: upErr.message };

  await logLicenseEvent(
    "installed",
    { license_id: claims.lic.id, rev: claims.lic.rev, plan: claims.lic.plan, until: claims.lic.until, jti: claims.jti },
    actorId,
  );
  invalidateLicenseCache();
  return { ok: true, licenseId: claims.lic.id, rev: claims.lic.rev };
}

// Seat check for an invite or reactivation (design 7.4). Returns a denial or null.
export async function checkSeat(isViewer: boolean): Promise<LicenseDenial | null> {
  const { effective: eff } = await getLicense({ force: true });
  if (eff.mode === "off") return null;
  let denial: LicenseDenial | null = null;
  if (eff.access !== "full") {
    denial = { code: eff.access === "readonly" ? "LIC_READ_ONLY" : "LIC_LOCKED", message: "The DCOS license does not allow adding users at the moment." };
  } else {
    const l = isViewer ? eff.limits.viewers : eff.limits.users;
    if (l.atLimit) {
      denial = {
        code: isViewer ? "LIC_VIEWER_LIMIT" : "LIC_SEAT_LIMIT",
        message: `${isViewer ? "Viewer" : "User"} limit reached: ${l.used} of ${l.limit} used. Ask DCOS for more seats.`,
        used: l.used,
        limit: l.limit,
      };
    }
  }
  if (denial && eff.mode === "report") {
    await reportDenial(denial, { action: "seat", viewer: isViewer });
    return null;
  }
  return denial;
}

// Whether a user with this legacy role and these RBAC role codes takes a viewer seat.
export async function isViewerSeat(role: string | null | undefined, roleCodes: string[] | undefined): Promise<boolean> {
  if (role && role !== "viewer") return false;
  if (!roleCodes || roleCodes.length === 0) return true;
  const db = serviceClient();
  const { data, error } = await db
    .from("role_permissions")
    .select("role_code")
    .in("role_code", roleCodes)
    .or("can_create.eq.true,edit.eq.true,delete.eq.true,submit.eq.true,approve.eq.true,reject.eq.true,transmit.eq.true,configure.eq.true,reassign.eq.true")
    .limit(1);
  if (error) throw new Error(`role_permissions: ${error.message}`);
  return (data ?? []).length === 0;
}
