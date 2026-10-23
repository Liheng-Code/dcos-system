#!/usr/bin/env node
// LOCAL ONLY: fills DCOS HQ with fictional customers so the dashboard and lists
// can be judged with realistic shapes. Every tenant code starts with DEMO- and
// every license is properly signed with the development key, so the data obeys
// the same rules as real licenses.
//
//   DCOS_SIGNING_PASSPHRASE=... node apps/hq/scripts/seed-demo.mjs --key .licensing/dev-local.key.json
//   node apps/hq/scripts/seed-demo.mjs --hide     # soft-delete the DEMO- tenants
//
// License events and the audit log are append-only, so demo rows cannot be
// deleted; --hide removes them from every HQ screen instead.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, sign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { decryptKey, parseArgs, readPassphrase } from "../../../scripts/licensing/key-file.mjs";

const args = parseArgs(process.argv.slice(2));
const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env.local");
const env = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    )
  : {};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !/127\.0\.0\.1:55321|localhost:55321/.test(url)) {
  console.error(`Refusing: demo data is for the local HQ stack only (got ${url}).`);
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

if (args.hide) {
  const { data, error } = await db
    .from("tenants")
    .update({ deleted_at: new Date().toISOString() })
    .like("code", "DEMO-%")
    .is("deleted_at", null)
    .select("code");
  if (error) throw new Error(error.message);
  console.log(`Hid ${data.length} demo tenant(s).`);
  process.exit(0);
}

if (!args.key) {
  console.error("Usage: seed-demo.mjs --key <dev key file>   |   seed-demo.mjs --hide");
  process.exit(1);
}
const envelope = JSON.parse(readFileSync(args.key, "utf8"));
const privateKey = decryptKey(envelope, await readPassphrase(`Passphrase for ${envelope.kid}: `));
const { data: keyRow } = await db.from("signing_keys").select("kid").eq("kid", envelope.kid).eq("status", "active").maybeSingle();
if (!keyRow) {
  console.error(`Register ${envelope.kid} under Signing Keys first.`);
  process.exit(1);
}

const { data: owner } = await db.from("hq_users").select("auth_user_id").eq("hq_role", "owner").limit(1).single();
const actor = owner.auth_user_id;
const { data: plans } = await db.from("plans").select("*");
const plan = (code) => plans.find((p) => p.code === code);

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = Date.now();
function addMonths(from, months) {
  const d = new Date(from + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Fictional customers. `until` is chosen relative to today so every lifecycle
// state appears; amounts are illustrative.
const DEMO = [
  { code: "DEMO-NORTHWIND", name: "Northwind Builders", plan: "PRO", type: "subscription", startDaysAgo: 120, months: 12, amount: 18000 },
  { code: "DEMO-RIVERSIDE", name: "Riverside Contracting", plan: "STANDARD", type: "subscription", untilInDays: 24, months: 12, amount: 7200 },
  { code: "DEMO-SUMMIT", name: "Summit Engineering Group", plan: "ENT", type: "enterprise", startDaysAgo: 60, months: 24, amount: 96000 },
  { code: "DEMO-LOTUS", name: "Lotus Homes", plan: "TRIAL", type: "trial", startDaysAgo: 9, trialDays: 30, amount: 0 },
  { code: "DEMO-MEKONG", name: "Mekong Infrastructure", plan: "PRO", type: "subscription", untilInDays: -6, months: 12, amount: 15000 },
  { code: "DEMO-ANGKOR", name: "Angkor Steel Works", plan: "STANDARD", type: "subscription", untilInDays: -24, months: 12, amount: 6000 },
  { code: "DEMO-COASTAL", name: "Coastal Civil", plan: "PRO", type: "subscription", startDaysAgo: 200, months: 12, amount: 16500, suspend: true },
  { code: "DEMO-HIGHLAND", name: "Highland Developers", plan: "PRO", type: "subscription", untilInDays: 68, months: 12, amount: 21000 },
  { code: "DEMO-GOLDEN", name: "Golden Gate Fit-Out", plan: "STANDARD", type: "subscription", untilInDays: 140, months: 12, amount: 8400 },
  { code: "DEMO-PEARL", name: "Pearl Tower Partners", plan: "PRO", type: "subscription", untilInDays: 210, months: 12, amount: 19500 },
  { code: "DEMO-JADE", name: "Jade Interiors", plan: "STANDARD", type: "subscription", untilInDays: 285, months: 12, amount: 7800 },
];

function claimsFor(license, tenant, deployment, p) {
  const termEnd = Date.parse(license.valid_until + "T00:00:00Z") / 1000 + 86_400;
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "dcos-hq",
    sub: tenant.code,
    aud: deployment.deployment_code,
    exp: termEnd + (license.grace_days + license.readonly_days + 30) * 86_400,
    prof: "online",
    lic: {
      id: license.number,
      rev: license.revision,
      type: license.type,
      plan: p.code,
      plan_name: p.display_name,
      customer: tenant.display_name,
      from: license.valid_from,
      until: license.valid_until,
      grace_days: license.grace_days,
      readonly_days: license.readonly_days,
      hq_state: license.hq_state,
      suspend_mode: license.hq_state === "suspended" ? license.suspend_mode : null,
      notice: license.notice,
    },
    ent: {
      modules: [...license.modules].sort(),
      features: [...license.features].sort(),
      limits: { users: license.limit_users, viewers: license.limit_viewers, projects: license.limit_projects },
    },
    support: { tier: license.support_tier, maintenance_until: license.maintenance_until, support_until: license.support_until },
    jti: `lt_${license.number}_r${license.revision}_${randomBytes(5).toString("hex")}`,
    iat: now,
    nbf: now - 300,
  };
}

async function signAndIssue(license, tenant, deployment, p) {
  const claims = claimsFor(license, tenant, deployment, p);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const input = `${b64({ alg: "EdDSA", typ: "dcos-license+jwt", kid: envelope.kid })}.${b64(claims)}`;
  const token = `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
  const { error } = await db.rpc("issue_license", {
    p_license_id: license.id,
    p_token: token,
    p_jti: claims.jti,
    p_kid: envelope.kid,
    p_claims: claims,
    p_expires_at: new Date(claims.exp * 1000).toISOString(),
    p_actor: actor,
  });
  if (error) throw new Error(`issue ${license.number}: ${error.message}`);
}

for (const d of DEMO) {
  const { data: existing } = await db.from("tenants").select("id").eq("code", d.code).maybeSingle();
  if (existing) {
    console.log(`${d.code} exists, skipped`);
    continue;
  }
  const p = plan(d.plan);
  const { data: tenant } = await db
    .from("tenants")
    .insert({
      code: d.code,
      legal_name: `${d.name} (demo)`,
      display_name: d.name,
      country: "Cambodia",
      notes: "Demo data from apps/hq/scripts/seed-demo.mjs. Fictional.",
      created_by: actor,
      account_manager_id: actor,
    })
    .select("*")
    .single();
  const { data: deployment } = await db
    .from("tenant_deployments")
    .insert({
      tenant_id: tenant.id,
      deployment_code: `dep_${d.code.toLowerCase().replace(/-/g, "_")}`,
      environment: "production",
      base_url: `https://${d.code.slice(5).toLowerCase()}.dcos.example`,
      status: "healthy",
      created_by: actor,
    })
    .select("*")
    .single();

  let from;
  let until;
  if (d.type === "trial") {
    from = iso(today - d.startDaysAgo * DAY);
    until = iso(Date.parse(from) + (d.trialDays - 1) * DAY);
  } else if (d.untilInDays !== undefined) {
    until = iso(today + d.untilInDays * DAY);
    // Start so that `months` later ends on `until`.
    const s = new Date(until + "T00:00:00Z");
    s.setUTCDate(s.getUTCDate() + 1);
    s.setUTCMonth(s.getUTCMonth() - d.months);
    from = s.toISOString().slice(0, 10);
  } else {
    from = iso(today - d.startDaysAgo * DAY);
    until = addMonths(from, d.months);
  }

  const { data: sub } = await db
    .from("subscriptions")
    .insert({
      tenant_id: tenant.id,
      plan_id: p.id,
      type: d.type,
      status: "draft",
      start_date: from,
      current_period_end: until,
      net_amount: d.amount,
      currency: "USD",
      created_by: actor,
    })
    .select("id")
    .single();
  const { data: number } = await db.rpc("next_license_number");

  const base = {
    tenant_id: tenant.id,
    deployment_id: deployment.id,
    subscription_id: sub.id,
    number,
    type: d.type,
    plan_id: p.id,
    status: "draft",
    valid_from: from,
    valid_until: until,
    grace_days: p.grace_days,
    readonly_days: p.readonly_days,
    modules: p.modules,
    features: p.features,
    limit_users: p.limit_users,
    limit_viewers: p.limit_viewers,
    limit_projects: p.limit_projects,
    support_tier: p.support_tier,
    support_until: until,
    maintenance_until: until,
    created_by: actor,
  };
  const { data: rev1 } = await db
    .from("licenses")
    .insert({ ...base, revision: 1, hq_state: "active", change_reason: "New license (demo)" })
    .select("*")
    .single();
  await signAndIssue(rev1, tenant, deployment, p);

  if (d.suspend) {
    const { data: rev2 } = await db
      .from("licenses")
      .insert({
        ...base,
        revision: 2,
        hq_state: "suspended",
        suspend_mode: "readonly",
        notice: "Your DCOS subscription is on hold. Please contact DCOS.",
        change_reason: "Suspend: invoice overdue for 60 days (demo)",
        supersedes_license_id: rev1.id,
      })
      .select("*")
      .single();
    await signAndIssue(rev2, tenant, deployment, p);
  }
  console.log(`${d.code}: ${number} ${d.plan} ${from} → ${until}${d.suspend ? " (suspended)" : ""}`);
}
console.log("Done. Hide later with: node apps/hq/scripts/seed-demo.mjs --hide");
