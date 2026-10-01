"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { getProfileById, listProfiles } from "@/lib/planning/planning-queries";
import {
  createResource,
  setResourceActive,
  updateResource,
  type PlanResource,
  type ResourceType,
} from "@/lib/planning/resource-service";

interface Props {
  projectId: string;
  resource?: PlanResource | null;
  onClose: () => void;
  onSaved: () => void;
}

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  department: string | null;
}

const TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: "labor", label: "Labor" },
  { value: "equipment", label: "Equipment" },
  { value: "material", label: "Material" },
  { value: "subcontractor", label: "Subcontractor" },
];

export function PlanResourceDialog({ projectId, resource, onClose, onSaved }: Props) {
  const isEdit = !!resource;
  const alreadyLinked = isEdit && !!resource?.profile_id;
  const [name, setName] = useState(resource?.name ?? "");
  const [resourceType, setResourceType] = useState<ResourceType>(resource?.resource_type ?? "labor");
  const [maxUnits, setMaxUnits] = useState(String(resource?.max_units ?? 100));
  const [costPerUnit, setCostPerUnit] = useState(
    resource?.cost_per_unit != null ? String(resource.cost_per_unit) : "",
  );
  const [unitLabel, setUnitLabel] = useState(resource?.unit_label ?? "");
  const [isActive, setIsActive] = useState(resource?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const [profileId, setProfileId] = useState(resource?.profile_id ?? "");
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [linkedProfileName, setLinkedProfileName] = useState<string | null>(null);
  const loadingProfiles = !alreadyLinked && !profilesLoaded;

  useEffect(() => {
    if (alreadyLinked && resource?.profile_id) {
      getProfileById(resource.profile_id, "full_name")
        .then(({ data }) => setLinkedProfileName((data?.full_name as string | undefined) ?? null));
      return;
    }
    Promise.resolve(
      listProfiles("id, full_name, role, avatar_url, department"),
    )
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
          return;
        }
        setProfiles((data ?? []) as StaffProfile[]);
      })
      .finally(() => setProfilesLoaded(true));
  }, [alreadyLinked, resource?.profile_id]);

  const departments = useMemo(
    () => [...new Set(profiles.map((p) => p.department).filter(Boolean) as string[])],
    [profiles],
  );
  const filteredProfiles = deptFilter ? profiles.filter((p) => p.department === deptFilter) : profiles;

  function handleProfileSelect(id: string) {
    setProfileId(id);
    if (id) {
      const p = profiles.find((pr) => pr.id === id);
      setResourceType("labor");
      if (p) setName(p.full_name);
    }
  }

  async function run() {
    if (!name.trim()) {
      toast.error("Resource name is required.");
      return;
    }
    const maxUnitsNum = Number(maxUnits);
    if (Number.isNaN(maxUnitsNum) || maxUnitsNum <= 0) {
      toast.error("Max Units % must be a positive number.");
      return;
    }
    const costNum = costPerUnit.trim() === "" ? null : Number(costPerUnit);
    if (costNum != null && Number.isNaN(costNum)) {
      toast.error("Cost per Unit must be a number.");
      return;
    }
    setBusy(true);
    try {
      if (isEdit && resource) {
        await updateResource(resource.id, {
          name: name.trim(),
          resource_type: resourceType,
          max_units: maxUnitsNum,
          cost_per_unit: costNum,
          unit_label: unitLabel.trim() || null,
          profile_id: alreadyLinked ? resource.profile_id : profileId || null,
        });
        if (isActive !== resource.is_active) {
          await setResourceActive(resource.id, isActive);
        }
      } else {
        await createResource(projectId, {
          name: name.trim(),
          resource_type: resourceType,
          max_units: maxUnitsNum,
          cost_per_unit: costNum,
          unit_label: unitLabel.trim() || null,
          profile_id: profileId || null,
        });
      }
      toast.success(isEdit ? "Resource updated" : "Resource created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">{isEdit ? "Edit Resource" : "Add Resource"}</h2>
            <p className="text-[11px] text-white/70">
              {isEdit ? "Update resource details and capacity" : "Create a resource for assignment to tasks"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
            <span className="flex items-center gap-1.5 font-semibold">
              <Users className="h-3.5 w-3.5 text-muted-foreground" /> Link to Team Member (optional)
            </span>
            {alreadyLinked ? (
              <p className="text-muted-foreground">
                Linked to <span className="font-medium text-foreground">{linkedProfileName ?? "…"}</span>. To link a
                different person, create a new resource.
              </p>
            ) : loadingProfiles ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading team members…
              </div>
            ) : (
              <div className="space-y-2">
                {departments.length > 0 && (
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
                <select
                  value={profileId}
                  onChange={(e) => handleProfileSelect(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="">— None (free-text resource) —</option>
                  {filteredProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}{p.department ? ` · ${p.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <label className="block">
            <span className="font-semibold">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Tan"
            />
          </label>

          <label className="block">
            <span className="font-semibold">Type</span>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceType)}
              disabled={!!profileId && !alreadyLinked}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none disabled:opacity-60"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {!!profileId && !alreadyLinked && (
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Locked to Labor because this resource is linked to a team member.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-semibold">Max Units %</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                value={maxUnits}
                onChange={(e) => setMaxUnits(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-semibold">Cost per Unit</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                placeholder="optional"
              />
            </label>
          </div>

          <label className="block">
            <span className="font-semibold">Unit Label</span>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="hr, day, m³…"
            />
          </label>

          {isEdit && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="font-semibold">Active</span>
              <span className="text-muted-foreground">
                {isActive ? "— available for new assignments" : "— hidden from assignment pickers"}
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
