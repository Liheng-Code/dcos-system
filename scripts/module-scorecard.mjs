// Per-module scorecard for the modularisation roll-out (Phase 6 of
// docs/01-DCOS-Foundation/DCOS-Modularisation-Plan.md). For each module it
// reports size, how much data access still sits in components and pages rather
// than in lib services, the largest UI files, and test count.
//
// Usage (from the repo root): node scripts/module-scorecard.mjs [--md]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE, moduleOf } from "../apps/web/module-boundaries.mjs";

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const markdown = process.argv.includes("--md");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const stats = new Map();
const get = (m) => {
  if (!stats.has(m)) stats.set(m, { files: 0, lines: 0, uiCalls: 0, uiFilesWithCalls: 0, libCalls: 0, tests: 0, big: [] });
  return stats.get(m);
};

for (const dir of ["app", "components", "lib", "hooks", "contexts"]) {
  for (const file of walk(path.join(web, dir))) {
    const rel = path.relative(web, file).replace(/\\/g, "/");
    if (rel === "lib/supabase/database.types.ts") continue;
    const s = get(moduleOf(rel));
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n").length;
    if (/\.test\.tsx?$/.test(rel)) { s.tests++; continue; }
    s.files++;
    s.lines += lines;
    // Direct table access (.from("table")) and RPC calls.
    const calls = (src.match(/\.from\(\s*["'`]|\.rpc\(\s*["'`]/g) ?? []).length;
    const isUi = rel.startsWith("app/dashboard/") || rel.startsWith("components/") || rel.startsWith("app/portal") || rel.startsWith("app/telegram-app");
    if (isUi) {
      s.uiCalls += calls;
      if (calls > 0) s.uiFilesWithCalls++;
      if (rel.endsWith(".tsx")) s.big.push([lines, rel]);
    } else {
      s.libCalls += calls;
    }
  }
}

const rows = [...stats.entries()]
  .map(([module, s]) => {
    s.big.sort((a, b) => b[0] - a[0]);
    const total = s.uiCalls + s.libCalls;
    return {
      module,
      files: s.files,
      lines: s.lines,
      uiCalls: s.uiCalls,
      uiFiles: s.uiFilesWithCalls,
      inService: total ? Math.round((s.libCalls / total) * 100) : 100,
      over800: s.big.filter(([n]) => n > 800).length,
      largest: s.big[0] ? `${s.big[0][1]} (${s.big[0][0]})` : "",
      tests: s.tests,
    };
  })
  .sort((a, b) => (a.module === CORE ? 1 : b.module === CORE ? -1 : b.uiCalls - a.uiCalls));

const head = ["Module", "Files", "Lines", "DB calls in UI", "UI files with DB calls", "Data access in services", "UI files over 800 lines", "Test files", "Largest UI file (lines)"];
const cells = rows.map((r) => [r.module, r.files, r.lines.toLocaleString("en-US"), r.uiCalls, r.uiFiles, r.inService + "%", r.over800, r.tests, r.largest]);

if (markdown) {
  console.log("| " + head.join(" | ") + " |");
  console.log("|" + head.map((_, i) => (i === 0 || i === head.length - 1 ? "---" : "---:")).join("|") + "|");
  for (const c of cells) console.log("| " + c.join(" | ") + " |");
} else {
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => String(c[i]).length)));
  const line = (c) => c.map((v, i) => (i === 0 || i === c.length - 1 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join("  ");
  console.log(line(head));
  for (const c of cells) console.log(line(c));
}
