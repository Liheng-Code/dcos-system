import Link from "next/link";
import { Plus } from "lucide-react";
import { can, requireHqUser } from "@/lib/auth";
import { allDeployments, allTenants, currentLicenses } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { buttonClass, Empty, PageHeader, StateBadge, Table, Td, Th } from "@/components/ui";

const STATUS_LABEL = { prospect: "Prospect", trial: "Trial", customer: "Customer", suspended: "Suspended", churned: "Churned" };

export default async function TenantsPage() {
  const user = await requireHqUser();
  const [tenants, deployments, licenses] = await Promise.all([allTenants(), allDeployments(), currentLicenses()]);

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="DCOS customers and the deployments they run."
        action={
          can(user, "manageTenants") && (
            <Link href="/tenants/new" className={buttonClass()}>
              <Plus /> New tenant
            </Link>
          )
        }
      />
      {tenants.length === 0 ? (
        <Empty>Add your first tenant.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Deployments</Th>
              <Th>License</Th>
              <Th>Since</Th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const lic = licenses.find((l) => l.tenant_id === t.id);
              return (
                <tr key={t.id} className="hover:bg-muted/50">
                  <Td className="font-mono text-xs">{t.code}</Td>
                  <Td>
                    <Link href={`/tenants/${t.id}`} className="font-medium text-primary hover:underline">
                      {t.display_name}
                    </Link>
                  </Td>
                  <Td>{STATUS_LABEL[t.status]}</Td>
                  <Td>{deployments.filter((d) => d.tenant_id === t.id).length}</Td>
                  <Td>
                    {lic ? (
                      <span className="flex items-center gap-2">
                        {lic.plan?.display_name ?? "Custom"} <StateBadge state={lic.state} days={lic.daysToExpiry} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </Td>
                  <Td>{fmtDate(t.created_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
