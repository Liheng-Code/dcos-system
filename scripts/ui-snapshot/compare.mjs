// Compares two files written by snapshot.mjs, view by view. Exits 1 if any
// view's text, form controls or buttons differ.
// Usage: node scripts/ui-snapshot/compare.mjs <before.json> <after.json>

import fs from "node:fs";

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("Usage: node scripts/ui-snapshot/compare.mjs <before.json> <after.json>");
  process.exit(2);
}
const before = JSON.parse(fs.readFileSync(a, "utf8")).views;
const after = JSON.parse(fs.readFileSync(b, "utf8")).views;
const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];

let same = 0;
const diffs = [];
for (const name of names) {
  if (!before[name] || !after[name]) {
    diffs.push(`${name}: only in the ${before[name] ? "before" : "after"} file`);
    continue;
  }
  const parts = [];
  for (const key of ["text", "controls", "buttons"]) {
    const x = JSON.stringify(before[name][key]);
    const y = JSON.stringify(after[name][key]);
    if (x === y) continue;
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    parts.push(`${key} differ at character ${i}:\n      before: ${x.slice(Math.max(0, i - 60), i + 120)}\n      after:  ${y.slice(Math.max(0, i - 60), i + 120)}`);
  }
  if (parts.length) diffs.push(`${name}:\n    ${parts.join("\n    ")}`);
  else same++;
}

console.log(`${names.length} views compared: ${same} identical, ${diffs.length} different`);
for (const d of diffs) console.log("  " + d);
process.exit(diffs.length ? 1 : 0);
