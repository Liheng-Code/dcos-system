"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, DollarSign, FileText, Plus, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlMaterialSpecDialog } from "@/components/qs/dwl-material-spec-dialog";
import { DwlSupplierMaterialDialog } from "@/components/qs/dwl-supplier-material-dialog";
import { DwlMaterialPriceDialog } from "@/components/qs/dwl-material-price-dialog";
import type {
  DwlCurrentMaterialSpec, DwlMaterialRow, DwlMaterialSpec, DwlMaterialSpecRevision,
  DwlPriceHistoryRow, DwlPriceSubmissionRow, DwlSupplierMaterialRow,
} from "@/components/qs/dwl-types";
import { getDwlVCurrentMaterialSpecByResourceId, getDwlVMaterialByResourceId, getProfileById, listDwlMaterialSpecRevisionsBySpecIds, listDwlMaterialSpecsByResourceId, listDwlResourcePricesByResourceId, listDwlSuppliers, listDwlVPriceSubmissionsByResourceIdWithStatusApproved, listDwlVSupplierMaterialsByResourceId } from "@/lib/qs/qs-queries";

const V_MATERIAL_COLUMNS =
  "resource_id, code, category, material_name, description, unit, spec_reference, is_active, created_at, updated_at, " +
  "subcategory, discipline, material_type, tech_spec_summary, standard, grade, brand, model, manufacturer, package_size, " +
  "dimension, thickness, weight, color_finish, application_element, lifecycle_status, tags, legacy_code, notes, " +
  "current_unit_price, current_currency, current_price_valid_from, current_price_valid_until, current_supplier_name, " +
  "current_price_is_expired, current_spec_code, current_spec_name, current_spec_revision_no, current_spec_status, " +
  "current_effective_unit_cost, current_price_status";

const PRICE_COLUMNS =
  "id, tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until, source_type, location, " +
  "notes, quantity, discount, delivery_cost, handling_cost, other_charges, tax_amount, effective_unit_cost, payment_terms, " +
  "delivery_terms, lead_time_days, source_document, quotation_ref, quotation_date, project_code, price_status, approved_by, " +
  "approved_at, submission_id, dwl_quotation_id, created_by, created_at";

function money(v: number | null | undefined, ccy: string | null | undefined) {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: ccy || "USD", minimumFractionDigits: 2, maximumFractionDigits: 4,
    }).format(v);
  } catch { return `${ccy ?? "USD"} ${v.toFixed(4)}`; }
}
function date(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

// Display-only cleanup for legacy-migration text — strips the leading
// "Material component (migrated) for " boilerplate and the trailing
// "(source: qs_cost_items.code='03 20 13')" note that some seeded/migrated
// rows carry in material_name/description — never touches the stored data.
function cleanLabel(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/^material component \(migrated\) for\s*/i, "")
    .replace(/\s*\(source:[^)]*\)/gi, "")
    .trim();
}

export default function DwlMaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [material, setMaterial] = useState<DwlMaterialRow | null>(null);
  const [specs, setSpecs] = useState<DwlMaterialSpec[]>([]);
  const [revisions, setRevisions] = useState<DwlMaterialSpecRevision[]>([]);
  const [currentSpec, setCurrentSpec] = useState<DwlCurrentMaterialSpec | null>(null);
  const [links, setLinks] = useState<DwlSupplierMaterialRow[]>([]);
  const [prices, setPrices] = useState<DwlPriceHistoryRow[]>([]);
  const [submissions, setSubmissions] = useState<DwlPriceSubmissionRow[]>([]);
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [specDialogOpen, setSpecDialogOpen] = useState(false);
  const [specDialogTarget, setSpecDialogTarget] = useState<DwlMaterialSpec | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: profile } = await getProfileById(uid, "company_id");
      if (profile?.company_id) setTenantId(profile.company_id as string);
    });
  }, [supabase]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);

    const [matRes, specRes, curSpecRes, linkRes, priceRes, subRes, supRes] = await Promise.all([
      getDwlVMaterialByResourceId(V_MATERIAL_COLUMNS, id),
      listDwlMaterialSpecsByResourceId(id),
      getDwlVCurrentMaterialSpecByResourceId(id),
      listDwlVSupplierMaterialsByResourceId(id),
      listDwlResourcePricesByResourceId(PRICE_COLUMNS, id),
      listDwlVPriceSubmissionsByResourceIdWithStatusApproved(id),
      listDwlSuppliers(),
    ]);

    if (matRes.error) { setErrorMsg(matRes.error.message); setLoading(false); return; }
    if (!matRes.data) { setErrorMsg("Material not found."); setLoading(false); return; }

    setMaterial(matRes.data as unknown as DwlMaterialRow);
    const specRows = (specRes.data ?? []) as unknown as DwlMaterialSpec[];
    setSpecs(specRows);
    setCurrentSpec((curSpecRes.data as unknown as DwlCurrentMaterialSpec) ?? null);
    setLinks((linkRes.data ?? []) as unknown as DwlSupplierMaterialRow[]);
    setPrices((priceRes.data ?? []) as unknown as DwlPriceHistoryRow[]);
    setSubmissions((subRes.data ?? []) as unknown as DwlPriceSubmissionRow[]);
    setSupplierNames(new Map(((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])));

    if (specRows.length > 0) {
      const { data: revData } = await listDwlMaterialSpecRevisionsBySpecIds(specRows.map((s) => s.id));
      setRevisions((revData ?? []) as unknown as DwlMaterialSpecRevision[]);
    } else {
      setRevisions([]);
    }

    setLoading(false);
  }, [id, supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canManage = can("qs_libraries", "can_create") || can("qs_libraries", "edit");
  const canRecordDirect = can("qs_libraries", "can_create");
  const canSubmitPrice = can("qs_price_approval", "submit");

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Cost &amp; Rate Library.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (errorMsg || !material) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground">{errorMsg ?? "Material not found."}</p>
        <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/qs/dwl-materials")}>
          Back to Materials
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/dashboard/qs/dwl-materials"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{cleanLabel(material.material_name)}</h1>
              <span className="font-mono text-sm text-muted-foreground">{material.code}</span>
              {material.legacy_code && (
                <Badge variant="outline" className="font-mono text-[10px]">{material.legacy_code}</Badge>
              )}
              {!material.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{cleanLabel(material.description)}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {(canRecordDirect || canSubmitPrice) && (
            <Button size="sm" onClick={() => setPriceDialogOpen(true)} disabled={!tenantId}>
              <DollarSign className="h-4 w-4" /> Record Price
            </Button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Basic price" value={money(material.current_unit_price, material.current_currency)}
          sub={material.current_supplier_name ?? undefined} />
        <Kpi label="Effective cost" value={money(material.current_effective_unit_cost, material.current_currency)}
          sub={`per ${material.unit}`} />
        <Kpi label="Current spec"
          value={material.current_spec_code ? `${material.current_spec_code} ${material.current_spec_revision_no ?? ""}` : "—"}
          sub={material.current_spec_status ?? undefined} />
        <Kpi label="Price status"
          value={material.current_price_status ?? "—"}
          sub={material.current_price_is_expired ? "quote expired" : date(material.current_price_valid_from)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="specification">Specification</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({links.length})</TabsTrigger>
          <TabsTrigger value="prices">Price History ({prices.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="pt-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            {([
              ["Category", material.category],
              ["Subcategory", material.subcategory],
              ["Discipline", material.discipline],
              ["Material type", material.material_type],
              ["Unit", material.unit],
              ["Standard", material.standard],
              ["Grade", material.grade],
              ["Brand", material.brand],
              ["Model", material.model],
              ["Manufacturer", material.manufacturer],
              ["Package size", material.package_size],
              ["Dimension", material.dimension],
              ["Thickness", material.thickness],
              ["Weight", material.weight],
              ["Colour / finish", material.color_finish],
              ["Application / element", material.application_element],
              ["Lifecycle", material.lifecycle_status],
              ["Spec reference", material.spec_reference],
            ] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="border-b border-border/50 py-1.5">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {material.tech_spec_summary && (
            <p className="mt-4 text-sm"><span className="font-medium">Technical summary: </span>{material.tech_spec_summary}</p>
          )}
          {material.tags && material.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {material.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
            </div>
          )}
          {material.notes && <p className="mt-3 text-sm text-muted-foreground">{material.notes}</p>}
        </TabsContent>

        {/* Specification */}
        <TabsContent value="specification" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {currentSpec
                ? `Current: ${currentSpec.spec_code} ${currentSpec.revision_no} (effective ${date(currentSpec.effective_date)})`
                : "No specification recorded yet."}
            </p>
            {canManage && (
              <Button size="sm" variant="outline"
                onClick={() => { setSpecDialogTarget(null); setSpecDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> New Specification
              </Button>
            )}
          </div>

          {specs.map((spec) => {
            const specRevs = revisions.filter((r) => r.spec_id === spec.id);
            return (
              <div key={spec.id} className="rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="text-sm">
                    <span className="font-mono font-medium">{spec.spec_code}</span> — {spec.spec_name}
                    {spec.discipline && <span className="ml-1 text-muted-foreground">· {spec.discipline}</span>}
                  </div>
                  {canManage && (
                    <Button size="sm" variant="outline"
                      onClick={() => { setSpecDialogTarget(spec); setSpecDialogOpen(true); }}>
                      <Plus className="h-3.5 w-3.5" /> Revision
                    </Button>
                  )}
                </div>
                {specRevs.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No revisions.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rev</TableHead>
                        <TableHead className="w-28">Effective</TableHead>
                        <TableHead className="w-28">Expiry</TableHead>
                        <TableHead>Standard / Grade</TableHead>
                        <TableHead>Dimension / Thickness</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {specRevs.map((r) => (
                        <TableRow key={r.id}
                          className={cnCurrent(currentSpec?.revision_id === r.id)}>
                          <TableCell className="font-mono text-xs">{r.revision_no}</TableCell>
                          <TableCell className="text-xs">{date(r.effective_date)}</TableCell>
                          <TableCell className="text-xs">{date(r.expiry_date)}</TableCell>
                          <TableCell className="text-xs">{[r.standard, r.grade].filter(Boolean).join(" · ") || "—"}</TableCell>
                          <TableCell className="text-xs">{[r.dimension, r.thickness].filter(Boolean).join(" · ") || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "active" ? "outline" : "secondary"} className="text-[10px]">
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* Suppliers */}
        <TabsContent value="suppliers" className="space-y-3 pt-4">
          <div className="flex justify-end">
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)} disabled={!tenantId}>
                <Plus className="h-3.5 w-3.5" /> Link Supplier
              </Button>
            )}
          </div>
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No suppliers linked to this material yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Product code</TableHead>
                    <TableHead>Brand / Mfr</TableHead>
                    <TableHead className="w-20 text-right">MOQ</TableHead>
                    <TableHead className="w-24 text-right">Lead (d)</TableHead>
                    <TableHead className="w-20">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((l) => (
                    <TableRow key={l.id} className={l.is_active ? undefined : "opacity-50"}>
                      <TableCell className="text-sm">
                        {l.supplier_name}
                        {l.supplier_code && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{l.supplier_code}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{l.supplier_product_code ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[l.brand, l.manufacturer].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">{l.moq ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{l.lead_time_days ?? "—"}</TableCell>
                      <TableCell>{l.is_active ? <Badge variant="outline">Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Price History */}
        <TabsContent value="prices" className="space-y-4 pt-4">
          {submissions.length > 0 && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-700">
                Pending / in-workflow submissions
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead className="w-28">Valid from</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{s.supplier_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{money(s.unit_price, s.currency)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{money(s.effective_unit_cost, s.currency)}</TableCell>
                      <TableCell className="text-xs">{date(s.valid_from)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-1.5 text-[11px] text-amber-700/80">
                Verify / approve these from{" "}
                <Link href="/dashboard/qs/dwl-price-approvals" className="underline">Price Approvals</Link>.
              </p>
            </div>
          )}

          {prices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No price history. Record a price or submit a supplier quotation for approval.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Valid from</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="w-20">Source</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Disc</TableHead>
                    <TableHead className="text-right">Deliv</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-28">Quote exp.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((p) => {
                    const expired = p.quote_valid_until != null && new Date(p.quote_valid_until) < new Date();
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{date(p.valid_from)}</TableCell>
                        <TableCell className="text-xs">{p.supplier_id ? supplierNames.get(p.supplier_id) ?? "—" : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.source_type}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{money(p.unit_price, p.currency)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{p.discount ? p.discount.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{p.delivery_cost ? p.delivery_cost.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{p.tax_amount ? p.tax_amount.toFixed(2) : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{money(p.effective_unit_cost, p.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={p.price_status === "approved" ? "outline" : "secondary"} className="text-[10px]">
                            {p.price_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.quote_valid_until ? (
                            <span className={expired ? "text-destructive" : undefined}>{date(p.quote_valid_until)}</span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Price rows are append-only — a change is always a new row; earlier rows are never edited or removed.
          </p>
        </TabsContent>

        {/* Documents (stub) */}
        <TabsContent value="documents" className="pt-4">
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Document attachments (datasheets, quotations, certificates) are a later phase of the
              Cost &amp; Rate Library (design doc Phase C-J).
            </p>
          </div>
        </TabsContent>

        {/* Audit (stub) */}
        <TabsContent value="audit" className="pt-4">
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Row-level change history for this material and its prices is captured in the DCOS audit
              log; a filtered view here is a later phase.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {tenantId && (
        <>
          <DwlMaterialSpecDialog
            open={specDialogOpen}
            onOpenChange={setSpecDialogOpen}
            resourceId={id}
            resourceCode={material.code}
            tenantId={tenantId}
            userId={userId}
            spec={specDialogTarget}
            existingRevisionCount={
              specDialogTarget ? revisions.filter((r) => r.spec_id === specDialogTarget.id).length : 0
            }
            onSaved={() => void load()}
          />
          <DwlSupplierMaterialDialog
            open={linkDialogOpen}
            onOpenChange={setLinkDialogOpen}
            resourceId={id}
            resourceCode={material.code}
            tenantId={tenantId}
            userId={userId}
            onSaved={() => void load()}
          />
          <DwlMaterialPriceDialog
            open={priceDialogOpen}
            onOpenChange={setPriceDialogOpen}
            resourceId={id}
            resourceCode={material.code}
            resourceUnit={material.unit}
            tenantId={tenantId}
            userId={userId}
            canSubmit={canSubmitPrice}
            canRecordDirect={canRecordDirect}
            onSaved={() => void load()}
          />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold" title={value}>{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function cnCurrent(isCurrent: boolean) {
  return isCurrent ? "bg-primary/5" : undefined;
}
