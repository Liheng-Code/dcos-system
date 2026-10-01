"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { getProfileById } from "@/lib/hr/hr-queries";

const LINK_CODE_ENDPOINT = "/api/hr/attendance/telegram/link-code";

interface LinkCodeResponse {
  code: string;
  expires_at: string;
  bot_username: string;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TelegramLinkCard() {
  const [checking, setChecking] = useState(true);
  const [linked, setLinked] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [linkData, setLinkData] = useState<LinkCodeResponse | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    async function checkLinkStatus() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setChecking(false);
        return;
      }
      const { data } = await getProfileById(user.id, "telegram_user_id");
      setLinked(!!data?.telegram_user_id);
      setChecking(false);
    }
    checkLinkStatus();
  }, []);

  useEffect(() => {
    if (!linkData) return;
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [linkData]);

  async function requestLinkCode() {
    setRequesting(true);
    try {
      const res = await fetch(LINK_CODE_ENDPOINT, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        toast.error(data?.error ?? "Failed to generate link code");
        return;
      }
      setLinkData(data as LinkCodeResponse);
      setNowTs(Date.now());
    } catch {
      toast.error("Failed to generate link code");
    } finally {
      setRequesting(false);
    }
  }

  const remainingMs = linkData
    ? new Date(linkData.expires_at).getTime() - nowTs
    : 0;
  const expired = !!linkData && remainingMs <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4" />
          Telegram Check-in
        </CardTitle>
        <CardDescription>
          Link your Telegram account to check in and out via chat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {checking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking status…
          </div>
        ) : linked ? (
          <div className="space-y-2">
            <Badge className="bg-green-600 text-white border-0 hover:bg-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Telegram linked
            </Badge>
            <p className="text-sm text-muted-foreground">
              Send <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/checkin</code> or{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/checkout</code> to the bot anytime.
            </p>
          </div>
        ) : !linkData ? (
          <Button onClick={requestLinkCode} disabled={requesting}>
            {requesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Link Telegram
          </Button>
        ) : expired ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Code expired.</p>
            <Button onClick={requestLinkCode} disabled={requesting} variant="outline">
              {requesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Generate a new code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
              <p className="text-3xl font-bold tabular-nums font-mono tracking-widest">
                {linkData.code}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expires in {formatCountdown(remainingMs)}
              </p>
            </div>

            <a
              href={`https://t.me/${linkData.bot_username}?start=link_${linkData.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
              Open in Telegram
            </a>

            <p className="text-xs text-muted-foreground">
              Or open a chat with @{linkData.bot_username} and send:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                /link {linkData.code}
              </code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
