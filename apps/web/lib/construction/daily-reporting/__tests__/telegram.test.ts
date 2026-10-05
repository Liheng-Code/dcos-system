// Module 10-01 Daily Reporting — Phase 1C Telegram: tokens, session exchange
// abuse cases, group bot handlers and the Mini App session on the gateway.

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ marker: "admin" }),
  createUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { actorMayUseUnit, requireReporterActor } from "../server";
import { formatReportForGroup } from "../telegram/report-summary";
import { drainGroupOutbox, exchangeMiniAppSession, launchUrl, miniAppSessionSecret, sendDirectMessage } from "../telegram/telegram-server";
import {
  hashToken,
  launchStartParam,
  newBindingCode,
  newLaunchToken,
  normalizeBindingCode,
  parseLaunchStartParam,
  signMiniAppSession,
  verifyMiniAppSession,
} from "../telegram/tokens";
import { handleDrBotUpdate } from "../telegram/webhook";

const BOT_TOKEN = "123456:TEST-TOKEN";
const USER = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";
const OTHER_UNIT = "33333333-3333-4333-8333-333333333333";
const BINDING = "44444444-4444-4444-8444-444444444444";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const CHAT = -1001234;
const TG_USER = 777001;

/** Builds initData signed the way Telegram signs it. */
function initData(opts: { startParam?: string; userId?: number; ageSeconds?: number; botToken?: string } = {}): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 5)));
  params.set("user", JSON.stringify({ id: opts.userId ?? TG_USER, first_name: "Sok" }));
  if (opts.startParam !== undefined) params.set("start_param", opts.startParam);
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(opts.botToken ?? BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

interface FakeOptions {
  profile?: { id: string; status: string } | null;
  memberships?: { valid_from: string; valid_to: string | null }[];
  binding?: { id: string } | null;
  recentTokens?: { id: string }[];
  outbox?: { id: string; chat_id: number; text: string; attempts: number }[];
  linkCode?: { id: string; employee_id: string } | null;
  /** Extra tables, by name. */
  tables?: Record<string, unknown>;
  profileUpdateError?: { code: string; message: string };
  rpc?: Record<string, { data?: unknown; error?: { message: string } | null }>;
}

/** Just enough of the Supabase client for these code paths. */
function fakeAdmin(opts: FakeOptions = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const tableData: Record<string, unknown> = {
    profiles: opts.profile === undefined ? { id: USER, status: "active" } : opts.profile,
    dr_reporting_unit_members: opts.memberships ?? [{ valid_from: "2020-01-01", valid_to: null }],
    dr_telegram_bindings: opts.binding === undefined ? { id: BINDING } : opts.binding,
    dr_telegram_launch_tokens: opts.recentTokens ?? [],
    dr_telegram_group_outbox: opts.outbox ?? [],
    telegram_link_codes: opts.linkCode ?? null,
    ...(opts.tables ?? {}),
  };
  const chain = (table: string) => {
    const result: { data: unknown; error: unknown } = { data: tableData[table] ?? null, error: null };
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "gt", "lt", "order", "limit"]) c[m] = () => c;
    c.update = (values: Record<string, unknown>) => {
      updates.push({ table, values });
      if (table === "profiles" && opts.profileUpdateError) result.error = opts.profileUpdateError;
      return c;
    };
    c.maybeSingle = async () => result;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return c;
  };
  const admin = {
    from: (table: string) => chain(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const preset = opts.rpc?.[name];
      if (preset) return { data: preset.data ?? null, error: preset.error ?? null };
      if (name === "dr_tg_resolve_launch") {
        return { data: { binding_id: BINDING, unit_id: UNIT, project_id: PROJECT, chat_id: CHAT, unit_name: "Sub One", unit_code: "SC-1" }, error: null };
      }
      if (name === "dr_unit_schedule") return { data: [{ timezone: "Asia/Phnom_Penh" }], error: null };
      return { data: null, error: null };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, rpcCalls, updates };
}

interface BotCall {
  method: string;
  body: Record<string, unknown>;
}

/** Stubs the Bot API. `answers` maps a method to its result, or to an HTTP status to fail with. */
function stubTelegram(answers: Record<string, unknown> = {}): BotCall[] {
  const calls: BotCall[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const method = url.split("/").pop() as string;
    calls.push({ method, body: JSON.parse(init.body) });
    const answer = answers[method];
    if (typeof answer === "number") {
      return { ok: false, status: answer, json: async () => ({ ok: false, description: "failed" }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: answer ?? { message_id: 99 } }) };
  });
  return calls;
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_DR_BOT_TOKEN", BOT_TOKEN);
  // The attendance bot has its own token; Daily Reporting must never fall back to it.
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "999:ATTENDANCE-BOT");
  vi.stubEnv("TELEGRAM_DR_MINIAPP_LINK", "https://t.me/dcos_test_bot/report");
  vi.stubEnv("DR_MINIAPP_SESSION_SECRET", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("codes and launch tokens", () => {
  it("binding codes are 8 unambiguous characters and survive being typed in lower case", () => {
    const code = newBindingCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(normalizeBindingCode(`  ${code.toLowerCase()} `)).toBe(code);
    expect(normalizeBindingCode("SHORT")).toBeNull();
    expect(normalizeBindingCode("ABCD-EFGH")).toBeNull();
  });

  it("a launch start parameter fits Telegram's 64-character limit and round-trips", () => {
    const token = newLaunchToken();
    const param = launchStartParam(token);
    expect(param.length).toBeLessThanOrEqual(64);
    expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseLaunchStartParam(param)).toBe(token);
  });

  it("start parameters that are not ours are ignored", () => {
    expect(parseLaunchStartParam(undefined)).toBeNull();
    expect(parseLaunchStartParam("link_123456")).toBeNull();
    expect(parseLaunchStartParam("dr_short")).toBeNull();
    expect(parseLaunchStartParam("dr_bad token with spaces!!")).toBeNull();
  });

  it("only a hash of a token is stored, and the launch URL carries the token", () => {
    const token = newLaunchToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(launchUrl(token)).toBe(`https://t.me/dcos_test_bot/report?startapp=dr_${token}`);
  });
});

describe("Mini App session token", () => {
  const claims = { uid: USER, unit: UNIT, binding: BINDING, exp: Math.floor(Date.now() / 1000) + 600 };

  it("verifies its own signature", () => {
    expect(verifyMiniAppSession(signMiniAppSession(claims, "s1"), "s1")).toEqual(claims);
  });

  it("rejects another secret, a tampered body, an expired token and garbage", () => {
    const token = signMiniAppSession(claims, "s1");
    expect(verifyMiniAppSession(token, "s2")).toBeNull();

    const [, body, mac] = /^drm\.([^.]+)\.(.+)$/.exec(token) as RegExpExecArray;
    const forged = Buffer.from(JSON.stringify({ ...claims, unit: OTHER_UNIT })).toString("base64url");
    expect(verifyMiniAppSession(`drm.${forged}.${mac}`, "s1")).toBeNull();
    expect(verifyMiniAppSession(`drm.${body}.`, "s1")).toBeNull();

    expect(verifyMiniAppSession(signMiniAppSession({ ...claims, exp: 1 }, "s1"), "s1")).toBeNull();
    expect(verifyMiniAppSession("drm.not-a-token", "s1")).toBeNull();
    expect(verifyMiniAppSession("Bearer something", "s1")).toBeNull();
  });
});

describe("session exchange", () => {
  const launch = launchStartParam(newLaunchToken());

  it("issues a session for the launched unit when every check passes", async () => {
    const calls = stubTelegram({ getChatMember: { status: "member" } });
    const { admin, rpcCalls } = fakeAdmin();
    const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unit.id).toBe(UNIT);
    expect(result.can_submit).toBe(true);
    expect(result.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(verifyMiniAppSession(result.token, miniAppSessionSecret())).toMatchObject({ uid: USER, unit: UNIT, binding: BINDING });
    // The database sees only the hash of the launch token.
    const resolve = rpcCalls.find((c) => c.name === "dr_tg_resolve_launch");
    expect(resolve?.args.p_token_hash).toBe(hashToken(parseLaunchStartParam(launch) as string));
    // Membership is asked about the bound chat and the Telegram user who signed the initData.
    expect(calls[0]).toEqual({ method: "getChatMember", body: { chat_id: CHAT, user_id: TG_USER } });
  });

  it("refuses initData signed by another bot, including the attendance bot", async () => {
    stubTelegram();
    const { admin, rpcCalls } = fakeAdmin();
    expect(await exchangeMiniAppSession(admin, initData({ startParam: launch, botToken: "999:ATTENDANCE-BOT" }))).toMatchObject({ ok: false, status: 401 });
    const result = await exchangeMiniAppSession(admin, initData({ startParam: launch, botToken: "999:OTHER" }));
    expect(result).toMatchObject({ ok: false, status: 401, code: "DR_TG_INIT_DATA" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses initData whose start parameter was swapped after signing", async () => {
    stubTelegram();
    const { admin } = fakeAdmin();
    const tampered = initData({ startParam: "dr_someone-elses-token-0000" }).replace(/start_param=[^&]+/, `start_param=${launch}`);
    expect(await exchangeMiniAppSession(admin, tampered)).toMatchObject({ ok: false, status: 401, code: "DR_TG_INIT_DATA" });
  });

  it("refuses stale initData (a replayed capture)", async () => {
    stubTelegram();
    const { admin } = fakeAdmin();
    const result = await exchangeMiniAppSession(admin, initData({ startParam: launch, ageSeconds: 7200 }));
    expect(result).toMatchObject({ ok: false, status: 401, code: "DR_TG_INIT_DATA" });
  });

  it("refuses a launch without a launch token", async () => {
    stubTelegram();
    const { admin } = fakeAdmin();
    expect(await exchangeMiniAppSession(admin, initData())).toMatchObject({ ok: false, status: 403, code: "DR_TG_LAUNCH" });
    expect(await exchangeMiniAppSession(admin, initData({ startParam: "link_123456" }))).toMatchObject({ ok: false, code: "DR_TG_LAUNCH" });
  });

  it("refuses a Telegram account that is not linked to an active DCOS user", async () => {
    stubTelegram();
    for (const profile of [null, { id: USER, status: "inactive" }]) {
      const { admin, rpcCalls } = fakeAdmin({ profile });
      const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));
      expect(result).toMatchObject({ ok: false, status: 403, code: "DR_TG_NOT_LINKED" });
      expect(rpcCalls.some((c) => c.name === "dr_tg_resolve_launch")).toBe(false);
    }
  });

  it("refuses an expired, revoked or foreign launch token and audits the attempt", async () => {
    stubTelegram();
    const { admin, rpcCalls } = fakeAdmin({
      rpc: { dr_tg_resolve_launch: { error: { message: "DR_FORBIDDEN: the launch link is invalid or has expired; ask for a new one" } } },
    });
    const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));
    expect(result).toMatchObject({ ok: false, status: 403, code: "DR_TG_LAUNCH" });
    if (!result.ok) expect(result.error).toContain("expired");
    const audit = rpcCalls.find((c) => c.name === "dr_audit");
    expect(audit?.args).toMatchObject({ p_event: "DR.LAUNCH_TOKEN_REJECTED", p_actor: USER });
    // The raw Telegram id never goes into the audit trail.
    expect(JSON.stringify(audit?.args)).not.toContain(String(TG_USER));
  });

  it("refuses someone in the group who is not a reporter of the unit", async () => {
    const calls = stubTelegram({ getChatMember: { status: "member" } });
    for (const memberships of [[], [{ valid_from: "2020-01-01", valid_to: "2020-12-31" }], [{ valid_from: "2999-01-01", valid_to: null }]]) {
      const { admin } = fakeAdmin({ memberships });
      const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));
      expect(result).toMatchObject({ ok: false, status: 403, code: "DR_TG_NOT_REPORTER" });
    }
    expect(calls).toHaveLength(0);
  });

  it("lets an approver or administrator of the project open the form, read-only", async () => {
    stubTelegram({ getChatMember: { status: "administrator" } });
    const { admin, rpcCalls } = fakeAdmin({ memberships: [], rpc: { dr_can_review: { data: true } } });
    const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.can_submit).toBe(false);
    expect(rpcCalls.find((c) => c.name === "dr_can_review")?.args).toEqual({ p_project_id: PROJECT, p_user: USER });
    expect(verifyMiniAppSession(result.token, miniAppSessionSecret())).toMatchObject({ uid: USER, unit: UNIT, ro: true });

    // The read-only session can load the form and nothing else.
    const get = await requireReporterActor(new Request("http://localhost/api/dr/forms/x", { headers: { authorization: `Bearer ${result.token}` } }));
    expect(get).toMatchObject({ userId: USER, miniApp: { unitId: UNIT, readOnly: true } });
    const post = await requireReporterActor(
      new Request("http://localhost/api/dr/reports", { method: "POST", headers: { authorization: `Bearer ${result.token}` } }),
    );
    expect((post as Response).status).toBe(403);
  });

  it("an approver must still be a member of the group", async () => {
    stubTelegram({ getChatMember: { status: "left" } });
    const { admin } = fakeAdmin({ memberships: [], rpc: { dr_can_review: { data: true } } });
    expect(await exchangeMiniAppSession(admin, initData({ startParam: launch }))).toMatchObject({ ok: false, code: "DR_TG_NOT_IN_GROUP" });
  });

  it("refuses a reporter who has left or been removed from the group", async () => {
    for (const member of [{ status: "left" }, { status: "kicked" }, { status: "restricted", is_member: false }]) {
      stubTelegram({ getChatMember: member });
      const { admin, rpcCalls } = fakeAdmin();
      const result = await exchangeMiniAppSession(admin, initData({ startParam: launch }));
      expect(result).toMatchObject({ ok: false, status: 403, code: "DR_TG_NOT_IN_GROUP" });
      expect(rpcCalls.some((c) => c.name === "dr_audit")).toBe(true);
    }
    stubTelegram({ getChatMember: 400 }); // Telegram: user not found in chat
    expect(await exchangeMiniAppSession(fakeAdmin().admin, initData({ startParam: launch }))).toMatchObject({ code: "DR_TG_NOT_IN_GROUP" });
  });

  it("accepts a restricted member who is still in the group", async () => {
    stubTelegram({ getChatMember: { status: "restricted", is_member: true } });
    expect((await exchangeMiniAppSession(fakeAdmin().admin, initData({ startParam: launch }))).ok).toBe(true);
  });

  it("fails closed when Telegram cannot confirm membership", async () => {
    stubTelegram({ getChatMember: 502 });
    const result = await exchangeMiniAppSession(fakeAdmin().admin, initData({ startParam: launch }));
    expect(result).toMatchObject({ ok: false, status: 503, code: "DR_TG_UNAVAILABLE" });
  });
});

describe("Mini App session on the gateway", () => {
  const request = (authorization?: string) =>
    new Request("http://localhost/api/dr/reports", { headers: authorization ? { authorization } : {} });
  const validToken = () =>
    signMiniAppSession({ uid: USER, unit: UNIT, binding: BINDING, exp: Math.floor(Date.now() / 1000) + 600 }, miniAppSessionSecret());

  it("is limited to the unit it was launched for", async () => {
    const actor = await requireReporterActor(request(`Bearer ${validToken()}`));
    expect(actor).toMatchObject({ userId: USER, miniApp: { unitId: UNIT } });
    if ("userId" in actor) {
      expect(actorMayUseUnit(actor, UNIT)).toBe(true);
      expect(actorMayUseUnit(actor, OTHER_UNIT)).toBe(false);
    }
  });

  it("rejects a forged or expired session", async () => {
    const forged = signMiniAppSession({ uid: USER, unit: UNIT, binding: BINDING, exp: Math.floor(Date.now() / 1000) + 600 }, "wrong-secret");
    const expired = signMiniAppSession({ uid: USER, unit: UNIT, binding: BINDING, exp: 1 }, miniAppSessionSecret());
    for (const token of [forged, expired, "drm.garbage"]) {
      const res = await requireReporterActor(request(`Bearer ${token}`));
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(401);
    }
  });

  it("falls back to the dashboard session when there is no Mini App token", async () => {
    const res = await requireReporterActor(request());
    expect((res as Response).status).toBe(401); // no cookie session in this test
  });

  it("a dashboard actor is not restricted to one unit", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(actorMayUseUnit({ userId: USER, admin: {} as any }, OTHER_UNIT)).toBe(true);
  });
});

describe("the bot in a group", () => {
  const group = { id: CHAT, type: "supergroup", title: "Site A" };

  it("/bind from a linked approver binds the group and posts the launch button", async () => {
    const calls = stubTelegram();
    const { admin, rpcCalls, updates } = fakeAdmin({
      rpc: { dr_tg_bind_chat: { data: { binding_id: BINDING, unit_name: "Sub One", unit_code: "SC-1" } } },
      binding: { id: BINDING, chat_id: CHAT, status: "Active", pinned_message_id: null } as never,
    });
    await handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "/bind@dcos_test_bot k7qm2xpa" } });

    const bind = rpcCalls.find((c) => c.name === "dr_tg_bind_chat");
    expect(bind?.args).toMatchObject({ p_actor: USER, p_chat_id: CHAT, p_chat_type: "supergroup", p_code_hash: hashToken("K7QM2XPA") });
    expect(rpcCalls.some((c) => c.name === "dr_tg_issue_launch_token")).toBe(true);

    const button = calls.find((c) => c.method === "sendMessage" && c.body.reply_markup);
    const url = (button?.body.reply_markup as { inline_keyboard: { url: string }[][] }).inline_keyboard[0][0].url;
    expect(url).toMatch(/^https:\/\/t\.me\/dcos_test_bot\/report\?startapp=dr_[A-Za-z0-9_-]+$/);
    expect(calls.some((c) => c.method === "pinChatMessage")).toBe(true);
    expect(updates).toContainEqual({ table: "dr_telegram_bindings", values: { pinned_message_id: 99 } });
  });

  it("a bare /bind (picked from the command menu) asks for the code, and the reply binds", async () => {
    const calls = stubTelegram();
    const { admin, rpcCalls } = fakeAdmin({
      rpc: { dr_tg_bind_chat: { data: { binding_id: BINDING, unit_name: "Sub One", unit_code: "SC-1" } } },
      binding: { id: BINDING, chat_id: CHAT, status: "Active", pinned_message_id: null } as never,
    });
    await handleDrBotUpdate(admin, { message: { message_id: 7, chat: group, from: { id: TG_USER }, text: "/bind@dcos_test_bot" } });
    expect(rpcCalls).toHaveLength(0);
    expect(calls[0].body).toMatchObject({
      chat_id: CHAT,
      reply_parameters: { message_id: 7 },
      reply_markup: { force_reply: true, selective: true },
    });

    const prompt = String(calls[0].body.text);
    await handleDrBotUpdate(admin, {
      message: { message_id: 8, chat: group, from: { id: TG_USER }, text: "k7qm2xpa", reply_to_message: { from: { is_bot: true }, text: prompt } },
    });
    expect(rpcCalls.find((c) => c.name === "dr_tg_bind_chat")?.args).toMatchObject({ p_code_hash: hashToken("K7QM2XPA"), p_chat_id: CHAT });
  });

  it("a reply to some other message, or to a person, is not taken as a code", async () => {
    stubTelegram();
    const { admin, rpcCalls } = fakeAdmin();
    await handleDrBotUpdate(admin, {
      message: { chat: group, from: { id: TG_USER }, text: "K7QM2XPA", reply_to_message: { from: { is_bot: true }, text: "DR-2026-000001 submitted" } },
    });
    await handleDrBotUpdate(admin, {
      message: { chat: group, from: { id: TG_USER }, text: "K7QM2XPA", reply_to_message: { from: { is_bot: false }, text: "Reply to this message with the 8-character binding code shown in DCOS." } },
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("/bind from an unlinked Telegram account binds nothing", async () => {
    const calls = stubTelegram();
    const { admin, rpcCalls } = fakeAdmin({ profile: null });
    await handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "/bind K7QM2XPA" } });
    expect(rpcCalls).toHaveLength(0);
    expect(String(calls[0].body.text)).toContain("Link your DCOS account");
  });

  it("a refused code is answered with the reason and no button", async () => {
    const calls = stubTelegram();
    const { admin } = fakeAdmin({
      rpc: { dr_tg_bind_chat: { error: { message: "DR_NOT_FOUND: the binding code is invalid, used or expired" } } },
    });
    await handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "/bind K7QM2XPA" } });
    expect(calls).toHaveLength(1);
    expect(String(calls[0].body.text)).toContain("invalid, used or expired");
  });

  it("ordinary chat, private chats and malformed codes do nothing in the database", async () => {
    stubTelegram();
    const { admin, rpcCalls } = fakeAdmin();
    await handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "poured slab L5 today, 45 m3" } });
    await handleDrBotUpdate(admin, { message: { chat: { id: 5, type: "private" }, from: { id: TG_USER }, text: "/bind K7QM2XPA" } });
    expect(rpcCalls).toHaveLength(0);
  });

  it("bot removed, bot re-added and group migration reach the database", async () => {
    stubTelegram();
    const { admin, rpcCalls } = fakeAdmin();
    await handleDrBotUpdate(admin, { my_chat_member: { chat: group, new_chat_member: { status: "kicked" } } });
    await handleDrBotUpdate(admin, { my_chat_member: { chat: group, new_chat_member: { status: "administrator" } } });
    await handleDrBotUpdate(admin, { message: { chat: group, migrate_to_chat_id: -100999 } });
    expect(rpcCalls.map((c) => [c.name, c.args])).toEqual([
      ["dr_tg_set_bot_presence", { p_chat_id: CHAT, p_present: false }],
      ["dr_tg_set_bot_presence", { p_chat_id: CHAT, p_present: true }],
      ["dr_tg_migrate_chat", { p_old_chat_id: CHAT, p_new_chat_id: -100999 }],
    ]);
  });

  it("/report is rate limited to one new link a minute", async () => {
    const calls = stubTelegram();
    const { admin, rpcCalls } = fakeAdmin({ recentTokens: [{ id: "t" }] });
    await handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "/report" } });
    expect(rpcCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("never throws, whatever Telegram or the database does", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const { admin } = fakeAdmin({ rpc: { dr_tg_bind_chat: { data: { binding_id: BINDING, unit_name: "S", unit_code: "S" } } } });
    await expect(
      handleDrBotUpdate(admin, { message: { chat: group, from: { id: TG_USER }, text: "/bind K7QM2XPA" } }),
    ).resolves.toBeUndefined();
  });
});

describe("the bot in a private chat", () => {
  const chat = { id: TG_USER, type: "private" };

  it("/link with a valid code links the Telegram account and marks the code used", async () => {
    const calls = stubTelegram();
    const { admin, updates, rpcCalls } = fakeAdmin({ linkCode: { id: "code-1", employee_id: USER } });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: "/link 123456" } });

    expect(updates).toContainEqual({ table: "profiles", values: { telegram_user_id: TG_USER } });
    expect(updates.some((u) => u.table === "telegram_link_codes" && "used_at" in u.values)).toBe(true);
    expect(rpcCalls.find((c) => c.name === "dr_audit")?.args).toMatchObject({ p_event: "DR.TELEGRAM_LINKED", p_actor: USER });
    expect(String(calls[0].body.text)).toContain("Linked to");
    expect(calls[0].body.chat_id).toBe(TG_USER);
  });

  it("the one-tap deep link (/start link_<code>) does the same", async () => {
    stubTelegram();
    const { admin, updates } = fakeAdmin({ linkCode: { id: "code-1", employee_id: USER } });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: "/start link_123456" } });
    expect(updates).toContainEqual({ table: "profiles", values: { telegram_user_id: TG_USER } });
  });

  it("/start inv_<token> redeems a reporter invite for the Telegram account that opened it", async () => {
    const calls = stubTelegram();
    const token = "A".repeat(32);
    const { admin, rpcCalls } = fakeAdmin({
      rpc: { dr_tg_redeem_invite: { data: { full_name: "Sok Dara", unit_code: "SC-01", unit_name: "ABC Masonry" } } },
    });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: `/start inv_${token}` } });
    expect(rpcCalls[0]).toEqual({ name: "dr_tg_redeem_invite", args: { p_token_hash: hashToken(token), p_telegram_user_id: TG_USER } });
    expect(String(calls[0].body.text)).toContain("Welcome, Sok Dara");
    expect(String(calls[0].body.text)).toContain("SC-01 ABC Masonry");
  });

  it("a used, expired or foreign invite is refused with the reason", async () => {
    const calls = stubTelegram();
    const { admin, updates } = fakeAdmin({
      rpc: { dr_tg_redeem_invite: { error: { message: "DR_NOT_FOUND: this invite is not valid any more; ask for a new one" } } },
    });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: `/start inv_${"B".repeat(32)}` } });
    expect(String(calls[0].body.text)).toContain("not valid any more");
    expect(updates).toHaveLength(0);
  });

  it("an unknown or expired code links nothing", async () => {
    const calls = stubTelegram();
    const { admin, updates } = fakeAdmin({ linkCode: null });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: "/link 000000" } });
    expect(updates).toHaveLength(0);
    expect(String(calls[0].body.text)).toContain("not valid or has expired");
  });

  it("a Telegram account already linked to someone else is refused and the code stays unused", async () => {
    const calls = stubTelegram();
    const { admin, updates } = fakeAdmin({
      linkCode: { id: "code-1", employee_id: USER },
      profileUpdateError: { code: "23505", message: "duplicate key" },
    });
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: "/link 123456" } });
    expect(updates.some((u) => u.table === "telegram_link_codes")).toBe(false);
    expect(String(calls[0].body.text)).toContain("already linked to another DCOS user");
  });

  it("/start explains linking to a stranger and confirms to a linked user", async () => {
    let calls = stubTelegram();
    await handleDrBotUpdate(fakeAdmin({ profile: null }).admin, { message: { chat, from: { id: TG_USER }, text: "/start" } });
    expect(String(calls[0].body.text)).toContain("/link 123456");

    calls = stubTelegram();
    await handleDrBotUpdate(fakeAdmin().admin, { message: { chat, from: { id: TG_USER }, text: "/start" } });
    expect(String(calls[0].body.text)).toContain("You are linked");
  });

  it("anything else typed privately is ignored: a chat message is never a report", async () => {
    const calls = stubTelegram();
    const { admin, rpcCalls, updates } = fakeAdmin();
    await handleDrBotUpdate(admin, { message: { chat, from: { id: TG_USER }, text: "today we poured 45 m3" } });
    expect(calls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe("direct messages", () => {
  it("a user who never started the bot is unreachable, not an error", async () => {
    stubTelegram({ sendMessage: 403 });
    expect(await sendDirectMessage(TG_USER, "DR-1 returned")).toBe("unreachable");
    stubTelegram();
    expect(await sendDirectMessage(TG_USER, "DR-1 returned")).toBe("sent");
    stubTelegram({ sendMessage: 502 });
    await expect(sendDirectMessage(TG_USER, "DR-1 returned")).rejects.toThrow();
  });

  it("uses the Daily Reporting bot's token, never the attendance bot's", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
    });
    await sendDirectMessage(TG_USER, "hello");
    expect(urls[0]).toContain(`/bot${BOT_TOKEN}/sendMessage`);
    vi.stubEnv("TELEGRAM_DR_BOT_TOKEN", "");
    await expect(sendDirectMessage(TG_USER, "hello")).rejects.toThrow("TELEGRAM_DR_BOT_TOKEN is not configured");
  });
});

describe("the submitted report in the group", () => {
  const TASK = "66666666-6666-4666-8666-666666666666";
  const payload = {
    schema_version: 1 as const,
    weather: { condition: "Sunny", hours_lost: 0, note: null },
    manpower: [{ line_id: "m1", trade: "Masonry", reported_count: 24 }],
    activities: [{ line_id: "a1", task_id: TASK, progress_before: 40, progress_today: 65, headcount: 24, work_status: "in_progress" as const }],
    equipment: [],
    materials: [],
    delays: [],
    issues: [],
    instructions: [],
    inspections: [],
    safety: { toolbox_talk_held: true, observations: null, incident_count: 0, near_miss_count: 0 },
    area_access: [],
    next_day: [{ line_id: "n1", description: "Continue L06 blockwork", planned_manpower: 24 }],
    custom_fields: { wall_type: "Hollow Clay Brick", wall_thickness: 100, area_completed: 125, crew_leader: "Mr. Sok" },
    custom_field_def_version: 1,
  };
  const fields = [
    { key: "wall_type", label: "Wall Type", type: "select" as const, options: ["Hollow Clay Brick"] },
    { key: "wall_thickness", label: "Wall Thickness", type: "number" as const, unit: "mm" },
    { key: "area_completed", label: "Area Completed", type: "number" as const, unit: "m²" },
    { key: "crew_leader", label: "Crew Leader", type: "text" as const },
  ];
  const summary = (overrides: Partial<Parameters<typeof formatReportForGroup>[0]> = {}) =>
    formatReportForGroup({
      heading: "DR-2026-000001 submitted",
      unitName: "ABC Masonry",
      reportDate: "2026-10-04",
      reporterName: "Mr. Sok",
      reportKind: "WORK",
      payload,
      tasks: { [TASK]: { name: "Blockwork", location: "Building A › L06" } },
      customFields: fields,
      photoCount: 2,
      ...overrides,
    });

  it("shows everything the reporter filled in", () => {
    expect(summary()).toBe(
      [
        "DR-2026-000001 submitted",
        "ABC Masonry · 2026-10-04",
        "Reported by Mr. Sok",
        "",
        "Weather: Sunny",
        "Manpower: 24 workers",
        "Toolbox talk: Yes",
        "",
        "Activity",
        "1. Blockwork — Building A › L06",
        "   Progress 40% → 65% · 24 workers",
        "",
        "Issue / constraint: No issue",
        "Tomorrow: Continue L06 blockwork (24 workers)",
        "",
        "Wall Type: Hollow Clay Brick",
        "Wall Thickness: 100 mm",
        "Area Completed: 125 m²",
        "Crew Leader: Mr. Sok",
        "",
        "Photos: 2",
      ].join("\n"),
    );
  });

  it("lists issues, delays and several activities, and says when there are no photos", () => {
    const text = summary({
      photoCount: 0,
      payload: {
        ...payload,
        activities: [...payload.activities, { line_id: "a2", free_text_activity: "Clean up", progress_today: 100, headcount: 1 }],
        issues: [{ line_id: "i1", description: "Scaffold not released at L06" }],
        delays: [{ line_id: "d1", cause_category: "WEATHER", description: "Rain stopped work", hours_lost: 2 }],
      },
    });
    expect(text).toContain("Activities\n1. Blockwork — Building A › L06");
    expect(text).toContain("2. Clean up\n   Progress 100% · 1 worker");
    expect(text).toContain("Issue / constraint: Scaffold not released at L06");
    expect(text).not.toContain("No issue");
    expect(text).toContain("Delay: Rain stopped work (2 h lost)");
    expect(text).toContain("Photos: none");
  });

  it("a No Work report shows only the reason", () => {
    const text = summary({ reportKind: "NO_WORK", payload: { ...payload, no_work_reason: "Heavy rain all day" } });
    expect(text).toBe("DR-2026-000001 submitted\nABC Masonry · 2026-10-04\nReported by Mr. Sok\n\nNo work today: Heavy rain all day");
  });

  it("stays under Telegram's message limit", () => {
    const long = { ...payload, issues: Array.from({ length: 60 }, (_, i) => ({ line_id: `i${i}`, description: "x".repeat(200) })) };
    const text = summary({ payload: long });
    expect(text.length).toBeLessThan(4096);
    expect(text).toContain("open the report in DCOS for the rest");
  });

  it("a submission is posted in full; the outbox line is its heading", async () => {
    const calls = stubTelegram();
    const { admin } = fakeAdmin({
      outbox: [{ id: "o1", chat_id: CHAT, text: "DR-2026-000001 submitted", attempts: 0, source_key: "audit:a1" } as never],
      tables: {
        dr_audit_log: { event_code: "DR.REPORT_SUBMITTED", report_id: "r1", version_no: 1 },
        dr_reports: { report_date: "2026-10-04", report_kind: "WORK", unit_id: UNIT, project_id: PROJECT },
        dr_report_versions: { id: "v1", payload, submitted_by: USER },
        dr_reporting_units: { display_name: "ABC Masonry" },
        wbs_tasks: [{ id: TASK, task_name: "Blockwork", wbs_node_id: "n2" }],
        wbs_nodes: [
          { id: "n1", parent_id: null, wbs_name: "Building A" },
          { id: "n2", parent_id: "n1", wbs_name: "L06" },
        ],
        dr_custom_field_definitions: { fields },
        dr_evidence: [{ id: "e1" }, { id: "e2" }],
      },
    });
    expect(await drainGroupOutbox(admin)).toEqual({ sent: 1, failed: 0 });
    const text = String(calls[0].body.text);
    expect(text.startsWith("DR-2026-000001 submitted\nABC Masonry · 2026-10-04")).toBe(true);
    expect(text).toContain("1. Blockwork — Building A › L06");
    expect(text).toContain("Wall Thickness: 100 mm");
    expect(text).toContain("Photos: 2");
  });

  it("an approval or a return stays a one-line status: no report content, no reviewer comment", async () => {
    const calls = stubTelegram();
    const { admin } = fakeAdmin({
      outbox: [{ id: "o1", chat_id: CHAT, text: "DR-2026-000001 approved", attempts: 0, source_key: "audit:a2" } as never],
      tables: {
        dr_audit_log: { event_code: "DR.REVIEW_DECISION", report_id: "r1", version_no: 1 },
        dr_reports: { report_date: "2026-10-04", report_kind: "WORK", unit_id: UNIT, project_id: PROJECT },
        dr_report_versions: { id: "v1", payload, submitted_by: USER },
      },
    });
    await drainGroupOutbox(admin);
    expect(calls[0].body.text).toBe("DR-2026-000001 approved");
  });

  it("if the report cannot be read, the one-line status still goes out", async () => {
    const calls = stubTelegram();
    const { admin } = fakeAdmin({
      outbox: [{ id: "o1", chat_id: CHAT, text: "DR-2026-000001 submitted", attempts: 0, source_key: "audit:a1" } as never],
      tables: { dr_audit_log: { event_code: "DR.REPORT_SUBMITTED", report_id: "r1", version_no: 1 } },
    });
    expect(await drainGroupOutbox(admin)).toEqual({ sent: 1, failed: 0 });
    expect(calls[0].body.text).toBe("DR-2026-000001 submitted");
  });
});

describe("group status lines", () => {
  it("sends each queued line once and records a failure for retry", async () => {
    const calls = stubTelegram();
    const { admin, updates } = fakeAdmin({ outbox: [{ id: "o1", chat_id: CHAT, text: "DR-2026-000148 submitted", attempts: 0 }] });
    expect(await drainGroupOutbox(admin)).toEqual({ sent: 1, failed: 0 });
    expect(calls[0].body).toMatchObject({ chat_id: CHAT, text: "DR-2026-000148 submitted" });
    expect(updates[0].values).toMatchObject({ status: "sent", attempts: 1 });

    stubTelegram({ sendMessage: 429 });
    const second = fakeAdmin({ outbox: [{ id: "o2", chat_id: CHAT, text: "DR-2026-000149 approved", attempts: 2 }] });
    expect(await drainGroupOutbox(second.admin)).toEqual({ sent: 0, failed: 1 });
    expect(second.updates[0].values).toMatchObject({ status: "failed", attempts: 3 });
  });
});
