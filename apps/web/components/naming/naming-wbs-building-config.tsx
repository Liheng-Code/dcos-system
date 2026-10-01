"use client";

import { useEffect, useState } from "react";
import { listBuildingCodesWithIsActive } from "@/lib/naming/naming-queries";
import { Loader2, Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface BuildingCode {
  code: string;
  name: string;
  description: string;
  is_reserved: boolean;
}

interface WbsBuildingConfigProps {
  buildingCode: string;
  buildingName: string;
  onBuildingCodeChange: (code: string) => void;
  onBuildingNameChange: (name: string) => void;
}

export function WbsBuildingConfig({
  buildingCode,
  buildingName,
  onBuildingCodeChange,
  onBuildingNameChange,
}: WbsBuildingConfigProps) {
  const [codes, setCodes] = useState<BuildingCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBuildingCodesWithIsActive("code, name, description, is_reserved")
      .then(({ data }) => {
        if (data) setCodes(data as BuildingCode[]);
        setLoading(false);
      });
  }, []);

  const selected = codes.find((c) => c.code === buildingCode);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading building codes...
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Building Setup</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Building Code *</Label>
          <select
            value={buildingCode}
            onChange={(e) => {
              onBuildingCodeChange(e.target.value);
              if (!buildingName) {
                const c = codes.find((c2) => c2.code === e.target.value);
                if (c) onBuildingNameChange(c.name);
              }
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
          >
            <option value="">— Select Building —</option>
            {codes.map((c) => (
              <option key={c.code} value={c.code} disabled={c.is_reserved}>
                {c.code}{c.is_reserved ? " (Reserved)" : ""} — {c.name}
              </option>
            ))}
          </select>
          {selected?.is_reserved && (
            <p className="text-xs text-amber-600">Reserved code — {selected.description}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Building Name</Label>
          <input
            value={buildingName}
            onChange={(e) => onBuildingNameChange(e.target.value)}
            placeholder="e.g. Tower, Podium..."
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
}
