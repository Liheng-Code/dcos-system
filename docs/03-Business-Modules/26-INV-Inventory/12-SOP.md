# Inventory / Stock Module — Standard Operating Procedure
**Document Code:** DCOS-SOP-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## 1. Purpose

This SOP defines the standard procedures for operating the DCOS Inventory module on a construction project. It covers the receipt of materials, storage, issuance, transfer, return, and physical stock count procedures.

All store personnel, site engineers, and supervisors must follow this SOP. Deviations must be escalated to the Project Manager.

---

## 2. Scope

Applies to:
- All construction projects managed under DCOS
- All project stores (main store, sub-stores, temporary stores)
- All materials purchased under DCOS-managed procurement

Excludes:
- Plant and equipment (Equipment Module SOP)
- Subcontractor-supplied materials under lump-sum sub-contracts
- Office consumables (petty cash purchases)

---

## 3. Roles and Responsibilities

| Role | Key Responsibilities |
|---|---|
| Store Supervisor | Oversee all store operations; approve adjustments and write-offs; conduct and approve stock takes; escalate critical stock issues to PM |
| Storekeeper | Create and confirm GRNs; process material issues; receive returns; maintain store cleanliness and order; report discrepancies |
| Site Engineer | Raise material requisitions in DCOS; plan material needs at least 48 hours in advance; confirm materials received on site |
| Site Supervisor | Approve material requisitions; verify quantities on site; authorise returns |
| QAQC Engineer | Inspect quarantined incoming materials; issue inspection results within 48 hours of receipt |
| Procurement Officer | Coordinate deliveries against POs; notify Storekeeper of expected deliveries 24h in advance |
| Quantity Surveyor | Monitor material consumption vs budget; review cost posting reports weekly |
| Project Manager | Review stock status dashboard weekly; approve high-value adjustments and inter-project transfers |

---

## 4. Process Procedures

### 4.1 Goods Receipt Procedure

**When:** Upon arrival of a supplier delivery at the site gate or store area.

**Steps:**

1. **Before the truck arrives:** Procurement Officer notifies Storekeeper of expected delivery at least 24 hours in advance, including PO number and expected items.

2. **At arrival:** Storekeeper verifies the supplier's delivery note against the expected PO:
   - Confirm items match PO description
   - Count quantities before offloading
   - Inspect condition — note any visible damage, broken packaging, or signs of contamination

3. **Create GRN in DCOS:**
   - Open DCOS → Inventory → GRN → Create GRN
   - Select the relevant PO
   - Enter delivery note number (from supplier's document)
   - Enter received quantities per line
   - Note any condition observations in the Condition Notes field
   - For items requiring QAQC inspection: do not move to main storage area — place in designated quarantine zone
   - Attach photo of delivery note and any visible damage

4. **Confirm GRN:**
   - Review all entries
   - Click "Confirm GRN"
   - DCOS updates stock balance automatically
   - For inspection-required items: system sends notification to QAQC Engineer

5. **Physical storage:**
   - Label stored materials with item code, GRN number, batch number, and date received
   - Store in designated area by category
   - Quarantined materials: keep in clearly marked quarantine zone until QAQC approval

6. **Post-receipt:**
   - File the supplier's delivery note (physical copy) in the GRN binder
   - If quantities differ from PO: report to Procurement Officer immediately

**SLA:** GRN must be confirmed in DCOS within 4 hours of physical receipt.

---

### 4.2 Material Requisition (Issue) Procedure

**When:** Site team requires materials for work activities.

**Steps:**

1. **Site Engineer plans ahead:**
   - Raise Material Requisition in DCOS at least 48 hours before materials are needed on site
   - Open DCOS → Inventory → Material Requisitions → New MR
   - Select the correct WBS node and task
   - Select the correct cost code (consult QS if unsure)
   - Enter quantities required
   - Set required date
   - Check the "Available Stock" column — if insufficient, contact Store Supervisor before submitting

2. **Site Engineer submits MR:**
   - Click "Submit for Approval"
   - Site Supervisor receives notification

3. **Site Supervisor approves:**
   - Review the MR — confirm WBS, cost code, and quantities are correct
   - If quantities exceed available stock, adjust approved quantity to available or reject with reason
   - Approve or reject within 24 hours of submission

4. **Storekeeper prepares issue:**
   - On receipt of approval notification, pick the materials
   - Verify quantities physically
   - Prepare for site delivery

5. **Storekeeper confirms issue in DCOS:**
   - Open DCOS → Inventory → Material Requisitions → select the approved MR
   - Enter actual issued quantities (may be less than approved if partial)
   - Click "Confirm Issue"
   - DCOS reduces stock and posts cost transaction

6. **Site receipt:**
   - Site team physically receives materials
   - If quantity or condition does not match — report immediately to Site Supervisor and Storekeeper
   - Site Engineer countersigns the issue record (digital acknowledgement in system if configured)

**SLA:** Material must be issued within 24 hours of MR approval (unless required date is later).

---

### 4.3 Material Return Procedure

**When:** Unused or excess materials are to be returned from site to store.

**Steps:**

1. **Site Engineer identifies excess materials:**
   - Confirm materials are safe to return (not contaminated, not damaged)
   - Raise Material Return in DCOS referencing the original MR
   - Specify quantities and reason for return

2. **Physical return:**
   - Transport materials to store
   - Storekeeper receives and inspects each item:
     - Reusable: in good condition, can be reissued
     - Damaged: damaged but not waste — record damage details
     - Waste: unusable — initiate write-off procedure (SOP 4.6)

3. **Storekeeper confirms return in DCOS:**
   - Record condition per item
   - Click "Confirm Return"
   - DCOS adds reusable stock back to Available balance and posts reversal cost transaction

**SLA:** Return must be processed in DCOS on the same day as physical return.

---

### 4.4 Material Transfer Procedure

**When:** Materials need to move between stores (intra-project or inter-project).

**Steps:**

1. **Store Supervisor (source) creates transfer request in DCOS:**
   - Specify source store, destination store, items, quantities, and reason
   - Submit for approval

2. **Approval:**
   - Intra-project: Source Store Supervisor approves
   - Inter-project: Both Store Supervisors must approve (system enforces both approvals before allowing dispatch)

3. **Physical dispatch:**
   - Storekeeper prepares materials, arranges transport
   - Create delivery note for the transfer shipment
   - Confirm dispatch in DCOS (source stock reduced)

4. **Destination receipt:**
   - Destination Storekeeper receives materials
   - Count and verify quantities against transfer record
   - Confirm receipt in DCOS
   - If quantities differ: record discrepancy in DCOS, notify both supervisors

5. **Discrepancy resolution:**
   - Both supervisors review the discrepancy
   - Agree on final quantities
   - Project Manager approves resolution
   - Adjustments posted in DCOS

**SLA:** Destination must confirm receipt within 72 hours of dispatch confirmation.

---

### 4.5 Physical Stock Take Procedure

**Frequency:** Monthly (minimum) for all active stores. Weekly for high-value stores.

**Steps:**

1. **Preparation (3 days before):**
   - Store Supervisor notifies all stakeholders of upcoming stock take
   - Ensure all pending GRNs are confirmed and all pending MRs are processed before initiating
   - Procure count sheets / tablets

2. **Initiate stock take in DCOS:**
   - Open DCOS → Inventory → Stock Takes → New Stock Take
   - Select store
   - Click "Initiate" — system locks the store and generates count sheet
   - Download count sheet (system quantity column will be hidden)

3. **Physical count:**
   - Two-person counting recommended (Storekeeper + witness)
   - Count each item independently
   - Record physical quantities on count sheet
   - Do not refer to system quantities during counting

4. **Enter counts in DCOS:**
   - Enter physical quantities per item
   - Click "Submit Count"

5. **Review variances:**
   - Store Supervisor reviews system-calculated variances
   - For each variance > tolerance:
     - Investigate the cause
     - Enter explanation (minimum 20 characters)
   - Approve individual variance lines

6. **Complete stock take:**
   - All variance lines approved
   - Store Supervisor clicks "Complete Stock Take"
   - DCOS posts adjustments to stock balances and Cost Control
   - Store is unlocked
   - Stock take report auto-generated and saved to Document Engine

7. **Post-count:**
   - Review results with PM and QS
   - For significant write-offs: initiate investigation (follow Incident Reporting SOP)

**SLA:** Stock take must be completed within 24 hours of initiation (store must not be locked longer than 24 hours).

---

### 4.6 Write-Off Procedure

**When:** Materials are damaged, expired, or confirmed lost/stolen.

**Steps:**

1. Store Supervisor (or Storekeeper) creates Stock Adjustment in DCOS:
   - Select reason code: Damage / Expiry / Theft-Loss / Write-Off
   - Provide written description of circumstances
   - Enter items and quantities

2. If cost impact > configurable threshold: Project Manager must also approve (system will route automatically).

3. Store Supervisor approves the adjustment.

4. DCOS posts the write-off: stock reduced, cost write-off recorded.

5. For theft or suspected fraud: report to Security and HR immediately. Document the incident. Do not process the adjustment until the Project Manager authorises in writing.

---

### 4.7 Return to Supplier Procedure

**When:** Materials are defective, over-delivered, or QAQC-rejected.

**Steps:**

1. Storekeeper creates Return-to-Supplier record in DCOS, referencing the original GRN.

2. Store Supervisor approves the return.

3. Contact Procurement Officer to coordinate physical return logistics and credit note.

4. Storekeeper physically packs and returns materials to supplier.

5. Obtain signed Delivery Return Note (DRN) from supplier or driver.

6. Upload DRN to DCOS return record.

7. Confirm physical return in DCOS.

8. DCOS reduces stock and forwards credit note request to Accounting.

---

## 5. Exception Handling

| Exception | Action |
|---|---|
| Delivery without a valid PO | Refuse delivery. Notify Procurement Officer and Store Supervisor immediately. Do not create GRN. |
| Quantity received exceeds PO balance | Accept only up to PO balance. Refuse excess. Notify Procurement Officer. Record over-delivery in GRN remarks. |
| Materials received after business hours | Secure materials. Create GRN first thing next morning. Note actual receipt date. |
| QAQC inspector unavailable for > 24h | Escalate to QAQC Manager and Store Supervisor. Materials remain in quarantine. |
| Store locked for > 24h during stock take | PM to decide: cancel stock take and unlock, or authorise emergency extension. |
| Suspected theft or fraud | Stop all processes. Notify PM, HR, and Security. Preserve evidence. Do not adjust stock until authorised. |
| System outage during delivery | Record on paper count sheet. Enter into DCOS within 4 hours of system restoration. |

---

## 6. Related Documents

| Document | Code |
|---|---|
| Procurement Module SOP | DCOS-SOP-27-001 |
| QAQC Module SOP | DCOS-SOP-23-001 |
| Cost Control Module SOP | DCOS-SOP-33-001 |
| Goods Received Note Template | DCOS-TMPL-INV-001 |
| Material Requisition Template | DCOS-TMPL-INV-002 |
| Stock Count Sheet Template | DCOS-TMPL-INV-003 |
| Delivery Return Note Template | DCOS-TMPL-INV-004 |
| Inventory Module — Functional Specification | DCOS-FS-26-001 |
| Inventory Module — Permission Matrix | DCOS-PM-26-001 |

---

## 7. SOP Revision History

| Version | Date | Change | Author |
|---|---|---|---|
| R0 | June 2026 | Initial draft | DCOS System Architect |
