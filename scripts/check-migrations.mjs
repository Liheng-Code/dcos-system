// CI check for supabase/migrations: every file is named <version>_<name>.sql and
// no two files share a version. Two people adding migrations on separate
// branches is the usual way a duplicate version appears.
//
// Usage: node scripts/check-migrations.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

// Named before the 14-digit convention was adopted; already applied everywhere.
const LEGACY_NAMES = new Set(["20260526_0001_create_profiles.sql"]);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const errors = [];
const byVersion = new Map();

for (const file of files) {
  if (!LEGACY_NAMES.has(file) && !/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
    errors.push(`${file}: name must be <14-digit version>_<lower_snake_case>.sql`);
  }
  const version = file.split("_")[0];
  byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
}

for (const [version, names] of byVersion) {
  if (names.length > 1) errors.push(`version ${version} is used by ${names.length} files: ${names.join(", ")}`);
}

if (errors.length > 0) {
  console.error(`Migration check failed:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`Migration check passed: ${files.length} files, versions unique.`);
