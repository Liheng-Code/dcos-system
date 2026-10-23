"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addContact, addDeployment, createTenant, setDeploymentStatus } from "@/app/actions/tenants";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const bind = (name: keyof T) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return { values, setValues, bind };
}

export function TenantForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { values, bind } = useForm({ code: "", legal_name: "", display_name: "", country: "", billing_email: "", tax_id: "", notes: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createTenant(values);
      if (!res.ok) return setError(res.error);
      toast.success("Tenant created.");
      router.push(`/tenants/${res.data.id}`);
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Short and permanent, e.g. ABC. Goes into every license.">
          <Input required {...bind("code")} placeholder="ABC" />
        </Field>
        <Field label="Display name">
          <Input required {...bind("display_name")} placeholder="ABC Construction" />
        </Field>
        <Field label="Legal name" className="sm:col-span-2">
          <Input required {...bind("legal_name")} placeholder="ABC Construction Co., Ltd." />
        </Field>
        <Field label="Country">
          <Input {...bind("country")} placeholder="Cambodia" />
        </Field>
        <Field label="Tax id" hint="Used to stop a second trial for the same company.">
          <Input {...bind("tax_id")} />
        </Field>
        <Field label="Billing email" className="sm:col-span-2">
          <Input type="email" {...bind("billing_email")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} {...bind("notes")} />
        </Field>
        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create tenant"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

export function DeploymentForm({ tenantId, tenantCode }: { tenantId: string; tenantCode: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { values, setValues, bind } = useForm({
    deployment_code: `dep_${tenantCode.toLowerCase().replace(/[^a-z0-9]/g, "_")}_prod`,
    environment: "production",
    topology: "saas_dedicated",
    base_url: "",
    region: "",
    status: "provisioning",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addDeployment({ ...values, tenant_id: tenantId });
      if (!res.ok) return setError(res.error);
      toast.success("Deployment added.");
      setError(null);
      setValues((v) => ({ ...v, base_url: "", region: "" }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Deployment id" hint="Set as DCOS_DEPLOYMENT_ID on that deployment.">
        <Input required {...bind("deployment_code")} className="font-mono" />
      </Field>
      <Field label="Environment">
        <Select {...bind("environment")}>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="demo">Demo</option>
        </Select>
      </Field>
      <Field label="Topology">
        <Select {...bind("topology")}>
          <option value="saas_dedicated">SaaS dedicated</option>
          <option value="on_prem">On-premises</option>
        </Select>
      </Field>
      <Field label="URL" className="sm:col-span-2">
        <Input type="url" {...bind("base_url")} placeholder="https://abc.dcos.example" />
      </Field>
      <Field label="Region">
        <Input {...bind("region")} placeholder="ap-southeast-1" />
      </Field>
      <div className="sm:col-span-3 flex items-center justify-end gap-3">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add deployment"}
        </Button>
      </div>
    </form>
  );
}

export function DeploymentStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      className="w-auto py-1 text-xs"
      onChange={(e) =>
        start(async () => {
          const res = await setDeploymentStatus({ id, status: e.target.value });
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      {["provisioning", "healthy", "degraded", "unreachable", "decommissioned"].map((s) => (
        <option key={s} value={s}>
          {s[0].toUpperCase() + s.slice(1)}
        </option>
      ))}
    </Select>
  );
}

export function ContactForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { values, setValues, bind } = useForm({ name: "", email: "", phone: "", role: "license_admin" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addContact({ ...values, tenant_id: tenantId });
      if (!res.ok) return setError(res.error);
      setError(null);
      setValues({ name: "", email: "", phone: "", role: "license_admin" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <Field label="Name">
        <Input required {...bind("name")} />
      </Field>
      <Field label="Email">
        <Input type="email" {...bind("email")} />
      </Field>
      <Field label="Phone">
        <Input {...bind("phone")} />
      </Field>
      <Field label="Role">
        <Select {...bind("role")}>
          <option value="license_admin">License admin</option>
          <option value="technical">Technical</option>
          <option value="billing">Billing</option>
          <option value="executive">Executive</option>
        </Select>
      </Field>
      <div className="sm:col-span-4 flex items-center justify-end gap-3">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="outline" disabled={pending}>
          Add contact
        </Button>
      </div>
    </form>
  );
}
