"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BimModel } from "@/lib/bim/bim-types";

const DISCIPLINES = [
  { value: "ARC", label: "Architecture" },
  { value: "STR", label: "Structure" },
  { value: "MEP", label: "MEP" },
  { value: "CIVIL", label: "Civil" },
  { value: "FED", label: "General" },
];

const IFC_SCHEMAS = ["IFC2X3", "IFC4", "IFC4X3"];

const STATUSES = [
  { value: "CURRENT", label: "Current" },
  { value: "SUPERSEDED", label: "Superseded" },
  { value: "ARCHIVED", label: "Archived" },
];

export function BimEditDialog({
  open,
  onOpenChange,
  model,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: BimModel;
  onComplete: () => void;
}) {
  const [modelName, setModelName] = useState(model.model_name);
  const [discipline, setDiscipline] = useState(model.discipline);
  const [ifcSchema, setIfcSchema] = useState(model.ifc_schema);
  const [status, setStatus] = useState(model.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    modelName !== model.model_name ||
    discipline !== model.discipline ||
    ifcSchema !== model.ifc_schema ||
    status !== model.status;

  const handleSave = async () => {
    if (!modelName.trim()) {
      setError("Model name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/bim/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: modelName.trim(),
          discipline,
          ifc_schema: ifcSchema,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update model");
      onComplete();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update model");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Model</DialogTitle>
          <DialogDescription>
            Update the metadata for &quot;{model.model_name}&quot; ({model.revision}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-model-name">Model Name</Label>
            <Input
              id="edit-model-name"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. Arch Model"
            />
          </div>

          <div className="space-y-2">
            <Label>Discipline</Label>
            <Select value={discipline} onValueChange={(v) => { if (v) setDiscipline(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>IFC Schema</Label>
            <Select value={ifcSchema} onValueChange={(v) => { if (v) setIfcSchema(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IFC_SCHEMAS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => { if (v) setStatus(v as BimModel["status"]); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
