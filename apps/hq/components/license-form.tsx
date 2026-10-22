"use client";

// Create License (design 9.1.4, the sketch's screen 3), also used for Renew and
// Change plan / Edit entitlements, which save a new draft revision.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FEATURE_ENTITLEMENTS, MODULE_ENTITLEMENTS } from "@dcos/licensing";
import { saveLicenseDraft } from "@/app/actions/licenses";
import { addDays, addMonths } from "@/lib/license-claims";
import { fmtDate } from "@/lib/format";
import type { Deployment, License, LicenseType, Plan, Tenant } from "@/lib/types";
import { Button, Card, cn, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

export type LicenseFormMode = "new" | "renew" | "change";

interface Props {
  mode: LicenseFormMode;
  tenants: Pick<Tenant, "id" | "display_name" | "code">[];
  deployments: Pick<Deployment, "id" | "tenant_id" | "deployment_code" | "environment" | "status">[];
  plans: Plan[];
  initialTenantId?: string | null;
  // The live revision when renewing or changing.
  from?: License | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const numOrEmpty = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const LICENSABLE = MODULE_ENTITLEMENTS.filter((m) => !m.alwaysOn);

export function LicenseForm({ mode, tenants, deployments, plans, initialTenantId, from }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activePlans = plans.filter((p) => p.active);
  const firstPlan = from ? plans.find((p) => p.id === from.plan_id) ?? null : activePlans.find((p) => p.code === "PRO") ?? activePlans[0] ?? null;

  const [tenantId, setTenantId] = useState(from?.tenant_id ?? initialTenantId ?? "");
  const tenantDeployments = deployments.filter((d) => d.tenant_id === tenantId && d.status !== "decommissioned");
  const [deploymentId, setDeploymentId] = useState(from?.deployment_id ?? tenantDeployments[0]?.id ?? "");
  const [type, setType] = useState<LicenseType>(from?.type ?? firstPlan?.license_type_default ?? "subscription");
  const [planId, setPlanId] = useState<string>(from?.plan_id ?? firstPlan?.id ?? "");
  const [validFrom, setValidFrom] = useState(
    mode === "renew" && from ? addDays(from.valid_until, 1) : mode === "change" && from ? from.valid_from : today(),
  );
  const [durationMonths, setDurationMonths] = useState(String(firstPlan?.default_duration_months ?? 12));
  const [trialDays, setTrialDays] = useState("30");
  const [manualUntil, setManualUntil] = useState("");
  const [graceDays, setGraceDays] = useState(String(from?.grace_days ?? firstPlan?.grace_days ?? 14));
  const [readonlyDays, setReadonlyDays] = useState(String(from?.readonly_days ?? firstPlan?.readonly_days ?? 30));
  const [modules, setModules] = useState<string[]>(from?.modules ?? firstPlan?.modules ?? []);
  const [features, setFeatures] = useState<string[]>(from?.features ?? firstPlan?.features ?? []);
  const [limitUsers, setLimitUsers] = useState(numOrEmpty(from ? from.limit_users : firstPlan?.limit_users));
  const [limitViewers, setLimitViewers] = useState(numOrEmpty(from ? from.limit_viewers : firstPlan?.limit_viewers));
  const [limitProjects, setLimitProjects] = useState(numOrEmpty(from ? from.limit_projects : firstPlan?.limit_projects));
  const [supportTier, setSupportTier] = useState<"standard" | "premium">(from?.support_tier ?? firstPlan?.support_tier ?? "standard");
  const [netAmount, setNetAmount] = useState("");
  const [currency, setCurrency] = useState(firstPlan?.currency ?? "USD");
  const [poReference, setPoReference] = useState("");
  const [changeReason, setChangeReason] = useState(mode === "renew" ? "Renewal" : "");
  const [notice, setNotice] = useState("");

  const plan = plans.find((p) => p.id === planId) ?? null;
  const keepTerm = mode === "change";

  function applyPlan(id: string) {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    setModules(p.modules);
    setFeatures(p.features);
    setLimitUsers(numOrEmpty(p.limit_users));
    setLimitViewers(numOrEmpty(p.limit_viewers));
    setLimitProjects(numOrEmpty(p.limit_projects));
    setGraceDays(String(p.grace_days));
    setReadonlyDays(String(p.readonly_days));
    setSupportTier(p.support_tier);
    setCurrency(p.currency);
    if (!keepTerm) {
      setType(p.license_type_default);
      setDurationMonths(String(p.default_duration_months));
    }
  }

  // V2: the end date is calculated, shown before saving.
  const validUntil = useMemo(() => {
    if (keepTerm && from) return from.valid_until;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return null;
    if (type === "trial") return addDays(validFrom, Number(trialDays || 0) - 1);
    if (type === "enterprise" && manualUntil) return manualUntil;
    return addMonths(validFrom, Number(durationMonths || 0));
  }, [keepTerm, from, validFrom, type, trialDays, manualUntil, durationMonths]);

  const overrides = new Set([
    ...modules.filter((m) => plan && !plan.modules.includes(m)),
    ...features.filter((f) => plan && !plan.features.includes(f)),
  ]);
  const removed = new Set([
    ...(plan?.modules ?? []).filter((m) => !modules.includes(m)),
    ...(plan?.features ?? []).filter((f) => !features.includes(f)),
  ]);

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveLicenseDraft({
        fromLicenseId: from?.id ?? null,
        tenantId,
        deploymentId,
        type,
        planId: planId || null,
        validFrom,
        durationMonths: Number(durationMonths),
        trialDays: Number(trialDays),
        validUntil: type === "enterprise" && manualUntil && !keepTerm ? manualUntil : null,
        keepTerm,
        graceDays: Number(graceDays),
        readonlyDays: Number(readonlyDays),
        modules,
        features,
        limitUsers,
        limitViewers,
        limitProjects,
        supportTier,
        supportUntil: null,
        maintenanceUntil: null,
        netAmount,
        currency,
        poReference,
        changeReason,
        notice,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Draft saved. Sign it to issue the license.");
      router.push(`/licenses/${res.data.id}`);
    });
  }

  const section = "space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0";

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenant and deployment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tenant">
              <Select
                required
                value={tenantId}
                disabled={!!from}
                onChange={(e) => {
                  setTenantId(e.target.value);
                  setDeploymentId(deployments.find((d) => d.tenant_id === e.target.value && d.status !== "decommissioned")?.id ?? "");
                }}
              >
                <option value="">Choose…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name} ({t.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deployment" hint={tenantId && tenantDeployments.length === 0 ? "This tenant has no deployment yet." : undefined}>
              <Select required value={deploymentId} disabled={!!from} onChange={(e) => setDeploymentId(e.target.value)}>
                <option value="">Choose…</option>
                {tenantDeployments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deployment_code} ({d.environment})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type and plan</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {(["trial", "subscription", "enterprise"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="type"
                  checked={type === t}
                  disabled={keepTerm}
                  onChange={() => {
                    setType(t);
                    if (t === "trial") setGraceDays("0");
                  }}
                />
                {t[0].toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
          <Field label="Plan" hint="Choosing a plan loads its modules, features and limits.">
            <Select value={planId} onChange={(e) => applyPlan(e.target.value)}>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Term</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Start">
              <Input type="date" required value={validFrom} disabled={keepTerm} onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            {keepTerm ? (
              <Field label="Term" hint="A plan change keeps the current term.">
                <Input disabled value={`until ${fmtDate(from?.valid_until)}`} />
              </Field>
            ) : type === "trial" ? (
              <Field label="Trial days" hint="14 to 60">
                <Input type="number" min={14} max={60} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
              </Field>
            ) : (
              <Field label="Duration (months)" hint={type === "enterprise" ? "Up to 60" : "Up to 36"}>
                <Select value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)}>
                  {[1, 3, 6, 12, 24, 36, ...(type === "enterprise" ? [48, 60] : [])].map((m) => (
                    <option key={m} value={m}>
                      {m} months
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Grace (days)" hint="Full access after the end">
              <Input type="number" min={0} value={graceDays} disabled={type === "trial"} onChange={(e) => setGraceDays(e.target.value)} />
            </Field>
            <Field label="Read-only (days)" hint="After grace, before lock">
              <Input type="number" min={0} value={readonlyDays} onChange={(e) => setReadonlyDays(e.target.value)} />
            </Field>
            {type === "enterprise" && !keepTerm && (
              <Field label="Negotiated end date" hint="Optional; overrides the duration">
                <Input type="date" value={manualUntil} onChange={(e) => setManualUntil(e.target.value)} />
              </Field>
            )}
          </div>
          <p className="text-sm">
            Ends <span className="font-semibold">{fmtDate(validUntil)}</span>
          </p>
        </div>

        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Users" hint="Full seats. Empty = unlimited.">
              <Input type="number" min={1} value={limitUsers} onChange={(e) => setLimitUsers(e.target.value)} />
            </Field>
            <Field label="Viewers" hint="Cheaper read-only seats.">
              <Input type="number" min={0} value={limitViewers} onChange={(e) => setLimitViewers(e.target.value)} />
            </Field>
            <Field label="Projects" hint="Tenders count only once awarded.">
              <Input type="number" min={1} value={limitProjects} onChange={(e) => setLimitProjects(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Modules and features <span className="font-normal normal-case">· ◆ beyond the plan · struck through: removed from the plan</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-sm text-muted-foreground">☑ Project (always)</span>
            {LICENSABLE.map((m) => (
              <label
                key={m.key}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm",
                  modules.includes(m.key) ? "border-primary bg-primary/5" : "border-border",
                  removed.has(m.key) && "line-through text-muted-foreground",
                )}
              >
                <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggle(modules, setModules, m.key)} />
                {m.label}
                {overrides.has(m.key) && <span className="text-amber-600">◆</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_ENTITLEMENTS.map((f) => (
              <label
                key={f.key}
                title={f.available ? undefined : "Not available yet"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm",
                  f.available ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                  features.includes(f.key) ? "border-primary bg-primary/5" : "border-border",
                  removed.has(f.key) && "line-through text-muted-foreground",
                )}
              >
                <input
                  type="checkbox"
                  disabled={!f.available}
                  checked={features.includes(f.key)}
                  onChange={() => toggle(features, setFeatures, f.key)}
                />
                {f.label}
                {overrides.has(f.key) && <span className="text-amber-600">◆</span>}
              </label>
            ))}
          </div>
        </div>

        <div className={section}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Support and commercial</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Support tier" hint="Support and maintenance run to the end date.">
              <Select value={supportTier} onChange={(e) => setSupportTier(e.target.value as "standard" | "premium")}>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </Select>
            </Field>
            <Field label="Net amount">
              <Input type="number" min={0} step="0.01" value={netAmount} onChange={(e) => setNetAmount(e.target.value)} />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </Field>
            <Field label="PO reference">
              <Input value={poReference} onChange={(e) => setPoReference(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className={section}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={mode === "new" ? "Reason" : "Why this revision?"}
              hint={overrides.size > 0 ? "Required: this grants more than the plan." : mode === "new" ? "Optional." : "Required."}
            >
              <Textarea rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
            </Field>
            <Field label="Notice for the customer's administrators" hint="Optional, shown on their License page.">
              <Textarea rows={2} maxLength={300} value={notice} onChange={(e) => setNotice(e.target.value)} />
            </Field>
          </div>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !tenantId || !deploymentId}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
