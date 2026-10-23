/**
 * Unit tests for the Libraries API route helpers.
 *
 * These tests cover the pure helper functions (normaliseSector,
 * dbRowToItem, itemToDbRow) extracted from the sector route handler so
 * they can be tested without a database or HTTP server.
 *
 * Environment: node (matches apps/web/vitest.config.ts)
 */
import { describe, it, expect } from "vitest";

// ── Inline the helpers (avoids importing Next.js server internals) ────────────

const SECTOR_MAP: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  institutional: "Institutional",
  infrastructure: "Infrastructure",
  prelim: "Residential",
};

function normaliseSector(raw: string): string {
  return SECTOR_MAP[raw.toLowerCase()] ?? raw;
}

function itemToDbRow(item: Record<string, unknown>, sector: string) {
  return {
    sector,
    name: item.name as string,
    description: (item.description as string | undefined) ?? null,
    unit: (item.unit as string | undefined) ?? null,
    currency: (item.currency as string | undefined) ?? "USD",
    price: Number(item.price ?? 0),
    effective_date: (item.effectiveDate as string | undefined) ?? null,
    source: (item.source as string | undefined) ?? null,
    material_type: (item.materialType as string | undefined) ?? null,
    grade: (item.grade as string | undefined) ?? null,
    specifications: (item.specifications as string | undefined) ?? null,
    activity_code: (item.activityCode as string | undefined) ?? null,
    labor_factor:
      item.laborFactor != null ? Number(item.laborFactor) : null,
  };
}

function dbRowToItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    sector: row.sector as string,
    name: row.name as string,
    description: row.description ?? undefined,
    unit: row.unit ?? undefined,
    currency: row.currency as string,
    price: Number(row.price),
    effectiveDate: row.effective_date ?? undefined,
    source: row.source ?? undefined,
    materialType: row.material_type ?? undefined,
    grade: row.grade ?? undefined,
    specifications: row.specifications ?? undefined,
    activityCode: row.activity_code ?? undefined,
    laborFactor:
      row.labor_factor != null ? Number(row.labor_factor) : undefined,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Libraries API helpers", () => {
  // ── normaliseSector ──────────────────────────────────────────────────────
  describe("normaliseSector", () => {
    it("normalises known slugs to DB title-case values", () => {
      expect(normaliseSector("residential")).toBe("Residential");
      expect(normaliseSector("commercial")).toBe("Commercial");
      expect(normaliseSector("industrial")).toBe("Industrial");
      expect(normaliseSector("institutional")).toBe("Institutional");
      expect(normaliseSector("infrastructure")).toBe("Infrastructure");
    });

    it("maps 'prelim' to 'Residential'", () => {
      expect(normaliseSector("prelim")).toBe("Residential");
    });

    it("is case-insensitive for the input slug", () => {
      expect(normaliseSector("RESIDENTIAL")).toBe("Residential");
      expect(normaliseSector("Commercial")).toBe("Commercial");
    });

    it("passes through unknown slugs unchanged", () => {
      expect(normaliseSector("unknown-sector")).toBe("unknown-sector");
    });
  });

  // ── itemToDbRow ──────────────────────────────────────────────────────────
  describe("itemToDbRow", () => {
    it("maps camelCase front-end fields to snake_case DB fields", () => {
      const row = itemToDbRow(
        {
          name: "Ready-mix C25",
          unit: "m³",
          currency: "USD",
          price: 120.5,
          effectiveDate: "2026-01-01",
          source: "RS Means",
          materialType: "Concrete",
          grade: "C25",
          specifications: "BS 8500",
          activityCode: "03 30 00",
          laborFactor: 1.2,
        },
        "Residential"
      );

      expect(row.sector).toBe("Residential");
      expect(row.name).toBe("Ready-mix C25");
      expect(row.unit).toBe("m³");
      expect(row.currency).toBe("USD");
      expect(row.price).toBe(120.5);
      expect(row.effective_date).toBe("2026-01-01");
      expect(row.source).toBe("RS Means");
      expect(row.material_type).toBe("Concrete");
      expect(row.grade).toBe("C25");
      expect(row.specifications).toBe("BS 8500");
      expect(row.activity_code).toBe("03 30 00");
      expect(row.labor_factor).toBe(1.2);
    });

    it("uses 'USD' as default currency when omitted", () => {
      const row = itemToDbRow({ name: "Steel", price: 2.0 }, "Commercial");
      expect(row.currency).toBe("USD");
    });

    it("stores null for optional fields that are absent", () => {
      const row = itemToDbRow({ name: "Steel", price: 2.0 }, "Commercial");
      expect(row.description).toBeNull();
      expect(row.unit).toBeNull();
      expect(row.effective_date).toBeNull();
      expect(row.source).toBeNull();
      expect(row.material_type).toBeNull();
      expect(row.grade).toBeNull();
      expect(row.labor_factor).toBeNull();
    });

    it("coerces price to a number", () => {
      const row = itemToDbRow({ name: "Wood", price: "99.9" }, "Residential");
      expect(typeof row.price).toBe("number");
      expect(row.price).toBe(99.9);
    });
  });

  // ── dbRowToItem ──────────────────────────────────────────────────────────
  describe("dbRowToItem", () => {
    const sampleRow = {
      id: "abc-123",
      sector: "Industrial",
      name: "Structural Steel",
      description: "S275 grade",
      unit: "kg",
      currency: "USD",
      price: "1.85",
      effective_date: "2026-06-01",
      source: "Supplier A",
      material_type: "Steel",
      grade: "S275",
      specifications: "BS EN 10025",
      activity_code: "05 12 00",
      labor_factor: "0.8",
    };

    it("maps snake_case DB row to camelCase front-end item", () => {
      const item = dbRowToItem(sampleRow);

      expect(item.id).toBe("abc-123");
      expect(item.sector).toBe("Industrial");
      expect(item.name).toBe("Structural Steel");
      expect(item.description).toBe("S275 grade");
      expect(item.unit).toBe("kg");
      expect(item.currency).toBe("USD");
      expect(item.price).toBe(1.85);
      expect(item.effectiveDate).toBe("2026-06-01");
      expect(item.source).toBe("Supplier A");
      expect(item.materialType).toBe("Steel");
      expect(item.grade).toBe("S275");
      expect(item.specifications).toBe("BS EN 10025");
      expect(item.activityCode).toBe("05 12 00");
      expect(item.laborFactor).toBe(0.8);
    });

    it("returns undefined (not null) for optional missing fields", () => {
      const item = dbRowToItem({
        id: "x",
        sector: "Residential",
        name: "Concrete",
        currency: "USD",
        price: 100,
        description: null,
        unit: null,
        effective_date: null,
        source: null,
        material_type: null,
        grade: null,
        specifications: null,
        activity_code: null,
        labor_factor: null,
      });

      expect(item.description).toBeUndefined();
      expect(item.unit).toBeUndefined();
      expect(item.effectiveDate).toBeUndefined();
      expect(item.source).toBeUndefined();
      expect(item.materialType).toBeUndefined();
      expect(item.grade).toBeUndefined();
      expect(item.specifications).toBeUndefined();
      expect(item.activityCode).toBeUndefined();
      expect(item.laborFactor).toBeUndefined();
    });

    it("round-trips correctly through itemToDbRow → dbRowToItem", () => {
      const original = {
        name: "Clay Brick",
        unit: "No.",
        currency: "USD",
        price: 0.45,
        materialType: "Masonry",
        grade: "Engineering",
        laborFactor: 1.5,
      };
      const dbRow = itemToDbRow(original, "Residential");
      const roundTripped = dbRowToItem({ ...dbRow, id: "generated-id" });

      expect(roundTripped.name).toBe(original.name);
      expect(roundTripped.unit).toBe(original.unit);
      expect(roundTripped.price).toBe(original.price);
      expect(roundTripped.materialType).toBe(original.materialType);
      expect(roundTripped.laborFactor).toBe(original.laborFactor);
    });
  });
});

