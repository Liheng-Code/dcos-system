import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ShieldCheck } from "lucide-react";
import { can, requireHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { currentLicenses } from "@/lib/queries";
import { fmtDate, fmtDateTime, fmtMoney, TYPE_LABEL } from "@/lib/format";
import type { Contact, Deployment, Tenant } from "@/lib/types";
import { buttonClass, Card, CardTitle, Empty, PageHeader, StateBadge, Table, Td, Th } from "@/components/ui";
import { ContactForm, DeploymentForm, DeploymentStatusSelect } from "@/components/tenant-forms";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireHqUser();
  const db = serviceClient();
  const [{ data: tenant }, { data: deployments }, { data: contacts }, { data: events }, licenses] = await Promise.all([
    db.from("tenants").select("*").eq("id", id).maybeSingle<Tenant>(),
    db.from("tenant_deployments").select("*").eq("tenant_id", id).order("created_at"),
    db.from("tenant_contacts").select("*").eq("tenant_id", id).order("created_at"),
    db.from("license_events").select("event_type, payload, occurred_at").eq("tenant_id", id).order("occurred_at", { ascending: false }).limit(15),
    currentLicenses(),
  ]);
  if (!tenant) notFound();
  const manage = can(user, "manageTenants");
  const manageLicenses = can(user, "manageLicenses");
  const tenantLicenses = licenses.filter((l) => l.tenant_id === id);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tenant.display_name}
        description={`${tenant.code} · ${tenant.legal_name}${tenant.country ? " · " + tenant.country : ""}${tenant.billing_email ? " · " + tenant.billing_email : ""}`}
        action={
          can(user, "manageLicenses") &&
          (deployments?.length ?? 0) > 0 && (
            <Link href={`/licenses/new?tenant=${id}`} className={buttonClass()}>
              <Plus /> Create license
            </Link>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-xl bg-muted p-3 dark:bg-muted/40">
          <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscriptions</h2>
          {tenantLicenses.length === 0 ? (
            <Empty>No license yet{(deployments?.length ?? 0) === 0 ? ": add a deployment first" : ""}.</Empty>
          ) : (
            <div className="space-y-3">
              {tenantLicenses.map((l) => (
                <Card key={l.id} className="p-0">
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <ShieldCheck className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="text-lg font-semibold leading-tight">DCOS {l.plan?.display_name ?? "Custom"}</div>
                          <div className="text-xs text-muted-foreground">
                            {l.number} · {TYPE_LABEL[l.type]} · {l.deployment.deployment_code}
                          </div>
                        </div>
                      </div>
                      <StateBadge state={l.state} days={l.daysToExpiry} />
                    </div>
                    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Users</dt>
                        <dd className="mt-0.5 font-medium">
                          {l.limit_users === null ? "Unlimited" : `${l.limit_users} users`} ·{" "}
                          {l.limit_viewers === null ? "unlimited" : l.limit_viewers} viewers
                        </dd>
                        <dd className="text-xs text-muted-foreground">In use: reported from Phase 3</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Subscription end date</dt>
                        <dd className="mt-0.5 font-medium">{fmtDate(l.valid_until)}</dd>
                        <dd className="text-xs text-muted-foreground">then {l.grace_days} d grace, {l.readonly_days} d read-only</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Contract value</dt>
                        <dd className="mt-0.5 font-medium">{fmtMoney(l.subscription?.net_amount, l.subscription?.currency ?? "USD")}</dd>
                        <dd className="text-xs text-muted-foreground">{l.subscription?.number ?? ""}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
                    {manageLicenses && (l.status === "active" || l.status === "suspended") && (
                      <>
                        <Link href={`/licenses/new?from=${l.id}&mode=change`} className={buttonClass("outline")}>
                          Change plan
                        </Link>
                        <Link href={`/licenses/new?from=${l.id}&mode=renew`} className={buttonClass("outline")}>
                          Renew
                        </Link>
                      </>
                    )}
                    <Link href={`/licenses/${l.id}`} className={buttonClass(l.status === "draft" ? "primary" : "ghost")}>
                      {l.status === "draft" ? "Sign draft" : "Details"}
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card className="h-fit">
          <div className="text-base font-semibold">Contract summary</div>
          <div className="text-xs text-muted-foreground">Current terms, as signed</div>
          <ul className="mt-4 space-y-3 text-sm">
            {tenantLicenses.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">DCOS {l.plan?.display_name ?? "Custom"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDate(l.valid_from)} – {fmtDate(l.valid_until)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{fmtMoney(l.subscription?.net_amount, l.subscription?.currency ?? "USD")}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {fmtMoney(
                tenantLicenses.reduce((s, l) => s + (l.subscription?.net_amount ?? 0), 0),
                tenantLicenses[0]?.subscription?.currency ?? "USD",
              )}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Invoices live in the billing system; HQ keeps the reference (design decision 15).</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Deployments</CardTitle>
        {(deployments ?? []).length > 0 && (
          <div className="mb-4">
            <Table>
              <thead>
                <tr>
                  <Th>Deployment id</Th>
                  <Th>Environment</Th>
                  <Th>Topology</Th>
                  <Th>URL</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {(deployments as Deployment[]).map((d) => (
                  <tr key={d.id}>
                    <Td className="font-mono text-xs">{d.deployment_code}</Td>
                    <Td className="capitalize">{d.environment}</Td>
                    <Td>{d.topology === "on_prem" ? "On-premises" : "SaaS dedicated"}</Td>
                    <Td>{d.base_url ?? "—"}</Td>
                    <Td>{manage ? <DeploymentStatusSelect id={d.id} status={d.status} /> : d.status}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {manage && <DeploymentForm tenantId={id} tenantCode={tenant.code} />}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Contacts</CardTitle>
          <ul className="mb-4 divide-y divide-border text-sm">
            {(contacts as Contact[] | null)?.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {[c.email, c.phone, c.role.replace("_", " ")].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
            {(contacts ?? []).length === 0 && <li className="py-2 text-muted-foreground">No contacts yet.</li>}
          </ul>
          {manage && <ContactForm tenantId={id} />}
        </Card>

        <Card>
          <CardTitle>Recent license events</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {(events ?? []).map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{String(e.event_type).replace(/_/g, " ")}</span>{" "}
                  <span className="text-muted-foreground">
                    {(e.payload as { number?: string; revision?: number }).number} rev {(e.payload as { revision?: number }).revision}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">{fmtDateTime(e.occurred_at)}</span>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
