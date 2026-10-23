"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
import { createWorkItem, listWorkItemUnits } from "@/lib/planning/activity-library/boq-item-service";
import { divisionText } from "@/lib/planning/activity-library/boq-item-rules";
import { errorMessage, SELECT_CLS } from "./activity-database-shared";

const schema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  division: z.string(),
});
type Values = z.infer<typeof schema>;

/** Add BOQ: a small form that creates a cost-library work item (code, name, unit, division). */
export function BoqItemCreateDialog({
  db, divisions, defaultDivision, onClose, onCreated,
}: { db: SupabaseClient; divisions: Division[]; defaultDivision: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { code: "", name: "", unit: "", division: defaultDivision ?? "" } });
  const { register, formState: { errors, isSubmitting } } = form;
  const [units, setUnits] = useState<string[]>([]);
  useEffect(() => { listWorkItemUnits(db).then(setUnits).catch(() => setUnits([])); }, [db]);
  const lbl = "mb-1 block text-xs text-muted-foreground";

  async function submit(v: Values) {
    try {
      const id = await createWorkItem(db, { code: v.code, name: v.name, unit: v.unit, csi_division_code: v.division || null, divisionName: divisions.find((d) => d.code === v.division)?.name });
      toast.success(`${v.code.trim()} created`);
      onCreated(id);
    } catch (e) {
      const msg = errorMessage(e, "Could not create the BOQ item");
      if (/code/i.test(msg)) form.setError("code", { message: msg });
      toast.error(msg);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add BOQ</DialogTitle>
          <DialogDescription>Creates an item in the cost library. Add its manpower, equipment and activities afterwards.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-3" noValidate>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <div>
              <Label className={lbl}>Code</Label>
              <Input {...register("code")} className="font-mono" aria-invalid={!!errors.code} />
              {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div>
              <Label className={lbl}>Name</Label>
              <Input {...register("name")} aria-invalid={!!errors.name} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <div>
              <Label className={lbl}>Unit</Label>
              <Input {...register("unit")} list="boq-create-units" placeholder="m2" aria-invalid={!!errors.unit} />
              <datalist id="boq-create-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
              {errors.unit && <p className="mt-1 text-xs text-destructive">{errors.unit.message}</p>}
            </div>
            <div>
              <Label className={lbl}>Division of Work</Label>
              <select {...register("division")} className={SELECT_CLS}>
                <option value="">No division</option>
                {divisions.filter((d) => d.is_active).map((d) => <option key={d.code} value={d.code}>{divisionText(d.code, d.name)}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
