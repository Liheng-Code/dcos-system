// Builds a views file for snapshot.mjs from a module's routes: every page under
// the module's app folders that has no dynamic segment. Pages with a dynamic
// segment ([id]) need a real id, so add those by hand or pass them as extras.
//
// Usage (from the repo root):
//   node scripts/ui-snapshot/make-views.mjs <module> <out.json> [extra-url ...]
// <module> is a key of MODULE_PATHS in apps/web/module-boundaries.mjs, or "core".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE, MODULE_PATHS, moduleOf } from "../../apps/web/module-boundaries.mjs";

const [moduleKey, out, ...extras] = process.argv.slice(2);
if (!moduleKey || !out || (moduleKey !== CORE && !MODULE_PATHS[moduleKey])) {
  console.error(`Usage: node scripts/ui-snapshot/make-views.mjs <${[...Object.keys(MODULE_PATHS), CORE].join("|")}> <out.json> [extra-url ...]`);
  process.exit(2);
}
const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "web");

function pages(dir, found = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, found);
    else if (e.name === "page.tsx") found.push(p);
  }
  return found;
}

const urls = pages(path.join(web, "app"))
  .map((p) => path.relative(web, p).replace(/\\/g, "/"))
  .filter((rel) => moduleOf(rel) === moduleKey)
  .map((rel) => "/" + rel.replace(/^app\//, "").replace(/\/?page\.tsx$/, ""))
  .filter((url) => !url.includes("[") && !url.startsWith("/api"))
  // Route groups such as (shell) are not part of the URL.
  .map((url) => url.replace(/\/\([^)]+\)/g, "") || "/")
  .sort();

const views = [...urls, ...extras].map((url) => ({ name: url, url, waitFor: "main" }));
fs.writeFileSync(out, JSON.stringify(views, null, 1));
console.log(`${views.length} views (${urls.length} static routes, ${extras.length} extras) written to ${out}`);
