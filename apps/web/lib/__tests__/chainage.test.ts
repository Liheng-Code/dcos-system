import { describe, expect, it } from "vitest";
import { buildSegments, formatChainage, lengthShares, overlapShares, parseChainagePoint, parseChainageRange } from "../chainage";

describe("chainage", () => {
  it("reads chainage points", () => {
    expect(parseChainagePoint("1+250")).toBe(1250);
    expect(parseChainagePoint("CH 0+050.5")).toBe(50.5);
    expect(parseChainagePoint("1.25 km")).toBe(1250);
    expect(parseChainagePoint("800")).toBe(800);
    expect(parseChainagePoint("1F")).toBeNull();
  });

  it("reads ranges from BOQ location labels, never plain level labels", () => {
    expect(parseChainageRange("CH 0+000 - 1+500")).toEqual({ from: 0, to: 1500 });
    expect(parseChainageRange("1+000 to 2+250")).toEqual({ from: 1000, to: 2250 });
    expect(parseChainageRange("2+000~1+000")).toEqual({ from: 1000, to: 2000 });
    expect(parseChainageRange("KM 0-1.5")).toEqual({ from: 0, to: 1500 });
    expect(parseChainageRange("CH 0+000 – 0+800")).toEqual({ from: 0, to: 800 });
    expect(parseChainageRange("1F")).toBeNull();
    expect(parseChainageRange("02")).toBeNull();
    expect(parseChainageRange("ALL")).toBeNull();
    expect(parseChainageRange("CH 1+000")).toBeNull();
  });

  it("formats chainage", () => {
    expect(formatChainage(0)).toBe("0+000");
    expect(formatChainage(1250)).toBe("1+250");
    expect(formatChainage(12005.5)).toBe("12+005.5");
  });

  it("builds equal sections, the last one shorter", () => {
    const s = buildSegments(0, 2500, 1000);
    expect(s.map((x) => [x.code, x.from, x.to])).toEqual([["S01", 0, 1000], ["S02", 1000, 2000], ["S03", 2000, 2500]]);
    expect(s[2].name).toBe("CH 2+000 – 2+500");
    expect(buildSegments(2500, 3000, 1000, 3)[0].code).toBe("S04");
    expect(buildSegments(1000, 1000, 100)).toEqual([]);
  });

  it("shares a range over the sections it overlaps, and a route line by section length", () => {
    const sections = [{ id: "a", from: 0, to: 1000 }, { id: "b", from: 1000, to: 2000 }, { id: "c", from: 2000, to: 2500 }];
    expect(overlapShares({ from: 500, to: 1500 }, sections)).toEqual([{ id: "a", share: 0.5 }, { id: "b", share: 0.5 }]);
    expect(overlapShares({ from: 3000, to: 4000 }, sections)).toEqual([]);
    expect(lengthShares(sections)).toEqual([{ id: "a", share: 0.4 }, { id: "b", share: 0.4 }, { id: "c", share: 0.2 }]);
  });
});
