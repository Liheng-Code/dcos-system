import { describe, expect, it } from "vitest";
import { HUB_MODULES, MODULE_REGISTRY, getModuleForPath } from "@/lib/modules/registry";
import { MODULE_KEY_MAP } from "@/lib/module-key-map";
import { isRouteBlocked } from "@/lib/module-settings-service";

// These snapshots are the hand-maintained maps the registry replaced. They pin
// the derived values so a manifest edit that changes gating or permissions is a
// deliberate, visible change.

describe("module registry", () => {
  it("lists modules in sidebar order with unique keys", () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(keys).toEqual([
      "project",
      "reporting",
      "document_control",
      "planning",
      "design",
      "procurement",
      "inventory",
      "qs",
      "construction",
      "hr",
      "account",
      "administration",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("orders module hub cards", () => {
    expect(HUB_MODULES.map((m) => m.key)).toEqual([
      "project",
      "reporting",
      "document_control",
      "planning",
      "design",
      "procurement",
      "qs",
      "construction",
      "hr",
      "inventory",
      "account",
      "administration",
    ]);
  });

  it("derives the module key -> RBAC code map", () => {
    expect(MODULE_KEY_MAP).toEqual({
      project: ["task_management"],
      reporting: ["reporting_kpi"],
      document_control: ["document_control"],
      planning: ["planning"],
      design: [],
      procurement: ["procurement"],
      inventory: ["inventory"],
      qs: ["qs", "tender"],
      construction: ["construction", "qa_qc", "hse"],
      hr: ["hr"],
      account: ["account_finance"],
      administration: ["admin_config"],
    });
  });

  it("attributes route prefixes to modules", () => {
    const routeModuleMap = Object.fromEntries(
      MODULE_REGISTRY.flatMap((m) => m.routePrefixes.map((prefix) => [prefix, m.key])),
    );
    expect(routeModuleMap).toEqual({
      "/dashboard/projects": "project",
      "/dashboard/wbs": "project",
      "/dashboard/tasks": "project",
      "/dashboard/my-tasks": "project",
      "/dashboard/department": "project",
      "/dashboard/stakeholders": "project",
      "/dashboard/reports": "reporting",
      "/dashboard/insights": "reporting",
      "/dashboard/documents": "document_control",
      "/dashboard/transmittals": "document_control",
      "/dashboard/planning": "planning",
      "/dashboard/design": "design",
      "/dashboard/procurement": "procurement",
      "/dashboard/inventory": "inventory",
      "/dashboard/qs": "qs",
      "/dashboard/tenders": "qs",
      "/dashboard/subcontractors": "qs",
      "/dashboard/contracts": "qs",
      "/dashboard/qto": "qs",
      "/dashboard/site": "construction",
      "/dashboard/qaqc": "construction",
      "/dashboard/hse": "construction",
      "/dashboard/hr": "hr",
      "/dashboard/account": "account",
      "/dashboard/administration": "administration",
      "/dashboard/settings": "administration",
    });
  });

  it("claims each route prefix for exactly one module", () => {
    const prefixes = MODULE_REGISTRY.flatMap((m) => m.routePrefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b) expect(a.startsWith(b + "/")).toBe(false);
      }
    }
  });

  it("matches nested routes but not sibling prefixes", () => {
    expect(getModuleForPath("/dashboard/hr/leave/admin")?.key).toBe("hr");
    expect(getModuleForPath("/dashboard/qs")?.key).toBe("qs");
    expect(getModuleForPath("/dashboard/qsx")).toBeUndefined();
    expect(getModuleForPath("/dashboard")).toBeUndefined();
  });

  it("gives every nav group an icon and a module-scoped navKey", () => {
    for (const m of MODULE_REGISTRY) {
      for (const group of m.navGroups ?? []) {
        expect(m.groupIcons?.[group.key], `${m.key}/${group.key} icon`).toBeDefined();
        expect(group.navKey.startsWith(`group:${m.key}:`), group.navKey).toBe(true);
      }
    }
  });
});

describe("isRouteBlocked", () => {
  const withoutHr = MODULE_REGISTRY.map((m) => m.key).filter((k) => k !== "hr");

  it("blocks a role-governed module the user is not permitted to see", () => {
    expect(isRouteBlocked("/dashboard/hr/employees", withoutHr)).toBe(true);
    expect(isRouteBlocked("/dashboard/qs/boq", withoutHr)).toBe(false);
  });

  it("never blocks before permissions are known", () => {
    expect(isRouteBlocked("/dashboard/hr/employees")).toBe(false);
  });

  it("never role-blocks administration or unmapped routes", () => {
    expect(isRouteBlocked("/dashboard/administration/users", [])).toBe(false);
    expect(isRouteBlocked("/dashboard/settings", [])).toBe(false);
    expect(isRouteBlocked("/dashboard", [])).toBe(false);
    expect(isRouteBlocked("/dashboard/profile", [])).toBe(false);
  });

  it("blocks every route of a module that is switched off", () => {
    const all = MODULE_REGISTRY.map((m) => m.key);
    const toggles = { activeModuleKeys: withoutHr, navItemSettings: [] };
    expect(isRouteBlocked("/dashboard/hr/employees", all, toggles)).toBe(true);
    expect(isRouteBlocked("/dashboard/qs/boq", all, toggles)).toBe(false);
  });

  it("fails open when module settings could not be loaded", () => {
    const all = MODULE_REGISTRY.map((m) => m.key);
    expect(isRouteBlocked("/dashboard/hr/employees", all, { activeModuleKeys: [], navItemSettings: [] })).toBe(false);
  });

  it("never blocks administration, even when toggled off", () => {
    const toggles = {
      activeModuleKeys: ["project"],
      navItemSettings: [{ nav_key: "/dashboard/settings", is_active: false }],
    };
    expect(isRouteBlocked("/dashboard/settings", [], toggles)).toBe(false);
    expect(isRouteBlocked("/dashboard/administration/users", [], toggles)).toBe(false);
  });
});
