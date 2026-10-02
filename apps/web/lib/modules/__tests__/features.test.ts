import { describe, expect, it } from "vitest";
import {
  MODULE_FEATURES,
  getFeatureForPath,
  isFeatureActive,
  isFeatureRouteBlocked,
  moduleHasActiveFeature,
} from "@/lib/modules/features";
import { NAV_ITEM_CATALOG } from "@/lib/nav-item-catalog";

const off = (navKey: string) => [{ nav_key: navKey, is_active: false }];
const on = (navKey: string) => [{ nav_key: navKey, is_active: true }];

describe("isFeatureActive", () => {
  it("treats a released feature with no settings row as on", () => {
    expect(isFeatureActive("/dashboard/hr/employees", [], false)).toBe(true);
  });

  it("lets a settings row switch a released feature off", () => {
    expect(isFeatureActive("/dashboard/hr/employees", off("/dashboard/hr/employees"), false)).toBe(false);
  });

  it("treats an unknown nav key as on unless a row says otherwise", () => {
    expect(isFeatureActive("/dashboard/unknown", [], false)).toBe(true);
    expect(isFeatureActive("/dashboard/unknown", off("/dashboard/unknown"), false)).toBe(false);
  });

  // lib/modules/release.ts decides what ships on by default; this pins it so a
  // release is a deliberate, visible change.
  it("releases only what lib/modules/release.ts lists", () => {
    const released = MODULE_FEATURES.filter((f) => f.status === "released");
    expect(released.filter((f) => f.moduleKey !== "administration").map((f) => f.navKey).sort()).toEqual(
      ["/dashboard", "/dashboard/hr/employees", "/dashboard/projects", "group:hr:workforce"].sort(),
    );
    const administration = MODULE_FEATURES.filter((f) => f.moduleKey === "administration");
    expect(administration.every((f) => f.status === "released")).toBe(true);
  });

  it("hides an unreleased page unless a row or the local override switches it on", () => {
    expect(isFeatureActive("/dashboard/hr/payroll", [], false)).toBe(false);
    expect(isFeatureActive("/dashboard/hr/payroll", [], true)).toBe(true);
    expect(isFeatureActive("/dashboard/hr/payroll", on("/dashboard/hr/payroll"), false)).toBe(true);
  });
});

describe("moduleHasActiveFeature", () => {
  it("is true for a module with a released page", () => {
    expect(moduleHasActiveFeature("project", [], false)).toBe(true);
    expect(moduleHasActiveFeature("hr", [], false)).toBe(true);
  });

  it("is false for a module with nothing released, true once a page is switched on", () => {
    expect(moduleHasActiveFeature("qs", [], false)).toBe(false);
    expect(moduleHasActiveFeature("qs", [...on("group:qs:cost_control"), ...on("/dashboard/qs/boq")], false)).toBe(true);
  });
});

describe("development features", () => {
  // No real feature is in development yet, so exercise the rule through the
  // resolver with a stand-in: a development feature is one whose status is not
  // "released", which isFeatureActive only reaches via getFeatureStatus.
  const feature = MODULE_FEATURES.find((f) => f.navKey === "/dashboard/hr/recruitment")!;

  it("is off with no row, on with a row, and on under the local override", () => {
    const original = feature.status;
    feature.status = "development";
    try {
      expect(isFeatureActive(feature.navKey, [], false)).toBe(false);
      expect(isFeatureRouteBlocked("/dashboard/hr/recruitment", [], false)).toBe(true);
      expect(isFeatureRouteBlocked("/dashboard/hr/recruitment/123", [], false)).toBe(true);

      expect(isFeatureActive(feature.navKey, on(feature.navKey), false)).toBe(true);
      expect(isFeatureRouteBlocked("/dashboard/hr/recruitment", on(feature.navKey), false)).toBe(false);

      expect(isFeatureActive(feature.navKey, [], true)).toBe(true);
      expect(isFeatureRouteBlocked("/dashboard/hr/recruitment", [], true)).toBe(false);
    } finally {
      feature.status = original;
    }
  });
});

describe("getFeatureForPath", () => {
  it("matches a page and its nested routes", () => {
    expect(getFeatureForPath("/dashboard/hr/employees")?.navKey).toBe("/dashboard/hr/employees");
    expect(getFeatureForPath("/dashboard/hr/employees/42")?.navKey).toBe("/dashboard/hr/employees");
  });

  it("gives a module's index page only its exact path", () => {
    expect(getFeatureForPath("/dashboard/planning")?.navKey).toBe("/dashboard/planning");
    expect(getFeatureForPath("/dashboard/planning/gantt")?.navKey).toBe("/dashboard/planning/gantt");
    expect(getFeatureForPath("/dashboard/planning/not-in-nav")).toBeUndefined();
  });

  it("never claims the landing page", () => {
    expect(getFeatureForPath("/dashboard")).toBeUndefined();
  });

  it("attributes a page listed under two modules to the module that owns the route", () => {
    expect(getFeatureForPath("/dashboard/account/reports")?.moduleKey).toBe("account");
    expect(getFeatureForPath("/dashboard/planning/reports")?.moduleKey).toBe("planning");
  });
});

describe("isFeatureRouteBlocked", () => {
  it("blocks a switched-off page and its nested routes, not its siblings", () => {
    const settings = off("/dashboard/hr/leave");
    expect(isFeatureRouteBlocked("/dashboard/hr/leave", settings, true)).toBe(true);
    expect(isFeatureRouteBlocked("/dashboard/hr/leave/admin", settings, true)).toBe(true);
    expect(isFeatureRouteBlocked("/dashboard/hr/payroll", settings, true)).toBe(false);
  });

  it("blocks every page of a switched-off group", () => {
    const settings = off("group:hr:time_payroll");
    expect(isFeatureRouteBlocked("/dashboard/hr/leave", settings, true)).toBe(true);
    expect(isFeatureRouteBlocked("/dashboard/hr/employees", settings, true)).toBe(false);
  });

  it("does not block a page shared by query-string tabs when one tab is off", () => {
    expect(isFeatureRouteBlocked("/dashboard/qs", off("/dashboard/qs?tab=contingency"), true)).toBe(false);
  });

  it("does not block routes outside any feature", () => {
    expect(isFeatureRouteBlocked("/dashboard/profile", off("/dashboard/hr/leave"), true)).toBe(false);
  });
});

describe("nav item catalog", () => {
  it("lists every toggleable feature under its module, groups before their pages", () => {
    const hr = NAV_ITEM_CATALOG.hr;
    expect(hr[0]).toMatchObject({ navKey: "group:hr:workforce", nodeType: "group" });
    expect(hr.find((e) => e.navKey === "/dashboard/hr/leave")).toMatchObject({
      nodeType: "item",
      parentGroupKey: "group:hr:time_payroll",
    });
  });

  it("includes pages the hand-written catalog had missed, and omits hidden tabs", () => {
    const planning = NAV_ITEM_CATALOG.planning.map((e) => e.navKey);
    expect(planning).toContain("group:planning:productivity");
    expect(planning).toContain("/dashboard/planning/sync");
    const qs = NAV_ITEM_CATALOG.qs.map((e) => e.navKey);
    expect(qs).not.toContain("/dashboard/qs/dwl-work-items");
  });
});
