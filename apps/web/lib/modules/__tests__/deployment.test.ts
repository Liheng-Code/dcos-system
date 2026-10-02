import { describe, expect, it } from "vitest";
import { MODULE_PATHS } from "../../../module-boundaries.mjs";
import {
  ALWAYS_ON,
  KNOWN_MODULES,
  disabledRoutes,
  isModuleEnabled,
  parseEnabledModules,
} from "../../../module-deployment.mjs";
import { MODULE_REGISTRY } from "@/lib/modules/registry";

describe("parseEnabledModules", () => {
  it("enables every module when unset, empty or 'all'", () => {
    expect(parseEnabledModules(undefined)).toBeNull();
    expect(parseEnabledModules("")).toBeNull();
    expect(parseEnabledModules("  ")).toBeNull();
    expect(parseEnabledModules("ALL")).toBeNull();
  });

  it("always keeps project and administration on", () => {
    const enabled = parseEnabledModules("qs, planning")!;
    expect([...enabled].sort()).toEqual([...ALWAYS_ON, "planning", "qs"].sort());
  });

  it("selects only the project platform for a project-only deploy", () => {
    expect([...parseEnabledModules("project")!].sort()).toEqual(["administration", "project"]);
  });

  it("fails on an unknown key", () => {
    expect(() => parseEnabledModules("qs,projcet")).toThrow(/projcet/);
  });

  it("knows every registry module", () => {
    for (const m of MODULE_REGISTRY) expect(KNOWN_MODULES).toContain(m.key);
  });
});

describe("isModuleEnabled", () => {
  it("is true for everything when all are enabled", () => {
    expect(isModuleEnabled(null, "hr")).toBe(true);
  });

  it("is true only for selected modules otherwise", () => {
    const enabled = parseEnabledModules("qs");
    expect(isModuleEnabled(enabled, "qs")).toBe(true);
    expect(isModuleEnabled(enabled, "hr")).toBe(false);
    expect(isModuleEnabled(enabled, "project")).toBe(true);
  });
});

describe("disabledRoutes", () => {
  it("blocks nothing when every module is enabled", () => {
    expect(disabledRoutes(null)).toEqual([]);
  });

  it("blocks every page and API route of a module that is off", () => {
    const sources = disabledRoutes(parseEnabledModules("qs")).filter((r) => r.module === "hr").map((r) => r.source);
    expect(sources).toContain("/dashboard/hr");
    expect(sources).toContain("/api/hr");
    expect(sources).toContain("/api/telegram");
    expect(sources).toContain("/telegram-app");
    expect(sources).toContain("/dashboard/administration/year-end");
  });

  it("leaves an enabled module's routes alone", () => {
    const routes = disabledRoutes(parseEnabledModules("qs"));
    expect(routes.some((r) => r.module === "qs")).toBe(false);
    expect(routes.some((r) => r.source.startsWith("/dashboard/projects"))).toBe(false);
  });

  it("with a project-only deploy blocks every other business module", () => {
    const blocked = new Set(disabledRoutes(parseEnabledModules("project")).map((r) => r.module));
    expect([...blocked].sort()).toEqual(Object.keys(MODULE_PATHS).sort());
  });

  it("never emits a file path as a route", () => {
    for (const r of disabledRoutes(parseEnabledModules("project"))) expect(r.source).not.toMatch(/\.\w+$/);
  });
});
