"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import {
  listDivisionsWithCounts, listMastersForDivision, searchBank, type BankSearchResult, type DivisionWithCounts,
} from "@/lib/planning/activity-library/activity-database-service";
import { listCsiSections, type CsiSection } from "@/lib/csi-divisions";
import { canManageLibraries } from "@/lib/planning/activity-library/qs-bridge-service";
import { ActivityDetailDialog } from "./activity-detail-dialog";
import { ImportActivitiesDialog } from "./import-activities-dialog";
import { ChipLibraryTab, MaterialLibraryTab } from "./chip-library-tabs";
import { BoqLibraryTab, ResourceLibraryTab } from "./library-tabs";
import { MasterActivityTab } from "./master-activity-tab";
import { errorMessage, type ActivityListItem } from "./activity-database-shared";

const MIN_SEARCH = 2;

type Keyed<T> = { key: string; scope: string; data: T; error: string | null };

/** Activity Database screen (doc 23): Master Activity | BOQ | Resource tabs, search, refresh and import. */
export function ActivityDatabaseView() {
  const db = useMemo(() => createClient(), []);
  const [canManage, setCanManage] = useState(false);
  const [tab, setTab] = useState("master");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedDivisionCode, setSelectedDivisionCode] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const searchActive = query.length >= MIN_SEARCH;

  useEffect(() => { void canManageLibraries(db).then(setCanManage); }, [db]);
  const [csiSections, setCsiSections] = useState<CsiSection[]>([]);
  useEffect(() => { listCsiSections(db).then(setCsiSections).catch(() => setCsiSections([])); }, [db]);

  // Divisions (with counts)
  const [divs, setDivs] = useState<Keyed<DivisionWithCounts[]> | null>(null);
  const divKey = `${refreshKey}:${reloadTick}`;
  useEffect(() => {
    let live = true;
    listDivisionsWithCounts(db)
      .then((data) => { if (live) setDivs({ key: divKey, scope: "all", data, error: null }); })
      .catch((e) => { if (live) setDivs({ key: divKey, scope: "all", data: [], error: errorMessage(e, "Failed to load divisions") }); });
    return () => { live = false; };
  }, [db, divKey]);

  // Activities of the selected division
  const [masters, setMasters] = useState<Keyed<ActivityListItem[]> | null>(null);
  const mScope = selectedDivisionCode ?? "all";
  const mKey = `${mScope}:${refreshKey}:${reloadTick}`;
  useEffect(() => {
    let live = true;
    listMastersForDivision(db, selectedDivisionCode)
      .then((rows) => { if (live) setMasters({ key: mKey, scope: mScope, data: rows, error: null }); })
      .catch((e) => { if (live) setMasters({ key: mKey, scope: mScope, data: [], error: errorMessage(e, "Failed to load activities") }); });
    return () => { live = false; };
  }, [db, selectedDivisionCode, mKey, mScope]);

  // Search results (activities + BOQ items)
  const [found, setFound] = useState<Keyed<BankSearchResult> | null>(null);
  const sScope = `${query}:${selectedDivisionCode ?? "all"}`;
  const sKey = `${sScope}:${refreshKey}`;
  useEffect(() => {
    if (!searchActive) return;
    let live = true;
    searchBank(db, query, selectedDivisionCode)
      .then((data) => { if (live) setFound({ key: sKey, scope: sScope, data, error: null }); })
      .catch((e) => { if (live) setFound({ key: sKey, scope: sScope, data: { activities: [], workItems: [] }, error: errorMessage(e, "Search failed") }); });
    return () => { live = false; };
  }, [db, query, selectedDivisionCode, searchActive, sKey, sScope]);

  // Stale-while-revalidate: keep the last result of the same scope while a refresh is running.
  const divisionsLoaded = divs;
  const mastersLoaded = masters?.scope === mScope ? masters : null;
  const foundLoaded = found?.scope === sScope ? found : null;

  const activities: ActivityListItem[] = useMemo(() => {
    if (searchActive) return foundLoaded?.data.activities ?? [];
    return mastersLoaded?.data ?? [];
  }, [searchActive, foundLoaded, mastersLoaded]);
  const activitiesLoading = searchActive ? !foundLoaded : !mastersLoaded;
  const activitiesError = searchActive ? foundLoaded?.error ?? null : mastersLoaded?.error ?? null;

  const openFromLibrary = (id: string) => { setSelectedActivityId(id); setDialogId(id); };
  const refresh = () => setRefreshKey((n) => n + 1);
  const reload = () => setReloadTick((n) => n + 1);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="master">Master Activity</TabsTrigger>
            <TabsTrigger value="boq">BOQ</TabsTrigger>
            <TabsTrigger value="material">Material</TabsTrigger>
            <TabsTrigger value="shop_drawing">Shop Drawing</TabsTrigger>
            <TabsTrigger value="coordination">Coordination</TabsTrigger>
            <TabsTrigger value="resource">Resource</TabsTrigger>
          </TabsList>
          {canManage && (
            <Button size="sm" onClick={() => setImporting(true)}><Upload className="mr-1 h-4 w-4" /> Import activities</Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input} onChange={(e) => setInput(e.target.value)} className="pl-8" aria-label="Search"
              placeholder={tab === "master" ? "Search activities and BOQs by name or code..." : tab === "boq" ? "Search BOQ items by code or description..." : tab === "material" ? "Search materials by code or name..." : tab === "shop_drawing" || tab === "coordination" ? "Search by code or name..." : "Search resources by code or name..."}
            />
          </div>
          {input.trim() !== query && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
        </div>
        {tab === "master" && input.trim().length > 0 && !searchActive && (
          <p className="text-xs text-muted-foreground">Type at least {MIN_SEARCH} characters to search.</p>
        )}

        <TabsContent value="master" className="pt-2">
          <MasterActivityTab
            db={db}
            divisions={divisionsLoaded?.data ?? []} divisionsLoading={!divisionsLoaded} divisionsError={divisionsLoaded?.error ?? null} onRetryDivisions={reload}
            selectedDivisionCode={selectedDivisionCode}
            onSelectDivision={(id) => { setSelectedDivisionCode(id); setSelectedActivityId(null); }}
            activities={activities} activitiesLoading={activitiesLoading} activitiesError={activitiesError} onRetryActivities={reload}
            searchActive={searchActive} searchWorkItems={searchActive ? foundLoaded?.data.workItems ?? null : null}
            selectedActivityId={selectedActivityId}
            onOpenActivity={(id) => { setSelectedActivityId(id); setDialogId(id); }}
            refreshKey={refreshKey}
          />
        </TabsContent>
        <TabsContent value="boq" className="pt-2">
          <BoqLibraryTab db={db} query={query} refreshKey={refreshKey} onOpenActivity={(id) => { setSelectedActivityId(id); setDialogId(id); }} />
        </TabsContent>
        <TabsContent value="material" className="pt-2">
          <MaterialLibraryTab db={db} query={query} refreshKey={refreshKey} onOpenActivity={openFromLibrary} />
        </TabsContent>
        <TabsContent value="shop_drawing" className="pt-2">
          <ChipLibraryTab kind="shop_drawing" db={db} canManage={canManage} divisions={divisionsLoaded?.data ?? []} query={query} refreshKey={refreshKey} onOpenActivity={openFromLibrary} />
        </TabsContent>
        <TabsContent value="coordination" className="pt-2">
          <ChipLibraryTab kind="coordination" db={db} canManage={canManage} divisions={divisionsLoaded?.data ?? []} query={query} refreshKey={refreshKey} onOpenActivity={openFromLibrary} />
        </TabsContent>
        <TabsContent value="resource" className="pt-2">
          <ResourceLibraryTab db={db} query={query} refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>

      {dialogId && (
        <ActivityDetailDialog
          db={db} activityId={dialogId} list={activities} divisions={divisionsLoaded?.data ?? []} sections={csiSections} canManage={canManage}
          onNavigate={(id) => { setDialogId(id); setSelectedActivityId(id); }}
          onClose={() => setDialogId(null)}
          onChanged={refresh}
        />
      )}
      {importing && <ImportActivitiesDialog db={db} onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
}
