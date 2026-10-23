import { can, requireHqUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import type { SigningKey } from "@/lib/types";
import { Card, CardTitle, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { KeyStatusSelect, RegisterKeyForm } from "@/components/key-forms";

// Design 9.1.12. Only public keys live here; the private key stays in the
// owner's encrypted file and is used in the browser when signing.
export default async function KeysPage() {
  const user = await requireHqUser();
  const { data } = await serviceClient().from("signing_keys").select("*").order("activated_at", { ascending: false });
  const keys = (data ?? []) as SigningKey[];
  const manage = can(user, "manageKeys");

  return (
    <div className="space-y-5">
      <PageHeader title="Signing Keys" description="Public halves of the keys that sign licenses. No private key is ever stored or shown." />

      {keys.length === 0 ? (
        <Empty>No key registered. Licenses cannot be signed until one is.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Key id</Th>
              <Th>Public key</Th>
              <Th>Kind</Th>
              <Th>Registered</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <Td className="font-mono text-xs">{k.kid}</Td>
                <Td className="font-mono text-xs">{k.public_key}</Td>
                <Td>{k.dev_only ? "Development" : "Production"}</Td>
                <Td>{fmtDateTime(k.activated_at)}</Td>
                <Td>{manage ? <KeyStatusSelect id={k.id} status={k.status} /> : k.status}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {manage && (
        <Card>
          <CardTitle>Register a key</CardTitle>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              On your own computer run{" "}
              <code className="rounded bg-muted px-1">node scripts/licensing/new-signing-key.mjs --kid hq-2026-01 --out &lt;USB&gt;/dcos-signing-hq-2026-01.key.json</code>
            </li>
            <li>Paste the printed key id and x value here, and into apps/web/lib/licensing/keys.ts.</li>
            <li>Release the DCOS app with the new key before signing customer licenses with it.</li>
          </ol>
          <RegisterKeyForm />
        </Card>
      )}
    </div>
  );
}
