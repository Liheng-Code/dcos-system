"use client";

import { useEffect, useState, useMemo } from "react";
import { getCompany, updateCompanyById } from "@/lib/settings/settings-queries";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DATE_FORMAT_PRESETS, DEFAULT_DATE_FORMAT_ID } from "@/lib/date-format";

interface Company {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_id: string | null;
  description: string | null;
  date_format: string | null;
}

interface FormData {
  name: string;
  code: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_id: string;
  description: string;
  date_format: string;
}

export function CompanyProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<FormData>({
    name: "",
    code: "",
    logo_url: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    tax_id: "",
    description: "",
    date_format: DEFAULT_DATE_FORMAT_ID,
  });

  useEffect(() => {
    getCompany().then(({ data, error }) => {
      if (data) {
        setCompany(data as Company);
        setForm({
          name: data.name,
          code: data.code,
          logo_url: data.logo_url ?? "",
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          website: data.website ?? "",
          tax_id: data.tax_id ?? "",
          description: data.description ?? "",
          date_format: data.date_format ?? DEFAULT_DATE_FORMAT_ID,
        });
      } else if (error?.code !== "PGRST116") {
        toast.error("Failed to load company profile");
      }
      setLoading(false);
    });
  }, []);

  const isDirty = useMemo(() => {
    if (!company) return false;
    return (
      form.name !== company.name ||
      form.code !== company.code ||
      form.logo_url !== (company.logo_url ?? "") ||
      form.address !== (company.address ?? "") ||
      form.phone !== (company.phone ?? "") ||
      form.email !== (company.email ?? "") ||
      form.website !== (company.website ?? "") ||
      form.tax_id !== (company.tax_id ?? "") ||
      form.description !== (company.description ?? "") ||
      form.date_format !== (company.date_format ?? DEFAULT_DATE_FORMAT_ID)
    );
  }, [form, company]);

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!company) return;
    setSaving(true);
    const payload = {
      name: form.name,
      code: form.code,
      logo_url: form.logo_url || null,
      address: form.address || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      tax_id: form.tax_id || null,
      description: form.description || null,
      date_format: form.date_format,
    };
    const { error } = await updateCompanyById(payload, company.id);
    if (error) {
      toast.error(error.message);
    } else {
      setCompany((prev) => prev ? { ...prev, ...payload } : null);
      toast.success("Company profile updated");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Company Information</h2>
          <Button onClick={handleSave} disabled={!isDirty || saving} size="sm">
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name" required>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </Field>
            <Field label="Company Code" required>
              <input
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
              />
            </Field>
          </div>
          <Field label="Tax ID / Registration No.">
            <input
              value={form.tax_id}
              onChange={(e) => update("tax_id", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
            />
          </Field>
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Address">
                <textarea
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Website">
                <input
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </Field>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <Field label="Logo URL">
              <input
                value={form.logo_url}
                onChange={(e) => update("logo_url", e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </Field>
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Regional</h3>
            <Field label="Date format">
              <select
                value={form.date_format}
                onChange={(e) => update("date_format", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                {DATE_FORMAT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Default date display across the app. Anyone can override this for themselves from the schedule&apos;s Columns menu.
              </span>
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
