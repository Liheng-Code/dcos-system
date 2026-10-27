# 02 – Functional Specification  
**Module:** 04-20-01 Quantity Take-off

## 1. Feature List

| ID    | Feature                     | Description                                      | Priority |
|-------|-----------------------------|--------------------------------------------------|----------|
| F-01  | Take-off Session Management | Create, edit, close measurement sessions         | Must     |
| F-02  | Manual Measurement Tools    | Length, Area, Volume, Count tools                | Must     |
| F-03  | BIM Quantity Extraction     | Extract from IFC models                          | Should   |
| F-04  | Factor & Formula Engine     | Apply multiple factors and custom formulas       | Must     |
| F-05  | Coding & Classification     | Assign Cost Code, WBS, Location                  | Must     |
| F-06  | Revision Comparison         | Compare two sessions side-by-side                | Should   |
| F-07  | Quantity Summary            | Group by Trade / Cost Code / Location / WBS      | Must     |
| F-08  | Export & Push               | Excel, CSV, and direct push to other modules     | Must     |
| F-09  | Audit Trail                 | Full history of all changes                      | Must     |
| F-10  | Measurement Rules Library   | Apply company or standard rules (SMM/CESMM)      | Should   |

## 2. Business Rules
- BR-01: Every session must be linked to one Document Revision.
- BR-02: Final Quantity = Measured Quantity × Product of all Factors.
- BR-03: Items can only be hard-deleted by System Administrator.
- BR-04: Only Senior QS can change session status to “Completed”.
- BR-05: Provisional items must be clearly flagged.