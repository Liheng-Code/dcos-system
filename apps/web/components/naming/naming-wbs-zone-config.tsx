"use client";

import { useEffect, useState } from "react";
import { listZoneTypeCodes } from "@/lib/naming/naming-queries";
import { Loader2, Grid3X3 } from "lucide-react";

interface ZoneTypeCode {
  code: string;
  name: string;
  category: string;
  description: string;
}

interface WbsZoneConfigProps {
  designZones: string[];
  constructionZones: string[];
  onDesignZonesChange: (zones: string[]) => void;
  onConstructionZonesChange: (zones: string[]) => void;
}

export function WbsZoneConfig({
  designZones,
  constructionZones,
  onDesignZonesChange,
  onConstructionZonesChange,
}: WbsZoneConfigProps) {
  const [zones, setZones] = useState<ZoneTypeCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listZoneTypeCodes()
      .then(({ data }) => {
        if (data) setZones(data as ZoneTypeCode[]);
        setLoading(false);
      });
  }, []);

  function toggle(arr: string[], code: string, onChange: (v: string[]) => void) {
    if (code.endsWith("All")) {
      if (arr.includes(code)) {
        onChange([]);
      } else {
        onChange([code]);
      }
    } else {
      if (arr.includes(code)) {
        onChange(arr.filter((c) => c !== code && !c.endsWith("All")));
      } else {
        onChange([...arr.filter((c) => !c.endsWith("All")), code]);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading zones...
      </div>
    );
  }

  const designZoneList = zones.filter((z) => z.category === "design");
  const constructionZoneList = zones.filter((z) => z.category === "construction");

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <details open>
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
          <Grid3X3 className="h-4 w-4 text-primary" />
          Zone Setup
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Design Zones</p>
            <div className="space-y-2">
              {designZoneList.map((z) => (
                <label key={z.code} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={designZones.includes(z.code)}
                    onChange={() => toggle(designZones, z.code, onDesignZonesChange)}
                    className="h-3.5 w-3.5 rounded border-border accent-foreground"
                  />
                  <span className="text-xs font-medium group-hover:text-foreground">{z.code}</span>
                  <span className="text-xs text-muted-foreground">{z.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Construction Zones</p>
            <div className="space-y-2">
              {constructionZoneList.map((z) => (
                <label key={z.code} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={constructionZones.includes(z.code)}
                    onChange={() => toggle(constructionZones, z.code, onConstructionZonesChange)}
                    className="h-3.5 w-3.5 rounded border-border accent-foreground"
                  />
                  <span className="text-xs font-medium group-hover:text-foreground">{z.code}</span>
                  <span className="text-xs text-muted-foreground">{z.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
