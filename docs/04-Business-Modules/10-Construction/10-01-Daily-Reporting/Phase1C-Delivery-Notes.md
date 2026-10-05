# Phase 1C — Delivery Notes (Telegram group binding and Mini App)

Date: 2026-10-05. Status: **built and tested with a stubbed Telegram API. Applied to the local database only. The bot `@DCOSSiteReport_Bot` is connected (token verified, command menus set); no group, Mini App or phone test has been done yet.**

Daily Reporting has **its own bot, `@DCOSSiteReport_Bot`**, separate from the attendance bot (`@dcos_Attendance_bot`) and the task-alert bot. It has its own token, webhook and Mini App. The attendance bot and its webhook are unchanged.

## 1. What was built

| Area | Files |
|---|---|
| Group bindings, binding codes, launch tokens, group status outbox, functions | `supabase/migrations/20261005000010_dr_telegram.sql` |
| Database tests (48 assertions) | `supabase/tests/dr_telegram.test.sql` |
| Codes, launch tokens, Mini App session token (pure) | `apps/web/lib/construction/daily-reporting/telegram/tokens.ts` |
| Session exchange, binding, launch button, status-line delivery | `apps/web/lib/construction/daily-reporting/telegram/telegram-server.ts` |
| What the bot does in a group and in a private chat | `apps/web/lib/construction/daily-reporting/telegram/webhook.ts` |
| The bot's webhook | `app/api/dr/telegram/webhook` |
| API routes | `app/api/dr/telegram/session`, `app/api/dr/telegram/bindings`, `app/api/dr/telegram/bindings/[id]` |
| Mini App session accepted by the reporter routes | `requireReporterActor` in `server.ts`; `app/api/dr/{forms,drafts,evidence/upload-url,reports}` |
| Mini App page | `apps/web/app/dr-miniapp/` |
| Setup screen: Telegram groups card | `components/construction/daily-reporting/dr-telegram.tsx` |
| My reports: Link Telegram | `components/construction/daily-reporting/dr-telegram-link.tsx` |
| Local development poller (no public webhook needed) | `scripts/dr-telegram-poll.mjs` |
| Form: re-send after short signal loss | `dr-report-form.tsx` (`retryWhenOnline`) |
| Cron: status lines and launch-button refresh | `app/api/dr/cron/tick/route.ts` |
| Unit tests (37) | `__tests__/telegram.test.ts` |

## 2. How it works

**Identity.** A Telegram user id is the same for every bot, so the link is the existing column `profiles.telegram_user_id`; someone already linked through the attendance bot is linked here too. A reporter who is not linked sees **Link Telegram** on My reports: DCOS shows a 6-digit code (10 minutes) and they send `/link 123456` to the bot in a private chat, or tap the one-tap link. An unlinked account can chat in the group and cannot open the form.

**Direct messages.** Daily Reporting notifications (returned, information requested, missing, and so on) are now sent by this bot to every linked user who has started it. Someone who never started the bot cannot be messaged by it; they still get the in-app alert and email.

**Binding a group.**
1. An approver or administrator opens Setup > Telegram groups and chooses **Bind a group** for a unit. DCOS shows a one-time command, `/bind XXXXXXXX`, valid 30 minutes. Only its hash is stored.
2. They add the bot to the group and post the command there.
3. The bot checks that the person who posted it is a linked user allowed to bind that unit, then activates the binding. One active group per unit, one active unit per group; a unit's previous group is retired and kept as history.
4. The bot posts a **Submit Daily Report** button and pins it (pinning needs the bot to be a group admin; the button works without it).

**Launching.** The button is a link `…?startapp=dr_<token>`. Telegram limits that parameter to 64 characters, so it carries a random id; the claims (binding, unit, expiry of at most 24 hours) are in the database. This replaces the signed claim set in R1 §7.5 and gives the same guarantees. The cron tick re-issues the token when less than 6 hours remain and edits the pinned message in place. `/report` in the group posts a fresh button (at most one a minute).

**Session.** The Mini App sends Telegram's signed `initData` to `POST /api/dr/telegram/session`. A session is issued only if all of these hold, checked in this order:

| Check | Refusal |
|---|---|
| `initData` signature and age (default 1 hour) | 401 |
| A launch token in the start parameter **inside the signed `initData`** (never from the request body) | 403 |
| The Telegram account is linked to an active DCOS user | 403 |
| The token is current, its binding is Active and the unit is Active | 403 |
| The user is a current REPORTER of that unit | 403 |
| Telegram confirms the user is in the bound group right now (`getChatMember`) | 403; 503 if Telegram cannot be reached |

Refusals after the user is known are written to the audit log as `DR.LAUNCH_TOKEN_REJECTED` with the Telegram id hashed.

The session is a signed token valid for 2 hours, for one user and **one unit**. Only four routes accept it: load the form, save a draft, get an evidence upload URL, submit a report. Review, amendment, correction, summary, sync and setup routes do not. A report submitted this way is recorded with channel `TELEGRAM_MINIAPP`; the channel is set by the server from how the caller authenticated, not from the request.

**Status lines.** A database trigger on the audit log queues one line per event for the unit's active group: submitted, resubmitted, amendment sent, approved, returned, information requested. A line contains the report number and the state only. Quantities, findings and review comments never reach the group. Lines are sent after each write and by the cron tick, with three attempts.

**Group changes.**

| Event | Result |
|---|---|
| Bot removed from the group | Binding Suspended, launch links revoked, approvers alerted in-app and by email |
| Bot added back | Binding Active again, new button posted |
| Group upgraded to a supergroup (new chat id) | Old binding Migrated; a Pending binding for the new id waits for **Confirm** in Setup; approvers alerted |
| Unbind in Setup | Binding Unbound, links revoked, row kept |

**Short signal loss.** In the Mini App, a submit that fails for lack of connection keeps the report on the device, shows "Saved on device — not yet sent" and retries every 15 seconds and on reconnect, with the same idempotency key, while the page stays open. Full offline remains the Field App's job.

## 3. Verified

| Check | Result |
|---|---|
| Migration applies; the final file replays in a rolled-back transaction | Pass |
| `supabase/tests/dr_telegram.test.sql` | 48 assertions pass |
| `dr_daily_reporting.test.sql`, `dr_offline_sync.test.sql` (unchanged behaviour) | Pass |
| Unit tests `telegram.test.ts` | 37 pass |
| Whole unit suite | 513 pass, 11 skipped (opt-in integration tests) |
| TypeScript, ESLint (including module boundaries) | No errors |
| Production build | Pass; new routes and `/dr-miniapp` compiled |
| Bot token | `getMe` confirms `@DCOSSiteReport_Bot`, can join groups, group privacy mode on, no webhook set |
| Bot command menus | Set: `/start`, `/link`, `/help` in private chats; `/report`, `/bind` in groups |
| Webhook route on the local dev server | 401 without or with a wrong secret, 200 with the right one; session and submit routes refuse a missing or forged token |

Abuse cases covered by tests: `initData` signed with another bot token; start parameter swapped after signing; stale `initData`; no launch token; unlinked or inactive account; expired, revoked or foreign launch token; group member who is not a reporter; reporter who left or was removed from the group; Telegram unreachable (fails closed); forged, tampered or expired session token; a session used for another unit; binding code that is wrong, expired, already used, posted by someone not allowed, or posted in a private chat; one group bound to two units.

## 4. Not verified, or not done

| Item | Detail |
|---|---|
| **Group and Mini App flows against live Telegram** | Only `getMe`, `getWebhookInfo` and `setMyCommands` were called on the real bot. Binding a real group, `getChatMember`, pinning, editing the pinned message, group migration and bot removal are tested with a stubbed API only. R1 §25 items 1–8 are still open. |
| **Webhook registration** | Not set. It must point at a deployment that has this code; production does not have it yet. Locally, `scripts/dr-telegram-poll.mjs` stands in for it. |
| **Mini App registration** | Not done (BotFather, by the owner). Until `TELEGRAM_DR_MINIAPP_LINK` is set, binding works but no Submit Daily Report button is posted. A Mini App needs a public HTTPS address, so it cannot be tested against localhost. |
| **How the Mini App opens from a group** | The design assumes a direct link `https://t.me/<bot>/<app>?startapp=…` opens the Mini App from a group and delivers the start parameter in `initData`. This is the documented behaviour but was not seen on a device. If it does not hold, `/report` and the button need a different link form; the server side does not change. |
| **Mini App page in a real Telegram web view** | Built and compiled, never opened in Telegram. Camera and file access inside the web view are untested. |
| **Setup card in a browser** | Not walked through. |
| **Link codes** | The 6-digit link code is shared with the attendance flow and is not rate limited per Telegram account. |
| **SMS fallback** | Not built. A user who has not started the bot privately gets in-app and email only. |
| **Session revocation** | A Mini App session lasts up to 2 hours and is not revoked early if the user is removed from the group meanwhile. Removal from the unit takes effect immediately, because every route re-checks membership. |
| **Gateway integration test with a Mini App session** | Not added; the opt-in integration test needs a disposable database. |
| **Khmer text** | Bot messages and the Mini App are English only. |

## 5. Decisions made while building (please confirm)

1. **A dedicated bot**, `@DCOSSiteReport_Bot` (owner's decision, 2026-10-05). There is no fallback to the attendance bot's token: without `TELEGRAM_DR_BOT_TOKEN` the Telegram channel is simply off.
2. **Daily Reporting direct messages moved to this bot.** They no longer use the attendance bot or the chat id saved in notification preferences. They go to anyone linked, unless that user has switched Telegram notifications off.
3. **Who may bind a group:** a project approver (or the Project Manager when no approver is set) or a system administrator. R1 says Company Admin or PM.
4. **Opaque launch token instead of a signed one**, because of the 64-character limit.
5. **A migrated group must be confirmed** before its button works again (R1 §7.4). Reporting from that group pauses until someone confirms; the Field App and dashboard are unaffected.
6. **Mini App sessions are for new reports only.** Corrections, answers to information requests and amendments stay in the dashboard and Field App.
7. **`/report` can be used by anyone in the group.** The link alone grants nothing.

## 6. To deploy

1. Apply `20261005000010_dr_telegram.sql` after the 1A and 1B migrations. Apply it from Git Bash (`psql < file`), not through PowerShell `Get-Content`, which corrupts the dash characters in the status lines.
2. In BotFather, send `/newapp`, choose `@DCOSSiteReport_Bot`, and give `<app url>/dr-miniapp` as the Web App URL. Note the direct link it returns (`https://t.me/DCOSSiteReport_Bot/<short name>`).
3. Environment on the deployment:
   - `TELEGRAM_DR_BOT_TOKEN` — the bot's token.
   - `TELEGRAM_DR_WEBHOOK_SECRET` — any long random string.
   - `NEXT_PUBLIC_TELEGRAM_DR_BOT_USERNAME` — `DCOSSiteReport_Bot`.
   - `TELEGRAM_DR_MINIAPP_LINK` — the direct link from step 2, without a query string. Without it no launch button is posted.
   - `DR_MINIAPP_SESSION_SECRET` — optional. If unset, the session secret is derived from the bot token, so rotating the bot token ends all Mini App sessions.
   - Existing: `CRON_SECRET`.
4. Register the webhook once the code is deployed:
   `https://api.telegram.org/bot<token>/setWebhook` with `url=<app url>/api/dr/telegram/webhook`, `secret_token=<TELEGRAM_DR_WEBHOOK_SECRET>`, `allowed_updates=["message","my_chat_member"]`.
5. Keep `GET /api/dr/cron/tick` scheduled: it now also refreshes launch buttons, which expire after 24 hours.
6. Regenerate `database.types.ts`.

## 7. Testing on this machine before deployment

Telegram cannot reach localhost, so run the poller beside the dev server:

```bash
node scripts/dr-telegram-poll.mjs
```

It fetches the bot's updates and forwards them to `/api/dr/telegram/webhook` with the secret. With it running you can link an account (`/start`, `/link`), bind a test group (`/bind`), see status lines arrive, and remove and re-add the bot. The Submit Daily Report button and the Mini App need a public HTTPS address and are not testable this way. Stop the poller before registering a webhook; Telegram allows one or the other.

## 8. Change to the documented migration procedure

While applying the 1A and 1B migrations on this machine, the PowerShell recipe in `CLAUDE.md` (`Get-Content … | docker exec … psql`) turned every em dash in the SQL into mojibake, including status values in 45 functions and one check constraint. The dry run passed; `dr_offline_sync.test.sql` caught it. The functions and the constraint were re-created with the correct encoding and all three test files pass. `CLAUDE.md` still shows the PowerShell recipe and should be corrected.
