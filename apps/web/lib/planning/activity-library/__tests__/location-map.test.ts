import { describe, expect, it } from "vitest";
import {
  allocateLine,
  canonicalLevel,
  suggestLocationMap,
  type BoqLocation,
  type SavedLocation,
  type WbsLevel,
} from "../location-map";

// PJR-2026-003 as it is on the local DB (2026-10-20).
const wbsCodes: [string, string][] = [
  ["00.UG", "Underground"], ["01.GF", "Ground Floor"], ["02.MZ", "Mezzanine Floor"],
  ["03.1F", "1F Floor"], ["04.2F", "2F Floor"], ["05.3F", "3F Floor"], ["06.4F", "4F Floor"], ["07.5F", "5F Floor"],
  ["08.6F", "6F Floor"], ["09.7F", "7F Floor"], ["10.8F", "8F Floor"], ["11.9F", "9F Floor"], ["12.TF", "TF Floor"], ["13.RF", "RF Floor"],
];
const levels: WbsLevel[] = wbsCodes.map(([wbs_code, wbs_name]) => ({ id: wbs_code, wbs_code, wbs_name, building_code: "BA" }));
const boqLabels = ["01.UG", "02.GF", "03.MZ", "04.1F", "05.2F", "06.3F", "07.4F", "08.5F", "09.6F", "10.7F", "11.8F", "12.9F", "13.10F", "14.TR", "15.RF", "All"];
const locations: BoqLocation[] = boqLabels.map((qs_level_label) => ({ building_code: "BA", qs_level_label, lines: 1 }));

describe("canonicalLevel", () => {
  it("reads BOQ labels, WBS codes and names into the G00 / L01 standard", () => {
    expect(canonicalLevel("04.1F")?.code).toBe("L01");
    expect(canonicalLevel("03.1F")?.code).toBe("L01");
    expect(canonicalLevel("13.10F")?.code).toBe("L10");
    expect(canonicalLevel("02.GF")?.code).toBe("G00");
    expect(canonicalLevel("Ground Floor")?.code).toBe("G00");
    expect(canonicalLevel("01.UG")?.code).toBe("B01");
    expect(canonicalLevel("Basement 2")?.code).toBe("B02");
    expect(canonicalLevel("Mezzanine Floor")?.code).toBe("M01");
    expect(canonicalLevel("L03")?.code).toBe("L03");
    expect(canonicalLevel("Level 12")?.code).toBe("L12");
    expect(canonicalLevel("15.RF")?.code).toBe("R00");
    expect(canonicalLevel("PH1")?.code).toBe("PH01");
  });

  it("leaves labels it cannot read with certainty to the planner", () => {
    expect(canonicalLevel("12.TF")).toBeNull();
    expect(canonicalLevel("14.TR")).toBeNull();
    expect(canonicalLevel("LG")).toBeNull();
  });

  it("orders levels physically", () => {
    const ranks = ["B02", "01.UG", "02.GF", "03.MZ", "04.1F", "13.10F", "PH1", "15.RF"].map((l) => canonicalLevel(l)!.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

describe("suggestLocationMap", () => {
  it("suggests 13 of PJR-2026-003's floors and leaves 10F, TR and All to the planner", () => {
    const rows = suggestLocationMap(locations, levels, []);
    const by = new Map(rows.map((r) => [r.qs_level_label, r]));
    expect(rows.filter((r) => r.status === "suggested")).toHaveLength(13);
    expect(by.get("04.1F")).toMatchObject({ status: "suggested", wbs_node_id: "03.1F", canonical: "L01" });
    expect(by.get("01.UG")).toMatchObject({ status: "suggested", wbs_node_id: "00.UG" });
    expect(by.get("15.RF")).toMatchObject({ status: "suggested", wbs_node_id: "13.RF" });
    expect(by.get("13.10F")).toMatchObject({ status: "unmatched", canonical: "L10" });
    expect(by.get("14.TR")).toMatchObject({ status: "unmatched", canonical: null });
    expect(by.get("All")?.status).toBe("project_wide");
  });

  it("uses saved decisions over suggestions", () => {
    const saved: SavedLocation[] = [
      { building_code: "BA", qs_level_label: "13.10F", wbs_node_id: "12.TF", status: "confirmed", split_rule: "none" },
      { building_code: "ba", qs_level_label: "14.tr", wbs_node_id: null, status: "ignored", split_rule: "none" },
      { building_code: "BA", qs_level_label: "All", wbs_node_id: null, status: "confirmed", split_rule: "gfa" },
    ];
    const by = new Map(suggestLocationMap(locations, levels, saved).map((r) => [r.qs_level_label, r]));
    expect(by.get("13.10F")).toMatchObject({ status: "confirmed", wbs_node_id: "12.TF" });
    expect(by.get("14.TR")?.status).toBe("ignored");
    expect(by.get("All")).toMatchObject({ status: "split", split_rule: "gfa" });
  });

  it("accepts a blank building code on a single-building project", () => {
    const [row] = suggestLocationMap([{ building_code: "", qs_level_label: "02.GF", lines: 3 }], levels, []);
    expect(row).toMatchObject({ status: "suggested", wbs_node_id: "01.GF" });
  });
});

describe("allocateLine", () => {
  const saved: SavedLocation[] = [
    { building_code: "BA", qs_level_label: "04.1F", wbs_node_id: "03.1F", status: "confirmed", split_rule: "none" },
    { building_code: "BA", qs_level_label: "14.TR", wbs_node_id: null, status: "ignored", split_rule: "none" },
    { building_code: "BA", qs_level_label: "All", wbs_node_id: null, status: "confirmed", split_rule: "gfa" },
  ];
  const two = levels.slice(1, 3); // GF, MZ

  it("puts a confirmed location's line on its level", () => {
    expect(allocateLine({ building_code: "BA", level: "04.1F" }, saved, levels, new Map())).toEqual([{ wbs_node_id: "03.1F", share: 1 }]);
  });

  it("never uses unconfirmed suggestions or ignored locations", () => {
    expect(allocateLine({ building_code: "BA", level: "05.2F" }, saved, levels, new Map())).toEqual([]);
    expect(allocateLine({ building_code: "BA", level: "14.TR" }, saved, levels, new Map())).toEqual([]);
  });

  it("splits project-wide lines by GFA, or equally when no GFA is recorded", () => {
    expect(allocateLine({ building_code: "BA", level: "All" }, saved, two, new Map([["01.GF", 600], ["02.MZ", 200]])))
      .toEqual([{ wbs_node_id: "01.GF", share: 0.75 }, { wbs_node_id: "02.MZ", share: 0.25 }]);
    expect(allocateLine({ building_code: "BA", level: "All" }, saved, two, new Map()))
      .toEqual([{ wbs_node_id: "01.GF", share: 0.5 }, { wbs_node_id: "02.MZ", share: 0.5 }]);
  });
});
