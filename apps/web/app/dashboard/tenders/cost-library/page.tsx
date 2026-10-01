"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Database, Plus, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import SiteDataPanel from "@/components/tenders/cost-library/site-data-panel";
import PrelimTree from "@/components/tenders/cost-library/prelim-tree";
import ItemEditor from "@/components/tenders/cost-library/item-editor";
import AddItemDialog from "@/components/tenders/cost-library/add-item-dialog";
import {
  type SiteDataParams,
  type CalculatedPrelimTree,
  type CalculatedPrelimItem,
  type PrelimLibraryItemWithComponents,
  getLibraryItemsWithComponents,
  calculatePrelimTree,
  exportPrelimTreeToExcel,
  DEFAULT_SITE_DATA,
} from "@/lib/qs/prelim-library-service";
import { getProfileById } from "@/lib/qs/qs-queries";

export default function CostLibraryPage() {
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PrelimLibraryItemWithComponents[]>([]);
  const [params, setParams] = useState<SiteDataParams>({ ...DEFAULT_SITE_DATA });
  const [tree, setTree] = useState<CalculatedPrelimTree>({ sections: [], total: 0 });
  const [selectedItem, setSelectedItem] = useState<PrelimLibraryItemWithComponents | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [caseName, setCaseName] = useState("Default");

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
      setTree(calculatePrelimTree(data, params));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleParamsChange(newParams: SiteDataParams) {
    setParams(newParams);
    setTree(calculatePrelimTree(items, newParams));
  }

  function handleRecalculate() {
    setTree(calculatePrelimTree(items, params));
  }

  function handleSelectItem(item: CalculatedPrelimItem) {
    const full = items.find((i) => i.code === item.code);
    if (full) setSelectedItem(full);
  }

  function handleExport() {
    exportPrelimTreeToExcel(tree, params, { caseName });
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

      {showAddItem && (
        <AddItemDialog
          items={items}
          onClose={() => setShowAddItem(false)}
          onCreated={load}
        />
      )}

      <SiteDataPanel
        params={params}
        onParamsChange={handleParamsChange}
        onRecalculate={handleRecalculate}
        onCaseChanged={setCaseName}
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
              allItems={items}
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
