"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCsv } from "@/lib/csv-export";
import { listDwlVMaterialDuplicates } from "@/lib/qs/qs-queries";

interface DuplicateGroup {
  fingerprint: string;
  copies: number;
  codes: string[];
  names: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Read-only report of materials that share one identity fingerprint
// (category + type + size + thickness + grade + strength + standard + unit).
// Nothing is merged or renumbered here; review and consolidate by hand.
export function DwlMaterialDuplicatesDialog({ open, onOpenChange }: Props) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoading(true);
      const { data } = await listDwlVMaterialDuplicates();
      setGroups((data ?? []) as unknown as DuplicateGroup[]);
      setLoading(false);
    })();
  }, [open]);

  function exportCsv() {
    downloadCsv("material-duplicates.csv", [
      ["Copies", "Codes", "Name"],
      ...groups.map((g) => [String(g.copies), g.codes.join(" / "), g.names[0] ?? ""]),
    ]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate materials</DialogTitle>
          <DialogDescription>
            Materials with the same category, type, size, grade and unit but different codes. Keep one code and move
            the others&apos; suppliers and prices onto it. Nothing is changed automatically.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
          </div>
        ) : groups.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No duplicates found.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{groups.length} groups</p>
              <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
            </div>
            <ul className="divide-y rounded-lg border text-sm">
              {groups.map((g) => (
                <li key={g.fingerprint} className="space-y-0.5 p-2.5">
                  <p className="font-medium">{g.names[0]} <span className="text-muted-foreground">×{g.copies}</span></p>
                  <p className="text-xs text-muted-foreground">{g.codes.join(" · ")}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
