"use client";

import { createClient } from "@/lib/supabase/client";
import { getChipOptionsByIds, searchMaterials, searchTcItems, TC_TYPE_LABEL } from "@/lib/planning/public";
import { GenericSchedule, type ScheduleLink } from "./generic-schedule";
import {
  COMMISSIONING_STATUS, EQUIPMENT_STATUS, LOAD_TYPES, MATERIAL_STATUS, SERVICE_TYPES, SLEEVE_STATUS, SUB_DISCIPLINES, TEST_RESULT,
} from "./schedule-options";

export function MepEquipment() { return <GenericSchedule config={{ title: "Equipment Schedule", table: "design_mep_equipment", orderField: "equipment_no", fields: [{ key: "equipment_no", label: "Equip No", required: true }, { key: "equipment_name", label: "Name", required: true }, { key: "sub_discipline", label: "Sub-Discipline", options: SUB_DISCIPLINES, required: true }, { key: "manufacturer", label: "Manufacturer" }, { key: "capacity", label: "Capacity" }, { key: "quantity", label: "Qty", type: "number" }, { key: "status", label: "Status", options: EQUIPMENT_STATUS }] }} />; }
export function MepLoadSchedule() { return <GenericSchedule config={{ title: "Load Schedule", table: "design_mep_load_schedule", orderField: "load_name", fields: [{ key: "load_type", label: "Type", options: LOAD_TYPES, required: true }, { key: "load_name", label: "Name", required: true }, { key: "load_value", label: "Value", type: "number", required: true }, { key: "unit", label: "Unit" }, { key: "demand_factor", label: "Demand %", type: "number" }] }} />; }
export function MepSleeveCoordination() { return <GenericSchedule config={{ title: "Sleeve/Opening Coordination", table: "design_mep_sleeve_coordination", orderField: "sleeve_no", fields: [{ key: "sleeve_no", label: "Sleeve No", required: true }, { key: "service_type", label: "Service", options: SERVICE_TYPES, required: true }, { key: "size_mm", label: "Size" }, { key: "location_text", label: "Location" }, { key: "floor_ref", label: "Floor" }, { key: "status", label: "Status", options: SLEEVE_STATUS }] }} />; }

const label = (o: { code: string; name: string }) => `${o.code} — ${o.name}`;
const labelsOf = (kind: "tc" | "material") => async (ids: string[]) =>
  new Map([...(await getChipOptionsByIds(createClient(), kind, ids))].map(([id, o]) => [id, label(o)]));

/** QS material (cost library) a material submittal is for. */
const MATERIAL_LINK: ScheduleLink = {
  key: "resource_id",
  label: "QS Material",
  source: "From the QS Cost Library (Material Master). Picking one fills an empty Material name.",
  search: async (q) => (await searchMaterials(createClient(), q, 30)).map((m) => ({ id: m.id, label: label(m), detail: m.unit, fill: { material_name: m.name } })),
  labels: labelsOf("material"),
};

/** Planning T&C item a commissioning record carries out. */
const TC_LINK: ScheduleLink = {
  key: "tc_item_id",
  label: "Planning T&C Item",
  source: "From the Planning Activity Database (Testing & Commissioning). Its test then counts in the Requirements Tracker.",
  search: async (q) => (await searchTcItems(createClient(), q, null, 30)).map((t) => ({
    id: t.id, label: label(t), detail: TC_TYPE_LABEL[t.tc_type], fill: { system_name: t.name, test_type: TC_TYPE_LABEL[t.tc_type] },
  })),
  labels: labelsOf("tc"),
};

export function MepMaterialSubmittal() {
  return <GenericSchedule config={{
    title: "Material Submittal", table: "design_mep_material_submittal", orderField: "submittal_no", link: MATERIAL_LINK,
    fields: [
      { key: "submittal_no", label: "Submittal No", required: true }, { key: "material_name", label: "Material", required: true },
      { key: "sub_discipline", label: "Sub-Discipline", options: SUB_DISCIPLINES, required: true }, { key: "manufacturer", label: "Manufacturer" },
      { key: "status", label: "Status", options: MATERIAL_STATUS, required: true },
    ],
  }} />;
}

export function MepCommissioning() {
  return <GenericSchedule config={{
    title: "Commissioning Data", table: "design_mep_commissioning", orderField: "system_name", link: TC_LINK,
    fields: [
      { key: "system_name", label: "System", required: true }, { key: "sub_discipline", label: "Sub-Discipline", options: SUB_DISCIPLINES, required: true },
      { key: "test_type", label: "Test Type", required: true }, { key: "test_date", label: "Test Date", type: "date" },
      { key: "test_result", label: "Result", options: TEST_RESULT }, { key: "status", label: "Status", options: COMMISSIONING_STATUS, required: true },
    ],
  }} />;
}
