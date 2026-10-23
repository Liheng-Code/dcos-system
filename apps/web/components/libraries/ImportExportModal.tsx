import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LibraryItemBase } from "@/types/library";
import { z } from "zod";
import { toast } from "sonner";

// Simple schema that matches LibraryItemBase (can be extended per sector)
const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  unit: z.string().optional(),
  currency: z.string().min(3).max(3),
  price: z.number().positive(),
  effectiveDate: z.string().optional(),
  source: z.string().optional()
});

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  sector: string;
  items: LibraryItemBase[];
  onImport: (data: LibraryItemBase[]) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ open, onClose, sector, items, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sector}-library.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = z.array(itemSchema).parse(parsed);
      onImport(validated);
      toast.success(`Imported ${validated.length} items into ${sector}`);
    } catch (err) {
      console.error(err);
      toast.error("Import failed – check file format and validation.");
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import / Export {sector} Library</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <Button onClick={handleExport}>Export as JSON</Button>
          <div className="flex items-center space-x-2">
            <Input
              type="file"
              accept="application/json"
              ref={fileInputRef}
              onChange={handleFileSelected}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportExportModal;

