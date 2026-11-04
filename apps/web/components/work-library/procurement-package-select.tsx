"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { packageLabel, PACKAGE_TYPE_LABEL, rankPackages } from "@/lib/work-library/activity-chips-rules";
import { searchProcurementPackages, type ProcurementPackage } from "@/lib/work-library/activity-chips-service";

/**
 * Picks a Construction Work Library procurement package (used on purchase requisitions). Packages in `suggestedIds`
 * (those the PR's BOQ lines lead to through their activities) are listed first.
 */
export function ProcurementPackageSelect({
  db, value, onChange, suggestedIds, className,
}: { db: SupabaseClient; value: string; onChange: (id: string) => void; suggestedIds: ReadonlySet<string>; className?: string }) {
  const [packages, setPackages] = useState<ProcurementPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    searchProcurementPackages(db, "", null, 500)
      .then((rows) => { if (live) setPackages(rows); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load packages"); });
    return () => { live = false; };
  }, [db]);

  const ranked = useMemo(() => rankPackages(packages ?? [], suggestedIds), [packages, suggestedIds]);
  const suggested = ranked.filter((p) => suggestedIds.has(p.id));
  const rest = ranked.filter((p) => !suggestedIds.has(p.id));
  const option = (p: ProcurementPackage) => <option key={p.id} value={p.id}>{packageLabel(p)} · {PACKAGE_TYPE_LABEL[p.package_type]}</option>;

  return (
    <div className="space-y-1">
      <select className={className} value={value} onChange={(e) => onChange(e.target.value)} disabled={!packages && !error}>
        <option value="">{packages ? "No package" : error ? "Packages unavailable" : "Loading..."}</option>
        {suggested.length > 0 && <optgroup label="Suggested from the BOQ lines">{suggested.map(option)}</optgroup>}
        {rest.length > 0 && (suggested.length > 0 ? <optgroup label="Other packages">{rest.map(option)}</optgroup> : rest.map(option))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
