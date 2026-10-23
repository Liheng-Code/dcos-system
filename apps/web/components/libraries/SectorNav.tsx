/**
 * SectorNav – top navigation bar for switching between library sectors.
 *
 * Sectors match the cost_libraries.sector CHECK constraint:
 *   Residential | Commercial | Industrial | Institutional | Infrastructure
 *
 * Usage:
 *   <SectorNav activeSector="residential" />
 */
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTORS = [
  { slug: "residential",    label: "Residential" },
  { slug: "commercial",     label: "Commercial" },
  { slug: "industrial",     label: "Industrial" },
  { slug: "institutional",  label: "Institutional" },
  { slug: "infrastructure", label: "Infrastructure" },
] as const;

interface SectorNavProps {
  /** The currently active sector slug (matched case-insensitively). */
  activeSector: string;
}

export const SectorNav: React.FC<SectorNavProps> = ({ activeSector }) => {
  const active = activeSector.toLowerCase();
  return (
    <nav className="flex gap-1 border-b pb-2 mb-6 overflow-x-auto">
      {SECTORS.map(({ slug, label }) => (
        <Link
          key={slug}
          href={`/dashboard/libraries/${slug}`}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
            active === slug
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
};

export default SectorNav;

