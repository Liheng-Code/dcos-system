import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { MODULE_PATHS } from "../../../module-boundaries.mjs";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import {
  MODULE_ENTITLEMENTS,
  entitlementForPath,
  featureForApiPath,
  isManifestLicensed,
  isPathLicensed,
} from "@/lib/licensing/catalogue";
import { isNavKeyLicensed } from "@/lib/licensing/nav";

describe("entitlement catalogue (design 3.2)", () => {
  it("covers every module manifest and every boundary module", () => {
    const manifests = new Set(MODULE_ENTITLEMENTS.map((m) => m.manifestKey));
    for (const { key } of MODULE_REGISTRY) expect(manifests, key).toContain(key);
    for (const key of Object.keys(MODULE_PATHS)) expect(manifests, key).toContain(key);
  });

  it("attributes pages and API routes to their module", () => {
    expect(entitlementForPath("/dashboard/hr/employees")).toBe("hr");
    expect(entitlementForPath("/api/telegram/webhook")).toBe("hr");
    expect(entitlementForPath("/api/tenders/x/ai-boq-draft")).toBe("qs");
    expect(entitlementForPath("/api/inv/items")).toBe("inventory");
    expect(entitlementForPath("/api/bim/models")).toBe("design");
    expect(entitlementForPath("/dashboard/projects")).toBeNull();
    expect(entitlementForPath("/api/geo/search")).toBeNull();
  });

  it("splits the construction manifest into Site, HSE and QA/QC", () => {
    expect(entitlementForPath("/dashboard/site/reports")).toBe("construction");
    expect(entitlementForPath("/api/dr/reports")).toBe("construction");
    expect(entitlementForPath("/dashboard/hse")).toBe("hse");
    expect(entitlementForPath("/dashboard/qaqc/ncr")).toBe("qaqc");
    const hseOnly = new Set(["hse"]);
    expect(isManifestLicensed("construction", hseOnly)).toBe(true);
    expect(isPathLicensed("/dashboard/hse", hseOnly)).toBe(true);
    expect(isPathLicensed("/dashboard/site", hseOnly)).toBe(false);
  });

  it("always licenses Project and Administration", () => {
    const none = new Set<string>();
    expect(isManifestLicensed("project", none)).toBe(true);
    expect(isManifestLicensed("administration", none)).toBe(true);
    expect(isPathLicensed("/dashboard/administration/license", none)).toBe(true);
    expect(isNavKeyLicensed("/dashboard/projects", none)).toBe(true);
    expect(isNavKeyLicensed("/dashboard/hr/employees", none)).toBe(false);
  });

  it("matches feature routes with dynamic segments", () => {
    expect(featureForApiPath("/api/tenders/123/ai-boq-draft")).toBe("ai_qs");
    expect(featureForApiPath("/api/tenders/123/other")).toBeNull();
  });

  // Every API route folder must belong to a module or be deliberately core, so a
  // new module's routes cannot slip past the license unnoticed.
  it("attributes every API route folder", () => {
    const apiRoot = path.resolve(__dirname, "../../../app/api");
    const CORE_API = new Set(["admin", "auth", "geo", "license"]);
    for (const dir of readdirSync(apiRoot)) {
      if (!statSync(path.join(apiRoot, dir)).isDirectory() || CORE_API.has(dir)) continue;
      expect(entitlementForPath(`/api/${dir}`), `/api/${dir}`).not.toBeNull();
    }
  });
});
