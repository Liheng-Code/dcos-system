"use client";

// Lets a reporter link their Telegram account to their DCOS user, so the
// Daily Reporting bot knows who opened the form from a project group and can
// message them when a report is returned. Shown until the account is linked.

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isTelegramLinked, requestTelegramLinkCode } from "@/lib/construction/daily-reporting/service";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_DR_BOT_USERNAME ?? "";

export function DrTelegramLink({ userId }: { userId: string | null }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    isTelegramLinked(userId)
      .then((v) => !cancelled && setLinked(v))
      .catch(() => !cancelled && setLinked(null));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Unknown (lookup failed) or already linked: nothing to offer.
  if (!userId || linked !== false) return null;

  async function start() {
    setBusy(true);
    try {
      setCode(await requestTelegramLinkCode());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      {code ? (
        <div className="space-y-1">
          <p>
            Send this to the DCOS site report bot{BOT_USERNAME ? ` (@${BOT_USERNAME})` : ""} in a private chat, within 10 minutes:
          </p>
          <code className="inline-block rounded bg-muted px-2 py-1 font-mono text-base">/link {code.code}</code>
          {BOT_USERNAME ? (
            <p>
              <a
                className="text-primary underline"
                href={`https://t.me/${BOT_USERNAME}?start=link_${code.code}`}
                target="_blank"
                rel="noreferrer"
              >
                Or open Telegram and link in one tap
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Link your Telegram account to open the report from your project group and to be messaged when a report is returned.
        </p>
      )}
      <div className="flex gap-2">
        {code ? (
          <Button size="sm" variant="outline" onClick={() => isTelegramLinked(userId).then(setLinked)}>
            I have sent it
          </Button>
        ) : null}
        <Button size="sm" variant={code ? "outline" : "default"} disabled={busy} onClick={start}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          {code ? "New code" : "Link Telegram"}
        </Button>
      </div>
    </div>
  );
}
