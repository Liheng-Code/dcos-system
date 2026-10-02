import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { CORE, MODULE_PATHS, PUBLIC_API, isPublicApi, moduleOf } from "../../../module-boundaries.mjs";

const webRoot = path.resolve(__dirname, "../../..");

// Project and Administration are the platform itself, so they are core.
const CORE_MODULE_KEYS = ["project", "administration"];

describe("module boundaries map", () => {
  it("has an ownership entry for every business module in the registry", () => {
    const expected = MODULE_REGISTRY.map((m) => m.key).filter((k) => !CORE_MODULE_KEYS.includes(k));
    expect(Object.keys(MODULE_PATHS).sort()).toEqual([...expected].sort());
  });

  it("only lists paths that exist", () => {
    const listed = [...Object.values(MODULE_PATHS).flat(), ...Object.values(PUBLIC_API).flat()];
    const missing = listed.filter((p) => !fs.existsSync(path.join(webRoot, p)));
    expect(missing).toEqual([]);
  });

  it("keeps each module's public API inside that module", () => {
    for (const [module, files] of Object.entries(PUBLIC_API)) {
      for (const file of files) expect(moduleOf(file), file).toBe(module);
    }
  });

  it("resolves ownership by the most specific path", () => {
    expect(moduleOf("components/hr/leave/leave-form.tsx")).toBe("hr");
    expect(moduleOf("lib/qs/qs-service")).toBe("qs");
    expect(moduleOf("components/project/wbs/wbs-tree.tsx")).toBe(CORE);
    expect(moduleOf("components/project/wbs/wbs-lookahead-view.tsx")).toBe("planning");
    expect(moduleOf("app/dashboard/administration/year-end/page.tsx")).toBe("hr");
    expect(moduleOf("app/dashboard/administration/users/page.tsx")).toBe(CORE);
    expect(moduleOf("lib/utils")).toBe(CORE);
  });

  it("is mirrored by .github/CODEOWNERS", () => {
    const codeowners = fs.readFileSync(path.join(webRoot, "../../.github/CODEOWNERS"), "utf8");
    const patterns = new Set(
      codeowners
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((p) => p && !p.startsWith("#")),
    );
    const missing = Object.values(MODULE_PATHS)
      .flat()
      .map((p) => `/apps/web/${p}${/\.[a-z]+$/.test(p) ? "" : "/"}`)
      .filter((p) => !patterns.has(p));
    expect(missing).toEqual([]);
  });

  it("exposes each module's nav file and nothing internal", () => {
    expect(isPublicApi("lib/hr/hr-nav")).toBe(true);
    expect(isPublicApi("lib/qs/qs-service")).toBe(false);
  });
});
