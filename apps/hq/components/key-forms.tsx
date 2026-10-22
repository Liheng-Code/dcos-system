"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registerKey, setKeyStatus } from "@/app/actions/catalogue";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";

export function RegisterKeyForm() {
  const router = useRouter();
  const [kid, setKid] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [devOnly, setDevOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await registerKey({ kid, public_key: publicKey, dev_only: devOnly });
      if (!res.ok) return setError(res.error);
      toast.success(`Key ${kid} registered.`);
      setKid("");
      setPublicKey("");
      setError(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
      <Field label="Key id (kid)">
        <Input required value={kid} onChange={(e) => setKid(e.target.value)} placeholder="hq-2026-01" />
      </Field>
      <Field label="Public key (x)">
        <Input required className="font-mono text-xs" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
      </Field>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <input type="checkbox" checked={devOnly} onChange={(e) => setDevOnly(e.target.checked)} /> Development key
      </label>
      <div className="sm:col-span-3 flex items-center justify-end gap-3">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={pending}>
          Register public key
        </Button>
      </div>
    </form>
  );
}

export function KeyStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      className="w-auto py-1 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        if (next === "compromised" && !confirm("Mark this key compromised? Licenses it signed must be re-issued with another key.")) return;
        start(async () => {
          const res = await setKeyStatus({ id, status: next });
          if (!res.ok) toast.error(res.error);
          router.refresh();
        });
      }}
    >
      {["active", "retiring", "retired", "compromised"].map((s) => (
        <option key={s} value={s}>
          {s[0].toUpperCase() + s.slice(1)}
        </option>
      ))}
    </Select>
  );
}
