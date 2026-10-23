"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchCustomCategories, getAllSectors, sectorLabel, type ProjectSector } from "@/lib/project-categories";

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary";

/**
 * Sector + "Recommended for" building types of a WBS or level template (lib/template-fit.ts).
 * Renders two grid cells: the sector select, then a full-width row of building-type chips.
 */
export function TemplateSectorFields({ sector, buildingTypes, onChange }: {
  sector: string;
  buildingTypes: string[];
  onChange: (next: { sector: string; buildingTypes: string[] }) => void;
}) {
  const [sectors, setSectors] = useState<ProjectSector[]>(() => getAllSectors());
  useEffect(() => {
    let cancelled = false;
    fetchCustomCategories().then((custom) => { if (!cancelled) setSectors(getAllSectors(custom)); });
    return () => { cancelled = true; };
  }, []);

  const types = sectors.find((s) => s.value === sector)?.buildingTypes ?? [];
  const toggle = (t: string) =>
    onChange({ sector, buildingTypes: buildingTypes.includes(t) ? buildingTypes.filter((x) => x !== t) : [...buildingTypes, t] });

  return (
    <>
      <label className="space-y-1 text-xs font-medium">
        Sector
        <select
          value={sector}
          onChange={(e) => {
            const allowed = new Set(sectors.find((s) => s.value === e.target.value)?.buildingTypes.map((b) => b.value) ?? []);
            onChange({ sector: e.target.value, buildingTypes: buildingTypes.filter((b) => allowed.has(b)) });
          }}
          className={field}
        >
          <option value="">— None —</option>
          {sectors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          {sector && !sectors.some((s) => s.value === sector) && <option value={sector}>{sectorLabel(sector)}</option>}
        </select>
      </label>
      {types.length > 0 && (
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-xs font-medium">Recommended for</legend>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={buildingTypes.includes(t.value)}
                onClick={() => toggle(t.value)}
                className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
                  buildingTypes.includes(t.value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Projects of the ticked building types get this template as their recommended one. None ticked = suggested for any project in the sector.
          </p>
        </fieldset>
      )}
    </>
  );
}

/**
 * Sector list + building types for library items that serve several sectors (activity masters and
 * activity templates, lib/template-fit.ts "sector lists"). No sector ticked = every sector.
 */
export function SectorListFields({ sectors, buildingTypes, onChange }: {
  sectors: string[];
  buildingTypes: string[];
  onChange: (next: { sectors: string[]; buildingTypes: string[] }) => void;
}) {
  const [all, setAll] = useState<ProjectSector[]>(() => getAllSectors());
  useEffect(() => {
    let cancelled = false;
    fetchCustomCategories().then((custom) => { if (!cancelled) setAll(getAllSectors(custom)); });
    return () => { cancelled = true; };
  }, []);

  const chosen = all.filter((s) => sectors.includes(s.value));
  const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
    on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted");
  const toggleSector = (v: string) => {
    const next = sectors.includes(v) ? sectors.filter((x) => x !== v) : [...sectors, v];
    const allowed = new Set(all.filter((s) => next.includes(s.value)).flatMap((s) => s.buildingTypes.map((b) => b.value)));
    onChange({ sectors: next, buildingTypes: buildingTypes.filter((b) => allowed.has(b)) });
  };
  const toggleType = (v: string) =>
    onChange({ sectors, buildingTypes: buildingTypes.includes(v) ? buildingTypes.filter((x) => x !== v) : [...buildingTypes, v] });

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">Sectors</legend>
        <div className="flex flex-wrap gap-1.5">
          {all.map((s) => (
            <button key={s.value} type="button" aria-pressed={sectors.includes(s.value)} onClick={() => toggleSector(s.value)} className={chip(sectors.includes(s.value))}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{sectors.length === 0 ? "None ticked = used in every sector." : "Used in the ticked sectors only."}</p>
      </fieldset>
      {chosen.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium">Recommended for</legend>
          {chosen.map((s) => (
            <div key={s.value} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{s.label}</span>
              {s.buildingTypes.map((t) => (
                <button key={t.value} type="button" aria-pressed={buildingTypes.includes(t.value)} onClick={() => toggleType(t.value)} className={chip(buildingTypes.includes(t.value))}>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Projects of the ticked building types see this first in pickers.</p>
        </fieldset>
      )}
    </div>
  );
}
