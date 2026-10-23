import { requireHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { Empty, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function AuditPage() {
  await requireHqUser();
  const db = serviceClient();
  const [{ data: rows }, { data: staff }, { data: tenants }] = await Promise.all([
    db.from("hq_audit_log").select("*").order("occurred_at", { ascending: false }).limit(200),
    db.from("hq_users").select("auth_user_id, display_name"),
    db.from("tenants").select("id, display_name"),
  ]);
  const who = new Map((staff ?? []).map((s) => [s.auth_user_id, s.display_name]));
  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.display_name]));

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" description="Every HQ action, newest first (last 200). Entries cannot be edited or deleted." />
      {(rows ?? []).length === 0 ? (
        <Empty>No actions recorded yet.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Tenant</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(r.occurred_at)}</Td>
                <Td>{who.get(r.actor_id) ?? "—"}</Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td>{r.tenant_id ? tenantName.get(r.tenant_id) ?? "—" : "—"}</Td>
                <Td className="max-w-md truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(r.after)}>
                  {r.after ? JSON.stringify(r.after) : ""}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
