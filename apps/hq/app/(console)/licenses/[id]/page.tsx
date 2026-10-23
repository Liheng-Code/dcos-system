import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURE_ENTITLEMENTS, MODULE_ENTITLEMENTS } from "@dcos/licensing";
import { can, requireHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { licenseById, licenseRevisions } from "@/lib/queries";
import { fmtDate, fmtDateTime, fmtLimit, TYPE_LABEL } from "@/lib/format";
import type { LicenseToken } from "@/lib/types";
import { Card, CardTitle, PageHeader, StateBadge, Table, Tag, Td, Th } from "@/components/ui";
import { CopyTokenButton, DiscardDraftButton, LiveLicenseActions, SignPanel } from "@/components/license-actions";

// Design 9.1.3 (the sketch's screen 2).
export default async function LicensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireHqUser();
  const license = await licenseById(id);
  if (!license) notFound();
  const db = serviceClient();
  const [revisions, { data: tokens }, { data: events }, { data: subscription }] = await Promise.all([
    licenseRevisions(license.number),
    db.from("license_tokens").select("*").eq("tenant_id", license.tenant_id).order("issued_at", { ascending: false }),
    db.from("license_events").select("event_type, payload, occurred_at").eq("license_id", license.id).order("occurred_at", { ascending: false }),
    license.subscription_id
      ? db.from("subscriptions").select("number, net_amount, currency, po_reference, status").eq("id", license.subscription_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const manage = can(user, "manageLicenses");
  const revisionIds = new Set(revisions.map((r) => r.id));
  const licenseTokens = ((tokens ?? []) as LicenseToken[]).filter((t) => revisionIds.has(t.license_id));
  const live = revisions.find((r) => r.status === "active" || r.status === "suspended");
  const openDraft = revisions.find((r) => r.status === "draft");
  const modules = new Set(license.modules);
  const features = new Set(license.features);

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        <Link href="/licenses" className="hover:underline">
          Licenses
        </Link>{" "}
        /{" "}
        <Link href={`/tenants/${license.tenant.id}`} className="hover:underline">
          {license.tenant.display_name}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {license.tenant.display_name} <StateBadge state={license.state} days={license.daysToExpiry} />
          </span>
        }
        description={`${license.number} · revision ${license.revision} · ${TYPE_LABEL[license.type]} · ${license.plan?.display_name ?? "Custom"} · ${license.deployment.deployment_code}${license.deployment.base_url ? " · " + license.deployment.base_url : ""}`}
      />

      {license.status !== "draft" && openDraft && (
        <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/30 text-sm">
          Revision {openDraft.revision} is drafted and waiting for a signature.{" "}
          <Link href={`/licenses/${openDraft.id}`} className="font-medium text-primary underline">
            Open it
          </Link>
          .
        </Card>
      )}

      {license.status === "draft" && manage && (
        <>
          {license.change_reason && <p className="text-sm">Reason: {license.change_reason}</p>}
          <SignPanel licenseId={license.id} number={license.number} revision={license.revision} />
          <div className="flex justify-end">
            <DiscardDraftButton licenseId={license.id} backTo={live ? `/licenses/${live.id}` : "/licenses"} />
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs font-medium uppercase text-muted-foreground">Term</div>
          <div className="mt-1 font-semibold">
            {fmtDate(license.valid_from)} → {fmtDate(license.valid_until)}
          </div>
          <div className="text-xs text-muted-foreground">
            Grace {license.grace_days} d · read-only {license.readonly_days} d
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-muted-foreground">Seats</div>
          <div className="mt-1 font-semibold">
            {fmtLimit(license.limit_users)} users · {fmtLimit(license.limit_viewers)} viewers
          </div>
          <div className="text-xs text-muted-foreground">Usage arrives with heartbeats</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-muted-foreground">Projects</div>
          <div className="mt-1 font-semibold">{fmtLimit(license.limit_projects)}</div>
          <div className="text-xs text-muted-foreground">Tenders count once awarded</div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase text-muted-foreground">Support</div>
          <div className="mt-1 font-semibold capitalize">{license.support_tier}</div>
          <div className="text-xs text-muted-foreground">
            until {fmtDate(license.support_until)} · maintenance {fmtDate(license.maintenance_until)}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Entitlements</CardTitle>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <span className="w-20 text-muted-foreground">Modules</span>
            {MODULE_ENTITLEMENTS.filter((m) => m.key !== "administration").map((m) => (
              <Tag key={m.key} tone={m.alwaysOn || modules.has(m.key) ? "on" : "off"}>
                {m.label}
              </Tag>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="w-20 text-muted-foreground">Features</span>
            {FEATURE_ENTITLEMENTS.map((f) => (
              <Tag key={f.key} tone={features.has(f.key) ? "on" : "off"}>
                {f.label}
              </Tag>
            ))}
          </div>
          {license.notice && <p>Customer notice: {license.notice}</p>}
          {license.hq_state === "suspended" && <p className="text-red-700 dark:text-red-400">Suspended ({license.suspend_mode}).</p>}
          {subscription && (
            <p className="text-muted-foreground">
              Subscription {subscription.number}
              {subscription.net_amount !== null ? ` · ${subscription.currency} ${Number(subscription.net_amount).toLocaleString()}` : ""}
              {subscription.po_reference ? ` · PO ${subscription.po_reference}` : ""}
            </p>
          )}
        </div>
      </Card>

      {manage && live && license.id === live.id && !openDraft && license.hq_state !== "revoked" && (
        <LiveLicenseActions licenseId={license.id} number={license.number} hqState={license.hq_state} />
      )}

      <Card>
        <CardTitle>Tokens</CardTitle>
        {licenseTokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing signed yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Revision</Th>
                <Th>Token id</Th>
                <Th>Key</Th>
                <Th>Issued</Th>
                <Th>Valid to</Th>
                <Th>Copied</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {licenseTokens.map((t) => (
                <tr key={t.id}>
                  <Td>{revisions.find((r) => r.id === t.license_id)?.revision}</Td>
                  <Td className="font-mono text-xs">{t.jti}</Td>
                  <Td className="font-mono text-xs">{t.kid}</Td>
                  <Td>{fmtDateTime(t.issued_at)}</Td>
                  <Td>{fmtDate(t.expires_at)}</Td>
                  <Td>{t.delivered_at ? fmtDateTime(t.delivered_at) : "—"}</Td>
                  <Td>{manage && <CopyTokenButton tokenId={t.id} token={t.token} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Revisions</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <Link href={`/licenses/${r.id}`} className={r.id === license.id ? "font-semibold" : "text-primary hover:underline"}>
                    Revision {r.revision}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {r.plan?.display_name ?? "Custom"} · to {fmtDate(r.valid_until)}
                    {r.change_reason ? ` · ${r.change_reason}` : ""}
                  </span>
                </span>
                <StateBadge state={r.state} days={r.daysToExpiry} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Events</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {(events ?? []).map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="font-medium">{String(e.event_type).replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{fmtDateTime(e.occurred_at)}</span>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
