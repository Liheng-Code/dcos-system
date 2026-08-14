import type { QsProgressClaim, QsClaimItem } from "@/lib/qs-service";
import type { TenderCoverSummary, TenderSubmissionData } from "@/lib/tender-cost-service";
import { amountInWords } from "@/lib/number-to-words";

const BASE_STYLE = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; padding: 20mm; }
    h1 { font-size: 14pt; margin-bottom: 4px; }
    h2 { font-size: 11pt; margin-bottom: 4px; }
    h3 { font-size: 10pt; margin: 12px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { background: #1e3a5f; color: #fff; font-size: 8pt; padding: 4px 6px; text-align: left; }
    td { border: 1px solid #ddd; padding: 3px 6px; vertical-align: top; }
    tr:nth-child(even) td { background: #f7f8fa; }
    .header { border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
    .logo { font-size: 18pt; font-weight: bold; color: #1e3a5f; }
    .doc-ref { text-align: right; font-size: 8pt; color: #555; }
    .summary-table td:last-child { text-align: right; font-weight: bold; }
    .total-row td { background: #1e3a5f !important; color: #fff; font-weight: bold; }
    .section-row td { background: #e8eef5; font-weight: bold; font-size: 8.5pt; }
    .right { text-align: right; }
    .footer { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 7.5pt; color: #777; display: flex; justify-content: space-between; }
    .sig-line { margin-top: 36px; border-top: 1px solid #999; padding-top: 4px; width: 200px; font-size: 8pt; color: #555; }
    .repeat-header thead { display: table-header-group; }
    @media print { body { padding: 12mm; } }
  </style>
`;

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function openPrint(html: string, title: string): void {
  const win = window.open("", "_blank");
  if (!win) { alert("Allow pop-ups to generate the PDF."); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${BASE_STYLE}</head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

export function printIpcCertificate(
  claim: QsProgressClaim,
  items: QsClaimItem[],
  projectName: string,
): void {
  const itemRows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.description}</td>
      <td class="right">${fmt(Number(item.scheduled_value))}</td>
      <td class="right">${fmt(Number(item.prev_completed))}</td>
      <td class="right">${fmt(Number(item.this_period))}</td>
      <td class="right">${fmt(Number(item.materials_stored ?? 0))}</td>
      <td class="right">${fmt(Number(item.total_to_date))}</td>
      <td class="right">${item.pct_complete != null ? Number(item.pct_complete).toFixed(1) + "%" : "—"}</td>
    </tr>
  `).join("");

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>INTERIM PAYMENT CERTIFICATE</strong><br>
        IPC No.: <strong>${claim.claim_number}</strong><br>
        Project: ${projectName}<br>
        Period: ${claim.period_start} to ${claim.period_end}<br>
        Status: ${claim.status.toUpperCase()}
      </div>
    </div>

    <h3>A. Contract Summary</h3>
    <table class="summary-table" style="width:360px">
      <tr><td>Original Contract Sum</td><td>$ ${fmt(Number(claim.original_contract_sum))}</td></tr>
      <tr><td>Net Change by Approved VOs</td><td>$ ${fmt(Number(claim.net_vo_amount))}</td></tr>
      <tr><td><strong>Contract Sum to Date</strong></td><td><strong>$ ${fmt(Number(claim.original_contract_sum) + Number(claim.net_vo_amount))}</strong></td></tr>
    </table>

    <h3>B. Claim Items</h3>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Description</th>
          <th style="width:80px">Scheduled Value</th>
          <th style="width:80px">Prev Completed</th>
          <th style="width:80px">This Period</th>
          <th style="width:80px">Mat. Stored</th>
          <th style="width:80px">Total to Date</th>
          <th style="width:55px">% Complete</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr class="total-row">
          <td colspan="2">TOTAL</td>
          <td class="right">${fmt(items.reduce((s, i) => s + Number(i.scheduled_value), 0))}</td>
          <td class="right">${fmt(items.reduce((s, i) => s + Number(i.prev_completed), 0))}</td>
          <td class="right">${fmt(items.reduce((s, i) => s + Number(i.this_period), 0))}</td>
          <td></td>
          <td class="right">${fmt(Number(claim.total_completed_stored))}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <h3>C. Payment Calculation</h3>
    <table class="summary-table" style="width:360px">
      <tr><td>Total Completed & Stored to Date</td><td>$ ${fmt(Number(claim.total_completed_stored))}</td></tr>
      <tr><td>Less Retention (${Number(claim.retention_pct)}%)</td><td>- $ ${fmt(Number(claim.retention_amount))}</td></tr>
      <tr><td>Less Previous Certificates Total</td><td>- $ ${fmt(Number(claim.prev_certificates_total))}</td></tr>
      <tr class="total-row"><td>CURRENT PAYMENT DUE</td><td>$ ${fmt(Number(claim.current_payment_due))}</td></tr>
    </table>

    ${claim.certified_amount != null ? `
    <p style="margin-top:8px;font-size:8pt;color:#1e3a5f;font-weight:bold">
      Certified Amount: $ ${fmt(Number(claim.certified_amount))}
      ${claim.certified_at ? " — Certified: " + claim.certified_at.slice(0, 10) : ""}
    </p>` : ""}

    <div style="display:flex;gap:60px;margin-top:32px">
      <div><div class="sig-line">Prepared by</div></div>
      <div><div class="sig-line">Certified by</div></div>
      <div><div class="sig-line">Date</div></div>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>IPC #${claim.claim_number} · ${projectName}</span>
    </div>
  `;

  openPrint(html, `IPC-${claim.claim_number}-${projectName}`);
}

export function printIpcSubmissionPackage(
  claim: QsProgressClaim,
  items: QsClaimItem[],
  projectName: string,
): void {
  const itemRows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.description}</td>
      <td class="right">${fmt(Number(item.scheduled_value))}</td>
      <td class="right">${fmt(Number(item.prev_completed))}</td>
      <td class="right">${fmt(Number(item.this_period))}</td>
      <td class="right">${fmt(Number(item.materials_stored ?? 0))}</td>
      <td class="right">${fmt(Number(item.total_to_date))}</td>
    </tr>
  `).join("");

  const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>IPC SUBMISSION PACKAGE</strong><br>
        IPC No.: <strong>${claim.claim_number}</strong><br>
        ${doc?.document_number ? `Document Ref: ${doc.document_number}<br>` : ""}
        Project: ${projectName}<br>
        Period: ${claim.period_start} to ${claim.period_end}
      </div>
    </div>

    <h3>Claim Summary</h3>
    <table class="summary-table" style="width:360px">
      <tr><td>Original Contract Sum</td><td>$ ${fmt(Number(claim.original_contract_sum))}</td></tr>
      <tr><td>Net Change by Approved VOs</td><td>$ ${fmt(Number(claim.net_vo_amount))}</td></tr>
      <tr><td>Total Completed & Stored to Date</td><td>$ ${fmt(Number(claim.total_completed_stored))}</td></tr>
      <tr><td>Less Retention (${Number(claim.retention_pct)}%)</td><td>- $ ${fmt(Number(claim.retention_amount))}</td></tr>
      <tr><td>Less Previous Certificates Total</td><td>- $ ${fmt(Number(claim.prev_certificates_total))}</td></tr>
      <tr class="total-row"><td>AMOUNT CLAIMED THIS PERIOD</td><td>$ ${fmt(Number(claim.current_payment_due))}</td></tr>
    </table>

    <h3>Measurement Detail</h3>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Description</th>
          <th style="width:80px">Scheduled Value</th>
          <th style="width:80px">Prev Completed</th>
          <th style="width:80px">This Period</th>
          <th style="width:80px">Mat. Stored</th>
          <th style="width:80px">Total to Date</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div style="display:flex;gap:60px;margin-top:32px">
      <div><div class="sig-line">Submitted by</div></div>
      <div><div class="sig-line">Date</div></div>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>IPC #${claim.claim_number} · ${projectName}</span>
    </div>
  `;

  openPrint(html, `IPC-Submission-${claim.claim_number}-${projectName}`);
}

export function printVoRegister(
  vos: Array<{ vo_number?: string | null; title: string; vo_type: string; status: string; total_amount: number; submitted_at?: string | null; rejection_reason?: string | null }>,
  projectName: string,
): void {
  const rows = vos.map((v, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${v.vo_number ?? "—"}</td>
      <td>${v.title}</td>
      <td>${v.vo_type.replace(/_/g, " ")}</td>
      <td>${v.status}</td>
      <td class="right">$ ${fmt(v.total_amount)}</td>
      <td>${v.submitted_at?.slice(0, 10) ?? "—"}</td>
    </tr>
  `).join("");

  const approved = vos.filter((v) => ["approved", "implemented"].includes(v.status));
  const approvedTotal = approved.reduce((s, v) => s + v.total_amount, 0);

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>VARIATION ORDER REGISTER</strong><br>
        Project: ${projectName}<br>
        Date: ${new Date().toLocaleDateString()}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th style="width:80px">VO No.</th>
          <th>Title</th>
          <th style="width:100px">Type</th>
          <th style="width:80px">Status</th>
          <th style="width:90px">Amount</th>
          <th style="width:80px">Submitted</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="5">Approved/Implemented Total</td>
          <td class="right">$ ${fmt(approvedTotal)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>${vos.length} variation orders · ${projectName}</span>
    </div>
  `;

  openPrint(html, `VO-Register-${projectName}`);
}

export function printBudgetReport(
  summary: { totalBudget: number; totalActual: number; totalForecast: number; variance: number; sections: Array<{ title: string; budget: number; actual: number; forecast: number; variance: number; items: Array<{ description: string; unit: string; quantity: number; unit_rate: number; total_amount: number; actual: number }> }> },
  projectName: string,
): void {
  const sectionRows = summary.sections.flatMap((sec) => [
    `<tr class="section-row"><td colspan="6">${sec.title}</td></tr>`,
    ...sec.items.map((item) => `
      <tr>
        <td style="padding-left:16px">${item.description}</td>
        <td class="right">${Number(item.quantity).toLocaleString()} ${item.unit}</td>
        <td class="right">$ ${fmt(Number(item.unit_rate))}</td>
        <td class="right">$ ${fmt(Number(item.total_amount))}</td>
        <td class="right">$ ${fmt(Number(item.actual))}</td>
        <td class="right" style="color:${Number(item.total_amount) >= Number(item.actual) ? "#16a34a" : "#dc2626"}">$ ${fmt(Number(item.total_amount) - Number(item.actual))}</td>
      </tr>
    `),
  ]).join("");

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>BUDGET SUMMARY REPORT</strong><br>
        Project: ${projectName}<br>
        Date: ${new Date().toLocaleDateString()}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="width:90px">Qty / Unit</th>
          <th style="width:80px">Unit Rate</th>
          <th style="width:90px">Budget</th>
          <th style="width:90px">Actual</th>
          <th style="width:90px">Variance</th>
        </tr>
      </thead>
      <tbody>
        ${sectionRows}
        <tr class="total-row">
          <td colspan="3">TOTAL</td>
          <td class="right">$ ${fmt(summary.totalBudget)}</td>
          <td class="right">$ ${fmt(summary.totalActual)}</td>
          <td class="right">$ ${fmt(summary.variance)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>Budget Report · ${projectName}</span>
    </div>
  `;

  openPrint(html, `Budget-Report-${projectName}`);
}

export function printRetentionStatement(
  ledger: Array<{ created_at: string; transaction_type: string; amount: number; release_trigger?: string | null; approval_status?: string | null }>,
  balance: { deducted: number; released: number; balance: number },
  projectName: string,
): void {
  const rows = ledger.map((entry, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${entry.created_at.slice(0, 10)}</td>
      <td>${entry.transaction_type}</td>
      <td>${entry.release_trigger?.replace(/_/g, " ") ?? "—"}</td>
      <td>${entry.approval_status ?? "—"}</td>
      <td class="right" style="color:${entry.transaction_type === "deduction" ? "#dc2626" : "#16a34a"}">
        ${entry.transaction_type === "deduction" ? "-" : "+"}$ ${fmt(Number(entry.amount))}
      </td>
    </tr>
  `).join("");

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>RETENTION STATEMENT</strong><br>
        Project: ${projectName}<br>
        Date: ${new Date().toLocaleDateString()}
      </div>
    </div>

    <table class="summary-table" style="width:360px;margin-bottom:16px">
      <tr><td>Total Deducted</td><td>$ ${fmt(balance.deducted)}</td></tr>
      <tr><td>Total Released</td><td>$ ${fmt(balance.released)}</td></tr>
      <tr class="total-row"><td>Outstanding Balance</td><td>$ ${fmt(balance.balance)}</td></tr>
    </table>

    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th style="width:80px">Date</th>
          <th style="width:80px">Type</th>
          <th>Trigger</th>
          <th style="width:80px">Status</th>
          <th style="width:90px">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>Retention Statement · ${projectName}</span>
    </div>
  `;

  openPrint(html, `Retention-${projectName}`);
}

interface BudgetConfirmationRecord {
  bc_number: string;
  bc_title: string | null;
  bc_type: string | null;
  ai_ref_no: string | null;
  to_name: string | null;
  to_role: string | null;
  cc: string | null;
  registered_after_approved: boolean;
  signature_pic: string | null;
  reason_design_defect: boolean;
  reason_design_missing: boolean;
  reason_design_change_vo: boolean;
  reason_change_order: boolean;
  reason_design_change_no_cost: boolean;
  reason_design_change_mgmt_no_cost: boolean;
  reason_other: string | null;
  budget_status: string | null;
  reason_over_budget: string | null;
  attachment_detail_comparison: boolean;
  attachment_quotation: boolean;
  attachment_detail_budget: boolean;
  attachment_drawing: boolean;
  attachment_other: string | null;
  prepared_by_position: string | null;
  prepared_at: string | null;
  verified_by_position: string | null;
  verified_at: string | null;
  approved_by_position: string | null;
  approved_at: string | null;
}

interface BudgetConfirmationItem {
  line_no: number;
  budget_code: string | null;
  item_description: string;
  contract_target_budget: number | null;
  estimated_amount: number | null;
  remaining_work_amount: number | null;
}

export function printBudgetConfirmation(
  bc: BudgetConfirmationRecord,
  items: BudgetConfirmationItem[],
  names: { preparedBy: string; verifiedBy: string; approvedBy: string },
  prNumber: string,
  projectName: string,
): void {
  const check = (v: boolean) => (v ? "☑" : "☐");

  const reasonRows = [
    check(bc.reason_design_defect) + " Design Defect",
    check(bc.reason_design_missing) + " Design Missing",
    check(bc.reason_design_change_vo) + " Design change as per Client Comment (VO)",
    check(bc.reason_change_order) + " Change Order",
    check(bc.reason_design_change_no_cost) + " Design change as per Client Comment (No Cost Incur)",
    check(bc.reason_design_change_mgmt_no_cost) + " Design change as per management Comment (No Cost Incur to client)",
    bc.reason_other ? `Other: ${bc.reason_other}` : "",
  ].filter(Boolean).join("<br>");

  const attachmentRows = [
    check(bc.attachment_detail_comparison) + " Detail Comparison",
    check(bc.attachment_quotation) + " Quotation",
    check(bc.attachment_detail_budget) + " Detail Budget",
    check(bc.attachment_drawing) + " Drawing",
    bc.attachment_other ? `Other: ${bc.attachment_other}` : "",
  ].filter(Boolean).join("<br>");

  const itemRows = items.map((item) => `
    <tr>
      <td>${item.line_no}</td>
      <td>${item.budget_code ?? "—"}</td>
      <td>${item.item_description}</td>
      <td class="right">$ ${fmt(item.contract_target_budget ?? 0)}</td>
      <td class="right">$ ${fmt(item.estimated_amount ?? 0)}</td>
      <td class="right" style="font-size:10.5pt;font-weight:bold;color:${(item.remaining_work_amount ?? 0) >= 0 ? "#16a34a" : "#dc2626"}">$ ${fmt(item.remaining_work_amount ?? 0)}</td>
    </tr>
  `).join("");

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>BUDGET CONFIRMATION</strong><br>
        BC No.: <strong>${bc.bc_number}</strong><br>
        PR Ref.: ${prNumber}<br>
        Project: ${projectName}<br>
        BC Type: ${bc.bc_type ?? "—"} ${bc.ai_ref_no ? " · AI Ref: " + bc.ai_ref_no : ""}
      </div>
    </div>

    <table class="summary-table" style="width:100%;margin-bottom:12px">
      <tr><td>To</td><td>${[bc.to_name, bc.to_role].filter(Boolean).join(", ") || "—"}</td></tr>
      <tr><td>CC</td><td>${bc.cc ?? "—"}</td></tr>
      <tr><td>BC Title</td><td>${bc.bc_title ?? "—"}</td></tr>
      <tr><td>Registered after Approved</td><td>${bc.registered_after_approved ? "Yes" : "No"}${bc.signature_pic ? " — PIC: " + bc.signature_pic : ""}</td></tr>
    </table>

    <h3>Reason of Budget Confirmation</h3>
    <p style="font-size:8.5pt;line-height:1.6">${reasonRows || "—"}</p>

    <h3>Summary Items Budget</h3>
    <table>
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th style="width:70px">Budget Group</th>
          <th>Description</th>
          <th style="width:100px">Contract Target Budget (A)</th>
          <th style="width:140px;white-space:nowrap">Amount raise PR (B)</th>
          <th style="width:120px;white-space:normal">Remain Budget Amount (C=A-B)</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <h3>Budget Confirmation Status</h3>
    <p style="font-size:8.5pt">
      <strong style="color:${bc.budget_status === "over_budget" ? "#dc2626" : "#16a34a"}">${bc.budget_status === "over_budget" ? "OVER BUDGET" : "UNDER BUDGET"}</strong>
      ${bc.budget_status === "over_budget" && bc.reason_over_budget ? " — Reason: " + bc.reason_over_budget : ""}
    </p>

    <h3>Attachment</h3>
    <p style="font-size:8.5pt;line-height:1.6">${attachmentRows || "—"}</p>

    <div style="display:flex;gap:40px;margin-top:32px;flex-wrap:wrap">
      <div style="min-width:160px">
        <div class="sig-line">Prepared by</div>
        <p style="font-size:8pt;color:#555;margin-top:4px">Name: ${names.preparedBy || "—"}</p>
        <p style="font-size:8pt;color:#555">Position: ${bc.prepared_by_position ?? "—"}</p>
        <p style="font-size:8pt;color:#555">Date: ${bc.prepared_at ?? "—"}</p>
      </div>
      <div style="min-width:160px">
        <div class="sig-line">Verify by</div>
        <p style="font-size:8pt;color:#555;margin-top:4px">Name: ${names.verifiedBy || "—"}</p>
        <p style="font-size:8pt;color:#555">Position: ${bc.verified_by_position ?? "—"}</p>
        <p style="font-size:8pt;color:#555">Date: ${bc.verified_at ?? "—"}</p>
      </div>
      <div style="min-width:160px">
        <div class="sig-line">Approved by</div>
        <p style="font-size:8pt;color:#555;margin-top:4px">Name: ${names.approvedBy || "—"}</p>
        <p style="font-size:8pt;color:#555">Position: ${bc.approved_by_position ?? "—"}</p>
        <p style="font-size:8pt;color:#555">Date: ${bc.approved_at ?? "—"}</p>
      </div>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>${bc.bc_number} · ${projectName}</span>
    </div>
  `;

  openPrint(html, `Budget-Confirmation-${bc.bc_number}`);
}

interface POPrintRecord {
  po_number: string;
  po_date: string | null;
  currency: string;
  vat_rate: number | null;
  total_amount: number | null;
  tax_amount: number | null;
  grand_total: number | null;
  delivery_address: string | null;
  advance_payment_terms: string | null;
  other_payment_terms: string | null;
  payment_terms: string | null;
  vendor_address: string | null;
  vendor_contact_person: string | null;
  vendor_contact_no: string | null;
}

interface POPrintItem {
  line_no: number;
  item_type: string;
  item_description: string;
  materials_code: string | null;
  brand: string | null;
  country: string | null;
  unit: string | null;
  quantity_ordered: number;
  unit_rate_labor: number | null;
  unit_rate_materials: number | null;
  total_price: number;
}

interface POPrintRevision {
  rev_no: number;
  description: string;
  rev_date: string;
}

export function printPO(
  po: POPrintRecord,
  items: POPrintItem[],
  revisions: POPrintRevision[],
  supplierName: string,
  projectName: string,
  prNumber: string | null,
): void {
  const itemRows = items.map((item) => item.item_type === "section"
    ? `<tr class="section-row"><td colspan="9">${item.item_description}</td></tr>`
    : `
    <tr>
      <td>${item.line_no}</td>
      <td style="white-space:pre-line">${item.item_description}</td>
      <td>${item.materials_code ?? "—"}</td>
      <td>${item.brand ?? "—"}</td>
      <td>${item.country ?? "—"}</td>
      <td>${item.unit ?? ""}</td>
      <td class="right">${item.quantity_ordered}</td>
      <td class="right">${fmt(item.unit_rate_labor ?? 0)}</td>
      <td class="right">${fmt(item.unit_rate_materials ?? 0)}</td>
      <td class="right">${fmt(item.total_price)}</td>
    </tr>
  `).join("");

  const revisionRows = revisions.map(r => `
    <tr><td>${r.rev_no}</td><td>${r.description}</td><td>${r.rev_date}</td></tr>
  `).join("");

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>PROJECT PURCHASE ORDER (SUPPLY AND INSTALLATION)</strong><br>
        PPO No.: <strong>${po.po_number}</strong><br>
        Date: ${po.po_date ?? "—"}<br>
        Project: ${projectName}<br>
        PR No.: ${prNumber ?? "—"}
      </div>
    </div>

    <table class="summary-table" style="width:100%;margin-bottom:10px">
      <tr><td>Vendor Name</td><td>${supplierName}</td></tr>
      <tr><td>Vendor Address</td><td style="white-space:pre-line">${po.vendor_address ?? "—"}</td></tr>
      <tr><td>Contact Person</td><td>${po.vendor_contact_person ?? "—"}</td></tr>
      <tr><td>Contact No.</td><td>${po.vendor_contact_no ?? "—"}</td></tr>
      <tr><td>Ship To</td><td>${po.delivery_address ?? "—"}</td></tr>
      <tr><td>Advance Payment</td><td>${po.advance_payment_terms ?? po.payment_terms ?? "—"}</td></tr>
      <tr><td>Other Payment</td><td>${po.other_payment_terms ?? "—"}</td></tr>
    </table>

    ${revisions.length > 0 ? `
    <h3>Revisions</h3>
    <table style="margin-bottom:10px">
      <thead><tr><th style="width:40px">Rev</th><th>Description</th><th style="width:90px">Date</th></tr></thead>
      <tbody>${revisionRows}</tbody>
    </table>` : ""}

    <table>
      <thead>
        <tr>
          <th style="width:28px">No.</th>
          <th>Description</th>
          <th style="width:70px">Materials Code</th>
          <th style="width:60px">Brand</th>
          <th style="width:60px">Country</th>
          <th style="width:40px">Unit</th>
          <th style="width:45px">Qty</th>
          <th style="width:75px">Rate (Labor)</th>
          <th style="width:75px">Rate (Materials)</th>
          <th style="width:85px">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="summary-table" style="width:360px;margin-left:auto;margin-top:10px">
      <tr><td>Total Amount</td><td>${po.currency} ${fmt(po.total_amount)}</td></tr>
      <tr><td>VAT (${po.vat_rate ?? 0}%)</td><td>${po.currency} ${fmt(po.tax_amount)}</td></tr>
      <tr class="total-row"><td>Grand Total</td><td>${po.currency} ${fmt(po.grand_total)}</td></tr>
    </table>
    <p style="margin-top:8px;font-size:8.5pt"><strong>Amount in Text:</strong> ${amountInWords(po.grand_total ?? 0, po.currency)}</p>
    <p style="font-size:7.5pt;color:#888;margin-top:4px">*Import Duties: The materials already include import duties and VAT</p>

    <div style="display:flex;gap:60px;margin-top:32px">
      <div><div class="sig-line">Prepared by</div></div>
      <div><div class="sig-line">Approved by</div></div>
      <div><div class="sig-line">Received by (Supplier)</div></div>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>${po.po_number} · ${projectName}</span>
    </div>
  `;

  openPrint(html, `PO-${po.po_number}`);
}

export function printTenderCoverSummary(
  summary: TenderCoverSummary,
  tender: { tender_no: string; title: string; project_location?: string | null },
  header: { client?: string; contractor?: string; date?: string },
): void {
  const bs = summary.bidSummary;

  const elementalRows = summary.elementalCostSummary.map((g) => `
    <tr>
      <td>${g.codeLetter}</td>
      <td>${g.groupName}</td>
      <td class="right">${g.priced ? "$ " + fmt(g.amount) : "—"}</td>
      <td>${g.priced ? "Priced" : "Excluded"}</td>
    </tr>
  `).join("");

  const preVatSubtotal = bs
    ? Number(bs.direct_cost) + Number(bs.preliminaries) + Number(bs.subcontract_cost) +
      Number(bs.overhead_amount) + Number(bs.profit_amount) + Number(bs.contingency) + Number(bs.risk_allowance)
    : 0;

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>TENDER COST SUMMARY</strong><br>
        For Submission to Client — For Approval<br>
        Tender Ref.: <strong>${tender.tender_no}</strong><br>
        Date: ${header.date ?? new Date().toLocaleDateString()}
      </div>
    </div>

    <table class="summary-table" style="width:100%;margin-bottom:16px">
      <tr><td>Project Name</td><td>${tender.title}</td></tr>
      <tr><td>Location</td><td>${tender.project_location ?? "—"}</td></tr>
      <tr><td>Client</td><td>${header.client ?? "( client name )"}</td></tr>
      <tr><td>Contractor</td><td>${header.contractor ?? "( your company )"}</td></tr>
    </table>

    <h3>1. Elemental Cost Summary</h3>
    <table>
      <thead>
        <tr>
          <th style="width:40px">Code</th>
          <th>Description</th>
          <th style="width:100px">Amount ($)</th>
          <th style="width:80px">Remark</th>
        </tr>
      </thead>
      <tbody>
        ${elementalRows}
        <tr class="total-row">
          <td colspan="2">DIRECT WORKS COST (A)</td>
          <td class="right">$ ${fmt(summary.directWorksTotal)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <h3>2. Commercial Build-up to Tender Price</h3>
    <table class="summary-table" style="width:460px">
      <tr><td>Direct Works Cost (A)</td><td>$ ${fmt(summary.directWorksTotal)}</td></tr>
      <tr><td>Add: Preliminaries & General (Z)</td><td>$ ${fmt(summary.preliminariesTotal)}</td></tr>
      ${bs ? `
      <tr><td>Add: Subcontract Cost</td><td>$ ${fmt(Number(bs.subcontract_cost))}</td></tr>
      <tr><td>Add: Head Office Overhead (${Number(bs.overhead_pct)}%)</td><td>$ ${fmt(Number(bs.overhead_amount))}</td></tr>
      <tr><td>Add: Risk & Contingency</td><td>$ ${fmt(Number(bs.contingency) + Number(bs.risk_allowance))}</td></tr>
      <tr><td>Add: Profit (${Number(bs.profit_pct)}%)</td><td>$ ${fmt(Number(bs.profit_amount))}</td></tr>
      <tr><td><strong>Subtotal before VAT</strong></td><td><strong>$ ${fmt(preVatSubtotal)}</strong></td></tr>
      <tr><td>Add: VAT (${Number(bs.vat_pct)}%)</td><td>$ ${fmt(Number(bs.vat_amount))}</td></tr>
      <tr class="total-row"><td>TENDER PRICE (USD)</td><td>$ ${fmt(Number(bs.total_bid_price))}</td></tr>
      ` : `<tr><td colspan="2" style="color:#888">No bid summary revision selected</td></tr>`}
    </table>

    <div style="display:flex;gap:40px;margin-top:36px;flex-wrap:wrap">
      <div><div class="sig-line">Prepared by (QS / Estimator)</div></div>
      <div><div class="sig-line">Checked by (QS Manager)</div></div>
      <div><div class="sig-line">Approved by (Contractor)</div></div>
      <div><div class="sig-line">Accepted by (Client)</div></div>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${new Date().toLocaleDateString()}</span>
      <span>Tender Cost Summary · ${tender.tender_no}</span>
    </div>
  `;

  openPrint(html, `Tender-Cost-Summary-${tender.tender_no}`);
}

// ── Tender Submission Document ───────────────────────────────────────────────

const BUILDING_NAMES: Record<string, string> = {
  BA: "Building A — Tower", BB: "Building B — Parking", BC: "Building C — Podium",
  BD: "Building D", BE: "Building E", BF: "Building F", BG: "Building G",
  BH: "Building H", BJ: "Building J", BK: "Building K", BL: "Building L",
  BM: "Building M", BN: "Building N", BP: "Building P", BQ: "Building Q",
  BR: "Building R", BS: "Building S", BT: "Building T", BU: "Building U",
  BV: "Building V", BW: "Building W", BX: "External Works", BY: "Landscape",
  BZ: "Boundary Works",
};

function buildingLabel(code: string): string {
  return BUILDING_NAMES[code] ?? code;
}

export function printTenderSubmission(data: TenderSubmissionData): void {
  const { tender, bidSummary, elementalSummary, preliminariesTotal, preliminariesItems,
    boqItemsGrouped, excludeItems, directWorksTotal, blendedRate } = data;
  const today = new Date().toLocaleDateString();
  const bs = bidSummary;

  // ── Cover Page (includes Executive Summary) ──
  const coverHtml = `
    <div style="display:flex;flex-direction:column;justify-content:center;min-height:240px;border-bottom:3px solid #1e3a5f;padding-bottom:20px;margin-bottom:20px">
      <div class="logo" style="font-size:28pt;text-align:center;margin-bottom:8px">DCOS</div>
      <div style="text-align:center;font-size:9pt;color:#555;margin-bottom:24px">Digital Construction Operating System</div>
      <h1 style="text-align:center;font-size:20pt;margin-bottom:4px">TENDER SUBMISSION</h1>
      <p style="text-align:center;font-size:10pt;color:#555">For Submission to Client — For Approval</p>
    </div>
    <table class="summary-table" style="width:100%;margin-bottom:16px">
      <tr><td>Project Name</td><td>${tender.title}</td></tr>
      <tr><td>Tender Reference</td><td>${tender.tender_no}</td></tr>
      <tr><td>Location</td><td>${tender.project_location ?? "—"}</td></tr>
      <tr><td>Client</td><td>${tender.client_name ?? "—"}</td></tr>
      <tr><td>Contractor</td><td>${tender.contractor_name ?? "—"}</td></tr>
      <tr><td>Issue Date</td><td>${tender.issue_date ?? today}</td></tr>
      <tr><td>Currency</td><td>${tender.currency}</td></tr>
      <tr><td>GFA Total</td><td>${tender.gfa_total ? tender.gfa_total.toLocaleString() + " m²" : "—"}</td></tr>
    </table>

    <h3 style="margin-top:20px">Executive Summary</h3>
    <table class="summary-table" style="width:100%;margin-bottom:12px">
      <tr><td>Direct Works Total</td><td>$ ${fmt(directWorksTotal)}</td></tr>
      <tr><td>Preliminaries Total</td><td>$ ${fmt(preliminariesTotal)}</td></tr>
      <tr><td>Combined Total</td><td>$ ${fmt(directWorksTotal + preliminariesTotal)}</td></tr>
      ${tender.gfa_total ? `<tr><td>GFA</td><td>${tender.gfa_total.toLocaleString()} m²</td></tr>` : ""}
      ${blendedRate != null ? `<tr><td>Blended $/m²</td><td>$ ${blendedRate.toFixed(2)}/m²</td></tr>` : ""}
      ${bs ? `<tr><td><strong>Tender Price</strong></td><td><strong>$ ${fmt(Number(bs.total_bid_price))}</strong></td></tr>` : ""}
      ${bs ? `<tr><td>Status</td><td>${bs.status.toUpperCase()}</td></tr>` : ""}
      ${bs ? `<tr><td>Revision</td><td>${bs.revision_no}</td></tr>` : ""}
    </table>
    ${tender.description ? `<p style="font-size:9pt;line-height:1.5;margin-top:8px">${tender.description}</p>` : ""}

    <div style="margin-top:60px;display:flex;gap:32px;flex-wrap:wrap">
      <div style="min-width:180px">
        <div class="sig-line">Prepared by (QS / Estimator)</div>
        <p style="font-size:8pt;color:#555;margin-top:20px">Name: ___________________________</p>
        <p style="font-size:8pt;color:#555;margin-top:6px">Date: ___________________________</p>
      </div>
      <div style="min-width:180px">
        <div class="sig-line">Checked by (QS Manager)</div>
        <p style="font-size:8pt;color:#555;margin-top:20px">Name: ___________________________</p>
        <p style="font-size:8pt;color:#555;margin-top:6px">Date: ___________________________</p>
      </div>
      <div style="min-width:180px">
        <div class="sig-line">Approved by (Contractor)</div>
        <p style="font-size:8pt;color:#555;margin-top:20px">Name: ___________________________</p>
        <p style="font-size:8pt;color:#555;margin-top:6px">Date: ___________________________</p>
      </div>
      <div style="min-width:180px">
        <div class="sig-line">Accepted by (Client)</div>
        <p style="font-size:8pt;color:#555;margin-top:20px">Name: ___________________________</p>
        <p style="font-size:8pt;color:#555;margin-top:6px">Date: ___________________________</p>
      </div>
    </div>
  `;

  // ── Chapter 01: Tender Price Summary ──
  const preVatSubtotal = bs
    ? Number(bs.direct_cost) + Number(bs.preliminaries) + Number(bs.subcontract_cost) +
      Number(bs.overhead_amount) + Number(bs.profit_amount) + Number(bs.contingency) + Number(bs.risk_allowance)
    : 0;

  const elementalRows = elementalSummary.map((g) => `
    <tr>
      <td>${g.codeLetter}</td>
      <td>${g.groupName}</td>
      <td class="right">${g.priced ? "$ " + fmt(g.amount) : "—"}</td>
      <td>${g.priced ? "Priced" : "Excluded"}</td>
    </tr>
  `).join("");

  const priceSummaryHtml = `
    <h2>01 &nbsp; Tender Price Summary</h2>
    <h3>Elemental Cost Summary</h3>
    <table>
      <thead>
        <tr><th style="width:40px">Code</th><th>Description</th><th style="width:100px">Amount ($)</th><th style="width:80px">Remark</th></tr>
      </thead>
      <tbody>
        ${elementalRows}
        <tr class="total-row"><td colspan="2">DIRECT WORKS COST (A)</td><td class="right">$ ${fmt(directWorksTotal)}</td><td></td></tr>
      </tbody>
    </table>
    <h3>Commercial Build-up to Tender Price</h3>
    <table class="summary-table" style="width:460px">
      <tr><td>Direct Works Cost (A)</td><td>$ ${fmt(directWorksTotal)}</td></tr>
      <tr><td>Add: Preliminaries & General (Z)</td><td>$ ${fmt(preliminariesTotal)}</td></tr>
      ${bs ? `
      <tr><td>Add: Subcontract Cost</td><td>$ ${fmt(Number(bs.subcontract_cost))}</td></tr>
      <tr><td>Add: Head Office Overhead (${Number(bs.overhead_pct)}%)</td><td>$ ${fmt(Number(bs.overhead_amount))}</td></tr>
      <tr><td>Add: Risk & Contingency</td><td>$ ${fmt(Number(bs.contingency) + Number(bs.risk_allowance))}</td></tr>
      <tr><td>Add: Profit (${Number(bs.profit_pct)}%)</td><td>$ ${fmt(Number(bs.profit_amount))}</td></tr>
      <tr><td><strong>Subtotal before VAT</strong></td><td><strong>$ ${fmt(preVatSubtotal)}</strong></td></tr>
      <tr><td>Add: VAT (${Number(bs.vat_pct)}%)</td><td>$ ${fmt(Number(bs.vat_amount))}</td></tr>
      <tr class="total-row"><td>TENDER PRICE (USD)</td><td>$ ${fmt(Number(bs.total_bid_price))}</td></tr>
      ` : `<tr><td colspan="2" style="color:#888">No bid summary revision available</td></tr>`}
    </table>
  `;

  // ── Discipline-grouped appendices ──
  const CS_LETTERS = ["A", "B", "G"];        // Early Work, Structure, External Work
  const ARC_LETTERS = ["C", "D", "E"];       // Architecture, Interior Finish, Fittings
  const MEP_LETTERS = ["F"];                 // Services (MEP)

  function disciplineSubtotal(letterGroup: string[]): number {
    return boqItemsGrouped.groups
      .filter((g) => letterGroup.includes(g.codeLetter))
      .reduce((sum, g) => sum + g.subtotal, 0);
  }

  function buildDisciplineAppendix(label: string, title: string, letterGroup: string[]): string {
    const total = disciplineSubtotal(letterGroup);
    if (total === 0) return "";

    const matchedGroups = boqItemsGrouped.groups
      .filter((g) => letterGroup.includes(g.codeLetter))
      .sort((a, b) => a.codeLetter.localeCompare(b.codeLetter));
    if (matchedGroups.length === 0) return "";

    // Collect budget codes for display in title
    const budgetCodeLabels = matchedGroups.flatMap((g) => g.budgetCodes.map((bc) => `${bc.code} ${bc.description}`));
    const uniqueCodes = [...new Set(budgetCodeLabels)].join(" / ");

    let tables = "";
    for (const group of matchedGroups) {
      const sortedBCs = [...group.budgetCodes].sort((a, b) => a.code.localeCompare(b.code));
      for (const bc of sortedBCs) {
        const bcItems = bc.sections.flatMap((sec) => sec.subSections.flatMap((ss) => ss.items));
        if (bcItems.length === 0) continue;

        // Sort within budget code by section → sub_section → sub_element
        const sorted = [...bcItems].sort((a, b) => {
          const sCmp = (a.section || "").localeCompare(b.section || "");
          if (sCmp !== 0) return sCmp;
          const ssCmp = (a.sub_section || "").localeCompare(b.sub_section || "");
          if (ssCmp !== 0) return ssCmp;
          return (a.sub_element || "").localeCompare(b.sub_element || "");
        });

        const bcTotal = sorted.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
        const rows = sorted.map((item) => `
          <tr>
            <td class="right">${item.level ?? "All"}</td>
            <td>${item.item_code}</td>
            <td>${item.section || ""}</td>
            <td>${item.sub_section || ""}</td>
            <td>${item.sub_element || ""}</td>
            <td>${item.description}</td>
            <td>${item.unit}</td>
            <td class="right">${Number(item.quantity).toLocaleString()}</td>
            <td class="right">$ ${fmt(Number(item.unit_rate))}</td>
            <td class="right" style="white-space:nowrap">$ ${fmt(Number(item.total_amount))}</td>
          </tr>
        `).join("");
        tables += `
          <table class="repeat-header">
            <thead>
              <tr><th colspan="10" style="background:#fff;color:#111;border:none;font-size:10pt;text-align:left;padding:0 0 6px">${label} — ${title} · ${bc.code} ${bc.description}</th></tr>
              <tr><th style="width:45px">Level</th><th style="width:65px">Item</th><th style="width:130px">Section</th><th style="width:150px">Sub Section</th><th style="width:150px">Sub Element</th><th>Description</th><th style="width:40px">Unit</th><th style="width:60px">Qty</th><th style="width:95px">Rate</th><th style="width:110px">Amount</th></tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="total-row"><td colspan="9">${bc.code} Subtotal</td><td class="right">$ ${fmt(bcTotal)}</td></tr>
            </tbody>
          </table>
        `;
      }
    }

    return `
      <p style="font-size:8pt;color:#555;margin-bottom:2px"><strong>${label} — ${title}</strong> &nbsp; Discipline Total: <strong>$ ${fmt(total)}</strong></p>
      <p style="font-size:7pt;color:#888;margin:0 0 8px">Budget Codes: ${uniqueCodes}</p>
      ${tables}
    `;
  }

  // ── Appendix A: Preliminaries Detail ──
  const prelimRows = preliminariesItems.map((p) => `
    <tr>
      <td>${p.code}</td>
      <td>${p.description}</td>
      <td class="right">${p.unit}</td>
      <td class="right">${Number(p.quantity).toLocaleString()}</td>
      <td class="right" style="white-space:nowrap">$ ${fmt(p.rate)}</td>
      <td class="right" style="white-space:nowrap">$ ${fmt(Number(p.amount))}</td>
    </tr>
  `).join("");

  const appendixAHtml = `
    ${preliminariesItems.length === 0 ? '' : `
    <table class="repeat-header">
      <thead>
        <tr><th colspan="6" style="background:#fff;color:#111;border:none;font-size:11pt;text-align:left;padding:0 0 8px">Appendix A — Preliminaries Detail</th></tr>
        <tr><th style="width:60px">Code</th><th>Description</th><th style="width:45px">Unit</th><th style="width:60px">Qty</th><th style="width:95px">Rate</th><th style="width:110px">Amount</th></tr>
      </thead>
      <tbody>
        ${prelimRows}
        <tr class="total-row"><td colspan="5">PRELIMINARIES TOTAL</td><td class="right">$ ${fmt(preliminariesTotal)}</td></tr>
      </tbody>
    </table>`}
  `;

  // ── Appendix B: C&S Detail ──
  const appendixBHtml = buildDisciplineAppendix("Appendix B", "C&S Detail (Civil & Structural)", CS_LETTERS);

  // ── Appendix C: Architecture ──
  const appendixCHtml = buildDisciplineAppendix("Appendix C", "Architecture", ARC_LETTERS);

  // ── Appendix D: MEP Work ──
  const appendixDHtml = buildDisciplineAppendix("Appendix D", "MEP Work", MEP_LETTERS);

  // ── Appendix E: Exclude Items ──
  const excludeItemRows = excludeItems.map((item) => `
    <tr>
      <td>${item.item_code}</td>
      <td>${item.description}</td>
      <td>${item.reason ?? ""}</td>
    </tr>
  `).join("");

  const appendixEHtml = excludeItems.length === 0 ? "" : `
    <table class="repeat-header">
      <thead>
        <tr><th colspan="3" style="background:#fff;color:#111;border:none;font-size:11pt;text-align:left;padding:0 0 8px">02 — Exclude Items</th></tr>
        <tr><th style="width:80px">Item</th><th>Description</th><th>Reason</th></tr>
      </thead>
      <tbody>
        ${excludeItemRows}
      </tbody>
    </table>
  `;

  // ── Assemble ──
  const allChapters = [
    coverHtml,
    priceSummaryHtml,
    appendixEHtml,
    appendixAHtml,
    appendixBHtml,
    appendixCHtml,
    appendixDHtml,
  ].filter(Boolean);

  const body = allChapters
    .map((ch, i) => `<div class="chapter" style="${i > 0 ? "page-break-before:always" : ""}">${ch}</div>`)
    .join("");

  const footer = `
    <div class="footer">
      <span>Generated by DCOS — ${today}</span>
      <span>${tender.tender_no} · Tender Submission</span>
    </div>
  `;

  openPrint(body + footer, `Tender-Submission-${tender.tender_no}`);
}
