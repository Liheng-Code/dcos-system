// Codemod: move direct Supabase calls out of UI files into a module service.
//
// For every `<client>.from("table")...` / `<client>.rpc("fn", ...)` expression in
// the given files it:
//   1. parses the method chain;
//   2. turns the variable arguments (filter values, rows to insert, update
//      patches) into function parameters and keeps the literal ones (table,
//      columns, ordering, literal filters) in the function body;
//   3. writes one exported function per distinct query into the service file;
//   4. replaces the call site with a call to that function, expression for
//      expression, so `await`, `.then(...)` and destructuring keep working;
//   5. removes the client variable and its import when nothing else uses them.
//
// The generated functions return the Supabase query itself, exactly what the
// call site had before, so behaviour does not change. Verify with
// scripts/ui-snapshot before and after.
//
// Usage (from the repo root):
//   node scripts/codemods/extract-service.mjs \
//     --service apps/web/lib/<module>/<module>-service.ts \
//     --strip <table prefix to drop from names, e.g. procurement_> \
//     [--names overrides.json] [--plan] <files...>
//
// --plan prints the functions it would create and changes nothing.
// --names maps an auto-generated name to a better one: { "listPos2": "listOpenPos" }.

import fs from "node:fs";
import path from "node:path";

// ── arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { strip: [], files: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--service") opt.service = argv[++i];
  else if (a === "--strip") opt.strip.push(argv[++i]);
  else if (a === "--names") opt.names = argv[++i];
  else if (a === "--plan") opt.plan = true;
  else opt.files.push(a);
}
if (!opt.service || opt.files.length === 0) {
  console.error("Usage: node scripts/codemods/extract-service.mjs --service <file> [--strip <prefix>] [--names <json>] [--plan] <files...>");
  process.exit(2);
}
const overrides = opt.names ? JSON.parse(fs.readFileSync(opt.names, "utf8")) : {};
const webRoot = path.resolve(opt.service).replace(/\\/g, "/").split("/apps/web/")[0] + "/apps/web";
const serviceImport = "@/" + path.resolve(opt.service).replace(/\\/g, "/").split("/apps/web/")[1].replace(/\.ts$/, "");

// ── small lexer helpers ──────────────────────────────────────────────────────

/** Index just past the bracket that closes the one at `open`, honouring strings and comments. */
function matchClose(s, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(s, i) - 1; continue; }
    if (ch === "/" && s[i + 1] === "/") { i = s.indexOf("\n", i); if (i < 0) return -1; continue; }
    if (ch === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i) + 1; continue; }
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** Index just past the string literal starting at `i` (template literals may nest ${...}). */
function skipString(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (q === "`" && s[j] === "$" && s[j + 1] === "{") { j = matchClose(s, j + 1) - 1; continue; }
    if (s[j] === q) return j + 1;
  }
  return s.length;
}

/** Splits `a, b, c` at top-level commas. */
function splitArgs(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(text, i) - 1; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  const last = text.slice(start);
  if (last.trim()) out.push(last);
  return out.map((a) => a.trim());
}

const STRING = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`)$/s;

function isLiteral(text) {
  const t = text.trim();
  if (STRING.test(t) || /^-?\d+(\.\d+)?$/.test(t) || /^(true|false|null|undefined)$/.test(t)) return true;
  if (t.startsWith("[") && matchClose(t, 0) === t.length) return splitArgs(t.slice(1, -1)).every(isLiteral);
  if (t.startsWith("{") && matchClose(t, 0) === t.length) {
    return splitArgs(t.slice(1, -1)).every((p) => {
      const m = /^([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:\s*([\s\S]+)$/.exec(p);
      return !!m && isLiteral(m[2]);
    });
  }
  return false;
}

const unquote = (t) => t.trim().slice(1, -1);
const pascal = (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const camel = (s) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };

function singular(word) {
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(ch|sh|x|ss)es$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, "");
  return word;
}

// ── chain parsing ────────────────────────────────────────────────────────────

const FILTERS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "contains", "containedBy", "overlaps"]);
const STOP = new Set(["then", "catch", "finally"]);

/** Parses the chain starting at the `.` after the client. Returns { segments, end } or null. */
function parseChain(s, dot) {
  const segments = [];
  let i = dot;
  for (;;) {
    let j = i;
    while (/\s/.test(s[j])) j++;
    if (s[j] !== ".") break;
    j++;
    while (/\s/.test(s[j])) j++;
    const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(j, j + 60));
    if (!m) break;
    const method = m[0];
    let k = j + method.length;
    if (s[k] === "<") return null; // explicit type arguments belong to the call site
    if (s[k] !== "(" || STOP.has(method)) break;
    const close = matchClose(s, k);
    if (close < 0) return null;
    segments.push({ method, args: splitArgs(s.slice(k + 1, close - 1)) });
    i = close;
  }
  return segments.length ? { segments, end: i } : null;
}

/** Builds the service function for one call. Returns null when the call is not supported. */
function analyse(segments) {
  const first = segments[0];
  if (!["from", "rpc"].includes(first.method) || !STRING.test(first.args[0] ?? "")) return null;
  const target = unquote(first.args[0]);
  const params = [];
  const callArgs = [];
  const used = new Set();
  const param = (base, type, value) => {
    let name = base, n = 2;
    while (used.has(name)) name = base + n++;
    used.add(name);
    params.push(`${name}: ${type}`);
    callArgs.push(value);
    return name;
  };

  const dynFilters = [];
  const litFilters = [];
  let op = first.method === "rpc" ? "rpc" : "select";
  let single = false, head = false, insertOne = false;
  let columns = null; // the literal column list of the first select(), if any
  const orderCols = [];

  const body = segments.map(({ method, args }, idx) => {
    let out = args.slice();
    if (idx === 0 && method === "rpc") {
      if (args[1] !== undefined && !isLiteral(args[1])) out[1] = param("args", "object", args[1]);
    } else if (method === "insert" || method === "upsert") {
      op = method;
      const a = args[0].trim();
      const inner = a.startsWith("[") && matchClose(a, 0) === a.length ? splitArgs(a.slice(1, -1)) : null;
      // insert(row) and insert([row]) are the same request; both become insert([row]).
      if (inner && inner.length === 1 && !inner[0].startsWith("...")) { out[0] = `[${param("row", "object", inner[0])}]`; insertOne = true; }
      else if (a.startsWith("{")) { out[0] = `[${param("row", "object", a)}]`; insertOne = true; }
      // A variable may hold one row or a list of rows; insert accepts both.
      else out[0] = param("rows", "object | object[]", a);
      if (args[1] !== undefined && !isLiteral(args[1])) out[1] = param("options", "object", args[1]);
    } else if (method === "update") {
      op = "update";
      out[0] = param("patch", "object", args[0]);
    } else if (method === "delete") {
      op = "delete";
    } else if (method === "select") {
      if (args[0] !== undefined && !isLiteral(args[0])) out[0] = param("columns", "string", args[0]);
      else if (args[0] !== undefined && columns === null && op === "select") { columns = args[0]; out[0] = "@COLS@"; }
      if (args[1] && /head\s*:\s*true/.test(args[1])) head = true;
    } else if (method === "single" || method === "maybeSingle") {
      single = true;
    } else if (FILTERS.has(method) || method === "in") {
      const col = STRING.test(args[0]) ? unquote(args[0]).split(".").pop() : "value";
      if (isLiteral(args[1])) {
        litFilters.push({ col, value: args[1] });
      } else if (method === "in") {
        out[1] = param(camel(pluralize(col)), "readonly (string | number)[]", args[1]);
        dynFilters.push({ word: pascal(pluralize(col)), col, plural: true });
      } else {
        // Ranges and exclusions read better with their direction: dateFrom / dateTo / exceptId.
        const suffix = { gte: "From", lte: "To", gt: "After", lt: "Before" }[method] ?? "";
        const base = method === "neq" ? "except" + pascal(col) : camel(col) + suffix;
        out[1] = param(base, "string | number | boolean", args[1]);
        dynFilters.push({ word: method === "neq" ? "Except" + pascal(col) : pascal(col) + suffix, col, method });
      }
    } else if (method === "or" && !isLiteral(args[0])) {
      out[0] = param("filter", "string", args[0]);
      dynFilters.push({ word: "Filter", col: "" });
    } else if (method === "order") {
      if (STRING.test(args[0] ?? "")) orderCols.push(unquote(args[0]));
    } else {
      out = args.map((a, n) => (isLiteral(a) ? a : param(args.length > 1 ? `${method}${n + 1}` : method, "string | number", a)));
    }
    return `.${method}(${out.join(", ")})`;
  });

  // name
  const prefix = opt.strip.find((p) => target.startsWith(p)) ?? "";
  const words = target.slice(prefix.length).split("_");
  const plural = pascal(words.join("_"));
  const one = pascal([...words.slice(0, -1), singular(words[words.length - 1])].join("_"));
  const byId = dynFilters.some((f) => f.col === "id" && !f.plural && f.method === "eq");
  let name;
  if (op === "rpc") name = camel(target);
  else if (op === "select") name = head ? `count${plural}` : single ? `get${one}` : `list${plural}`;
  else if (op === "insert" || op === "upsert") name = op + (insertOne ? one : plural);
  else name = op + (byId ? one : plural);
  if (dynFilters.length) name += "By" + dynFilters.map((f) => f.word).join("And");
  // Literal filters are part of what the query means, so they go in the name.
  const literalWords = litFilters.map((f) => {
    const values = (f.value.match(/"[^"]*"|'[^']*'/g) ?? []).map((v) => pascal(v.slice(1, -1)));
    return pascal(f.col) + values.join("");
  });
  if (literalWords.length) name += "With" + literalWords.join("And");

  // Suffixes to try, in order, when another query already has this name.
  const alts = [];
  if (orderCols.length) alts.push("OrderedBy" + orderCols.map(pascal).join("And"));
  if (columns !== null) {
    const text = columns.trim().slice(1, -1);
    const plain = text.split(",").map((c) => c.trim());
    if (plain.length <= 3 && plain.every((c) => /^[a-z_][a-z0-9_]*$/.test(c))) alts.push("Of" + plain.map(pascal).join("And"));
    const embeds = [...text.matchAll(/([a-z_][a-z0-9_]*)\s*(?:![a-z0-9_]+)?\s*\(/g)].map((m) => pascal(m[1]));
    if (embeds.length) alts.push("With" + [...new Set(embeds)].slice(0, 3).join("And"));
    if (alts.length > 1) alts.push(alts[0] + alts[alts.length - 1]);
  }

  return { target, params, callArgs, shape: body.join(""), columns, name, alts, op };
}

function pluralize(col) {
  if (col === "id") return "ids";
  if (/(s|x|ch|sh)$/.test(col)) return col + "es";
  if (/[^aeiou]y$/.test(col)) return col.replace(/y$/, "ies");
  return col + "s";
}

/** Fixes each call's final body: a shape used with several column lists takes `columns` as a parameter. */
function resolveColumns(calls) {
  const lists = new Map();
  for (const c of calls) {
    if (c.columns === null) continue;
    lists.set(c.shape, (lists.get(c.shape) ?? new Set()).add(c.columns.replace(/\s+/g, " ")));
  }
  for (const c of calls) {
    if (c.columns === null) { c.body = c.shape; continue; }
    if (lists.get(c.shape).size > 1) {
      // Supabase infers the row type from a literal column list; a variable one has
      // to be typed as "*" or the result becomes an error type.
      c.body = c.shape.replace("@COLS@", 'columns as "*"');
      c.params = [...c.params, "columns: string"];
      c.callArgs = [...c.callArgs, c.columns];
    } else {
      c.body = c.shape.replace("@COLS@", () => c.columns);
    }
  }
}

// ── collect calls ────────────────────────────────────────────────────────────

const CLIENT_DECL = /(?:const|let)\s+(\w+)\s*=\s*(?:useMemo\(\s*\(\)\s*=>\s*)?createClient\(\)/g;

const perFile = [];
const skipped = [];
for (const file of opt.files) {
  const src = fs.readFileSync(file, "utf8");
  const clients = new Set([...src.matchAll(CLIENT_DECL)].map((m) => m[1]));
  const alt = [...clients].map((c) => `\\b${c}\\b`).concat("createClient\\(\\)").join("|");
  const re = new RegExp(`(${alt})\\s*\\.\\s*(from|rpc)\\(`, "g");
  const calls = [];
  let m;
  while ((m = re.exec(src))) {
    if (/[\w$.]$/.test(src.slice(0, m.index))) continue; // part of a longer expression
    const dot = m.index + m[1].length;
    const chain = parseChain(src, dot);
    const info = chain && analyse(chain.segments);
    const line = src.slice(0, m.index).split("\n").length;
    if (!info) { skipped.push(`${file}:${line}`); continue; }
    calls.push({ start: m.index, end: chain.end, line, ...info });
    re.lastIndex = chain.end;
  }
  perFile.push({ file, src, clients, calls });
}
resolveColumns(perFile.flatMap((f) => f.calls));

// ── assign names ─────────────────────────────────────────────────────────────

// Functions already in the service file (written by an earlier run).
const existing = new Map(); // key -> { name, target, params, body }
const FN = /\/\/ @table (\S+)\r?\nexport function (\w+)\((.*)\) \{\r?\n  return db\(\)([\s\S]*?);\r?\n\}/g;
if (fs.existsSync(opt.service)) {
  const current = fs.readFileSync(opt.service, "utf8");
  for (const m of current.matchAll(FN)) {
    const body = m[4].replace(/\r?\n\s*/g, "");
    existing.set(body, { name: m[2], target: m[1], params: m[3], body });
  }
  // The service is rewritten from what was read back, so refuse to run if any function was not understood.
  const declared = (current.match(/^export (async )?function /gm) ?? []).length;
  if (declared !== existing.size) {
    console.error(`${opt.service}: read ${existing.size} of ${declared} functions. Each generated function must keep its "// @table" marker and the "return db()...;" form; hand-written ones belong in another file.`);
    process.exit(1);
  }
}

// Two queries that differ only in layout (line breaks, trailing commas) are the same query.
const keyOf = (body) =>
  body.replace(/\s+/g, " ").replace(/,\s*([}\])])/g, "$1").replace(/([{[(])\s+/g, "$1").replace(/\s+([}\])])/g, "$1");

const registry = new Map([...existing].map(([body, fn]) => [keyOf(body), fn])); // normalised body -> fn
const taken = new Set([...existing.values()].map((f) => f.name));
const autoNames = [];
for (const f of perFile) {
  for (const c of f.calls) {
    let fn = registry.get(keyOf(c.body));
    if (!fn) {
      // On a clash, try a describing suffix (ordering, columns, joined tables) before a number.
      let name = c.name, n = 2;
      for (const alt of c.alts ?? []) {
        if (!taken.has(name)) break;
        name = c.name + alt;
      }
      while (taken.has(name)) name = c.name + n++;
      const auto = name;
      taken.add(auto); // keep numbering stable whether or not the name is overridden
      if (overrides[auto]) {
        name = overrides[auto];
        if (taken.has(name)) throw new Error(`override ${auto} -> ${name}: name already used`);
      }
      taken.add(name);
      fn = { name, auto, target: c.target, params: c.params.join(", "), body: c.body };
      registry.set(keyOf(c.body), fn);
      autoNames.push(fn);
    }
    c.fn = fn.name;
  }
}

if (opt.plan) {
  for (const fn of autoNames) console.log(`${fn.name.padEnd(48)} (${fn.params})\n    db()${fn.body.slice(0, 230)}`);
  console.log(`\n${autoNames.length} new functions from ${perFile.reduce((n, f) => n + f.calls.length, 0)} calls; ${skipped.length} calls skipped`);
  for (const s of skipped) console.log("  skipped: " + s);
  process.exit(0);
}

// ── write the service ────────────────────────────────────────────────────────

function formatBody(body) {
  const oneLine = `  return db()${body};`;
  if (oneLine.length <= 110 && !body.includes("\n")) return oneLine;
  // one chained call per line; a chain segment starts at a top-level ".name("
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(body, i) - 1; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "." && depth === 0 && i > 0) { parts.push(body.slice(start, i)); start = i; }
  }
  parts.push(body.slice(start));
  return `  return db()\n${parts.map((p) => "    " + p).join("\n")};`;
}

const byTable = new Map();
for (const fn of registry.values()) byTable.set(fn.target, [...(byTable.get(fn.target) ?? []), fn]);
const moduleName = path.basename(opt.service).replace(/-service\.ts$/, "");
const out = [
  `// Data access for the ${moduleName} module. Every query and write its screens make`,
  `// goes through here; components do not call the database directly.`,
  `//`,
  `// Each function returns the Supabase query itself, so callers await it (or call`,
  `// .then) and read \`{ data, error }\` as usual. Functions are grouped by table.`,
  `//`,
  `// Generated by scripts/codemods/extract-service.mjs and then maintained by hand.`,
  `// Keep the "// @table" markers: the codemod reads them when it is run again.`,
  ``,
  `import { createClient } from "@/lib/supabase/client";`,
  ``,
  `const db = () => createClient();`,
];
for (const table of [...byTable.keys()].sort()) {
  out.push("", `// ── ${table} ${"─".repeat(Math.max(3, 74 - table.length))}`);
  for (const fn of byTable.get(table).sort((a, b) => a.name.localeCompare(b.name))) {
    out.push("", `// @table ${table}`, `export function ${fn.name}(${fn.params}) {`, formatBody(fn.body), `}`);
  }
}
fs.mkdirSync(path.dirname(opt.service), { recursive: true });
fs.writeFileSync(opt.service, out.join("\n") + "\n");

// ── rewrite call sites ───────────────────────────────────────────────────────

let converted = 0;
for (const f of perFile) {
  if (f.calls.length === 0 && f.clients.size === 0) continue;
  let s = f.src;
  for (const c of [...f.calls].sort((a, b) => b.start - a.start)) {
    s = s.slice(0, c.start) + `${c.fn}(${c.callArgs.join(", ")})` + s.slice(c.end);
    converted++;
  }

  // Drop each client variable that is now only declared (and perhaps listed in hook dependency arrays).
  for (const client of f.clients) {
    const declRe = new RegExp(`^[ \\t]*(?:const|let)\\s+${client}\\s*=\\s*(?:useMemo\\(\\s*\\(\\)\\s*=>\\s*createClient\\(\\)\\s*,\\s*\\[\\]\\s*\\)|createClient\\(\\));?[ \\t]*\\r?\\n`, "gm");
    const withoutDecl = s.replace(declRe, "");
    if (withoutDecl === s) continue;
    // Remove the client from hook dependency arrays: [client] -> [], [client, x] -> [x], [x, client] -> [x].
    // Only these exact forms are touched; nothing else in the file is rewritten.
    const withoutDeps = withoutDecl
      .replace(new RegExp(`\\[\\s*${client}\\s*\\]`, "g"), "[]")
      .replace(new RegExp(`\\[\\s*${client}\\s*,\\s*`, "g"), "[")
      .replace(new RegExp(`,\\s*${client}\\s*(?=,|\\])`, "g"), "");
    // Still used as a value (auth, storage, ...)? Import paths such as "@/lib/supabase/client" do not count.
    if (new RegExp(`(?<![\\w/"'.-])${client}(?![\\w/-])`).test(withoutDeps)) continue;
    s = withoutDeps;
  }

  const names = [...new Set(f.calls.map((c) => c.fn))].sort();
  const importLine = `import { ${names.join(", ")} } from "${serviceImport}";`;
  const clientImport = /^import \{ createClient \} from "@\/lib\/supabase\/client";[ \t]*\r?\n/m;
  const clientUnused = !/createClient\(/.test(s) && clientImport.test(s);
  if (names.length === 0) {
    if (clientUnused) s = s.replace(clientImport, "");
  } else if (clientUnused) {
    s = s.replace(clientImport, importLine + "\n");
  } else {
    const imports = [...s.matchAll(/^import [\s\S]*?from "[^"]+";[ \t]*\r?\n/gm)];
    const last = imports[imports.length - 1];
    const at = last ? last.index + last[0].length : 0;
    s = s.slice(0, at) + importLine + "\n" + s.slice(at);
  }
  if (!/\buseMemo\b\s*[(<]/.test(s)) {
    s = s.replace(/^(import \{[^}]*)\buseMemo\b,?\s*([^}]*\} from "react";)/m, (m, a, b) => (a + b).replace(/,\s*\}/, " }").replace(/\{\s*,/, "{"));
  }
  if (s === f.src) continue;
  fs.writeFileSync(f.file, s);
  console.log(`${path.relative(webRoot, path.resolve(f.file)).replace(/\\/g, "/").padEnd(62)} ${f.calls.length} calls`);
}
console.log(`\n${converted} calls converted into ${registry.size} functions (${autoNames.length} new) in ${opt.service}`);
for (const sk of skipped) console.log("skipped (left as is): " + sk);
