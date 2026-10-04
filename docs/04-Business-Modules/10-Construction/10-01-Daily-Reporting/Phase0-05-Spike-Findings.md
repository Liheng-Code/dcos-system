# Phase 0 — Spike Findings

Two kinds of result are kept apart: **Verified in docs** (read from Telegram's official pages on 2026-10-04) and **Not verified** (needs a bot token, a test group, or physical devices, which this session does not have). No spike was run against live systems.

> **Correction (2026-10-04):** the app already has a Telegram bot, webhook, `initData` verification, account linking and a Mini App (HR leave). §2 below (Supabase session minting) is therefore not needed, and "No `supabase/functions` directory" is wrong. See `Phase1A-Delivery-Notes.md` §6.

## 1. Telegram (design §25 items 1–8)

| # | Item | Result | Basis |
|---|---|---|---|
| 1a | Launch from a group | A **direct link** (`https://t.me/<bot>/<app>?startapp=<param>`) works from a group and gives `chat_type` and `chat_instance`. | Verified in docs |
| 1b | Does `initData` give the group chat ID? | **No** for direct-link launch. Only `chat_type` and `chat_instance`. The full `chat` object (with id) is returned only for the attachment menu and chat join requests. R1's decision not to rely on `initData` for the group is **correct**. | Verified in docs |
| 1c | `start_param` | Docs say `start_param` for the `startattach` parameter on attachment-menu launches. Behaviour for `startapp` direct links should be confirmed live; the signed launch token can be carried in the link's parameter regardless. Telegram limits this parameter's length and character set, so the token must be a short opaque ID looked up server-side, not a long JWT. | Partly verified; **confirm live** |
| 1d | `chat_instance` usefulness | A stable ID per chat for this launch type, but not the Bot API chat ID. It could be stored at first launch to cross-check later launches. Not enough to authenticate the group. | Verified in docs (semantics); design use is a proposal |
| 2 | Group → supergroup migration | Messages carry `migrate_to_chat_id` / `migrate_from_chat_id`. Exact update delivery to the bot not confirmed from the excerpt. | Partly verified; **confirm live** |
| 3 | Privacy mode | When enabled the bot receives: commands addressed to it, `/start`-style general commands if it was the last bot to message, messages sent via the bot, and replies to its messages. It can still send messages. Pinning needs the admin right `can_pin_messages` (not covered in what was fetched). | Verified in docs (receive side); pinning **confirm live** |
| 4 | Membership check at launch (`getChatMember`) | Not covered by the pages fetched. Expected to work if the bot is a member of the group; may be restricted for large groups. | **Not verified** |
| 5 | Local storage in Mini App | Telegram provides `DeviceStorage` (5 MB per user per bot), `CloudStorage` (1024 items) and `SecureStorage` (10 items). Browser `localStorage`/IndexedDB not described in the docs. Photos cannot live in DeviceStorage; draft text can. | Verified in docs (APIs); WebView limits **not verified** |
| 6 | Rate limits | Documented: about 1 message/second per chat, 20 messages/minute per group, about 30 messages/second broadcast. One status line per submission is far below that for realistic volumes. | Verified in docs |
| 7 | DM to a user who never started the bot | Docs fetched do not state it. Common knowledge is that bots cannot initiate DMs. Keep the in-app/SMS fallback. | **Not verified** |
| 8 | Camera / location in Mini App | `LocationManager` exists. No camera API is documented; `showScanQrPopup` is a QR popup only. Photo capture would rely on a file input (`<input type=file capture>`) in the WebView. | Verified in docs (APIs); capture behaviour **not verified** |
| 9 | SMS fallback provider and cost | Not researched. Needs a provider choice for the deployment country. | **Not done** |

### Implications for the build

- Telegram-launched evidence capture may be weaker than the Field App. Plan the Mini App as "form + quick photos", and keep heavy photo work for the Field App.
- Initial design for the link: `startapp=<short random launch ID>`; server maps ID → binding, expiry and `jti`. Do not embed claims in the link.
- initData validation: HMAC with the bot token plus `auth_date` freshness. Ed25519 third-party validation is available but not needed since DCOS holds the bot token.

### Live checks to run before 1C starts (needs a bot and a test group)

1. Create a bot, a basic group and a supergroup. Post a direct link with `startapp`. Log `initData` from the Mini App on Android, iOS and Desktop. Record `chat_type`, `chat_instance`, `start_param`.
2. Convert the basic group to a supergroup. Record the updates the bot receives and whether the old ID continues to work.
3. Call `getChatMember` for a normal member, a non-member, and a user who left. Run it with the bot as normal member and as admin.
4. Pin a message with and without the admin right.
5. Open the Mini App with no signal and record behaviour.

## 2. Supabase session minting (ADR-4)

| Question | Status |
|---|---|
| Can an edge function produce a session for an existing user without a password? | Expected via the admin API (`generateLink` for a magic link, then `verifyOtp` with the returned token hash on the client). **Not tested.** Another option is signing a JWT with the project JWT secret, which gives control over claims but ties the function to the signing key. |
| Is there an edge function setup in the repo? | No `supabase/functions` directory. The Supabase MCP can deploy functions, but the repo has no convention yet. |
| Does `profiles` hold what the JWT hook needs (`company_id`)? | Hook exists (`20260623000001`). A session minted by link flow should pass through the same hook. **Verify.** |

Spike to run (small, 1 day): an edge function that takes a user ID and returns a session, called from a throwaway page; confirm the JWT hook runs and RLS sees `auth.uid()`.

## 3. PWA offline (design §12, G13)

Not run: it needs physical devices. Checklist for the 1B spike:

1. Build a minimal installable PWA in the existing Next.js app (manifest, service worker, IndexedDB write of a 20-photo draft).
2. Android Chrome: install, go offline, create draft, restart device, confirm data survives.
3. iOS Safari: same, both installed to home screen and not installed. Record eviction after 7+ days idle on a test device if possible.
4. Confirm `navigator.storage.persist()` result on each.
5. Check Next.js 16 service-worker guidance in `apps/web/node_modules/next/dist/docs/` before choosing a plugin (the repo's `apps/web/CLAUDE.md` warns that conventions changed).

## 4. Decision gates produced

| Gate | Blocks | Condition to pass |
|---|---|---|
| Telegram live checks (§1) | Phase 1C only | Items 1–3 recorded and match assumptions |
| Session minting spike (§2) | Phase 1C only | Session accepted by RLS and JWT hook |
| PWA device checks (§3) | Phase 1B only | Android and iOS survive restart with persistent storage granted |

Phase 1A has no dependency on any spike.
