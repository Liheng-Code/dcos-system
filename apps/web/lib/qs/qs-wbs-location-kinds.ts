export type QsWbsLocationKind =
  | "building"
  | "level"
  | "zone"
  | "area"
  | "facility"
  | "route"
  | "segment"
  | "asset"
  | "system";

const allowedKinds = new Set<QsWbsLocationKind>([
  "building", "level", "zone", "area", "facility", "route", "segment", "asset", "system",
]);

/** Resolve legacy location rows while retaining an explicit kind when one is configured. */
export function resolveQsWbsLocationKind(input: {
  locationModel?: string | null;
  locationType?: string | null;
  locationCode?: string | null;
  locationKind?: string | null;
}): QsWbsLocationKind {
  if (input.locationKind && allowedKinds.has(input.locationKind as QsWbsLocationKind)) {
    return input.locationKind as QsWbsLocationKind;
  }

  const labels = `${input.locationType ?? ""} ${input.locationCode ?? ""}`.toLowerCase();
  if (/segment|chainage|reach/.test(labels)) return "segment";
  if (/route|corridor|road|pipeline|cable/.test(labels) || input.locationModel === "linear") return "route";
  if (/asset|equipment|structure/.test(labels)) return "asset";
  if (/system/.test(labels)) return "system";
  if (/zone|podium/.test(labels)) return "zone";
  if (/external|site|campus/.test(labels)) return "area";
  if (input.locationModel === "facility") return "facility";
  if (input.locationModel === "campus") return "building";
  return "level";
}

export function qsWbsLocationLabel(kind: QsWbsLocationKind): string {
  return kind === "level" ? "Level" : kind.charAt(0).toUpperCase() + kind.slice(1);
}
