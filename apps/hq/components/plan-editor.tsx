"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { FEATURE_ENTITLEMENTS, MODULE_ENTITLEMENTS } from "@dcos/licensing";
import { savePlan } from "@/app/actions/catalogue";
import type { Plan } from "@/lib/types";
import { Button, Card, cn, ErrorText, Input, Select } from "@/components/ui";

const LICENSABLE = MODULE_ENTITLEMENTS.filter((m) => !m.alwaysOn);

type Draft = Omit<Plan, "id" | "list_price" | "limit_users" | "limit_viewers" | "limit_projects" | "sort_order"> & {
  id?: string;
  list_price: string;
  limit_users: string;
  limit_viewers: string;
  limit_projects: string;
};

const toDraft = (p: Plan): Draft => ({
  ...p,
  list_price: p.list_price === null ? "" : String(p.list_price),
  limit_users: p.limit_users === null ? "" : String(p.limit_users),
  limit_viewers: p.limit_viewers === null ? "" : String(p.limit_viewers),
  limit_projects: p.limit_projects === null ? "" : String(p.limit_projects),
});

const BLANK: Draft = {
  code: "",
  display_name: "",
  license_type_default: "subscription",
  default_duration_months: 12,
  modules: [],
  features: [],
  limit_users: "",
  limit_viewers: "",
  limit_projects: "",
  grace_days: 14,
  readonly_days: 30,
  support_tier: "standard",
  list_price: "",
  price_period: "annual",
  currency: "USD",
  active: true,
};

// Plans x entitlements matrix (design 9.1.8). Editing a plan never touches issued
// licenses; each revision froze its own set.
export function PlanMatrix({ plans, editable }: { plans: Plan[]; editable: boolean }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(plans.map(toDraft));
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setDirty((s) => new Set(s).add(i));
  };
  const toggleIn = (i: number, field: "modules" | "features", key: string) => {
    const list = drafts[i][field];
    update(i, { [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };

  function save() {
    setError(null);
    start(async () => {
      for (const i of [...dirty].sort()) {
        const res = await savePlan(drafts[i]);
        if (!res.ok) {
          setError(`${drafts[i].code || "New plan"}: ${res.error}`);
          return;
        }
        drafts[i].id = res.data.id;
      }
      setDirty(new Set());
      toast.success("Plans saved. Existing licenses are unchanged.");
      router.refresh();
    });
  }

  const cell = "border-b border-border px-2 py-1.5 text-center";
  const label = "border-b border-border px-3 py-1.5 text-left text-sm whitespace-nowrap";

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={cn(label, "text-xs uppercase text-muted-foreground")}>Entitlement</th>
              {drafts.map((p, i) => (
                <th key={i} className={cn(cell, "min-w-36")}>
                  {editable ? (
                    <div className="space-y-1">
                      <Input className="text-center font-semibold" value={p.display_name} placeholder="Name" onChange={(e) => update(i, { display_name: e.target.value })} />
                      <Input className="text-center font-mono text-xs" value={p.code} placeholder="CODE" onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
                    </div>
                  ) : (
                    <>
                      <div className="font-semibold">{p.display_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cn(label, "bg-muted/50 text-xs font-semibold uppercase text-muted-foreground")} colSpan={drafts.length + 1}>
                Modules · Project and Administration are always included
              </td>
            </tr>
            {LICENSABLE.map((m) => (
              <tr key={m.key}>
                <td className={label}>{m.label}</td>
                {drafts.map((p, i) => (
                  <td key={i} className={cell}>
                    <input type="checkbox" disabled={!editable} checked={p.modules.includes(m.key)} onChange={() => toggleIn(i, "modules", m.key)} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={cn(label, "bg-muted/50 text-xs font-semibold uppercase text-muted-foreground")} colSpan={drafts.length + 1}>
                Features
              </td>
            </tr>
            {FEATURE_ENTITLEMENTS.map((f) => (
              <tr key={f.key}>
                <td className={label}>
                  {f.label}
                  {!f.available && <span className="ml-1 text-xs text-muted-foreground">(not available yet)</span>}
                </td>
                {drafts.map((p, i) => (
                  <td key={i} className={cell}>
                    <input
                      type="checkbox"
                      disabled={!editable || !f.available}
                      checked={p.features.includes(f.key)}
                      onChange={() => toggleIn(i, "features", f.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={cn(label, "bg-muted/50 text-xs font-semibold uppercase text-muted-foreground")} colSpan={drafts.length + 1}>
                Limits and terms · empty = unlimited
              </td>
            </tr>
            {(
              [
                ["limit_users", "Users"],
                ["limit_viewers", "Viewers"],
                ["limit_projects", "Projects"],
                ["default_duration_months", "Default term (months)"],
                ["grace_days", "Grace (days)"],
                ["readonly_days", "Read-only (days)"],
                ["list_price", "List price"],
              ] as const
            ).map(([field, text]) => (
              <tr key={field}>
                <td className={label}>{text}</td>
                {drafts.map((p, i) => (
                  <td key={i} className={cell}>
                    <Input
                      type="number"
                      min={0}
                      disabled={!editable}
                      className="text-center"
                      value={String(p[field])}
                      onChange={(e) => update(i, { [field]: e.target.value } as Partial<Draft>)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={label}>Default type</td>
              {drafts.map((p, i) => (
                <td key={i} className={cell}>
                  <Select disabled={!editable} value={p.license_type_default} onChange={(e) => update(i, { license_type_default: e.target.value as Draft["license_type_default"] })}>
                    <option value="trial">Trial</option>
                    <option value="subscription">Subscription</option>
                    <option value="enterprise">Enterprise</option>
                  </Select>
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Support</td>
              {drafts.map((p, i) => (
                <td key={i} className={cell}>
                  <Select disabled={!editable} value={p.support_tier} onChange={(e) => update(i, { support_tier: e.target.value as Draft["support_tier"] })}>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </Select>
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Price period · currency</td>
              {drafts.map((p, i) => (
                <td key={i} className={cell}>
                  <div className="flex gap-1">
                    <Select disabled={!editable} value={p.price_period ?? ""} onChange={(e) => update(i, { price_period: (e.target.value || null) as Draft["price_period"] })}>
                      <option value="">—</option>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                      <option value="one_time">One-time</option>
                    </Select>
                    <Input disabled={!editable} className="w-16 text-center" maxLength={3} value={p.currency} onChange={(e) => update(i, { currency: e.target.value.toUpperCase() })} />
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td className={label}>Offered</td>
              {drafts.map((p, i) => (
                <td key={i} className={cell}>
                  <input type="checkbox" disabled={!editable} checked={p.active} onChange={() => update(i, { active: !p.active })} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ErrorText>{error}</ErrorText>
      {editable && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => {
              setDrafts((d) => [...d, { ...BLANK }]);
              setDirty((s) => new Set(s).add(drafts.length));
            }}
          >
            <Plus /> Add plan
          </Button>
          <Button onClick={save} disabled={pending || dirty.size === 0}>
            {pending ? "Saving…" : `Save ${dirty.size || ""} change${dirty.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PlanNote() {
  return (
    <Card className="text-sm text-muted-foreground">
      Module bundles are still an open decision (design decision 4). These starter plans are placeholders: change them here when
      the bundles are decided. A license copies its plan&apos;s set when it is drafted, so changing a plan never changes a
      license already issued.
    </Card>
  );
}

