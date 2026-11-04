# 20 — What Planning needs from the BIM extract

Audience: Design/BIM team (owners of the IFC extractor and `bim_element_takeoff`). Date: 2026-10-13.
Context: Activity Library Phase 3.4. Planning already consumes the extract; this note says what is missing and how to check it.

## 1. Why this matters
Planning generates the activities of each floor (formwork, rebar, concrete, ...) and sizes them from quantities. A slab-volume
figure taken straight from the model replaces manual entry and BOQ matching, and stays traceable to the model revision.
Planning has built its side (level mapping, coverage report, `bim` quantity provider). It cannot work yet because of the data below.

## 2. What the extract looks like today (checked 2026-10-13, model "KOMB - Test 004", project Hattha Bank Tower)

| IFC class | Elements | With quantity | With unit | With storey (`level` / `building_level`) |
|---|---|---|---|---|
| IFCREINFORCINGBAR | 3,694 | 0 | 0 | 0 |
| IFCBEAM | 312 | 0 | 0 | 0 |
| IFCSLAB | 214 | 0 | 0 | 0 |
| IFCCOLUMN | 184 | 0 | 0 | 0 |
| IFCWALLSTANDARDCASE | 32 | 0 | 0 | 0 |

`raw_properties` holds only tag / name / object type / predefined type. `bim_element_wbs_map` has no rows.
Roughly 30,000 further rows are relationship and property-set records (IFCRELDEFINESBYPROPERTIES, IFCPROPERTYSET, ...) that carry no quantity themselves.

## 3. What Planning reads (the contract)
Table `bim_element_takeoff`, columns `model_id, ifc_class, unit, quantity, level, building_level`, for the classes
`IFCSLAB, IFCBEAM, IFCCOLUMN, IFCWALL, IFCWALLSTANDARDCASE, IFCREINFORCINGBAR`. Planning does not write to any BIM table.

Requirements per structural element (one row per physical element):

1. **`quantity` and `unit`** from the model's own base quantities (`IfcElementQuantity` / `Qto_*BaseQuantities`), **net** values:

   | Class | Quantity wanted | Unit written |
   |---|---|---|
   | IFCSLAB | NetVolume (and, as a second row or column set, plan area) | `m3` / `m2` |
   | IFCBEAM | NetVolume | `m3` |
   | IFCCOLUMN | NetVolume | `m3` |
   | IFCWALL / IFCWALLSTANDARDCASE | NetVolume; NetSideArea for formwork | `m3` / `m2` |
   | IFCREINFORCINGBAR | mass | `kg` |

   One element may carry several quantities. Planning accepts either several rows per element (one per quantity, distinguished by `unit`) or one row per quantity kind; it filters by `unit`. Please tell us which you choose.
2. **Storey** in `building_level` (preferred) or `level`, from `IfcRelContainedInSpatialStructure` to the `IfcBuildingStorey` (its `Name`). Planning matches names such as `Level 3`, `L03`, `3rd Floor`, `Ground Floor`, `Roof`; the exact label is kept and mapped by the planner to a WBS level.
3. **Unit spelling:** `m3`, `m2`, `m`, `kg` (Planning also accepts `m³`, `m²`).
4. **Idempotent re-extraction:** running the extractor again on the same model must update rows (unique `model_id, global_id` already exists), never duplicate them.
5. **Revisions:** a new model revision is a new `bim_models` row; the old one becomes `SUPERSEDED`. Planning only reads `CURRENT` models.
6. **Do not mix gross and net** in the same unit. If a model has no base quantities, leave `quantity` empty rather than estimating; Planning treats empty as "unknown".

## 4. Acceptance check (run this SQL on the extracted model)
A class is usable by Planning when **at least 80%** of its elements have a quantity above zero **and** a storey.

```sql
select ifc_class,
       count(*)                                                           as elements,
       count(*) filter (where quantity > 0 and coalesce(nullif(building_level,''), nullif(level,'')) is not null) as usable,
       round(100.0 * count(*) filter (where quantity > 0 and coalesce(nullif(building_level,''), nullif(level,'')) is not null) / count(*), 1) as usable_pct,
       array_agg(distinct unit) filter (where quantity > 0)               as units
from bim_element_takeoff
where model_id = '<model id>'
  and ifc_class in ('IFCSLAB','IFCBEAM','IFCCOLUMN','IFCWALL','IFCWALLSTANDARDCASE','IFCREINFORCINGBAR')
group by 1 order by 2 desc;
```
Planning screen: **Planning › Activity Library › BIM Quantities** shows the same report and the storey list for the selected model.

Done when IFCSLAB, IFCCOLUMN, IFCBEAM and walls reach 80% usable on the pilot model (rebar can follow).

## 5. What happens on the Planning side when the data arrives
1. The planner opens **BIM Quantities**, checks coverage, confirms the mapping of BIM storeys to WBS levels (suggested automatically by name).
2. Generation then fills slab / column / beam / wall quantities from the model, marked `BIM <model> <revision>: n elements`; BOQ links, manual and calculated quantities remain the fallbacks.
3. A class below 80% is ignored, so a half-extracted model can never under-count a floor.

## 6. Questions for the Design/BIM team
- Which quantities does the pilot model actually carry (does the authoring tool export `Qto_SlabBaseQuantities`)? If not, is calculating volumes from geometry in scope?
- One row per quantity kind or several quantities per row? (Section 3.1)
- Target date for the pilot model so Planning can run the acceptance check and a walkthrough.

## Update 2026-10-13: the extractor is now implemented
On the owner's request ("3.4a"), Planning built the extractor in the BIM module instead of waiting for the Design/BIM team (details: `19-Activity-Library-Phase3-Plan.md`, section 16). The "Extract for takeoff" button now fills quantity, unit, storey and secondary quantities (`raw_properties._quantities`) and removes non-element rows. The acceptance check in this document still applies unchanged. It has been verified on fixtures and a synthetic model, **not yet on a real IFC file**: re-extract a real model in the viewer and run the acceptance SQL to confirm 80% coverage on slabs, columns, beams and walls.
