import { describe, expect, it } from "vitest";
import { aggregateByTrade, aggregateByType, capacityPeriodsByResource, flagShortageWeeks, type AllocationRow, type PlanResource } from "../resource-service";

function resource(over: Partial<PlanResource>): PlanResource {
  return {
    id: "r1", project_id: "p1", name: "R1", resource_type: "labor", max_units: 100,
    cost_per_unit: null, unit_label: null, calendar_id: null, is_active: true, profile_id: null, trade: null, dwl_resource_id: null,
    created_at: "2026-01-01", ...over,
  };
}
function alloc(over: Partial<AllocationRow>): AllocationRow {
  return { resource_id: "r1", resource_name: "R1", work_date: "2026-10-01", total_allocation: 100, max_units: 100, is_overallocated: false, ...over };
}

describe("aggregateByTrade", () => {
  it("groups resources with the same trade together and sums their demand", () => {
    const resources = [
      resource({ id: "r1", trade: "Formwork", max_units: 500 }),
      resource({ id: "r2", trade: "Formwork", max_units: 300 }),
      resource({ id: "r3", trade: "Rebar", max_units: 400 }),
    ];
    const allocation = [
      alloc({ resource_id: "r1", work_date: "2026-10-01", total_allocation: 600 }),
      alloc({ resource_id: "r2", work_date: "2026-10-01", total_allocation: 100 }),
      alloc({ resource_id: "r3", work_date: "2026-10-01", total_allocation: 200 }),
    ];
    const points = aggregateByTrade(allocation, resources);
    expect(points).toContainEqual({ work_date: "2026-10-01", trade: "Formwork", demand: 700, capacity: 800 });
    expect(points).toContainEqual({ work_date: "2026-10-01", trade: "Rebar", demand: 200, capacity: 400 });
  });

  it("falls back to the resource's own name as its trade when trade is null (a manually created resource)", () => {
    const resources = [resource({ id: "r1", trade: null, name: "John's Crew", max_units: 200 })];
    const allocation = [alloc({ resource_id: "r1", total_allocation: 150 })];
    const points = aggregateByTrade(allocation, resources);
    expect(points[0].trade).toBe("John's Crew");
  });

  it("excludes an inactive resource's capacity but a still-open allocation for it contributes nothing (unknown trade lookup) once removed from the resource list", () => {
    const resources = [resource({ id: "r1", trade: "Formwork", is_active: false, max_units: 500 })];
    const allocation = [alloc({ resource_id: "r1", total_allocation: 100 })];
    const points = aggregateByTrade(allocation, resources);
    expect(points[0].capacity).toBe(0); // inactive resources don't count toward capacity
    expect(points[0].demand).toBe(100); // but a lingering allocation still shows as demand — visibly wrong, not hidden
  });

  it("ignores allocation rows for a resource that no longer exists", () => {
    const points = aggregateByTrade([alloc({ resource_id: "ghost" })], []);
    expect(points).toHaveLength(0);
  });
});

describe("flagShortageWeeks", () => {
  it("flags a week whose peak daily demand exceeds capacity, using the Monday of that week", () => {
    const points = [
      { work_date: "2026-10-05", trade: "Formwork", demand: 300, capacity: 500 }, // Monday
      { work_date: "2026-10-07", trade: "Formwork", demand: 600, capacity: 500 }, // Wednesday, same week — over
      { work_date: "2026-10-12", trade: "Formwork", demand: 400, capacity: 500 }, // next Monday — under
    ];
    const weeks = flagShortageWeeks(points);
    expect(weeks).toEqual([{ trade: "Formwork", week_start: "2026-10-05", peak_demand: 600, capacity: 500 }]);
  });

  it("returns nothing when demand never exceeds capacity", () => {
    expect(flagShortageWeeks([{ work_date: "2026-10-05", trade: "Rebar", demand: 100, capacity: 500 }])).toEqual([]);
  });

  it("ignores a trade with zero capacity (nothing to compare against, not a false shortage)", () => {
    expect(flagShortageWeeks([{ work_date: "2026-10-05", trade: "Rebar", demand: 100, capacity: 0 }])).toEqual([]);
  });

  it("sorts multiple shortage weeks by trade then week", () => {
    const points = [
      { work_date: "2026-10-12", trade: "Rebar", demand: 600, capacity: 400 },
      { work_date: "2026-10-05", trade: "Formwork", demand: 600, capacity: 400 },
      { work_date: "2026-10-05", trade: "Rebar", demand: 600, capacity: 400 },
    ];
    const weeks = flagShortageWeeks(points);
    expect(weeks.map((w) => `${w.trade}|${w.week_start}`)).toEqual(["Formwork|2026-10-05", "Rebar|2026-10-05", "Rebar|2026-10-12"]);
  });
});

describe("capacity periods (doc 35 C1)", () => {
  const resources = [resource({ id: "r1", trade: "Formwork", max_units: 500 }), resource({ id: "r2", trade: "Formwork", max_units: 300 })];
  const periods = capacityPeriodsByResource([
    { id: "c1", resource_id: "r1", from_date: "2026-10-05", to_date: "2026-10-09", max_units: 1000, note: null },
    { id: "c2", resource_id: "r2", from_date: "2026-10-12", to_date: null, max_units: 0, note: null },
  ]);

  it("sums each resource's capacity on the day itself", () => {
    const allocation = [
      alloc({ resource_id: "r1", work_date: "2026-10-01", total_allocation: 100 }),
      alloc({ resource_id: "r1", work_date: "2026-10-06", total_allocation: 100 }),
      alloc({ resource_id: "r1", work_date: "2026-10-13", total_allocation: 100 }),
    ];
    const cap = aggregateByTrade(allocation, resources, periods).map((p) => [p.work_date, p.capacity]);
    expect(cap).toEqual([["2026-10-01", 800], ["2026-10-06", 1300], ["2026-10-13", 500]]);
    expect(aggregateByType(allocation, resources, periods).map((p) => p.capacity)).toEqual([800, 1300, 500]);
  });

  it("flags a week against the capacity of its own days", () => {
    const points = [
      { work_date: "2026-10-06", trade: "Formwork", demand: 1200, capacity: 1300 }, // inside the extra capacity: fine
      { work_date: "2026-10-13", trade: "Formwork", demand: 600, capacity: 500 },  // after r2 leaves: short
      { work_date: "2026-10-14", trade: "Formwork", demand: 550, capacity: 500 },
    ];
    expect(flagShortageWeeks(points)).toEqual([{ trade: "Formwork", week_start: "2026-10-12", peak_demand: 600, capacity: 500 }]);
  });
});
