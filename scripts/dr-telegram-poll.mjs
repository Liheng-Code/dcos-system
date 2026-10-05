// Local development only: lets the Daily Reporting bot (@DCOSSiteReport_Bot)
// work against the dev server on this machine, which Telegram cannot reach.
// It long-polls Telegram for updates and forwards each one to the local
// webhook route exactly as Telegram would.
//
//   node scripts/dr-telegram-poll.mjs            (dev server on http://localhost:3000)
//   node scripts/dr-telegram-poll.mjs http://localhost:3100
//
// Telegram refuses getUpdates while a webhook is registered, so this cannot
// run for a bot whose webhook points at a deployment. Stop with Ctrl+C.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const token = env.TELEGRAM_DR_BOT_TOKEN;
const secret = env.TELEGRAM_DR_WEBHOOK_SECRET;
if (!token || !secret) {
  console.error("TELEGRAM_DR_BOT_TOKEN and TELEGRAM_DR_WEBHOOK_SECRET must be set in apps/web/.env.local");
  process.exit(1);
}

const target = `${(process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "")}/api/dr/telegram/webhook`;
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const hook = await api("getWebhookInfo", {});
if (hook.result?.url) {
  console.error(`This bot has a webhook registered (${hook.result.url}); polling is not possible while it is set.`);
  process.exit(1);
}

console.log(`Forwarding updates for the Daily Reporting bot to ${target}`);
let offset = 0;
for (;;) {
  let res;
  try {
    res = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "my_chat_member"] });
  } catch (e) {
    console.error("getUpdates failed:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  if (!res.ok) {
    console.error("getUpdates:", res.description);
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  for (const update of res.result) {
    offset = update.update_id + 1;
    const chat = update.message?.chat ?? update.my_chat_member?.chat;
    const what = update.my_chat_member ? `bot is now ${update.my_chat_member.new_chat_member?.status}` : (update.message?.text ?? "(service message)");
    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
        body: JSON.stringify(update),
      });
      console.log(`${new Date().toLocaleTimeString()} ${chat?.type ?? "?"} ${chat?.title ?? chat?.id ?? ""}: ${what} -> ${r.status}`);
    } catch (e) {
      console.error(`could not reach ${target}: ${e.message}`);
    }
  }
}
