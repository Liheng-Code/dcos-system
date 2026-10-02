// Material identity fingerprint — a TypeScript mirror of the database
// functions dwl_norm_spec() / dwl_material_fingerprint() (migration
// 20261002000002). Keep the two in step: the import uses this to match a file
// row to an existing material before anything is written, and the database
// uses its own copy to refuse an exact duplicate on create.
//
// Same material = same category + unit + (type, size, thickness, grade,
// compressive strength, standard). Name is only used when all of those are
// blank. Supplier, brand and price are never part of the identity.

export function normSpec(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\*/g, "x")
    .replace(/µ/g, "u")
    .replace(/[^a-z0-9.]+/g, "");
}

export interface MaterialIdentity {
  category_id: string | null;
  unit: string | null;
  material_type: string | null;
  dimension: string | null;
  thickness: string | null;
  grade: string | null;
  compressive_strength: string | null;
  standard: string | null;
  material_name: string | null;
}

export function materialFingerprint(m: MaterialIdentity): string {
  const spec = [m.material_type, m.dimension, m.thickness, m.grade, m.compressive_strength, m.standard].map(normSpec);
  const body = spec.every((s) => s === "") ? `n:${normSpec(m.material_name)}` : spec.join("|");
  return `${m.category_id ?? ""}|${(m.unit ?? "").toLowerCase()}|${body}`;
}
