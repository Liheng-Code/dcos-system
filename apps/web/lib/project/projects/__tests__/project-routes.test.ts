import { describe, expect, it } from "vitest";
import {
  listViewForType,
  parseCreateKind,
  parseProjectListParams,
  projectHref,
  projectListQuery,
  settingsHref,
} from "@/lib/project/projects/project-routes";

const params = (q: string) => new URLSearchParams(q);

describe("projectHref", () => {
  it("addresses a project by its code, with an optional tab", () => {
    expect(projectHref("PJR-2026-004")).toBe("/dashboard/projects/PJR-2026-004");
    expect(projectHref("PJR-2026-004", "contract")).toBe("/dashboard/projects/PJR-2026-004/contract");
  });

  it("encodes characters that are not URL-safe", () => {
    expect(projectHref("A B/1")).toBe("/dashboard/projects/A%20B%2F1");
  });
});

describe("listViewForType", () => {
  it("puts tenders in Pipeline and everything else in Live", () => {
    expect(listViewForType("tender")).toBe("pipeline");
    expect(listViewForType("awarded")).toBe("live");
    expect(listViewForType("internal")).toBe("live");
  });
});

describe("parseProjectListParams", () => {
  it("uses the fallback view when none or an unknown one is given", () => {
    expect(parseProjectListParams(params("")).view).toBe("pipeline");
    expect(parseProjectListParams(params(""), "live").view).toBe("live");
    expect(parseProjectListParams(params("view=bogus"), "live").view).toBe("live");
  });

  it("reads filters and layout", () => {
    expect(parseProjectListParams(params("view=live&q=tower&status=active&sector=residential&type=awarded&layout=card"))).toEqual({
      view: "live", q: "tower", status: "active", sector: "residential", type: "awarded", layout: "card",
    });
  });

  it("ignores the type filter in Pipeline, where every project is a tender", () => {
    expect(parseProjectListParams(params("view=pipeline&type=awarded")).type).toBe("");
  });

  it("defaults to the table and falls back to it for unknown values", () => {
    expect(parseProjectListParams(params("")).layout).toBe("list");
    expect(parseProjectListParams(params("layout=grid")).layout).toBe("list");
    expect(parseProjectListParams(params("layout=card")).layout).toBe("card");
  });

  it("offers the board only for tenders", () => {
    expect(parseProjectListParams(params("view=pipeline&layout=board")).layout).toBe("board");
    expect(parseProjectListParams(params("view=live&layout=board")).layout).toBe("list");
    expect(parseProjectListParams(params("layout=board"), "pipeline").layout).toBe("board");
  });
});

describe("projectListQuery", () => {
  it("keeps only the view when nothing else is set", () => {
    expect(projectListQuery(parseProjectListParams(params("view=live")))).toBe("view=live");
  });

  it("round-trips a full state", () => {
    const state = parseProjectListParams(params("view=live&q=a+b&status=draft&sector=x&type=internal&layout=card"));
    expect(parseProjectListParams(params(projectListQuery(state)))).toEqual(state);
  });

  it("drops the type filter outside Live and appends extra params", () => {
    const state = { ...parseProjectListParams(params("view=live&type=awarded")), view: "pipeline" as const };
    expect(projectListQuery(state, { new: "tender" })).toBe("view=pipeline&new=tender");
  });
});

describe("parseCreateKind", () => {
  it("opens the dialog on a tender or an awarded project", () => {
    expect(parseCreateKind("tender")).toBe("tender");
    expect(parseCreateKind("awarded")).toBe("awarded");
  });

  it("maps the old wizard links", () => {
    expect(parseCreateKind("precontract")).toBe("tender");
    expect(parseCreateKind("project")).toBe("awarded");
    expect(parseCreateKind("template")).toBe("awarded");
  });

  it("ignores anything else", () => {
    expect(parseCreateKind("other")).toBeNull();
    expect(parseCreateKind("constructor")).toBeNull();
    expect(parseCreateKind(null)).toBeNull();
  });
});

describe("settingsHref", () => {
  it("links to the Settings tab, optionally at a section", () => {
    expect(settingsHref("P-1")).toBe("/dashboard/projects/P-1/settings");
    expect(settingsHref("P-1", "calendar")).toBe("/dashboard/projects/P-1/settings?section=calendar");
  });
});
