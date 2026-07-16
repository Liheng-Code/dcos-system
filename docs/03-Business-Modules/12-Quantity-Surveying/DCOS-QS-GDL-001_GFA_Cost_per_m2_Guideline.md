DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 1 of 9 
 
DCOS 
Digital Construction Operating System 
GFA, Site Area & Cost per m² 
Measurement & Reporting Guideline for Quantity Surveyors 
Document Ref 
DCOS-QS-GDL-001
Version 
V1.0 — Initial Issue
Related Documents 
SOP-QS-001 R3; DCOS-QS-DDS-001 V2.0; DCOS-QS-RPT-001; Measurement 
Rules (Ch.1 = this convention) 
Issue Date 
2026-07-16
Owner 
QS Manager (convention authority) / Commercial Director (approval) 
Applies To 
All QS Engineers, Estimators, and anyone producing a cost/m² figure in DCOS
Classification 
Internal — Controlled Document
 
 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 2 of 9 
Table of Contents 
Table of Contents ...........................................................................................................................................2 
1. Purpose & Rule of Use ...............................................................................................................................3 
2. Definitions ..................................................................................................................................................3 
3. GFA Measurement Convention (House Rules) ..........................................................................................4 
4. Site Area Convention .................................................................................................................................4 
5. Cost Allocation Rules — What Divides by What .......................................................................................4 
6. Case A — Building WITHOUT Basement ....................................................................................................6 
7. Case B — Building WITH Basement ...........................................................................................................6 
8. Case C — External Works ...........................................................................................................................7 
9. Case D — Combined Project & the Standard Final Cost Summary ...........................................................8 
10. Common Mistakes & Validation Checklist ..............................................................................................8 
11. Entering the Data in DCOS .......................................................................................................................9 
12. Approval & Revision .................................................................................................................................9 
 
 
 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 3 of 9 
1. Purpose & Rule of Use 
Cost per square metre ($/m²) is the most-used benchmark in construction: it sanity-checks a tender, 
compares projects, and is the number every client and director asks for first. But $/m² is only meaningful 
if everyone measures the same way. Two QS engineers using different area conventions will report 
different $/m² for the same building — and both will look wrong. 
This guideline fixes ONE house convention for measuring Gross Floor Area (GFA) and Site Area, and ONE 
standard method for allocating cost to each, so every DCOS cost summary is comparable across projects, 
years, and staff. 
The Governing Principle 
GFA measures FLOOR PLATES, not cost items. Piles have cost but no floor — they divide by the building's 
GFA. A roof has area but no floor — its cost also divides by GFA. External works have neither building cost 
nor building floor — they divide by SITE AREA and never enter the building $/m². 
 
Rule of use: no cost/m² figure may be issued in a tender review, management report, or client 
document unless it is calculated per this guideline. Deviations require QS Manager approval recorded 
in writing. 
2. Definitions 
Term 
Definition
GFA (Gross Floor Area) 
Total area of all counted floor plates, measured to the OUTSIDE face of 
external walls, per the convention in Section 3. Includes internal walls, 
columns, circulation, and shafts. 
GFA above ground 
GFA of all floors at or above ground level, including counted roof-level 
rooms. 
GFA basement 
GFA of all floors below ground level. Always recorded separately from 
above-ground GFA. 
GFA total 
GFA above ground + GFA basement.
Site Area 
Total land area of the project site within the legal boundary, per title/survey 
plan. 
Building footprint 
Ground-level area covered by the building. Used for site coverage checks —
NOT a cost denominator. 
Building cost 
Contract cost of the building works only — excludes external works and 
land. 
External works cost 
Cost of works outside the building line: roads, boundary, drainage, 
landscape, guard house, site utilities. 
Elemental cost/m² 
Cost of one trade/element (substructure, frame, finishes, MEP...) ÷ GFA 
total. 
Blended $/m² 
Total building cost ÷ GFA total (basement mixed in).
Split $/m² 
Above-ground cost ÷ above-ground GFA reported separately from basement 
cost ÷ basement GFA. 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 4 of 9 
3. GFA Measurement Convention (House Rules) 
Measure each floor plate from the architectural floor plans to the OUTSIDE face of external walls. Then 
apply the inclusion table: 
Element 
Count in GFA
Rule
Typical enclosed floor 
100%
Full plate to outside face of external walls 
Basement floor 
100%
Full plate — recorded as GFA basement, never 
mixed silently into above-ground 
Covered balcony / open-sided corridor / 
covered walkway / canopy over entrance 
50%
Half area — covered but not enclosed 
Uncovered terrace, open roof deck, open 
parking on grade 
0%
No enclosure — excluded
Lift shafts, stair cores, service risers 
100%
Counted at EVERY floor they pass through 
Double-height void (lobby, atrium, 
auditorium airspace) 
Once
Counted once at the lowest floor; the void 
opening above counts 0% 
Enclosed roof-level rooms (lift motor 
room, tank room, plant room, stair 
bulkhead) 
100%
They are floor plates — count them in above-
ground GFA 
Roof structure, waterproofing, parapets
0%
Not a floor — cost divides by GFA total 
Piles, pile caps, footings, ground beams
0%
Not a floor — cost shows as the Substructure 
elemental line ÷ GFA total 
External works, boundary walls, site 
roads 
0%
Different denominator — Site Area (Section 4)
 
Three Non-Negotiable Rules 
1.  GFA is ENTERED from drawings, never derived. Do not sum it from BOQ items or room areas — room-
by-room totals miss walls, circulation, and shafts. 
2.  GFA is entered per LEVEL in DCOS and rolls up to building and project (Section 11). Parents are read-
only. 
3.  When the design changes (added floor, changed footprint), the GFA is revised with a reason and the 
change is audit-logged. Historical $/m² snapshots keep the GFA that was current at their time. 
4. Site Area Convention 
• Site Area = legal land area from the title deed / survey plan, entered once at the PROJECT node. 
• If the contract covers only part of a larger site, use the defined works-area boundary from the 
contract drawings and note the source. 
• Site Area is the denominator for external works $/m² ONLY. It never divides building cost. 
• Building footprint may be recorded for site-coverage ratio (footprint ÷ site area) but is not a cost 
denominator. 
5. Cost Allocation Rules — What Divides by What 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 5 of 9 
Cost 
Denominator
Shown as
Building works total (incl. piling, roof, prelims 
share) 
GFA total
Building $/m² (blended) 
Above-ground building works 
GFA above ground
Split reporting line 1 
Basement works (excavation, retaining, 
waterproofing, basement structure) 
GFA basement
Split reporting line 2 
Substructure (piling, pile caps, ground beams)
GFA total
Elemental line inside building 
$/m² 
Each trade/element (frame, finishes, MEP, 
prelims) 
GFA total
Elemental $/m² table 
External works 
SITE AREA
External $/m² site — SEPARATE 
line, never inside building $/m² 
 
Building $/m2        = Building cost ÷ GFA_total
Elemental $/m2       = Element cost  ÷ GFA_total 
Basement $/m2        = Basement cost ÷ GFA_basement 
External $/m2 (site) = External cost ÷ Site_Area 
NEVER:  (Building + External) ÷ GFA   as the headline building benchmark 
 
A deep-piled project shows a HIGH substructure elemental line — that is the correct, visible signal. Hiding 
foundation cost by inflating area is the classic mistake this guideline exists to stop. 
 
 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 6 of 9 
6. Case A — Building WITHOUT Basement 
Project: 10-storey school building. Contract for building works only = $3,595,200 (external works 
excluded, handled in Case C). 
Step 1 — Measure GFA per level 
Level 
Plate area
Rule applied
Counted 
Ground floor 
850 m²
100%
850 
Levels 2–10 (9 floors) 
9 × 850 m²
100%
7,650 
Roof: lift motor room + tank 
room 
60 m² 
Enclosed roof rooms 100%
60 
Roof: open deck 
400 m²
Uncovered 0%
0 
GFA above ground = GFA 
total 
 
 
8,560 m² 
Step 2 — Compute the benchmark 
Building $/m2 = 3,595,200 ÷ 8,560 = $420.00 /m2
Step 3 — Elemental breakdown (÷ GFA total 8,560) 
Element 
Cost (USD)
$/m² 
Substructure (piling, pile caps, ground beams)
428,000
50.00 
Superstructure (concrete frame) 
1,112,800
130.00 
Architectural works & finishes 
1,027,200
120.00 
MEP services 
856,000
100.00 
Preliminaries 
171,200
20.00 
Building total 
3,595,200
420.00 
Note how the piling cost is fully visible as the $50/m² substructure line — divided by the whole GFA, 
contributing zero area of its own. 
7. Case B — Building WITH Basement 
Same school, now with one basement level of 850 m² (parking + plant). Basement works (excavation, 
retaining, waterproofing, basement structure) = $722,500. Illustrative — in reality substructure design 
also changes; this example isolates the area logic. 
Step 1 — GFA split 
Component 
Area
GFA above ground (Case A) 
8,560 m²
GFA basement (1 × 850) 
850 m²
GFA total 
9,410 m²


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 7 of 9 
Step 2 — Report BOTH ways (mandatory) 
Reporting line 
Calculation
Result 
Above-ground $/m² 
3,595,200 ÷ 8,560
420.00 
Basement $/m² 
722,500 ÷ 850
850.00 
Blended building $/m² 
(3,595,200 + 722,500) ÷ 9,410 = 4,317,700 ÷ 
9,410 
458.84 
 
Why split reporting is mandatory 
The basement costs 850 $/m² — roughly double a typical floor. If you publish only the blended 458.84, this 
project looks 9% more expensive than the no-basement school at 420.00, and someone will wrongly 
conclude the building got costlier. Split reporting shows the truth: the above-ground building is IDENTICAL 
at 420.00; the basement is a separate, expensive component. Blended is for portfolio comparison; split is 
for understanding. 
8. Case C — External Works 
Site area 4,500 m² (title deed). External works: boundary wall, internal road & parking, storm drainage, 
landscaping, guard house = $180,000. 
External works $/m2 (site) = 180,000 ÷ 4,500 = $40.00 /m2 of site
WRONG:  adding 180,000 into the building numerator 
        (4,317,700 + 180,000) ÷ 9,410 = 477.97  ← NOT the building benchmark 
 
• External works relate to the land, not the floor plates. A small building on a large site would be 
unfairly penalized if external cost divided by GFA. 
• The 477.97 all-in figure MAY be shown as a memo line labelled “whole project ÷ GFA” — but never 
as “building $/m²”, and never used to benchmark against building-only figures. 
 
 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 8 of 9 
9. Case D — Combined Project & the Standard Final Cost Summary 
The full project = Case B building + Case C external works. Total contract $4,497,700. Every project cost 
summary issued from DCOS must follow this exact format: 
STANDARD FINAL COST SUMMARY (mandatory format) 
No. 
Description 
Cost (USD)
Denominator 
$/m² 
1 
Building works — above ground
3,595,200
8,560 m² GFA 
420.00
2 
Building works — basement 
722,500
850 m² GFA 
850.00
A 
Building subtotal (blended) 
4,317,700
9,410 m² GFA 
458.84
3 
External works 
180,000
4,500 m² site 
40.00 
B 
TOTAL CONTRACT 
4,497,700
—
— 
memo Whole project ÷ GFA (memo only — not a 
benchmark) 
4,497,700
9,410 m² GFA 
477.97
 
Below the summary, attach the elemental table (Section 6 Step 3 format) computed on GFA total, and 
state the GFA convention reference: “Areas per DCOS-QS-GDL-001 V1.0”. Client-facing versions show sell-
side costs only, per the firewall rule (SOP-QS-05A / RPT-001 G7). 
Reading the summary — what each line answers 
Line 
Question it answers
Line 1 (420.00) 
Is this building's construction economical? Compare with other above-ground 
buildings of the same type. 
Line 2 (850.00) 
What did going underground cost us? Compare basement decisions across 
projects. 
Line A (458.84) 
Portfolio blended rate — for company-wide $/m² statistics.
Line 3 (40.00) 
Site development intensity — compare against site area, not building size. 
Memo (477.97) 
Answering a director who asks “total divided by area” — labelled so it is never 
mistaken for the building benchmark. 
10. Common Mistakes & Validation Checklist 
The five classic mistakes 
1. Counting foundations or roof structure as area. They are cost, not floor plate — 0% area, full cost ÷ 
GFA total. 
2. Blending the basement silently. Always report split + blended; a blended-only figure misleads every 
comparison. 
3. Dividing external works by GFA. External works ÷ Site Area, always. 
4. Deriving GFA from BOQ or room areas. GFA is measured from floor plans to the outside face — 
room sums miss walls, shafts, circulation. 
5. Changing GFA without revision control. A GFA edit silently changes every historical-looking 
benchmark. Revise with reason; snapshots keep their original GFA. 


DCOS — GFA & Cost per m² Guideline 
DCOS-QS-GDL-001  |  V1.0  |  Internal 
Digital Construction Operating System  |  Internal Controlled Document  |  Page 9 of 9 
Checklist before issuing any $/m² figure 
• GFA entered per level, from the current drawing revision, convention table applied and noted. 
• Basement levels flagged; above/below split available. 
• Site area entered at project node with source (title deed / survey ref). 
• External works WBS branch excluded from building numerator. 
• No level has cost > 0 with GFA = 0 (DCOS warns — do not ignore the warning). 
• Summary follows the Section 9 mandatory format; convention reference cited. 
• Client version contains sell-side figures only (firewall check). 
11. Entering the Data in DCOS 
1. Open the WBS tree → select each Level node → QuanƟƟes panel → add metric GFA with value (m²), 
source = drawing revision reference. 
2. Basement levels: ensure the node is typed/flagged as below-ground so the split reports 
automatically. 
3. Roof-level enclosed rooms: enter their 60 m² (etc.) as GFA on the roof level node — the open deck is 
simply not entered. 
4. Select the Project node → add metric SITE_AREA with the title-deed area and source reference. 
5. Building and project GFA totals roll up automatically — parent values are read-only. 
6. Design change: edit the level GFA → the system requires a reason and logs the change; existing S-
curve/EVM snapshots retain their original GFA. 
7. The QS Dashboard “Cost/m²” card and the Final Cost Summary report (RPT series) read ONLY these 
entered values — if the card shows “no area data”, the input above is missing. 
 
System reference: metrics are stored in wbs_node_quantities (metric_code GFA / SITE_AREA); feature 
specification FS-QS-012 in DDS-001 V2.0. 
12. Approval & Revision 
The 50% balcony treatment, void rules, and split-reporting mandate are HOUSE DECISIONS. They bind all 
staff once approved below. Amendments follow document control (new version, reason, re-approval). 
Role 
Name
Signature
Date 
QS Manager (convention authority) 
 
 
 
Commercial Director (approver) 
 
 
 
 
Version 
Date 
Description
Author 
V1.0 
2026-07-16 
Initial issue — GFA/site conventions, cost allocation 
rules, worked Cases A–D, standard final cost 
summary format, DCOS entry procedure 
DCOS Commercial 
Team 
 
End of Document — DCOS-QS-GDL-001 V1.0 
