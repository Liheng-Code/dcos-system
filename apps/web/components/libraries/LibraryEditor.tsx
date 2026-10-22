import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LibraryItemBase } from "@/types/library";

// Basic schema – can be extended per sector if needed
const libraryItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  unit: z.string().optional(),
  currency: z.string().min(3).max(3),
  price: z.number().positive(),
  effectiveDate: z.string().optional(),
  source: z.string().optional()
});

type FormData = z.infer<typeof libraryItemSchema>;

interface LibraryEditorProps {
  /** If provided, the form works in edit mode */
  initialData?: LibraryItemBase;
  /** Callback with the parsed data */
  onSubmit: (data: FormData) => void;
  /** Callback to close the modal/dialog */
  onClose: () => void;
  /** Whether the editor is shown */
  open: boolean;
}

export const LibraryEditor: React.FC<LibraryEditorProps> = ({ initialData, onSubmit, onClose, open }) => {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(libraryItemSchema),
    defaultValues: initialData ?? {
      currency: "USD"
    }
  });

  const submitHandler = (data: FormData) => {
    // Ensure an id exists – generate a temporary UUID if missing (real app would use server side)
    if (!data.id) {
      data.id = crypto.randomUUID();
    }
    onSubmit(data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit" : "Add"} Library Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submitHandler)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit</label>
            <Input {...register("unit")} placeholder="e.g. m³, kg, set" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <Input {...register("currency")} placeholder="USD" maxLength={3} />
            {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price</label>
            <Input type="number" step="0.01" {...register("price", { valueAsNumber: true })} />
            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Effective Date</label>
            <Input type="date" {...register("effectiveDate")} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Source</label>
            <Input {...register("source")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{initialData ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LibraryEditor;

