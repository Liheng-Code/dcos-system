"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import {
  parseWorkbook, summarize, type ParsedImport, type ImportIssue,
} from "@/components/qs/dwl-import-lib";
import { getProfileById, insertDwlMaterialAttribute, insertDwlMaterialSpecReturning, insertDwlMaterialSpecRevision, insertDwlPriceSubmission, insertDwlQuotationItem, insertDwlQuotationReturning, insertDwlResourcePrice, insertDwlResourceReturning, insertDwlSupplierMaterial, insertDwlSupplierProfile, insertDwlSupplierReturning, listDwlMaterialAttributes, listDwlMaterialSpecRevisions, listDwlMaterialSpecs, listDwlPriceSubmissions, listDwlQuotationItems, listDwlQuotations, listDwlResourcePrices, listDwlResources, listDwlSupplierMaterials, listDwlSupplierProfiles, listDwlSuppliers } from "@/lib/qs/qs-queries";

type Phase = "idle" | "parsed" | "importing" | "done";

interface TableResult { table: string; inserted: number; skipped: number; failed: number; errors: string[]; }

export default function DwlMaterialImportPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [results, setResults] = useState<TableResult[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const canImport = can("qs_libraries", "can_create");
  const canView = !permsLoaded || can("qs_libraries", "view");

  const summary = parsed ? summarize(parsed) : null;
  const blocked = !!summary && summary.errors > 0;

  const onFile = useCallback(async (file: File) => {
    setFatal(null); setResults([]); setParsed(null); setPhase("idle");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const p = parseWorkbook(wb);
      setParsed(p);
      setPhase("parsed");
      if (p.materials.length === 0 && p.issues.length === 0) {
        setFatal("No recognisable data found. Is this the Cost & Rate Library template?");
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Failed to read the workbook.");
    }
  }, []);

  async function runImport() {
    if (!parsed) return;
    setPhase("importing");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      let tenantId = "";
      if (userId) {
        const { data: profile } = await getProfileById(userId, "company_id");
        tenantId = (profile?.company_id as string) ?? "";
      }
      if (!tenantId) { setFatal("No tenant assigned to your profile — cannot import."); setPhase("parsed"); return; }

      const res = await importAll(supabase, parsed, tenantId, userId);
      setResults(res);
      setPhase("done");
      const totalIns = res.reduce((a, r) => a + r.inserted, 0);
      const totalFail = res.reduce((a, r) => a + r.failed, 0);
      if (totalFail > 0) toast.warning(`Import finished with ${totalFail} row failure(s). See the report.`);
      else toast.success(`Import complete — ${totalIns} row(s) created.`);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Import failed.");
      setPhase("parsed");
    }
  }

  function reset() {
    setPhase("idle"); setParsed(null); setResults([]); setFatal(null); setFileName("");
    if (fileInput.current) fileInput.current.value = "";
  }

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Cost &amp; Rate Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import — Cost &amp; Rate Library Template</h1>
        <p className="text-sm text-muted-foreground">
          Upload → Validate → Preview → Confirm → Import → Report. Invalid rows are listed and
          nothing is written until you confirm. Re-importing the same file creates no duplicates.
        </p>
      </div>

      {/* upload */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
        <Button onClick={() => fileInput.current?.click()} disabled={phase === "importing"}>
          <Upload className="h-4 w-4" /> Choose .xlsx file
        </Button>
        {fileName && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </span>
        )}
        {phase !== "idle" && <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>}
      </div>

      {fatal && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{fatal}</span>
        </div>
      )}

      {summary && (
        <>
          {/* summary tiles */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {([
              ["Materials", summary.materials], ["Specs", summary.specs], ["Suppliers", summary.suppliers],
              ["Supplier links", summary.supplierMaterials], ["Approved prices", summary.prices],
              ["Submissions", summary.submissions], ["Quotations", summary.quotations], ["Quote items", summary.quotationItems],
            ] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={summary.errors > 0 ? "destructive" : "outline"}>{summary.errors} error{summary.errors === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{summary.warnings} warning{summary.warnings === 1 ? "" : "s"}</Badge>
            <Button
              className="ml-auto"
              disabled={phase === "importing" || phase === "done" || blocked || !canImport}
              title={blocked ? "Fix all errors before importing" : !canImport ? "You lack create permission on QS libraries" : undefined}
              onClick={() => void runImport()}
            >
              {phase === "importing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "done" ? "Imported" : blocked ? "Fix errors to import" : "Confirm & Import"}
            </Button>
          </div>

          {parsed && parsed.issues.length > 0 && phase !== "done" && (
            <IssueTable issues={parsed.issues} />
          )}
        </>
      )}

      {phase === "done" && (
        <div className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Import report
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target table</TableHead>
                <TableHead className="w-24 text-right">Inserted</TableHead>
                <TableHead className="w-24 text-right">Skipped</TableHead>
                <TableHead className="w-24 text-right">Failed</TableHead>
                <TableHead>Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.table}>
                  <TableCell className="font-mono text-xs">{r.table}</TableCell>
                  <TableCell className="text-right text-sm">{r.inserted}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{r.skipped}</TableCell>
                  <TableCell className={cn("text-right text-sm", r.failed > 0 && "text-destructive font-medium")}>{r.failed}</TableCell>
                  <TableCell className="text-xs text-destructive">
                    {r.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
                    {r.errors.length > 3 && <div>+{r.errors.length - 3} more…</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            &quot;Skipped&quot; = already present (matched by code / name / import marker). Re-running this import is safe.
          </p>
        </div>
      )}
    </div>
  );
}

function IssueTable({ issues }: { issues: ImportIssue[] }) {
  const errs = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const show = [...errs, ...warns].slice(0, 200);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Level</TableHead>
            <TableHead className="w-44">Sheet</TableHead>
            <TableHead className="w-16">Row</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {show.map((i, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <Badge variant={i.level === "error" ? "destructive" : "secondary"} className="text-[10px]">{i.level}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{i.sheet}</TableCell>
              <TableCell className="text-xs">{i.row ?? "—"}</TableCell>
              <TableCell className="text-sm">{i.message}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {issues.length > show.length && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">+{issues.length - show.length} more issue(s) not shown.</p>
      )}
    </div>
  );
}

// ── import engine ────────────────────────────────────────────────────────
type SB = ReturnType<typeof createClient>;

async function importAll(supabase: SB, p: ParsedImport, tenantId: string, userId: string | null): Promise<TableResult[]> {
  const R = (table: string): TableResult => ({ table, inserted: 0, skipped: 0, failed: 0, errors: [] });
  const rMat = R("dwl_resources"), rAttr = R("dwl_material_attributes"),
    rSpec = R("dwl_material_specs"), rRev = R("dwl_material_spec_revisions"),
    rSup = R("dwl_suppliers"), rProf = R("dwl_supplier_profiles"), rSM = R("dwl_supplier_materials"),
    rQ = R("dwl_quotations"), rQI = R("dwl_quotation_items"),
    rPrice = R("dwl_resource_prices"), rSubm = R("dwl_price_submissions");

  // prefetch existing state (RLS-scoped to the caller's tenant)
  const [exRes, exSup, exSpec, exRev, exAttr, exSM, exQ, exQI, exPrice, exSub] = await Promise.all([
    listDwlResources(),
    listDwlSuppliers(),
    listDwlMaterialSpecs(),
    listDwlMaterialSpecRevisions(),
    listDwlMaterialAttributes("resource_id"),
    listDwlSupplierMaterials(),
    listDwlQuotations(),
    listDwlQuotationItems(),
    listDwlResourcePrices(),
    listDwlPriceSubmissions(),
  ]);

  const codeToId = new Map<string, string>();
  for (const r of (exRes.data ?? []) as { id: string; code: string }[]) codeToId.set(r.code, r.id);
  const nameToSup = new Map<string, string>();
  for (const s of (exSup.data ?? []) as { id: string; name: string }[]) nameToSup.set(s.name.toLowerCase(), s.id);
  const specCodeToId = new Map<string, string>();
  for (const s of (exSpec.data ?? []) as { id: string; spec_code: string }[]) specCodeToId.set(s.spec_code, s.id);
  const revSet = new Set(((exRev.data ?? []) as { spec_id: string; revision_no: string }[]).map((x) => `${x.spec_id}|${x.revision_no}`));
  const attrSet = new Set(((exAttr.data ?? []) as { resource_id: string }[]).map((x) => x.resource_id));
  const smSet = new Set(((exSM.data ?? []) as { supplier_id: string; resource_id: string }[]).map((x) => `${x.supplier_id}|${x.resource_id}`));
  const quoteNoToId = new Map<string, string>();
  for (const q of (exQ.data ?? []) as { id: string; quote_no: string }[]) quoteNoToId.set(q.quote_no, q.id);
  const qiSet = new Set(((exQI.data ?? []) as { quotation_id: string; line_no: number }[]).map((x) => `${x.quotation_id}|${x.line_no}`));
  const markerRe = /^\[import ([^\]]+)\]/;
  const priceMarkers = new Set<string>();
  // natural-key dedupe: resource + effective date + basic price (catches
  // rows already loaded by the C-H seed as well as prior imports).
  const priceKeys = new Set<string>();
  const priceRows = [...(exPrice.data ?? []), ...(exSub.data ?? [])] as
    { resource_id: string; valid_from: string; unit_price: number; notes: string | null }[];
  for (const row of priceRows) {
    const m = row.notes?.match(markerRe); if (m) priceMarkers.add(m[1].trim());
    priceKeys.add(`${row.resource_id}|${row.valid_from}|${Number(row.unit_price)}`);
  }

  // 1. materials -------------------------------------------------------
  for (const m of p.materials) {
    if (codeToId.has(m.code)) { rMat.skipped++; }
    else {
      const { data, error } = await insertDwlResourceReturning({
        tenant_id: tenantId, code: m.code, category: m.category, description: m.description,
        unit: m.unit, spec_reference: m.attrs.standard ?? null, created_by: userId,
      });
      if (error || !data) { rMat.failed++; rMat.errors.push(`${m.code}: ${error?.message ?? "insert failed"}`); continue; }
      codeToId.set(m.code, data.id as string); rMat.inserted++;
    }
    const rid = codeToId.get(m.code)!;
    if (!attrSet.has(rid)) {
      const { error } = await insertDwlMaterialAttribute({
        resource_id: rid, tenant_id: tenantId, material_name: m.material_name,
        subcategory: m.attrs.subcategory, discipline: m.attrs.discipline, material_type: m.attrs.material_type,
        tech_spec_summary: m.attrs.tech_spec_summary, standard: m.attrs.standard, grade: m.attrs.grade,
        brand: m.attrs.brand, model: m.attrs.model, manufacturer: m.attrs.manufacturer,
        package_size: m.attrs.package_size, dimension: m.attrs.dimension, weight: m.attrs.weight,
        color_finish: m.attrs.color_finish, application_element: m.attrs.application_element,
        lifecycle_status: (m.attrs.status ?? "active").toLowerCase() === "active" ? "active" : "archived",
        tags: m.attrs.tags ? m.attrs.tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
        legacy_code: m.legacy_code, notes: m.attrs.notes, created_by: userId,
      });
      if (error) { rAttr.failed++; rAttr.errors.push(`${m.code}: ${error.message}`); }
      else { attrSet.add(rid); rAttr.inserted++; }
    } else rAttr.skipped++;
  }

  // 2. specs + revisions --------------------------------------------
  for (const s of p.specs) {
    const rid = codeToId.get(s.material_code);
    if (!rid) { rSpec.failed++; rSpec.errors.push(`${s.spec_code}: material ${s.material_code} not imported`); continue; }
    let sid = specCodeToId.get(s.spec_code);
    if (!sid) {
      const { data, error } = await insertDwlMaterialSpecReturning({
        tenant_id: tenantId, spec_code: s.spec_code, resource_id: rid, spec_name: s.spec_name,
        discipline: s.rev.standard ? null : null, created_by: userId,
      });
      if (error || !data) { rSpec.failed++; rSpec.errors.push(`${s.spec_code}: ${error?.message ?? "insert failed"}`); continue; }
      sid = data.id as string; specCodeToId.set(s.spec_code, sid); rSpec.inserted++;
    } else rSpec.skipped++;
    if (!revSet.has(`${sid}|${s.revision_no}`)) {
      const { error } = await insertDwlMaterialSpecRevision({
        tenant_id: tenantId, spec_id: sid, revision_no: s.revision_no,
        standard: s.rev.standard, grade: s.rev.grade, strength_performance: s.rev.strength_performance,
        dimension: s.rev.dimension, thickness: s.rev.thickness, density: s.rev.density, unit: s.rev.unit,
        manufacturer: s.rev.manufacturer, brand: s.rev.brand, technical_req: s.rev.technical_req,
        installation_req: s.rev.installation_req, testing_req: s.rev.testing_req, approval_req: s.rev.approval_req,
        effective_date: s.effective_date ?? new Date().toISOString().slice(0, 10),
        expiry_date: s.rev.expiry_date, status: ["draft", "active", "superseded", "expired"].includes(s.rev.status ?? "") ? s.rev.status : "active",
        created_by: userId,
      });
      if (error) { rRev.failed++; rRev.errors.push(`${s.spec_code} ${s.revision_no}: ${error.message}`); }
      else { revSet.add(`${sid}|${s.revision_no}`); rRev.inserted++; }
    } else rRev.skipped++;
  }

  // 3. suppliers + profiles ---------------------------------------
  const existingProfiles = new Set<string>();
  {
    const { data } = await listDwlSupplierProfiles("supplier_id");
    for (const x of (data ?? []) as { supplier_id: string }[]) existingProfiles.add(x.supplier_id);
  }
  for (const s of p.suppliers) {
    let sid = nameToSup.get(s.name.toLowerCase());
    if (!sid) {
      const { data, error } = await insertDwlSupplierReturning({
        tenant_id: tenantId, name: s.name, contact: s.contact, rating: s.rating, is_active: true, created_by: userId,
      });
      if (error || !data) { rSup.failed++; rSup.errors.push(`${s.name}: ${error?.message ?? "insert failed"}`); continue; }
      sid = data.id as string; nameToSup.set(s.name.toLowerCase(), sid); rSup.inserted++;
    } else rSup.skipped++;
    if (!existingProfiles.has(sid)) {
      const { error } = await insertDwlSupplierProfile({
        supplier_id: sid, tenant_id: tenantId, ...s.profile, lifecycle_status: "active", created_by: userId,
      });
      if (error) { rProf.failed++; rProf.errors.push(`${s.name}: ${error.message}`); }
      else { existingProfiles.add(sid); rProf.inserted++; }
    } else rProf.skipped++;
  }

  // 4. supplier-materials ---------------------------------------
  for (const sm of p.supplierMaterials) {
    const rid = codeToId.get(sm.material_code);
    const sid = sm.supplier_name ? nameToSup.get(sm.supplier_name.toLowerCase()) : undefined;
    if (!rid || !sid) { rSM.failed++; rSM.errors.push(`row ${sm._row}: ${!rid ? "material" : "supplier"} not resolved`); continue; }
    if (smSet.has(`${sid}|${rid}`)) { rSM.skipped++; continue; }
    const { error } = await insertDwlSupplierMaterial({
      tenant_id: tenantId, supplier_id: sid, resource_id: rid,
      supplier_product_code: sm.supplier_product_code, supplier_product_name: sm.supplier_product_name,
      brand: sm.brand, manufacturer: sm.manufacturer, specification: sm.specification,
      package_size: sm.package_size, moq: sm.moq, lead_time_days: sm.lead_time_days,
      is_active: sm.is_active, created_by: userId,
    });
    if (error) { rSM.failed++; rSM.errors.push(`row ${sm._row}: ${error.message}`); }
    else { smSet.add(`${sid}|${rid}`); rSM.inserted++; }
  }

  // 5. quotations + items -------------------------------------
  for (const q of p.quotations) {
    if (quoteNoToId.has(q.quote_no)) { rQ.skipped++; continue; }
    const sid = q.supplier_name ? nameToSup.get(q.supplier_name.toLowerCase()) : null;
    const { data, error } = await insertDwlQuotationReturning({
      tenant_id: tenantId, quote_no: q.quote_no, supplier_id: sid ?? null, project_code: q.project_code,
      rfq_ref: q.rfq_ref, quote_date: q.quote_date, valid_until: q.valid_until, currency: q.currency,
      payment_terms: q.payment_terms, delivery_terms: q.delivery_terms, contact_person: q.contact_person,
      source_document: q.source_document, status: q.status, notes: q.notes, created_by: userId,
    });
    if (error || !data) { rQ.failed++; rQ.errors.push(`${q.quote_no}: ${error?.message ?? "insert failed"}`); continue; }
    quoteNoToId.set(q.quote_no, data.id as string); rQ.inserted++;
  }
  for (const qi of p.quotationItems) {
    const qid = quoteNoToId.get(qi.quote_no);
    const rid = codeToId.get(qi.material_code);
    if (!qid || !rid) { rQI.failed++; rQI.errors.push(`row ${qi._row}: ${!qid ? "quotation" : "material"} not resolved`); continue; }
    if (qiSet.has(`${qid}|${qi.line_no}`)) { rQI.skipped++; continue; }
    const { error } = await insertDwlQuotationItem({
      tenant_id: tenantId, quotation_id: qid, line_no: qi.line_no, resource_id: rid,
      supplier_product_code: qi.supplier_product_code, description: qi.description, spec_ref: qi.spec_ref,
      quantity: qi.quantity, unit: qi.unit, unit_price: qi.unit_price, discount: qi.discount,
      delivery: qi.delivery, tax: qi.tax, lead_time_days: qi.lead_time_days, remarks: qi.remarks,
    });
    if (error) { rQI.failed++; rQI.errors.push(`row ${qi._row}: ${error.message}`); }
    else { qiSet.add(`${qid}|${qi.line_no}`); rQI.inserted++; }
  }

  // 6. prices / submissions ---------------------------------
  for (const pr of p.prices) {
    const rid = codeToId.get(pr.material_code);
    if (!rid) { (pr.approved ? rPrice : rSubm).failed++; (pr.approved ? rPrice : rSubm).errors.push(`row ${pr._row}: material not imported`); continue; }
    const marker = (pr.price_id ?? String(pr._row)).trim();
    const natKey = `${rid}|${pr.valid_from}|${Number(pr.unit_price)}`;
    if (priceMarkers.has(marker) || priceKeys.has(natKey)) { (pr.approved ? rPrice : rSubm).skipped++; continue; }
    const sid = pr.supplier_name ? nameToSup.get(pr.supplier_name.toLowerCase()) ?? null : null;
    const common = {
      tenant_id: tenantId, resource_id: rid, supplier_id: sid, unit_price: pr.unit_price, currency: pr.currency,
      valid_from: pr.valid_from, quote_valid_until: pr.quote_valid_until, source_type: "quotation",
      location: pr.location, quantity: pr.quantity, discount: pr.discount, delivery_cost: pr.delivery_cost,
      handling_cost: pr.handling_cost, other_charges: pr.other_charges, tax_amount: pr.tax_amount,
      payment_terms: pr.payment_terms, delivery_terms: pr.delivery_terms, lead_time_days: pr.lead_time_days,
      source_document: pr.source_document, quotation_ref: pr.quotation_ref, quotation_date: pr.quotation_date,
      project_code: pr.project_code, notes: pr.notes, created_by: userId,
    };
    if (pr.approved) {
      const { error } = await insertDwlResourcePrice({ ...common, price_status: "approved" });
      if (error) { rPrice.failed++; rPrice.errors.push(`${marker}: ${error.message}`); }
      else { priceMarkers.add(marker); priceKeys.add(natKey); rPrice.inserted++; }
    } else {
      const { error } = await insertDwlPriceSubmission({ ...common, status: "submitted", submitted_at: new Date().toISOString() });
      if (error) { rSubm.failed++; rSubm.errors.push(`${marker}: ${error.message}`); }
      else { priceMarkers.add(marker); priceKeys.add(natKey); rSubm.inserted++; }
    }
  }

  return [rMat, rAttr, rSpec, rRev, rSup, rProf, rSM, rQ, rQI, rPrice, rSubm].filter((r) => r.inserted + r.skipped + r.failed > 0);
}
