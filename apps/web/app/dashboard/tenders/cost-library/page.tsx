"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Database, Plus, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import SiteDataPanel from "@/components/qs/tenders/cost-library/site-data-panel";
import PrelimTree from "@/components/qs/tenders/cost-library/prelim-tree";
import ItemEditor from "@/components/qs/tenders/cost-library/item-editor";
import AddItemDialog from "@/components/qs/tenders/cost-library/add-item-dialog";
import {
  type SiteDataParams,
  type CalculatedPrelimTree,
  type CalculatedPrelimItem,
  type PrelimLibraryItemWithComponents,
  getLibraryItemsWithComponents,
  calculatePrelimTree,
  exportPrelimTreeToExcel,
  DEFAULT_SITE_DATA,
  PRELIM_PROFILES,
  PROFILE_PARAMS,
  SITE_DATA_META,
  type PrelimProfileCode,
  getDefaultPrelimProfile,
  getCategoryReviewNote,
  getDefaultSiteData,
  filterLibraryItemsByProfile,
} from "@/lib/qs/prelim-library-service";
import { getProfileById } from "@/lib/qs/qs-queries";
import { PROJECT_SECTORS } from "@/lib/project-categories";

export default function CostLibraryPage() {
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PrelimLibraryItemWithComponents[]>([]);
  const [params, setParams] = useState<SiteDataParams>({ ...DEFAULT_SITE_DATA });
  const [sector, setSector] = useState("");
  const [buildingType, setBuildingType] = useState("");
  const [profile, setProfile] = useState<PrelimProfileCode>("PROF-GEN");
  const [overrideReason, setOverrideReason] = useState("");
  const [tree, setTree] = useState<CalculatedPrelimTree>({ sections: [], total: 0 });
  const [selectedItem, setSelectedItem] = useState<PrelimLibraryItemWithComponents | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [caseName, setCaseName] = useState("Default");
  const visibleItems = useMemo(() => filterLibraryItemsByProfile(items, profile), [items, profile]);
  const scaleSuggestsHighRise = params.P04 >= 6 || params.P05 >= 20;
  const scaleReviewProfile: PrelimProfileCode | null = profile.startsWith("PROF-BLD-")
    ? (scaleSuggestsHighRise ? "PROF-BLD-HR" : "PROF-BLD-LR")
    : null;
  const scaleNeedsReview = !!buildingType && !!scaleReviewProfile && scaleReviewProfile !== profile;

  useEffect(() => {
    setTree(calculatePrelimTree(visibleItems, params));
  }, [visibleItems, params]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      getProfileById(data.user.id, "role").then(({ data: profile }) => {
        if (profile) setIsAdmin(profile.role === "admin");
      });
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLibraryItemsWithComponents();
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function handleParamsChange(newParams: SiteDataParams) {
    setParams(newParams);
  }

  function handleRecalculate() {
    setTree(calculatePrelimTree(visibleItems, params));
  }

  function handleSelectItem(item: CalculatedPrelimItem) {
    const full = visibleItems.find((i) => i.code === item.code);
    if (full) setSelectedItem(full);
  }

  function handleCategoryChange(nextSector: string, nextBuildingType: string) {
    setSector(nextSector);
    setBuildingType(nextBuildingType);
    const nextProfile = getDefaultPrelimProfile(nextBuildingType);
    setProfile(nextProfile);
    setOverrideReason("");
    setParams(getDefaultSiteData(nextProfile));
    setSelectedItem(null);
  }

  function handleProfileChange(nextProfile: PrelimProfileCode) {
    const nextParams = getDefaultSiteData(nextProfile);
    const sharedKeys = PROFILE_PARAMS[profile].filter((key) => PROFILE_PARAMS[nextProfile].includes(key));
    for (const key of sharedKeys) nextParams[key] = params[key];
    setProfile(nextProfile);
    setParams(nextParams);
    setSelectedItem(null);
    setOverrideReason(nextProfile === getDefaultPrelimProfile(buildingType) ? "" : overrideReason);
  }

  function handleCaseContextChange(value: { profile_code?: PrelimProfileCode | null; sector_slug?: string | null; building_type_slug?: string | null; override_reason?: string | null }) {
    if (value.profile_code) setProfile(value.profile_code);
    setSector(value.sector_slug ?? "");
    setBuildingType(value.building_type_slug ?? "");
    setOverrideReason(value.override_reason ?? "");
  }

  function handleExport() {
    exportPrelimTreeToExcel(tree, params, { caseName, profileCode: profile, sector, buildingType });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Preliminaries Cost Library</h1>
          <p className="text-sm text-muted-foreground">
            Reusable parameter-driven build-up templates for Z-code prelims. Adjust Site Data to auto-calculate rates.
            To use them on a tender, save the case, then use Load from Library on the tender&apos;s Preliminaries tab in Cost Estimation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && can("qs_libraries", "can_create") && (
            <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExport} disabled={tree.sections.length === 0}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Export to Excel
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-4 w-4" />
            {items.length} library items
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Project category and prelim profile</h2>
          <p className="text-xs text-muted-foreground">Category suggests a starting profile. Confirm scale and construction method before pricing.</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Library rates are legacy USD values marked unverified. Confirm market, currency, source, and effective date before tender submission.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-medium">
            Sector
            <select value={sector} onChange={(e) => handleCategoryChange(e.target.value, "")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal">
              <option value="">Select sector</option>
              {PROJECT_SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Project category
            <select value={buildingType} onChange={(e) => handleCategoryChange(sector, e.target.value)} disabled={!sector} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal disabled:opacity-50">
              <option value="">Select category</option>
              {PROJECT_SECTORS.find((s) => s.value === sector)?.buildingTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Prelim profile
            <select value={profile} onChange={(e) => handleProfileChange(e.target.value as PrelimProfileCode)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal">
              {PRELIM_PROFILES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="text-xs text-muted-foreground">
          {PRELIM_PROFILES.find((p) => p.code === profile)?.description}
          {getCategoryReviewNote(buildingType) ? ` ${getCategoryReviewNote(buildingType)}` : ""}
        </div>
        {buildingType && profile !== getDefaultPrelimProfile(buildingType) && (
          <label className="block space-y-1 text-xs font-medium">
            Profile override reason
            <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Explain the scale, method, or package difference" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" />
          </label>
        )}
        {scaleNeedsReview && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span>Current building inputs suggest {PRELIM_PROFILES.find((p) => p.code === scaleReviewProfile)?.name}. Review the profile against actual method and scope.</span>
            <Button size="sm" variant="outline" onClick={() => handleProfileChange(scaleReviewProfile!)}>Use suggested profile</Button>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          Active site data: {PROFILE_PARAMS[profile].map((key) => `${key} ${SITE_DATA_META[key].label}`).join(" · ")}
        </div>
      </div>

      {showAddItem && (
        <AddItemDialog
          items={items}
          onClose={() => setShowAddItem(false)}
          onCreated={load}
        />
      )}

      <SiteDataPanel
        params={params}
        profile={profile}
        caseContext={{ sector_slug: sector || null, building_type_slug: buildingType || null, override_reason: overrideReason || null }}
        onParamsChange={handleParamsChange}
        onRecalculate={handleRecalculate}
        onCaseChanged={setCaseName}
        onCaseContextChange={handleCaseContextChange}
      />

      <div className="flex gap-6 items-start">
        <div className={selectedItem ? "w-1/2" : "w-full"}>
          <PrelimTree
            tree={tree}
            onSelectItem={handleSelectItem}
          />
        </div>

        {selectedItem && (
          <div className="w-1/2 sticky top-6">
            <ItemEditor
              item={selectedItem}
              allItems={visibleItems}
              params={params}
              isAdmin={isAdmin}
              onClose={() => setSelectedItem(null)}
              onSaved={load}
              onDeleted={() => { setSelectedItem(null); load(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
