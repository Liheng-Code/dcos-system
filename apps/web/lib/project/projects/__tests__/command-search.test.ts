import { describe, expect, it } from "vitest";
import { searchPalette, type PaletteProject } from "@/lib/project/projects/command-search";

const projects: PaletteProject[] = [
  { id: "1", project_code: "PRJ-2026-004-PC", project_name: "Riverside Tower", project_type: "awarded" },
  { id: "2", project_code: "PRJ-2026-004", project_name: "Riverside Tower", project_type: "tender" },
  { id: "3", project_code: "PJR-2026-011", project_name: "Airport Hangar", project_type: "tender" },
];
const keys = (q: string) => searchPalette(q, projects).map((r) => r.href);

describe("searchPalette", () => {
  it("lists projects when nothing is typed", () => {
    expect(searchPalette("", projects)).toHaveLength(3);
    expect(searchPalette("", projects, 2)).toHaveLength(2);
  });

  it("finds a project by code or name and opens it", () => {
    expect(keys("011")).toEqual(["/dashboard/projects/PJR-2026-011"]);
    expect(keys("hangar")).toEqual(["/dashboard/projects/PJR-2026-011"]);
  });

  it("jumps to a tab when a word names one", () => {
    expect(keys("004-pc boq")[0]).toBe("/dashboard/projects/PRJ-2026-004-PC/boq");
    expect(keys("hangar go")[0]).toBe("/dashboard/projects/PJR-2026-011/go-no-go");
  });

  it("only offers tabs the project has", () => {
    // Variations is a post-contract tab; the tender PRJ-2026-004 has no such destination.
    expect(keys("riverside variations")).toEqual(["/dashboard/projects/PRJ-2026-004-PC/variations"]);
  });

  it("does not list every tab of a project matched by name alone", () => {
    expect(searchPalette("riverside", projects).every((r) => r.destination === null)).toBe(true);
  });

  it("requires every word to match", () => {
    expect(keys("hangar nonsense")).toEqual([]);
  });
});
