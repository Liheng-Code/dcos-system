"use client";
// app/dashboard/libraries/[sector]/page.tsx
import { useParams } from "next/navigation";
import { useState } from "react";
import { LibraryList } from "@/components/libraries/LibraryList";
import { LibraryEditor } from "@/components/libraries/LibraryEditor";
import { ImportExportModal } from "@/components/libraries/ImportExportModal";
import { SectorNav } from "@/components/libraries/SectorNav";
import { useLibrary } from "@/hooks/useLibrary";
import { LibraryItemBase } from "@/types/library";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function LibrarySectorPage() {
  const { sector } = useParams() as { sector: string };
  const { items, loading, error, createItem, updateItem, deleteItem } =
    useLibrary(sector);

  const [selectedItem, setSelectedItem] = useState<LibraryItemBase | undefined>(
    undefined
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);

  const handleEdit = (item: LibraryItemBase) => {
    setSelectedItem(item);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setSelectedItem(undefined);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      toast.success("Item deleted");
    } catch (err: any) {
      toast.error(err.message ?? "Delete failed");
    }
  };

  const handleEditorSubmit = async (data: Omit<LibraryItemBase, "id"> & { id?: string }) => {
    try {
      if (data.id) {
        await updateItem({ ...(data as LibraryItemBase) });
        toast.success("Item updated");
      } else {
        await createItem({ ...data, sector } as any);
        toast.success("Item created");
      }
      setEditorOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  };

  const handleImport = async (imported: LibraryItemBase[]) => {
    let created = 0;
    for (const it of imported) {
      try {
        await createItem({ ...it, sector } as any);
        created++;
      } catch {
        /* skip invalid rows */
      }
    }
    toast.success(`Imported ${created} of ${imported.length} items`);
    setImportExportOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8" />
        <span className="ml-2">Loading library data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive p-4">Error loading library: {error}</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SectorNav activeSector={sector} />

      {/* Header row */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold capitalize">{sector} Cost Library</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportExportOpen(true)}>
            Import / Export
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Items table */}
      <LibraryList items={items} onEdit={handleEdit} onDelete={handleDelete} />

      {/* Create / Edit dialog */}
      <LibraryEditor
        open={editorOpen}
        initialData={selectedItem}
        onSubmit={handleEditorSubmit}
        onClose={() => setEditorOpen(false)}
      />

      {/* Import / Export dialog */}
      <ImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        sector={sector}
        items={items}
        onImport={handleImport}
      />
    </div>
  );
}
