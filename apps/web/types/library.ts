// TypeScript interfaces for Cost Estimation Libraries
// Re-exports from the repo-level types definition.

/** Common fields for any library entry */
export interface LibraryItemBase {
  id: string; // UUID
  sector?: string; // sector this item belongs to (e.g. "Residential")
  name: string; // Human-readable label
  description?: string;
  unit?: string; // e.g., "m³", "kg", "item"
  currency: string; // ISO-4217, e.g., "USD"
  price: number; // Base price per unit
  effectiveDate?: string; // ISO-8601 date string
  source?: string; // URL or internal reference
}

/** Material specific fields */
export interface MaterialItem extends LibraryItemBase {
  materialType: string; // e.g., "Concrete", "Steel"
  grade?: string;
  specifications?: string; // Optional free-form spec text
}

/** Unit-price table specific fields */
export interface UnitPriceItem extends LibraryItemBase {
  activityCode?: string; // CSI or custom code
  laborFactor?: number; // Multiplier for labor component
}

/** Wrapper for each sector's library */
export interface LibrarySector {
  sector: string; // "Residential", "Commercial", …
  items: (MaterialItem | UnitPriceItem)[];
}

