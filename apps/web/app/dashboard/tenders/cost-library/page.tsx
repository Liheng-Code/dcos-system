"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Database, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import SiteDataPanel from "@/components/tenders/cost-library/site-data-panel";
import PrelimTree from "@/components/tenders/cost-library/prelim-tree";
import ItemEditor from "@/components/tenders/cost-library/item-editor";
import ApplyDialog from "@/components/tenders/cost-library/apply-dialog";
import {
  type SiteDataParams,
  type CalculatedPrelimTree,
  type CalculatedPrelimItem,
  type PrelimLibraryItemWithComponents,
  getLibraryItemsWithComponents,
  calculatePrelimTree,
  DEFAULT_SITE_DATA,
} from "@/lib/prelim-library-service";

export default function CostLibraryPage() {
  const searchParams = useSearchParams();
  const tenderId = searchParams.get("tenderId");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PrelimLibraryItemWithComponents[]>([]);
  const [params, setParams] = useState<SiteDataParams>({ ...DEFAULT_SITE_DATA });
  const [tree, setTree] = useState<CalculatedPrelimTree>({ sections: [], total: 0 });
  const [selectedItem, setSelectedItem] = useState<PrelimLibraryItemWithComponents | null>(null);
  const [showApply, setShowApply] = useState(false);

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
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tenderId && (
            <Button size="sm" onClick={() => setShowApply(true)} disabled={tree.sections.length === 0}>
              <Send className="mr-1 h-4 w-4" /> Apply to Tender
            </Button>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-4 w-4" />
            {items.length} library items
          </div>
        </div>
      </div>

      {showApply && tenderId && (
        <ApplyDialog
          tree={tree}
          tenderId={tenderId}
          onClose={() => setShowApply(false)}
          onApplied={() => {
            toast.success("Reloading tender page...");
            window.opener?.location.reload();
          }}
        />
      )}

      <SiteDataPanel
        params={params}
        onParamsChange={handleParamsChange}
        onRecalculate={handleRecalculate}
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
              params={params}
              onClose={() => setSelectedItem(null)}
              onSaved={load}
            />
          </div>
        )}
      </div>
    </div>
  );
}
