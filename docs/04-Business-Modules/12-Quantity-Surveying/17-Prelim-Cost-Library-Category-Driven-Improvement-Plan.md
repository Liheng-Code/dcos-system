# Prelim Cost Library: Category-Driven Design Improvement Plan

**Status:** Proposed  
**Date:** 2026-10-21  
**Scope:** Quantity Surveying → Cost & Estimation → Prelim Cost Library  
**Inputs:** `Project Categories.md`, `DCOS_Prelim_Cost_Library_Revised_Structure_R1.xlsx`, and the current prelim library schema/service

## 1. Purpose

Make preliminary cost estimates responsive to the project category selected during project setup. The category should select a useful starting profile, determine which cost items and site inputs are relevant, and guide the estimator through exceptions. It must not lock the estimate to a category default: actual scope, construction method, scale, and package boundaries remain configurable.

## 2. Findings and design gaps

The R1 workbook establishes a good conceptual flow: Project Category → Prelim Profile → applicable library items and site data → calculated estimate. It maps all 33 categories in `Project Categories.md` to five profiles: Building – High Rise, Building – Low Rise, Industrial, Infrastructure / Linear, and General / Default.

The current implementation does not yet carry that model through. The database stores a single generic item catalog and `tender_prelim_settings.params`; it has no profile/category mapping or item applicability relation. The calculation service exposes only P01–P12 building-oriented parameters. Thus the workbook's P20–P22 and P30–P33 industrial/infrastructure drivers and its `Applicable Profiles` column are not represented in the current runtime model. Library defaults are also largely seeded from a single high-rise building example.

The R1 mapping is a useful first pass, but some categories span multiple scales and scopes. Examples include Apartment, Office Building, University, Residential Development, and Mixed-Use Building. Mapping these permanently to one profile risks irrelevant items or missing costs. The workbook's “dominant type” note for multi-block developments should be replaced by package-level estimates where materially different work types coexist.

## 3. Target behavior

1. Project Setup supplies a stable sector and category identifier to the tender/estimate.
2. The system proposes a default prelim profile using a versioned category map.
3. The estimator confirms or overrides the profile after entering key scale/method inputs; the system records why an override was made.
4. A profile filters the available library items and relevant site-data inputs. Shared items remain available to every profile.
5. Quantity rules are explicit and validated. Missing required inputs and user decisions are shown before calculation; missing data must not silently become zero or a generic default.
6. Calculations retain a snapshot of profile, inputs, rates, item applicability, and rule versions on the estimate so library changes do not rewrite historical tender values.
7. Multi-type developments can be split into packages, each with its own profile, inputs, and calculated items, and then rolled up to a project estimate.

## 4. Profile and category model

### 4.1 Initial profile set

Use the five R1 profiles for the first release:

| Profile | Initial use |
|---|---|
| `PROF-BLD-HR` | High-rise and complex multi-storey building work |
| `PROF-BLD-LR` | Low-rise building work |
| `PROF-IND` | Factory, warehouse, manufacturing, logistics, and industrial building work |
| `PROF-INF` | Linear and civil infrastructure work |
| `PROF-GEN` | Fallback for unmapped or internal work; shared items only |

Do not create separate Hotel, Hospital, School, or Villa profiles in the first pass. Keep these as categories that select an initial building profile, then add scope flags or profile-specific items only where verified estimating practice demonstrates a repeatable difference. This avoids multiplying near-identical templates prematurely.

### 4.2 Initial category defaults

Keep the R1 defaults as suggestions, subject to a review of the scale-based override rules in section 4.3:

| Sector | Categories | Suggested default |
|---|---|---|
| Residential | Luxury Villa, Mansion / Estate, Private Residence, Standard Villa, Townhouse | `PROF-BLD-LR` |
| Residential | Apartment | `PROF-BLD-LR`, with scale review |
| Residential | Condominium, Residential Tower | `PROF-BLD-HR` |
| Residential | Residential Development | Package-based profile selection when multiple blocks or infrastructure scopes are material; otherwise estimator confirms a dominant building profile |
| Commercial | Showroom, Shopping Mall, Retail Building, Restaurant | `PROF-BLD-LR`, with scale review for mall/large retail |
| Commercial | Office Building, Mixed-Use Building, Hotel | `PROF-BLD-HR`, with scale review; mixed-use should support separate packages |
| Industrial | Factory, Warehouse, Manufacturing Facility, Logistics Center, Industrial Building | `PROF-IND` |
| Institutional | School, University, Clinic, Government Building, Religious Building | `PROF-BLD-LR`, with scale review and campus/package split where needed |
| Institutional | Hospital | `PROF-BLD-HR`, with scale review |
| Infrastructure | Road, Bridge, Drainage, Water Supply, Utility, Other Infrastructure | `PROF-INF` |

The map must be complete against the source category list. Category labels should be stored as stable IDs/codes with display names, so later wording changes do not break existing projects.

### 4.3 Profile selection and override rules

- Treat category mapping as a default only. Evaluate confirmed building height/storeys, geometry, and work type before final profile confirmation.
- Where a building's storey count or height falls on the profile boundary, prompt the estimator to confirm the profile; do not silently change it.
- Let authorized estimators override the proposed profile and capture a reason, user, and timestamp.
- A project may use multiple estimate packages. Each package has one primary profile; explicitly shared project-level preliminaries can be allocated to packages or retained as shared lines with a documented allocation basis.
- General profile should expose shared/common items and manual additions, never silently inherit building-only equipment items.
- Keep category mapping and profile thresholds effective-dated/versioned so existing estimates remain reproducible.

## 5. Site data and quantity rules

Replace the P01–P12-only contract with a profile-aware parameter catalog. Each parameter needs a stable code, label, unit, applicable profiles, required/optional status, source guidance, validation bounds, derivation rule (if any), and the library rules that consume it.

Preserve the R1 parameter families:

- Shared: programme duration and peak workforce; site perimeter where applicable.
- Building: footprint, perimeter, storeys, height, facade area, structure/scaffold duration, floors including roof, and gross floor area.
- Industrial: plot/site area, eaves or clear height, plant/crane positions, and earthworks volume where relevant.
- Infrastructure: alignment/road length, earthworks volume, number of structures/crossings, and working width/corridor.

Review parameter codes and derivations before implementation. In particular, avoid treating gross floor area as footprint × storeys where the project includes basements, podiums, partial floors, or multiple blocks; allow a measured override with source/provenance. Derived values should show their formula and inputs. Parameter values should support “unknown / not applicable / zero” distinctly, plus source, last updated, and verification status.

For each measurable library item, replace free-text-only quantity guidance with a selectable, validated quantity rule: formula, fixed allowance, measured takeoff, or estimator-entered quantity. Store the rule version and show the calculation trail. Retain notes for human guidance, but do not parse them to calculate quantities.

## 6. Library item applicability and rate behavior

- Add a many-to-many item-to-profile applicability mapping (or equivalent normalized relation) rather than encoding comma-separated profile names in a text field. Include `ALL` behavior through an explicit shared flag or profile mapping.
- Separate item identity/code and hierarchy from applicability, quantity rules, and rate records. Preserve Z-code hierarchy and support inactive/superseded records without deleting tender history.
- Identify mutually exclusive alternatives, especially tower crane vs mobile/crawler crane and building vertical transport vs industrial/linear plant. Require an estimator choice or a validated method rule to prevent double counting.
- Distinguish “included,” “excluded,” “not applicable,” and “not yet assessed.” Do not infer exclusion from a zero quantity or zero rate.
- Add rate basis metadata: currency, location/market, effective date, source, and rate status (benchmark, quotation, project-specific). R1 USD figures are sample values, not universal market defaults; mark them as illustrative until commercially verified.
- Allow profile/category-specific defaults only when there is a defensible rate or rule difference; keep shared rates shared otherwise.

## 7. Recommended data design changes

Confirm the final schema during technical design. The minimum logical additions are:

1. **Category catalog and profile map:** stable project category IDs, sectors, default profile, effective dates, and mapping notes.
2. **Prelim profiles:** profile code/name, description, active dates/status, and version.
3. **Item applicability:** item ID, profile ID, inclusion state, and optional conditions/alternative group.
4. **Parameter definitions and values:** parameter catalog plus estimate/package-specific value, source, status, and override metadata. Replace the hard-coded `SiteDataParams` shape with a typed extensible catalog contract.
5. **Estimate/package context:** link the estimate to category, selected profile/version, and optional package parent; keep tender-specific settings compatible during migration.
6. **Rule and rate history:** versioned quantity rules and rate records or immutable calculation snapshots sufficient to reproduce tender calculations.

Prefer normalized, typed relations for category/profile/applicability over storing the entire model as unvalidated JSON. JSON may still hold extensible rule inputs or snapshots where schema versioning and validation are defined.

## 8. User workflow changes

1. **Project setup:** select sector and category from the canonical catalog.
2. **Prelim estimate start:** display proposed profile and a short explanation; prompt for scale/method confirmations and allow reasoned override.
3. **Package setup:** optionally split multi-block, mixed-use, campus, or infrastructure-plus-building scopes into packages.
4. **Site data:** show only relevant inputs, grouped by shared and profile-specific sections; identify required missing values and allow measured/derived source entry.
5. **Library review:** show included items, excluded/not-applicable items, and mutually exclusive alternatives with reasons. Let estimators add project-specific items without changing the master catalog.
6. **Calculation and application:** show formula trail, rate source/effective date, warnings, package subtotals, and project total before applying to tender preliminaries.
7. **Snapshot:** applying creates a versioned tender snapshot. Later library edits require an explicit refresh/recalculate action and a change preview.

## 9. Delivery phases

| Phase | Work | Acceptance outcome |
|---|---|---|
| 0. Reconcile and validate | Compare all 33 categories, R1 profiles/parameters/items, live seed data, and current project setup values; review sample rates and Z-code hierarchy with QS. | Approved mapping, profile rules, parameter catalog, and gap register; all sample rate assumptions labeled. |
| 1. Data model and migration | Add category/profile mapping, applicability, parameter definitions/values, package context, and snapshot/version support. Backfill existing estimates to a compatible legacy/default profile without changing stored tender amounts. | Existing tenders load unchanged; new estimates can persist category/profile and applicable inputs. |
| 2. Calculation service | Load catalog-driven parameters, validate required values, resolve profile applicability and alternatives, evaluate explicit rules, and emit traceable calculations/warnings. | Building, industrial, infrastructure, and general fixtures produce expected item sets and quantities; invalid/missing inputs are surfaced. |
| 3. Category-aware UI | Add profile confirmation/override, profile-aware site data, applicable item review, alternatives, and package creation. | Estimator can complete and inspect an estimate for each profile and a mixed-scope project. |
| 4. Tender integration and snapshot | Apply package results to tender preliminaries with source/profile/version metadata and preview; make refresh explicit. | Tender totals reconcile, source trace is retained, and recalculation cannot silently overwrite approved values. |
| 5. Pilot and rollout | Pilot one representative project per profile plus a mixed-use or multi-block example; update SOP and train QS users. | QS signs off item coverage, quantity rules, rate provenance, and roll-up behavior before broad release. |

## 10. Acceptance criteria

- Every category in `Project Categories.md` resolves to an active, versioned default profile or an explicit review-required state.
- Category selection prefilters the library and required site data correctly for all five profiles.
- Profile overrides and multi-package estimates are supported and auditable.
- Shared items appear for every profile; profile-specific and mutually exclusive items cannot be silently double-counted.
- Every calculated quantity has a visible rule/input trail; invalid formulas and missing required inputs block or clearly qualify calculation.
- Rates show currency, source, and effective date; illustrative workbook rates are not presented as approved current rates.
- Applying or recalculating a library estimate preserves a reproducible snapshot and does not silently alter approved tender amounts.
- Legacy tenders retain their existing values through migration.

## 11. Decisions to confirm during Phase 0

- Whether the initial high-rise threshold remains “≥ 6 storeys or ≥ 20 m” and how ambiguous boundary cases are handled.
- Whether Shopping Mall, University, and Residential Development need dedicated scope flags or should begin with profile/package selection only.
- Which prelim items are included in the contractor's prelim estimate versus separately priced direct works or client costs.
- Which rate market/currency is authoritative for production defaults and who approves rate updates.
- Whether infrastructure needs different subprofiles for roads, bridges, drainage, water, and utilities after the first pilot.

## 12. Execution status

The first code slice has been applied in migration `20261021000013_prelim_cost_profiles.sql` and the cost-library service/UI:

- Adds the five profile records, all 33 category mappings, and normalized item-to-profile applicability.
- Adds profile/category/override fields to saved cases, profile-specific parameter visibility, industrial and infrastructure inputs, and required-input warnings.
- Adds an initial infrastructure prelim section and prompts for scale-based building profile review.
- Recommends a matching saved profile when loading a library case into a tender, based on the linked project's category.
- Stores the source case, selected profile, and calculation inputs with tender lines loaded from the library; existing quantities/rates/amounts remain as line snapshots.
- Marks existing component rates as unverified USD values and adds source/effective-date/status fields for rate governance.

The remaining planned work is package-level mixed-project estimates, parameter value provenance and measured overrides for derived values, full formula/rule validation, richer rate editing and currency conversion, and a QS pilot/rate approval. Those items still need design and implementation before the plan's full acceptance criteria are met.

