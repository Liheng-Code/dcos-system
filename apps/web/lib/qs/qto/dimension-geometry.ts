import type { Pt } from "./geometry";

export type DimensionMode = "linear" | "aligned";

export interface DimensionAnnotation {
  mode: DimensionMode;
  location: Pt;
}

export interface DimensionGeometry {
  start: Pt;
  end: Pt;
  measuredPageUnits: number;
  orientation: "horizontal" | "vertical" | "aligned";
}

type DimensionMetadataPoint = Pt & { _dcosDimensionMode?: DimensionMode };

export function dimensionGeometry(a: Pt, b: Pt, location: Pt, mode: DimensionMode): DimensionGeometry {
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (mode === "aligned") {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return { start: a, end: b, measuredPageUnits: 0, orientation: "aligned" };
    const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const offset = (location.x - midpoint.x) * normal.x + (location.y - midpoint.y) * normal.y;
    return {
      start: { x: a.x + normal.x * offset, y: a.y + normal.y * offset },
      end: { x: b.x + normal.x * offset, y: b.y + normal.y * offset },
      measuredPageUnits: length,
      orientation: "aligned",
    };
  }

  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontal) {
    return {
      start: { x: a.x, y: location.y },
      end: { x: b.x, y: location.y },
      measuredPageUnits: Math.abs(b.x - a.x),
      orientation: "horizontal",
    };
  }
  return {
    start: { x: location.x, y: a.y },
    end: { x: location.x, y: b.y },
    measuredPageUnits: Math.abs(b.y - a.y),
    orientation: "vertical",
  };
}

export function encodeDimensionPoints(points: [Pt, Pt], annotation: DimensionAnnotation): Pt[] {
  const metadataPoint: DimensionMetadataPoint = {
    ...annotation.location,
    _dcosDimensionMode: annotation.mode,
  };
  return [points[0], points[1], metadataPoint];
}

export function decodeDimensionPoints(points: Pt[]): DimensionAnnotation | null {
  const metadataPoint = points[2] as DimensionMetadataPoint | undefined;
  if (
    !metadataPoint ||
    (metadataPoint._dcosDimensionMode !== "linear" && metadataPoint._dcosDimensionMode !== "aligned") ||
    !Number.isFinite(metadataPoint.x) ||
    !Number.isFinite(metadataPoint.y)
  ) {
    return null;
  }
  return {
    mode: metadataPoint._dcosDimensionMode,
    location: { x: metadataPoint.x, y: metadataPoint.y },
  };
}
