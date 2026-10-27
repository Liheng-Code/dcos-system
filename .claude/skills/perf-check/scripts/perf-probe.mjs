// perf-check probe: opens DCOS pages in headless Chromium against the LOCAL stack and reports, per page, the
// Supabase requests the browser makes and how many sequential "rounds" they form (a request is in round n+1 when it
// starts after a round-n request finished). On production every round costs one internet round trip, so rounds,
// not local milliseconds, predict how slow a page feels there.
//
// Usage (from the repo root, dev server running on :3100):
//   node .claude/skills/perf-check/scripts/perf-probe.mjs [--pages /dashboard,/dashboard/qs] [--project PRJ-2026-004-PC]
//        [--tabs overview,boq] [--clicks] [--email liheng@dcos.com] [--app http://localhost:3100] [--json out.json]
//        [--baseline previous.json]
// Keys come from `supabase status -o env` at run time; nothing is printed or written except the results.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(ROOT, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require(path.join(ROOT, "node_modules/playwright"));

// ---- arguments ---------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const APP = opt("app", "http://localhost:3100").replace(/\/$/, "");
const EMAIL = opt("email", "liheng@dcos.com");
const PROJECT = opt("project", null);
const PAGES = opt("pages", PROJECT ? "" : "/dashboard,/dashboard/planning/gantt,/dashboard/qs,/dashboard/tenders").split(",").filter(Boolean);
const POST_TABS = ["overview", "team", "contract", "boq", "variations", "claims", "payments", "scurve", "tender", "settings"];
const TABS = (opt("tabs", null)?.split(",") ?? (PROJECT ? POST_TABS : [])).filter(Boolean);
const CLICKS = flag("clicks") && PROJECT;
const JSON_OUT = opt("json", null);
const BASELINE = opt("baseline", null);

// ---- local stack only ----------------------------------------------------------------------------------------------
const cli = path.join(ROOT, "node_modules/.bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
// one command string (no args array): Windows needs a shell for the .cmd shim
const status = spawnSync(`"${cli}" status -o env`, { cwd: ROOT, encoding: "utf8", shell: true });
const env = Object.fromEntries(
  (status.stdout || "").split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const API = env.API_URL;
if (!API || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Could not read the local stack from `supabase status`. Is it running?");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) throw new Error(`Refusing to run against a non-local Supabase: ${API}`);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) throw new Error(`Refusing to run against a non-local app: ${APP}`);

// ---- session: a magic-link sign-in on the local auth server, stored as the @supabase/ssr cookie ------------------
const admin = createClient(API, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) throw linkErr;
const anon = createClient(API, env.ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (otpErr) throw otpErr;
const cookieKey = `sb-${new URL(API).hostname.split(".")[0]}-auth-token`;
const value = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
const cookies = [];
if (value.length <= 3180) cookies.push({ name: cookieKey, value });
else for (let i = 0, n = 0; i < value.length; i += 3180, n++) cookies.push({ name: `${cookieKey}.${n}`, value: value.slice(i, i + 3180) });

// ---- browser ------------------------------------------------------------------------------------------------------
function findChrome() {
  const base = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (!base || !fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    const exe = path.join(base, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || findChrome() });
const ctx = await browser.newContext();
await ctx.addCookies(cookies.map((c) => ({ ...c, domain: new URL(APP).hostname, path: "/" })));
const page = await ctx.newPage();

let log = [];
const serverNav = [];
const inflight = new Map();
page.on("request", (r) => {
  if (r.url().startsWith(API)) inflight.set(r, { url: r.url(), method: r.method(), start: Date.now() });
  else if (r.url().startsWith(APP) && (r.headers()["rsc"] || r.url().includes("_rsc="))) serverNav.push(r.url());
});
const done = (r) => {
  const e = inflight.get(r);
  if (e) { e.end = Date.now(); log.push(e); inflight.delete(r); }
};
page.on("requestfinished", done);
page.on("requestfailed", done);

async function quiet(ms = 1500, max = 45000) {
  const t0 = Date.now();
  let last = Date.now();
  while (Date.now() - t0 < max) {
    await page.waitForTimeout(100);
    if (inflight.size) last = Date.now();
    else if (Date.now() - last > ms) return;
  }
}

const results = [];
function summarise(label, t0) {
  const reqs = log.filter((e) => e.start >= t0).sort((a, b) => a.start - b.start);
  for (const r of reqs) r.round = 1 + Math.max(0, ...reqs.filter((q) => q !== r && q.end <= r.start).map((q) => q.round ?? 1));
  const byPath = {};
  for (const r of reqs) {
    const p = `${r.method} ${new URL(r.url).pathname.replace(/^\/(rest|auth)\/v1/, "")}`;
    byPath[p] = (byPath[p] || 0) + 1;
  }
  results.push({
    label,
    requests: reqs.length,
    rounds: Math.max(0, ...reqs.map((r) => r.round)),
    localMs: reqs.length ? Math.max(...reqs.map((r) => r.end)) - t0 : 0,
    serverNav: serverNav.splice(0).length,
    slowest: reqs.map((r) => ({ ms: r.end - r.start, path: new URL(r.url).pathname })).sort((a, b) => b.ms - a.ms).slice(0, 3),
    repeated: Object.entries(byPath).filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} x${n}`),
  });
}

const projectUrl = (t) => `${APP}/dashboard/projects/${encodeURIComponent(PROJECT)}/${t}`;
const targets = [...TABS.map((t) => ({ label: `load ${PROJECT}/${t}`, url: projectUrl(t) })), ...PAGES.map((p) => ({ label: `load ${p}`, url: APP + p }))];

// warm-up: the dev server compiles a route on its first visit; timings should be about data, not compilation
for (const t of targets) { await page.goto(t.url); await quiet(800); }
for (const t of targets) { log = []; serverNav.length = 0; const t0 = Date.now(); await page.goto(t.url); await quiet(); summarise(t.label, t0); }

if (CLICKS) {
  await page.goto(projectUrl(TABS[0] ?? "overview"));
  await quiet();
  for (const t of [...TABS.slice(1), TABS[0] ?? "overview"]) {
    const label = { boq: "BOQ", scurve: "S-Curve" }[t] ?? t[0].toUpperCase() + t.slice(1);
    log = []; serverNav.length = 0;
    const t0 = Date.now();
    const target = page.getByRole("button", { name: label, exact: true }).or(page.getByRole("link", { name: label, exact: true })).first();
    try { await target.click({ timeout: 5000 }); } catch { results.push({ label: `click ${t}`, skipped: "no tab with that label" }); continue; }
    await quiet();
    summarise(`click ${t}`, t0);
  }
}
await browser.close();

// ---- report -------------------------------------------------------------------------------------------------------
const base = BASELINE && fs.existsSync(BASELINE) ? Object.fromEntries(JSON.parse(fs.readFileSync(BASELINE, "utf8")).map((r) => [r.label, r])) : {};
const delta = (now, before) => (before == null ? "" : now === before ? " (=)" : ` (${now > before ? "+" : ""}${now - before})`);
console.log(`perf-check  ${new Date().toISOString()}  user ${EMAIL}  (dev mode runs effects twice: production makes ~half the requests; rounds are comparable)`);
console.log("page".padEnd(46) + "requests".padStart(14) + "rounds".padStart(12) + "local ms".padStart(10) + "  server-nav  repeated");
for (const r of results) {
  if (r.skipped) { console.log(`${r.label.padEnd(46)}  skipped: ${r.skipped}`); continue; }
  const b = base[r.label];
  console.log(
    r.label.padEnd(46) +
    `${r.requests}${delta(r.requests, b?.requests)}`.padStart(14) +
    `${r.rounds}${delta(r.rounds, b?.rounds)}`.padStart(12) +
    String(r.localMs).padStart(10) +
    String(r.serverNav).padStart(12) + "  " +
    r.repeated.slice(0, 4).join(", "),
  );
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
