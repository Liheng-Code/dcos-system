import { describe, expect, it } from "vitest";
import { computeEffective } from "@/lib/licensing/effective";
import { checkApiRequest } from "@/lib/licensing/guard";
import { at, makeClaims } from "./fixtures";

const usage = { users: 1, viewers: 0, projects: 0 };
const active = computeEffective("enforce", makeClaims(), at("2026-06-01"), usage); // planning + qs, ai_qs
const readonly = computeEffective("enforce", makeClaims(), at("2027-01-20"), usage);
const locked = computeEffective("enforce", makeClaims(), at("2027-03-01"), usage);

describe("checkApiRequest", () => {
  it("allows licensed modules and core routes", () => {
    expect(checkApiRequest(active, "POST", "/api/tenders/abc/ai-boq-draft")).toBeNull();
    expect(checkApiRequest(active, "GET", "/api/planning/sync/p1/status")).toBeNull();
    expect(checkApiRequest(active, "GET", "/api/geo/search")).toBeNull();
  });

  it("refuses modules outside the license", () => {
    expect(checkApiRequest(active, "GET", "/api/hr/employees")?.code).toBe("LIC_MODULE_NOT_LICENSED");
    expect(checkApiRequest(active, "GET", "/api/inv/items")?.code).toBe("LIC_MODULE_NOT_LICENSED");
    expect(checkApiRequest(active, "POST", "/api/dr/reports")?.code).toBe("LIC_MODULE_NOT_LICENSED");
  });

  it("refuses an unlicensed feature inside a licensed module", () => {
    const noAi = computeEffective("enforce", makeClaims({}, { features: [] }), at("2026-06-01"), usage);
    expect(checkApiRequest(noAi, "POST", "/api/tenders/abc/ai-boq-draft")?.code).toBe("LIC_FEATURE_NOT_LICENSED");
    expect(checkApiRequest(noAi, "GET", "/api/tenders/abc/other")).toBeNull();
  });

  it("read-only refuses writes but allows reads and site-data ingestion", () => {
    expect(checkApiRequest(readonly, "GET", "/api/planning/sync/p1/status")).toBeNull();
    expect(checkApiRequest(readonly, "POST", "/api/planning/sync/p1/commit")?.code).toBe("LIC_READ_ONLY");
    const site = computeEffective("enforce", makeClaims({}, { modules: ["construction", "hr"] }), at("2027-01-20"), usage);
    expect(checkApiRequest(site, "POST", "/api/dr/sync/push")).toBeNull();
    expect(checkApiRequest(site, "POST", "/api/telegram/webhook")).toBeNull();
  });

  it("locked refuses everything except auth and the license", () => {
    expect(checkApiRequest(locked, "GET", "/api/geo/search")?.code).toBe("LIC_LOCKED");
    expect(checkApiRequest(locked, "POST", "/api/telegram/webhook")?.code).toBe("LIC_LOCKED");
    expect(checkApiRequest(locked, "POST", "/api/auth/change-password")).toBeNull();
    expect(checkApiRequest(locked, "POST", "/api/license")).toBeNull();
  });

  it("a missing license is LIC_UNVERIFIED", () => {
    const none = computeEffective("enforce", null, at("2026-06-01"), usage);
    expect(checkApiRequest(none, "GET", "/api/geo/search")?.code).toBe("LIC_UNVERIFIED");
  });

  it("does nothing when licensing is off", () => {
    const off = computeEffective("off", null, at("2026-06-01"), usage);
    expect(checkApiRequest(off, "DELETE", "/api/hr/employees/1")).toBeNull();
  });
});
