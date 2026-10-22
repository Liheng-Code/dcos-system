"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, FileKey2, PauseCircle, PlayCircle, RefreshCw, Ban, Shuffle, Trash2 } from "lucide-react";
import { discardDraft, draftStateChange, markTokenDelivered, prepareSigning, submitSignedToken } from "@/app/actions/licenses";
import { parseKeyFile, signClaims } from "@/lib/signing/key-file";
import { Button, buttonClass, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

// Sign & issue: the key file and passphrase stay in this browser tab.
export function SignPanel({ licenseId, number, revision }: { licenseId: string; number: string; revision: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function sign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose your signing key file.");
        const envelope = parseKeyFile(await file.text());

        setStep("Preparing the license…");
        const prepared = await prepareSigning({ licenseId });
        if (!prepared.ok) throw new Error(prepared.error);
        const key = prepared.data.keys.find((k) => k.kid === envelope.kid);
        if (!key) throw new Error(`Key ${envelope.kid} is not registered as active in HQ (see Signing Keys).`);

        setStep("Unlocking the key and signing (a few seconds)…");
        const token = await signClaims(envelope, passphrase, prepared.data.claims, key.x);

        setStep("Verifying and issuing…");
        const issued = await submitSignedToken({ licenseId, token });
        if (!issued.ok) throw new Error(issued.error);
        toast.success(`${number} revision ${revision} issued.`);
        setPassphrase("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Signing failed.");
      } finally {
        setStep(null);
      }
    });
  }

  return (
    <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/30">
      <form onSubmit={sign} className="space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <FileKey2 className="h-4 w-4" /> Sign and issue revision {revision}
        </div>
        <p className="text-sm text-muted-foreground">
          Your key file and passphrase are used in this browser only. HQ receives the signed license, checks the signature against
          the registered public key, and checks it matches this draft exactly.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signing key file" hint="dcos-signing-<kid>.key.json">
            <input ref={fileRef} type="file" accept=".json,application/json" className="text-sm" />
          </Field>
          <Field label="Passphrase">
            <Input type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </Field>
        </div>
        {step && <p className="text-sm text-sky-800 dark:text-sky-300">{step}</p>}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !passphrase}>
            {pending ? "Signing…" : "Sign and issue"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function DiscardDraftButton({ licenseId, backTo }: { licenseId: string; backTo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("Discard this draft? It is kept in the history as discarded.")) return;
        start(async () => {
          const res = await discardDraft({ licenseId });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Draft discarded.");
          router.push(backTo);
          router.refresh();
        });
      }}
    >
      <Trash2 /> Discard draft
    </Button>
  );
}

type StateAction = "suspend" | "resume" | "revoke";

// Renew, Change plan, Suspend, Resume, Revoke on the live revision (design 9.1.3).
export function LiveLicenseActions({ licenseId, number, hqState }: { licenseId: string; number: string; hqState: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<StateAction | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"readonly" | "locked">("readonly");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    start(async () => {
      const res = await draftStateChange({ licenseId, action: open, reason, suspendMode: mode, notice: notice || undefined });
      if (!res.ok) return setError(res.error);
      toast.success("Draft revision saved. Sign it to apply.");
      router.push(`/licenses/${res.data.id}`);
    });
  }

  const titles: Record<StateAction, string> = {
    suspend: "Suspend license",
    resume: "Resume license",
    revoke: "Revoke license",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link href={`/licenses/new?from=${licenseId}&mode=renew`} className={buttonClass("primary")}>
          <RefreshCw /> Renew
        </Link>
        <Link href={`/licenses/new?from=${licenseId}&mode=change`} className={buttonClass("outline")}>
          <Shuffle /> Change plan / entitlements
        </Link>
        {hqState === "suspended" ? (
          <Button variant="outline" onClick={() => setOpen("resume")}>
            <PlayCircle /> Resume
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setOpen("suspend")}>
            <PauseCircle /> Suspend
          </Button>
        )}
        <Button variant="outline" className="text-red-700 dark:text-red-400" onClick={() => setOpen("revoke")}>
          <Ban /> Revoke
        </Button>
      </div>

      {open && (
        <Card className="border-amber-200 dark:border-amber-900">
          <form onSubmit={submit} className="space-y-3">
            <div className="font-semibold">{titles[open]}</div>
            <p className="text-sm text-muted-foreground">
              This drafts a new signed revision. It takes effect on the customer&apos;s deployment once the token is installed there
              (automatic delivery arrives with heartbeats in Phase 3).
            </p>
            {open === "suspend" && (
              <Field label="While suspended">
                <Select value={mode} onChange={(e) => setMode(e.target.value as "readonly" | "locked")}>
                  <option value="readonly">Read-only: users can view and export</option>
                  <option value="locked">Locked: only administrators can sign in</option>
                </Select>
              </Field>
            )}
            <Field label="Reason (internal)" hint="At least 15 characters.">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {open !== "resume" && (
              <Field label="Notice shown to the customer" hint="Neutral wording; avoid blame.">
                <Textarea rows={2} maxLength={300} value={notice} onChange={(e) => setNotice(e.target.value)} />
              </Field>
            )}
            {open === "revoke" && (
              <Field label={`Type ${number} to confirm`}>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </Field>
            )}
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={open === "resume" ? "primary" : "danger"}
                disabled={pending || reason.trim().length < 15 || (open === "revoke" && confirmText !== number)}
              >
                Draft revision
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

export function CopyTokenButton({ tokenId, token }: { tokenId: string; token: string }) {
  return (
    <Button
      variant="outline"
      className="px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(token);
        await markTokenDelivered({ tokenId });
        toast.success("License token copied. Paste it under Administration > License on the customer's DCOS.");
      }}
    >
      <Copy /> Copy token
    </Button>
  );
}
