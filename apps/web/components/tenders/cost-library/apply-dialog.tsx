"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type CalculatedPrelimTree,
  applyLibraryToTender,
} from "@/lib/prelim-library-service";
import { toast } from "sonner";

interface ApplyDialogProps {
  tree: CalculatedPrelimTree;
  tenderId: string;
  onClose: () => void;
  onApplied: () => void;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export default function ApplyDialog({ tree, tenderId, onClose, onApplied }: ApplyDialogProps) {
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    setApplying(true);
    try {
      await applyLibraryToTender(tenderId, tree, mode === "replace");
      toast.success(`Preliminaries ${mode === "replace" ? "replaced" : "merged"} successfully`);
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply library");
    } finally {
      setApplying(false);
    }
  }

  const totalItems = tree.sections.reduce((sum, s) => {
    function count(items: typeof tree.sections): number {
      return items.reduce((s, i) => s + 1 + count(i.children), 0);
    }
    return sum + count([s]);
  }, 0);

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Apply Cost Library to Tender</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Items to insert</p>
            <p className="text-lg font-semibold tabular-nums">{totalItems}</p>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Total amount</p>
            <p className="text-lg font-semibold tabular-nums">${formatCurrency(tree.total)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Insert mode</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("replace")}
              className={`flex-1 rounded-lg border p-3 text-left text-sm transition-colors ${
                mode === "replace"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <Replace className="h-4 w-4" />
                Replace all
              </div>
              <p className="text-xs text-muted-foreground mt-1">Delete existing prelim items and insert from library</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("merge")}
              className={`flex-1 rounded-lg border p-3 text-left text-sm transition-colors ${
                mode === "merge"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <ArrowRight className="h-4 w-4" />
                Merge (add new)
              </div>
              <p className="text-xs text-muted-foreground mt-1">Keep existing items, add new codes from library</p>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply} disabled={applying}>
            {applying && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Apply {mode === "replace" ? "& Replace" : "& Merge"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
