"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtQty } from "@/lib/qs/qto/measured-quantity";

/**
 * Confirms deleting the selected take-off (Delete key or the bin in Properties). When one shape of an
 * item with several shapes was picked on the drawing, it also offers deleting only that shape.
 * Cancel has the focus, so an accidental Enter deletes nothing.
 */
export function DeleteTakeoffDialog({ itemLabel, quantity, unit, shapeCount, shapeType, canDeleteShape, onDeleteShape, onDeleteItem, onCancel }: {
  itemLabel: string;
  quantity: number | string;
  unit: string;
  shapeCount: number;
  shapeType: string | null;
  canDeleteShape: boolean;
  onDeleteShape: () => Promise<void>;
  onDeleteItem: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<"shape" | "item" | null>(null);
  const run = async (which: "shape" | "item") => {
    setBusy(which);
    try { await (which === "shape" ? onDeleteShape() : onDeleteItem()); } finally { setBusy(null); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" /> Delete take-off?</DialogTitle>
          <DialogDescription>
            <b className="text-foreground">{itemLabel}</b> · {fmtQty(quantity)} {unit === "m2" ? "m²" : unit === "m3" ? "m³" : unit} · {shapeCount} shape{shapeCount === 1 ? "" : "s"} on the drawing
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {canDeleteShape
            ? `Delete only the ${shapeType ?? "shape"} you selected (the item's quantity updates), or the whole take-off item with all its shapes?`
            : "The take-off item and its shapes are removed from this version. It stays in the audit history."}
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button autoFocus variant="outline" onClick={onCancel} disabled={!!busy}>Cancel</Button>
          {canDeleteShape && (
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" disabled={!!busy} onClick={() => void run("shape")}>
              {busy === "shape" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Delete this shape only
            </Button>
          )}
          <Button variant="destructive" disabled={!!busy} onClick={() => void run("item")}>
            {busy === "item" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {canDeleteShape ? "Delete whole take-off" : "Delete take-off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
