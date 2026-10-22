#!/usr/bin/env node
// Creates a DCOS HQ staff login. HQ has no self sign-up.
//
//   node apps/hq/scripts/create-hq-user.mjs --email you@example.com --name "Your Name" --role owner
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
// environment or apps/hq/.env.local. The password comes from HQ_USER_PASSWORD,
// or a random one is generated and printed once.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["owner", "license_admin", "account_manager", "support", "ops", "viewer"];

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.email || !args.name || !ROLES.includes(args.role)) {
  console.error(`Usage: create-hq-user.mjs --email <email> --name <name> --role <${ROLES.join("|")}>`);
  process.exit(1);
}

const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    )
  : {};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (/54321/.test(url)) {
  console.error(`Refusing: ${url} looks like the DCOS tenant database, not HQ.`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const password = process.env.HQ_USER_PASSWORD ?? randomBytes(12).toString("base64url");

const { data, error } = await db.auth.admin.createUser({ email: args.email, password, email_confirm: true });
if (error) {
  console.error(`Could not create the login: ${error.message}`);
  process.exit(1);
}
const { error: rowError } = await db
  .from("hq_users")
  .insert({ auth_user_id: data.user.id, display_name: args.name, hq_role: args.role });
if (rowError) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error(`Could not create the HQ profile: ${rowError.message}`);
  process.exit(1);
}

console.log(`HQ ${args.role} ${args.email} created on ${url}.`);
if (!process.env.HQ_USER_PASSWORD) console.log(`Password (shown once): ${password}`);
