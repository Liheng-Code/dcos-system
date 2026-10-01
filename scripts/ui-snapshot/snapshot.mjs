// Read-only UI snapshot, for checking that a refactor did not change behaviour.
//
// Signs in to the local app, visits each view listed in a views file, and
// records visible text, form-control values and button state. Run it before a
// refactor and again after, then compare the two files with compare.mjs.
//
// It only navigates and clicks tabs and the buttons you list; it never submits
// a form. Do not list a button that saves, deletes or runs something.
//
// Usage (from the repo root, with `pnpm dev` and the local Supabase stack running):
//   node scripts/ui-snapshot/snapshot.mjs <views.json> <out.json>
//
// Sign-in defaults to the seeded demo administrator; override with
// DCOS_SNAPSHOT_EMAIL / DCOS_SNAPSHOT_PASSWORD. DCOS_SNAPSHOT_BASE sets the app
// URL and DCOS_SNAPSHOT_BROWSER a Playwright channel (default "msedge").
//
// views.json is an array of:
//   { "name": "employee",            // label used in the output
//     "url": "/dashboard/hr/employees/<id>",
//     "waitFor": "[role=tablist]",   // selector that means the page has loaded
//     "scope": "main",               // element to record (default "main")
//     "tabs": true,                  // also record after clicking each role=tab
//     "clicks": ["Team Capacity"],   // also record after clicking each named button
//     "freshClicks": ["Add Leave Type"] } // reload, click one button, record (for dialogs)

import fs from "node:fs";
import { chromium } from "playwright";

const [viewsFile, out] = process.argv.slice(2);
if (!viewsFile || !out) {
  console.error("Usage: node scripts/ui-snapshot/snapshot.mjs <views.json> <out.json>");
  process.exit(2);
}
const views = JSON.parse(fs.readFileSync(viewsFile, "utf8"));
const BASE = process.env.DCOS_SNAPSHOT_BASE ?? "http://localhost:3000";
const EMAIL = process.env.DCOS_SNAPSHOT_EMAIL ?? "liheng@dcos.com";
const PASSWORD = process.env.DCOS_SNAPSHOT_PASSWORD ?? "dcosdemo#2026";
// How long to let a page settle after it loads. Raise it (DCOS_SNAPSHOT_SETTLE, in ms)
// for pages that fill in panels late; a view that differs between two runs with no
// code change needs a longer settle.
const SETTLE_MS = Number(process.env.DCOS_SNAPSHOT_SETTLE) || 1500;

const result = { errors: [], views: {} };
const browser = await chromium.launch({ channel: process.env.DCOS_SNAPSHOT_BROWSER ?? "msedge" });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (e) => result.errors.push("pageerror: " + e.message));

async function capture(scope) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document.body;
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const controls = [...root.querySelectorAll("input, select, textarea")].filter(visible).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") ?? "",
      // Password fields are never recorded (some forms pre-fill a random one).
      value: el.type === "checkbox" ? String(el.checked) : el.type === "password" ? "(not recorded)" : el.value,
      disabled: el.disabled,
      options: el.tagName === "SELECT" ? [...el.options].map((o) => o.value + "=" + o.text) : undefined,
    }));
    const buttons = [...root.querySelectorAll("button, a[href]")].filter(visible).map((el) => ({
      text: (el.innerText || el.getAttribute("title") || "").trim().slice(0, 60),
      disabled: el.disabled === true,
      href: el.getAttribute("href") ?? undefined,
      checked: el.getAttribute("aria-checked") ?? undefined,
    }));
    return { text: root.innerText.replace(/\s+\n/g, "\n").trim(), controls, buttons };
  }, scope);
}

async function open(view) {
  await page.goto(BASE + view.url, { waitUntil: "domcontentloaded" });
  // A page without the expected element (no <main>, for instance) is still recorded, from <body>.
  if (view.waitFor) await page.waitForSelector(view.waitFor, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

try {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/(modules|dashboard)/);

  for (const view of views) {
    const scope = view.scope ?? "main";
    try {
      await recordView(view, scope);
      console.log(`recorded ${view.name}`);
    } catch (e) {
      // One broken view must not stop the run; it shows up in the comparison instead.
      result.views[view.name] = { text: "(could not be recorded: " + e.message.split("\n")[0] + ")", controls: [], buttons: [] };
      console.log(`could not record ${view.name}`);
    }
  }
} catch (e) {
  result.errors.push("script: " + e.message.split("\n")[0]);
  console.error("FAILED: " + e.message.split("\n")[0]);
}

async function recordView(view, scope) {
  await open(view);
  result.views[view.name] = await capture(scope);

  if (view.tabs) {
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    for (let i = 0; i < (await tabs.count()); i++) {
      const label = (await tabs.nth(i).innerText()).trim();
      await tabs.nth(i).click();
      await page.waitForTimeout(300);
      result.views[`${view.name} / tab ${label}`] = await capture(scope);
    }
  }
  for (const label of view.clicks ?? []) {
    await page.getByRole("button", { name: label, exact: true }).first().click();
    await page.waitForTimeout(SETTLE_MS);
    result.views[`${view.name} / ${label}`] = await capture(scope);
  }
  for (const label of view.freshClicks ?? []) {
    await open(view);
    await page.getByRole("button", { name: label, exact: true }).first().click();
    await page.waitForTimeout(500);
    result.views[`${view.name} / dialog ${label}`] = await capture("body");
  }
}

fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`${Object.keys(result.views).length} views written to ${out}; ${result.errors.length} page errors`);
// Some browser channels do not exit cleanly on close, so do not wait for it.
browser.close().catch(() => {});
setTimeout(() => process.exit(result.errors.some((e) => e.startsWith("script:")) ? 1 : 0), 1500);
