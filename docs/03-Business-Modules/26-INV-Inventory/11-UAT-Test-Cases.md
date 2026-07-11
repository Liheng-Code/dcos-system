# Inventory / Stock Module — UAT Test Cases
**Document Code:** DCOS-UAT-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## Test Environment Setup

**Pre-conditions for all tests:**
- Tenant: DCOS Test Tenant
- Project: "Test Project Alpha" (active)
- Users: Admin, PM, Store Supervisor, Storekeeper (user01), Site Engineer, Site Supervisor, QAQC Engineer
- Store: "Main Store" (active, Main type, assigned to Storekeeper user01)
- Items: "Rebar 10mm" (kg, structural, inspection_required=true), "Cement OPC 42.5" (bag, civil, inspection_required=false), "PVC Pipe 50mm" (m, MEP)
- Active PO from Procurement: PO-001 (Rebar 10mm × 5,000 kg @ $1.50, Cement × 200 bags @ $8.00)
- WBS node: "Foundation Works" (linked to Test Project Alpha)
- Task: "Pile Cap Rebar" (linked to Foundation Works WBS)

---

## Test Cases

### TC-01: Create and Confirm GRN (No Inspection)

**BR Reference:** BR-F3-01, BR-F3-02, BR-F3-04
**Actor:** Storekeeper

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Inventory → GRN → Create GRN | GRN form opens |
| 2 | Select PO-001 | PO lines populated: Rebar 10mm 5,000 kg, Cement 200 bags |
| 3 | Enter Cement line received qty: 150 bags (partial delivery) | Total cost shows 150 × $8.00 = $1,200 |
| 4 | Leave Rebar line qty = 0 (not delivered yet) | |
| 5 | Enter delivery note number "DN-2026-001", received date today | |
| 6 | Save as Draft | GRN saved with status = Draft, GRN number assigned |
| 7 | Click Confirm GRN | Confirmation dialog appears |
| 8 | Confirm | GRN status = Confirmed; Cement stock in Main Store = 150 bags (Available); Rebar still 0 |
| 9 | Verify stock balance screen | Cement: 150 Available, 0 Under Inspection |

**Pass Criteria:** GRN confirmed; stock updated; cost commitment posted.

---

### TC-02: GRN with QAQC Inspection Required

**BR Reference:** BR-F3-05, BR-F3-06, BR-F3-07
**Actor:** Storekeeper, QAQC Engineer

| Step | Action | Expected Result |
|---|---|---|
| 1 | Create new GRN referencing PO-001 | |
| 2 | Enter Rebar 10mm received qty: 2,000 kg | Inspection Required badge shows (item has is_inspection_required=true) |
| 3 | Enter batch number "BATCH-RB-001" | |
| 4 | Confirm GRN | GRN confirmed; Rebar stock: 0 Available, 2,000 Under Inspection |
| 5 | QAQC Engineer opens GRN detail | Inspection pending badge visible; Inspect button active |
| 6 | QAQC Engineer clicks Inspect → submits "approved" with notes | |
| 7 | Verify stock | Rebar: 2,000 Available, 0 Under Inspection |
| 8 | Verify notification | Store Supervisor and Procurement Officer received approval notification (N4) |

**Pass Criteria:** Stock correctly quarantined until QAQC approval; status transitions correctly.

---

### TC-03: QAQC Rejects Incoming Material

**BR Reference:** BR-F3-06
**Actor:** QAQC Engineer, Storekeeper

| Step | Action | Expected Result |
|---|---|---|
| 1 | Create GRN for 500 kg Rebar; confirm | Stock = 500 Under Inspection |
| 2 | QAQC Engineer submits inspection result = "rejected", reason = "Corroded surface — not compliant with BS 4449" | |
| 3 | Verify stock | Rebar stock remains 0 Available, 0 Under Inspection (rejected stock removed) |
| 4 | Verify Return-to-Supplier record created automatically | RTS record exists, status = Pending Approval, reason = QAQC Rejection |
| 5 | Verify notifications | Storekeeper, Store Supervisor, Procurement Officer notified (N5) |

**Pass Criteria:** Rejected material does not enter available stock; return record auto-created.

---

### TC-04: Create and Approve Material Requisition (Sufficient Stock)

**BR Reference:** BR-F4-01, BR-F4-02, BR-F4-03, BR-F4-04, BR-F4-05
**Actor:** Site Engineer, Site Supervisor, Storekeeper
**Pre-condition:** 150 bags Cement available in Main Store (from TC-01)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Site Engineer creates MR | MR form opens |
| 2 | Select WBS = "Foundation Works", Task = "Pile Cap Rebar", Cost Code = "MAT-CIV-01" | |
| 3 | Set required date = tomorrow | |
| 4 | Add Cement, qty 50 bags | Available stock shown: 150 bags. No warning. |
| 5 | Submit MR | MR status = Submitted; Site Supervisor notified (N6) |
| 6 | Site Supervisor opens MR and approves | MR status = Approved; Storekeeper notified (N7) |
| 7 | Storekeeper opens MR and clicks Issue | Issue confirmation form shows 50 bags |
| 8 | Confirm issue with qty = 50 | MR status = Issued; Cement stock = 100 Available |
| 9 | Check Cost Control | Cost transaction posted: 50 bags × $8.00 = $400, against WBS "Foundation Works" / "MAT-CIV-01" |

**Pass Criteria:** MR workflow complete; stock reduced; cost posted to correct WBS and cost code.

---

### TC-05: Block Issue When Stock is Zero

**BR Reference:** BR4 (stock can never go below zero)
**Actor:** Site Engineer, Storekeeper
**Pre-condition:** Cement stock = 100 bags (from TC-04)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Site Engineer creates MR for 110 bags Cement | Warning shown: "Requested (110) exceeds available (100)" |
| 2 | Submit MR | MR submitted with stock warning flag |
| 3 | Site Supervisor approves 100 bags (adjusts approved qty to available) | MR approved, quantity_approved = 100 |
| 4 | Storekeeper attempts to issue 110 bags (enters wrong number) | System shows error: `INV_NEGATIVE_STOCK` — issue blocked |
| 5 | Storekeeper issues 100 bags | Success; Cement stock = 0 |
| 6 | Verify low-stock/zero-stock notification | Notification N13 sent to Storekeeper, Supervisor, Procurement, PM |

**Pass Criteria:** System blocks negative stock; correct notifications fired.

---

### TC-06: Block Issue from Quarantined Stock

**BR Reference:** BR-F4-06

| Step | Action | Expected Result |
|---|---|---|
| 1 | Rebar stock = 0 Available, 1,000 Under Inspection | |
| 2 | Site Engineer creates MR for 500 kg Rebar | |
| 3 | Site Supervisor approves | |
| 4 | Storekeeper attempts to issue | Error: `INV_QUARANTINE_ISSUE` — cannot issue quarantined stock |

**Pass Criteria:** System enforces quarantine barrier.

---

### TC-07: Material Return to Store

**BR Reference:** BR-F5-01, BR-F5-02, BR-F5-03, BR-F5-04
**Pre-condition:** TC-04 completed; 50 bags Cement issued on MR-001

| Step | Action | Expected Result |
|---|---|---|
| 1 | Site Engineer raises Material Return, references MR-001 | Form shows issued items |
| 2 | Enter return qty = 15 bags, condition = Reusable, reason = "Excess" | |
| 3 | Storekeeper confirms return; inspects; marks as Reusable | |
| 4 | Verify stock | Cement: 115 Available (was 100 + 15 returned) |
| 5 | Verify cost Control | Reversal posted: 15 bags × $8.00 = $120 credit to Foundation Works / MAT-CIV-01 |

**Pass Criteria:** Stock correctly restocked; cost reversal posted.

---

### TC-08: Inter-Project Transfer (Full Approval Flow)

**Pre-condition:** Two projects exist: "Alpha" and "Beta". Alpha has 200 bags Cement. Beta has a Store Supervisor.

| Step | Action | Expected Result |
|---|---|---|
| 1 | Alpha Store Supervisor creates transfer: 50 bags Cement from Alpha-Store to Beta-Store | Transfer created, status = Pending |
| 2 | Verify Alpha-Store Supervisor is prompted to approve (source) | |
| 3 | Alpha Store Supervisor approves | Status = Partially Approved (awaiting destination) |
| 4 | Beta Store Supervisor receives notification (N14) | |
| 5 | Beta Store Supervisor approves | Status = Approved |
| 6 | Alpha Storekeeper dispatches | Alpha stock reduced by 50; status = In Transit |
| 7 | Beta Storekeeper confirms receipt of 50 bags | Status = Received; Beta stock +50 |
| 8 | Verify cost adjustments | Alpha cost centre credited 50 × cost; Beta cost centre debited |

**Pass Criteria:** Both-party approval enforced; stock and costs updated correctly.

---

### TC-09: Physical Stock Take — With Variance

**Pre-condition:** Cement stock = 100 bags (Available)

| Step | Action | Expected Result |
|---|---|---|
| 1 | Store Supervisor initiates stock take for Main Store | Status = Open; store LOCKED; all users notified (N23) |
| 2 | Verify Storekeeper cannot create a new GRN or process an MR | Error: `INV_STORE_LOCKED` |
| 3 | Storekeeper downloads count sheet | System quantities hidden; items listed |
| 4 | Storekeeper enters counted qty: Cement = 97 bags (3 missing) | Variance = -3 bags |
| 5 | Storekeeper submits count | Status = Pending Approval |
| 6 | Store Supervisor reviews: variance = -3 bags = -$24 | Exceeds zero tolerance — explanation required |
| 7 | Supervisor enters explanation: "3 bags found damaged — wet from rain, disposed on site" | |
| 8 | Supervisor approves variance | |
| 9 | Store Supervisor clicks Complete Stock Take | Adjustments posted: -3 bags; stock = 97; status = Completed; store UNLOCKED |
| 10 | Verify audit log | `INV.ST.COMPLETE` entry present with full details |

**Pass Criteria:** Store correctly locked/unlocked; variance approved by named supervisor; stock adjusted; audit entry created.

---

### TC-10: Low Stock Alert Trigger

| Step | Action | Expected Result |
|---|---|---|
| 1 | Set Cement reorder_point = 110 bags | |
| 2 | Current stock = 100 bags (from TC-09) | Already below reorder point |
| 3 | Verify notification N12 | Storekeeper + Store Supervisor + Procurement Officer have received Low Stock alert |
| 4 | Check low-stock panel | Cement appears with available = 100, reorder point = 110 |

**Pass Criteria:** Alert fires correctly; correct recipients notified.

---

### TC-11: Tenant Isolation Test

**BR Reference:** System architecture — cross-tenant access blocked

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in as user from Tenant B | |
| 2 | Attempt to access GRN list from Tenant A project via direct URL | 404 response (or empty list — no existence leak) |
| 3 | Attempt to create MR with store_id from Tenant A | 403 / 404 response |
| 4 | Verify no Tenant A data visible in any response | No Tenant A data in API responses |

**Pass Criteria:** RLS prevents all cross-tenant access.

---

### TC-12: Report — Consumption by WBS

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Reports → Material Consumption | |
| 2 | Filter: Project = Alpha, Date = this month, WBS = Foundation Works | |
| 3 | Verify data | Shows all issues to Foundation Works: Cement 50 bags issued (from TC-04), minus 15 return (TC-07) = net 35 bags |
| 4 | Export CSV | CSV file downloads with correct data |

---

## UAT Sign-Off Checklist

| Test Case | Pass ✅ / Fail ❌ | Tester | Date |
|---|---|---|---|
| TC-01: GRN Create + Confirm | | | |
| TC-02: GRN with QAQC Inspection | | | |
| TC-03: QAQC Rejection | | | |
| TC-04: MR Create + Approve + Issue | | | |
| TC-05: Block Negative Stock | | | |
| TC-06: Block Issue from Quarantine | | | |
| TC-07: Material Return | | | |
| TC-08: Inter-Project Transfer | | | |
| TC-09: Physical Stock Take | | | |
| TC-10: Low Stock Alert | | | |
| TC-11: Tenant Isolation | | | |
| TC-12: Consumption Report | | | |

**UAT Approved By:** ___________________ **Date:** ___________________

**Notes / Outstanding Issues:**
