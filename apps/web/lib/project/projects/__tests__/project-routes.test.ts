import { describe, expect, it } from "vitest";
import {
  listViewForType,
  parseCreateKind,
  parseProjectListParams,
  projectHref,
  projectListQuery,
  projectViewBucket,
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

describe("listViewForType & projectViewBucket", () => {
  it("puts tenders in Pipeline and everything else in Live", () => {
    expect(listViewForType("tender")).toBe("pipeline");
    expect(listViewForType("awarded")).toBe("live");
    expect(listViewForType("internal")).toBe("live");
  });

  it("classifies projects across Tender Pipeline, Awarded, Archived, and On-Hold", () => {
    expect(projectViewBucket({ project_type: "tender", project_status: "active" }, "tendering")).toBe("pipeline");
    expect(projectViewBucket({ project_type: "tender", project_status: "on_hold" }, "tendering")).toBe("on_hold");
    expect(projectViewBucket({ project_type: "tender", project_status: "active" }, "unsuccessful")).toBe("archived");
    expect(projectViewBucket({ project_type: "tender", project_status: "active" }, "closed")).toBe("archived");
    expect(projectViewBucket({ project_type: "awarded", project_status: "active" })).toBe("live");
    expect(projectViewBucket({ project_type: "awarded", project_status: "on_hold" })).toBe("on_hold");
    expect(projectViewBucket({ project_type: "awarded", project_status: "archived" })).toBe("archived");
    expect(projectViewBucket({ project_type: "awarded", project_status: "completed" })).toBe("completed");
    expect(projectViewBucket({ project_type: "tender", project_status: "completed" }, "awarded")).toBe("completed");
  });
});

describe("parseProjectListParams", () => {
  it("uses the fallback view when none or an unknown one is given, and supports archived and on_hold", () => {
    expect(parseProjectListParams(params("")).view).toBe("pipeline");
    expect(parseProjectListParams(params(""), "live").view).toBe("live");
    expect(parseProjectListParams(params("view=bogus"), "live").view).toBe("live");
    expect(parseProjectListParams(params("view=archived")).view).toBe("archived");
    expect(parseProjectListParams(params("view=completed")).view).toBe("completed");
    expect(parseProjectListParams(params("view=on_hold")).view).toBe("on_hold");
    expect(parseProjectListParams(params("view=awarded")).view).toBe("live");
  });

  it("reads filters and layout", () => {
    expect(parseProjectListParams(params("view=live&q=tower&status=active&sector=residential&type=awarded&layout=list"))).toEqual({
      view: "live", q: "tower", status: "active", sector: "residential", type: "awarded", layout: "list",
    });
  });

  it("ignores the type filter in Pipeline, where every project is a tender", () => {
    expect(parseProjectListParams(params("view=pipeline&type=awarded")).type).toBe("");
    expect(parseProjectListParams(params("view=archived&type=tender")).type).toBe("tender");
    expect(parseProjectListParams(params("view=on_hold&type=tender")).type).toBe("tender");
  });

  it("defaults to cards and falls back to them for unknown values", () => {
    expect(parseProjectListParams(params("")).layout).toBe("card");
    expect(parseProjectListParams(params("layout=grid")).layout).toBe("card");
    expect(parseProjectListParams(params("layout=list")).layout).toBe("list");
  });

  it("offers the board only for tenders", () => {
    expect(parseProjectListParams(params("view=pipeline&layout=board")).layout).toBe("board");
    expect(parseProjectListParams(params("view=live&layout=board")).layout).toBe("card");
    expect(parseProjectListParams(params("view=archived&layout=board")).layout).toBe("card");
    expect(parseProjectListParams(params("layout=board"), "pipeline").layout).toBe("board");
  });
});

describe("projectListQuery", () => {
  it("keeps only the view when nothing else is set", () => {
    expect(projectListQuery(parseProjectListParams(params("view=live")))).toBe("view=live");
  });

  it("round-trips a full state", () => {
    const state = parseProjectListParams(params("view=live&q=a+b&status=draft&sector=x&type=internal&layout=list"));
    expect(parseProjectListParams(params(projectListQuery(state)))).toEqual(state);
  });

  it("drops the type filter in Pipeline and appends extra params", () => {
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
