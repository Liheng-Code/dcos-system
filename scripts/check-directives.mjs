// CI check: a "use client" or "use server" directive must be the first statement
// of its file. If an import or anything else comes before it, Next.js fails the
// build ("The "use client" directive must be placed before other expressions"),
// and neither TypeScript nor ESLint reports it.
//
// Usage (from the repo root): node scripts/check-directives.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const DIRECTIVE = /^\s*["']use (client|server)["'];?\s*$/;
const bad = [];
let checked = 0;

for (const dir of ["app", "components", "hooks", "contexts", "lib"]) {
  const root = path.join(web, dir);
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    // Drop leading comments and blank lines, then look at the statements in order.
    const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/);
    const statements = lines.filter((l) => l.trim() && !l.trim().startsWith("//"));
    const at = statements.findIndex((l) => DIRECTIVE.test(l));
    if (at < 0) continue;
    checked++;
    // Only a top-of-file directive counts; "use server" inside a function body is fine.
    if (at > 0 && /^["']use /.test(statements[at].trimStart()) && !/^\s/.test(statements[at])) {
      bad.push(`${path.relative(web, file).replace(/\\/g, "/")}: directive is statement ${at + 1}, after "${statements[0].trim().slice(0, 60)}"`);
    }
  }
}

if (bad.length) {
  console.error(`Directive check failed:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`Directive check passed: ${checked} files with a top-level directive.`);
