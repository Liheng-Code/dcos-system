import type { QsProgressClaim, QsClaimItem } from "@/lib/qs-service";
import type { TenderCoverSummary } from "@/lib/tender-cost-service";

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
