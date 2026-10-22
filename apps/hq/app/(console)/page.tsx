import Link from "next/link";
import { Activity, CalendarClock } from "lucide-react";
import { requireHqUser } from "@/lib/auth";
import { allTenants, currentLicenses } from "@/lib/queries";
import { fmtDate, fmtMoney, STATE_LABEL } from "@/lib/format";
import { countByState, renewalsByMonth, totals, upcomingRenewals, valueByPlan, type MetricLicense } from "@/lib/metrics";
import { Card, CardTitle, Empty, Kpi, PageHeader, StateBadge } from "@/components/ui";
import { PlanValueChart, RenewalsChart } from "@/components/charts";

// Design 9.1.1, laid out like a license analytics dashboard. Everything shown is
// real HQ data; seat usage waits for heartbeats (Phase 3) rather than guessing.
export default async function DashboardPage() {
  await requireHqUser();
  const [licenses, tenants] = await Promise.all([currentLicenses(), allTenants()]);
  const now = Date.now();

  // Money charts use one currency; anything else is counted but not summed in.
  const currencies = licenses.map((l) => l.subscription?.currency ?? "USD");
  const currency = mode(currencies) ?? "USD";
  const priced: MetricLicense[] = licenses.map((l) =>
    (l.subscription?.currency ?? "USD") === currency ? l : { ...l, subscription: null },
  );
  const otherCurrency = currencies.some((c) => c !== currency);

  const t = totals(priced);
  const renewals = renewalsByMonth(priced, now);
  // Plans with no contract value (trials) have no bar to draw.
  const byPlan = valueByPlan(priced).filter((p) => p.value > 0);
  const states = countByState(licenses);
  const maxState = Math.max(1, ...states.map((s) => s.count));
  const upcoming = upcomingRenewals(priced, 90);

  if (tenants.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Empty>
          Nothing yet. <Link href="/tenants/new" className="font-medium text-primary underline">Add your first tenant</Link>.
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description="Licenses, renewals and contract value across every DCOS customer." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Contract value in force" value={fmtMoney(t.contractValue, currency)} hint={otherCurrency ? `${currency} only` : "Current terms"} />
        <Kpi label="Customers" value={t.customers} hint={`${t.trials} on trial`} />
        <Kpi label="User seats sold" value={t.seatsSold ?? "Unlimited"} hint={t.seatsSold === null ? "An Enterprise license is unlimited" : "Full seats"} />
        <Kpi label="Viewer seats sold" value={t.viewerSeatsSold ?? "Unlimited"} hint="Read-only seats" />
        <Kpi
          label="Renewing ≤ 90 days"
          value={upcoming.length}
          tone={upcoming.length ? "warn" : undefined}
          hint={fmtMoney(
            upcoming.reduce((s, l) => s + (l.subscription?.net_amount ?? 0), 0),
            currency,
          )}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>Renewal value by month</CardTitle>
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">Contract value whose term ends in each month, next 12 months ({currency}).</p>
          <RenewalsChart data={renewals} currency={currency} />
        </Card>

        <Card>
          <CardTitle>Licenses by state</CardTitle>
          <ul className="space-y-2.5">
            {states.map(({ state, count }) => (
              <li key={state} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm">
                <Link href={`/licenses?state=${state}`} className="hover:underline">
                  <StateBadge state={state} />
                </Link>
                <div className="h-2 overflow-hidden rounded-full bg-chart-track" title={`${STATE_LABEL[state]}: ${count}`}>
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(count / maxState) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Upcoming renewals
            </span>
          </CardTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing ends in the next 90 days.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 8).map((l) => (
                <li key={l.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/licenses/${l.id}`} className="truncate font-medium hover:underline">
                      {l.tenant.display_name}
                    </Link>
                    <span className="shrink-0 tabular-nums">{fmtMoney(l.subscription?.net_amount, currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{fmtDate(l.valid_until)}</span>
                    <span>·</span>
                    <span>
                      {l.daysToExpiry !== null && l.daysToExpiry >= 0 ? `${l.daysToExpiry} days left` : "ended"}
                    </span>
                    <span className="ml-auto">
                      <StateBadge state={l.state} />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-chart-track">
                    <div
                      className="h-full rounded-full bg-chart-1"
                      style={{ width: `${Math.max(4, 100 - ((l.daysToExpiry ?? 0) / 90) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Contract value by plan</CardTitle>
          {byPlan.length === 0 ? (
            <p className="text-sm text-muted-foreground">No license in force yet.</p>
          ) : (
            <PlanValueChart data={byPlan} currency={currency} />
          )}
        </Card>

        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" /> Seat usage
            </span>
          </CardTitle>
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Waiting for deployment heartbeats</p>
            <p className="mt-1">
              Users, viewers and projects in use per customer appear here once deployments report daily (Phase 3). Until then
              each customer sees its own usage on its License page.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
