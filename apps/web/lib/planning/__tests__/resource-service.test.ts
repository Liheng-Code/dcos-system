import { describe, expect, it } from "vitest";
import { aggregateByType, type AllocationRow, type PlanResource } from "../resource-service";

function resource(id: string, type: PlanResource["resource_type"], maxUnits: number, active = true): PlanResource {
  return {
    id,
    project_id: "p1",
    name: id,
    resource_type: type,
    max_units: maxUnits,
    cost_per_unit: null,
    unit_label: null,
    calendar_id: null,
    is_active: active,
    profile_id: null,
    created_at: "2026-01-01",
  };
}

function alloc(resourceId: string, date: string, total: number): AllocationRow {
  return { resource_id: resourceId, resource_name: resourceId, work_date: date, total_allocation: total, max_units: 100, is_overallocated: false };
}

describe("aggregateByType", () => {
  it("sums demand across resources of the same type on the same date", () => {
    const resources = [resource("r1", "labor", 100), resource("r2", "labor", 100)];
    const allocation = [alloc("r1", "2026-01-05", 80), alloc("r2", "2026-01-05", 50)];
    const points = aggregateByType(allocation, resources);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ work_date: "2026-01-05", resource_type: "labor", demand: 130, capacity: 200 });
  });

  it("keeps different resource types on the same date as separate points", () => {
    const resources = [resource("r1", "labor", 100), resource("r2", "equipment", 50)];
    const allocation = [alloc("r1", "2026-01-05", 60), alloc("r2", "2026-01-05", 40)];
    const points = aggregateByType(allocation, resources);
    expect(points).toHaveLength(2);
    const labor = points.find((p) => p.resource_type === "labor")!;
    const equipment = points.find((p) => p.resource_type === "equipment")!;
    expect(labor.demand).toBe(60);
    expect(equipment.demand).toBe(40);
    expect(equipment.capacity).toBe(50);
  });

  it("excludes inactive resources from capacity but an allocation row for an unknown resource is simply ignored", () => {
    const resources = [resource("r1", "labor", 100, true), resource("r2", "labor", 100, false)];
    const allocation = [alloc("r1", "2026-01-05", 30), alloc("ghost", "2026-01-05", 999)];
    const points = aggregateByType(allocation, resources);
    expect(points).toHaveLength(1);
    expect(points[0].demand).toBe(30); // the "ghost" row has no matching resource, so it contributes nothing
    expect(points[0].capacity).toBe(100); // only the active resource counts toward capacity
  });

  it("returns an empty array for no allocation rows", () => {
    expect(aggregateByType([], [resource("r1", "labor", 100)])).toEqual([]);
  });
});
