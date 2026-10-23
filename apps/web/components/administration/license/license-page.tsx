"use client";

// Administration > License & Subscription (design 9.2). Shows the installed
// license, usage against its limits, and what it includes; administrators can
// install a new signed token (until DCOS HQ delivers them automatically).

import { useState } from "react";
import { Check, KeyRound, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLicense } from "@/contexts/license-context";
import { FEATURE_ENTITLEMENTS, MODULE_ENTITLEMENTS } from "@/lib/licensing/catalogue";
import type { LimitStatus } from "@/lib/licensing/effective";
import { STATE_LABELS, STATE_TONES, formatLicenseDate } from "@/components/administration/license/license-format";

const TYPE_LABELS = { trial: "Trial", subscription: "Subscription", enterprise: "Enterprise" } as const;

function UsageRow({ label, status }: { label: string; status: LimitStatus }) {
  const pct = status.limit ? Math.min(100, Math.round((status.used / status.limit) * 100)) : 0;
  return (
    <div className="grid grid-cols-[7rem_1fr_7rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {status.limit !== null && (
          <div
            className={cn("h-full rounded-full", status.over ? "bg-red-500" : status.atLimit ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className={cn("text-right tabular-nums", status.over && "font-semibold text-red-600")}>
        {status.used} / {status.limit ?? "∞"}
      </span>
    </div>
  );
}

function Included({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
        on ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground",
      )}
    >
      {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function LicensePage() {
  const { summary, loading, refresh } = useLicense();
  const [token, setToken] = useState("");
  const [installing, setInstalling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!summary) {
    return <p className="text-sm text-muted-foreground">The license could not be loaded.</p>;
  }

  const lic = summary.license;
  const admin = summary.admin;
  const modules = new Set(summary.modules);
  const features = new Set(summary.features);

  async function install() {
    setInstalling(true);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "The license could not be installed.");
      toast.success(`License ${json.licenseId} revision ${json.rev} installed.`);
      setToken("");
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The license could not be installed.");
    } finally {
      setInstalling(false);
    }
  }

  async function reload() {
    setRefreshing(true);
    await refresh(true);
    setRefreshing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card gradient={false}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {lic ? `DCOS ${lic.planName ?? lic.plan}` : "No license installed"}
              </CardTitle>
              <CardDescription>
                {lic
                  ? `${lic.customer ? lic.customer + " · " : ""}License ${lic.id} · revision ${lic.rev} · ${TYPE_LABELS[lic.type]}`
                  : "Install the signed license token you received from DCOS."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATE_TONES[summary.state])}>
                {STATE_LABELS[summary.state]}
              </span>
              <Button variant="outline" size="sm" onClick={reload} disabled={refreshing}>
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {lic && (
            <p>
              Valid {formatLicenseDate(lic.from)} → {formatLicenseDate(summary.until)}
              <span className="text-muted-foreground">
                {" "}
                · then {lic.graceDays} days full access and {lic.readonlyDays} days read-only
              </span>
            </p>
          )}
          {summary.mode !== "enforce" && (
            <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
              {summary.mode === "off"
                ? "Licensing is not enforced on this deployment (DCOS_LICENSE_MODE is off). Everything below is for information only."
                : "Report mode: limits and expiry are checked and logged, but nothing is blocked."}
            </p>
          )}
          {summary.notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">{summary.notice}</p>}
          {admin?.tokenError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950 dark:text-red-100">
              Installed token rejected: {admin.tokenError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card gradient={false}>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Viewers are users with read-only access only. Tenders do not count as projects until they are awarded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <UsageRow label="Users" status={summary.limits.users} />
          <UsageRow label="Viewers" status={summary.limits.viewers} />
          <UsageRow label="Projects" status={summary.limits.projects} />
        </CardContent>
      </Card>

      <Card gradient={false}>
        <CardHeader>
          <CardTitle>Included in this license</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {MODULE_ENTITLEMENTS.filter((m) => m.key !== "administration").map((m) => (
              <Included key={m.key} label={m.alwaysOn ? `${m.label} (included)` : m.label} on={modules.has(m.key)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {FEATURE_ENTITLEMENTS.map((f) => (
              <Included key={f.key} label={f.label} on={features.has(f.key)} />
            ))}
          </div>
          {lic?.support && (
            <p className="text-sm text-muted-foreground">
              {lic.support.tier === "premium" ? "Premium" : "Standard"} support
              {lic.support.supportUntil ? ` until ${formatLicenseDate(lic.support.supportUntil)}` : ""}
              {lic.support.maintenanceUntil ? ` · maintenance until ${formatLicenseDate(lic.support.maintenanceUntil)}` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {admin && (
        <Card gradient={false}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Install license
            </CardTitle>
            <CardDescription>
              Paste the token DCOS sent you. It is checked against this deployment
              ({admin.deploymentId ?? "DCOS_DEPLOYMENT_ID not set"}) before it replaces the current one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="eyJhbGciOiJFZERTQSIs…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button onClick={install} disabled={installing || token.trim().length < 20}>
                {installing && <Loader2 className="h-4 w-4 animate-spin" />}
                Install
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {admin && admin.events.length > 0 && (
        <Card gradient={false}>
          <CardHeader>
            <CardTitle>License history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {admin.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-4 py-2">
                  <span>
                    <span className="font-medium">{e.event_type.replace(/_/g, " ")}</span>
                    <span className="ml-2 text-muted-foreground">
                      {Object.entries(e.payload)
                        .filter(([, v]) => v !== null && v !== undefined)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{new Date(e.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
