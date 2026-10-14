"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { StakeholderDropdown, type DropdownOption } from "@/components/project/projects/stakeholder-dropdown";
import { CustomCategoryDialog } from "@/components/project/projects/custom-category-dialog";
import { StakeholderEditSheet, type Stakeholder as StakeholderRecord } from "@/components/project/stakeholders/stakeholder-edit-sheet";
import { listProfilesOfIdAndFullName, listStakeholdersWithStatusActive } from "@/lib/project/projects/projects-queries";
import { buildingTypesForSector, fetchCustomCategories, getAllSectors, sectorLabel, type CustomCategoryRecord } from "@/lib/project-categories";

// Fields shared by the New project dialog and the Settings tab.

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary disabled:opacity-60";

export function Field({ label, htmlFor, error, hint, className, children }: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Active staff, for project manager and other key-role pickers. */
export function useStaff() {
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  useEffect(() => {
    listProfilesOfIdAndFullName("id, full_name").then(({ data }) => setStaff((data ?? []) as { id: string; full_name: string }[]));
  }, []);
  return staff;
}

export function StaffSelect({ id, value, onChange, staff, placeholder = "— Select —" }: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  staff: { id: string; full_name: string }[];
  placeholder?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">{placeholder}</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
    </select>
  );
}

/** Client (or consultant) picker with "Add new", which opens the stakeholder sheet and selects the new one. */
export function ClientField({ id, value, onChange, role = "client" }: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  role?: "client" | "consultant";
}) {
  const [clients, setClients] = useState<DropdownOption[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listStakeholdersWithStatusActive().then(({ data }) => setClients((data ?? []) as DropdownOption[]));
  }, []);

  function handleCreated(s: StakeholderRecord) {
    setClients((prev) => [...prev.filter((c) => c.id !== s.id), { id: s.id, organization_name: s.organization_name, stakeholder_type: s.stakeholder_type }]
      .sort((a, b) => (a.organization_name ?? "").localeCompare(b.organization_name ?? "")));
    onChange(s.id);
    setCreating(false);
    toast.success(`${role === "client" ? "Client" : "Consultant"} "${s.organization_name}" created and selected`);
  }

  return (
    <>
      <StakeholderDropdown
        id={id}
        value={value}
        onChange={onChange}
        options={clients}
        placeholder={`— Select ${role} —`}
        addNewLabel={`+ Add new ${role}`}
        onAddNew={() => setCreating(true)}
        className="rounded-lg px-3 py-2"
      />
      {creating && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs" onClick={() => setCreating(false)} />
          <div className="fixed inset-y-0 right-0 z-[60] flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
            <StakeholderEditSheet stakeholder={null} defaultCategory="external" defaultType={role === "client" ? "CLI" : "CON"} onClose={() => setCreating(false)} onSave={handleCreated} />
          </div>
        </>
      )}
    </>
  );
}

/** Sector and building type, each with "Add new" for company-specific categories. */
export function SectorFields({ category, buildingType, onChange, categoryError, idPrefix = "pf" }: {
  category: string;
  buildingType: string;
  onChange: (next: { category: string; buildingType: string }) => void;
  categoryError?: string;
  idPrefix?: string;
}) {
  const [custom, setCustom] = useState<CustomCategoryRecord[]>([]);
  const [dialog, setDialog] = useState<"sector" | "building_type" | null>(null);

  useEffect(() => {
    fetchCustomCategories().then(setCustom);
  }, []);

  return (
    <>
      <Field label="Sector *" htmlFor={`${idPrefix}_category`} error={categoryError}>
        <StakeholderDropdown
          id={`${idPrefix}_category`}
          value={category}
          onChange={(v) => onChange({ category: v, buildingType: "" })}
          options={getAllSectors(custom).map((s) => ({ value: s.value, label: s.label }))}
          placeholder="— Select sector —"
          addNewLabel="+ Add new sector"
          onAddNew={() => setDialog("sector")}
          className="rounded-lg px-3 py-2"
        />
      </Field>
      <Field label="Building type" htmlFor={`${idPrefix}_building_type`}>
        <StakeholderDropdown
          id={`${idPrefix}_building_type`}
          value={buildingType}
          onChange={(v) => onChange({ category, buildingType: v })}
          options={buildingTypesForSector(category, custom).map((t) => ({ value: t.value, label: t.label }))}
          placeholder={category ? "— Select building type —" : "Select a sector first"}
          addNewLabel="+ Add new building type"
          disabled={!category}
          onAddNew={() => setDialog("building_type")}
          className="rounded-lg px-3 py-2"
        />
      </Field>
      <CustomCategoryDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        categoryType={dialog ?? "sector"}
        sectorSlug={category}
        sectorLabel={getAllSectors(custom).find((s) => s.value === category)?.label || sectorLabel(category)}
        onCreated={(record) => {
          setCustom((prev) => [...prev, record]);
          if (record.category_type === "sector") onChange({ category: record.slug, buildingType: "" });
          else onChange({ category, buildingType: record.slug });
          setDialog(null);
        }}
      />
    </>
  );
}
