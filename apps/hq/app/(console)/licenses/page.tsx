import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { can, requireHqUser } from "@/lib/auth";
import { allPlans, currentLicenses } from "@/lib/queries";
import { fmtDate, fmtLimit, fmtMoney, STATE_LABEL, TYPE_LABEL } from "@/lib/format";
import { buttonClass, Empty, Input, Kpi, PageHeader, Select, StateBadge, Table, Td, Th } from "@/components/ui";
import type { DisplayState } from "@/lib/license-claims";

// Design 9.1.2 (the sketch's screen 1), styled as a subscriptions table. Seat
// *usage* ("38 / 50") needs heartbeats (Phase 3); the licensed seats show now.
export default async function LicensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireHqUser();
  const { q = "", state = "", type = "", plan = "" } = await searchParams;
  const [licenses, plans] = await Promise.all([currentLicenses(), allPlans()]);

  const count = (...states: DisplayState[]) => licenses.filter((l) => states.includes(l.state)).length;
  const needle = q.trim().toLowerCase();
  const shown = licenses.filter(
    (l) =>
      (!needle ||
        l.number.toLowerCase().includes(needle) ||
        l.tenant.display_name.toLowerCase().includes(needle) ||
        l.tenant.code.toLowerCase().includes(needle)) &&
      (!state || l.state === state) &&
      (!type || l.type === type) &&
      (!plan || l.plan?.code === plan),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Licenses"
        description="The current revision of every customer license."
        action={
          can(user, "manageLicenses") && (
            <Link href="/licenses/new" className={buttonClass()}>
              <Plus /> Create license
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Active" value={count("active")} />
        <Kpi label="Expiring" value={count("expiring")} tone={count("expiring") ? "warn" : undefined} />
        <Kpi label="Grace" value={count("grace")} tone={count("grace") ? "warn" : undefined} />
        <Kpi label="Read-only" value={count("readonly")} tone={count("readonly") ? "danger" : undefined} />
        <Kpi label="Locked" value={count("locked")} tone={count("locked") ? "danger" : undefined} />
        <Kpi label="Suspended" value={count("suspended")} tone={count("suspended") ? "danger" : undefined} />
        <Kpi label="Drafts" value={count("draft")} tone={count("draft") ? "warn" : undefined} />
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="Search tenant or license number…" className="w-72" />
        <Select name="type" defaultValue={type} className="w-40">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="plan" defaultValue={plan} className="w-40">
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.code}>
              {p.display_name}
            </option>
          ))}
        </Select>
        <Select name="state" defaultValue={state} className="w-40">
          <option value="">All states</option>
          {(["draft", "active", "expiring", "grace", "readonly", "locked", "suspended", "revoked"] as DisplayState[]).map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </Select>
        <button className={buttonClass("outline")}>Filter</button>
        {(q || state || type || plan) && (
          <Link href="/licenses" className={buttonClass("ghost")}>
            Clear
          </Link>
        )}
      </form>

      {licenses.length === 0 ? (
        <Empty>
          No licenses yet. <Link href="/tenants" className="font-medium text-primary underline">Onboard a tenant first</Link>.
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Renewal date</Th>
              <Th className="text-right">Contract value</Th>
              <Th>Licenses</Th>
              <Th>Owner</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="hover:bg-muted/50">
                <Td>
                  <div className="font-semibold">{l.tenant.display_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.number} · {l.plan?.display_name ?? "Custom"} · rev {l.revision}
                  </div>
                </Td>
                <Td>{TYPE_LABEL[l.type]}</Td>
                <Td>
                  <StateBadge state={l.state} days={l.daysToExpiry} />
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {fmtDate(l.valid_until)}
                  </span>
                </Td>
                <Td className="text-right font-semibold tabular-nums">
                  {fmtMoney(l.subscription?.net_amount, l.subscription?.currency ?? "USD")}
                </Td>
                <Td>
                  <div className="tabular-nums">{l.limit_users === null ? "Unlimited" : `${l.limit_users} users`}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {l.limit_viewers === null ? "unlimited" : l.limit_viewers} viewers · {fmtLimit(l.limit_projects).toLowerCase()} projects
                  </div>
                </Td>
                <Td>{l.ownerName ?? <span className="text-muted-foreground">—</span>}</Td>
                <Td className="text-right">
                  <Link href={`/licenses/${l.id}`} className="text-sm font-medium text-primary hover:underline">
                    {l.status === "draft" ? "Sign" : "View"}
                  </Link>
                </Td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <Td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No license matches.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
    </div>
  );
}
