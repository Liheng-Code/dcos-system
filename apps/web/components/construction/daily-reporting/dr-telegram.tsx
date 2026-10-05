"use client";

// Daily Reporting setup — Telegram groups (design §7.4). One active group per
// reporting unit. The group is only an entry point and a place for status
// lines; being in it grants nothing.

import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listTelegramBindings,
  startTelegramBinding,
  telegramBindingAction,
  type NewTelegramBinding,
  type TelegramBinding,
} from "@/lib/construction/daily-reporting/service";
import type { ReportingUnit } from "@/lib/construction/daily-reporting/types";
import { Flag, SectionCard } from "./dr-ui";

const STATUS_TONE = { Active: "good", Pending: "info", Suspended: "bad", Migrated: "neutral", Unbound: "neutral" } as const;

export function DrTelegramBindings({ projectId, units, canManage }: { projectId: string; units: ReportingUnit[]; canManage: boolean }) {
  const [bindings, setBindings] = useState<TelegramBinding[] | null>(null);
  const [code, setCode] = useState<(NewTelegramBinding & { unitId: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listTelegramBindings(projectId)
      .then((rows) => !cancelled && setBindings(rows))
      .catch(() => !cancelled && setBindings([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, refresh]);

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await action();
      toast.success(done);
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function start(unitId: string) {
    setBusy(unitId);
    try {
      setCode({ ...(await startTelegramBinding(unitId)), unitId });
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const rows = units.filter((u) => u.status !== "Demobilised");

  return (
    <SectionCard title="Telegram groups">
      <p className="text-sm text-muted-foreground">
        Bind one Telegram group to each reporting unit. Add the DCOS bot to the group, start a binding here, then post the code in the
        group. The bot pins a Submit Daily Report button and posts one-line status updates. Being in the group gives nobody access:
        only linked reporters of the unit can open the form.
      </p>

      {bindings === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Create a reporting unit first.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((unit) => {
            const current = bindings.find((b) => b.unit_id === unit.id && b.status !== "Pending");
            const migrated = bindings.find((b) => b.unit_id === unit.id && b.status === "Pending" && b.migrated_from_chat_id !== null);
            const shown = code?.unitId === unit.id ? code : null;
            return (
              <li key={unit.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">
                      {unit.unit_code} {unit.display_name}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {current ? current.chat_title || "Telegram group" : migrated ? "Group upgraded by Telegram" : "No group"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {current ? <Flag tone={STATUS_TONE[current.status]}>{current.status}</Flag> : null}
                    {migrated ? <Flag tone="warn">Confirm new group</Flag> : null}
                    {canManage && migrated ? (
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => run(migrated.id, () => telegramBindingAction(migrated.id, "confirm_migration"), "Group confirmed.")}
                      >
                        Confirm
                      </Button>
                    ) : null}
                    {canManage && current?.status === "Active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => run(current.id, () => telegramBindingAction(current.id, "reissue_launch"), "A new button was posted in the group.")}
                      >
                        Re-issue button
                      </Button>
                    ) : null}
                    {canManage && (current || migrated) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => {
                          const target = (current ?? migrated)!;
                          if (!window.confirm("Unbind this group? Its Submit Daily Report button will stop working.")) return;
                          void run(target.id, () => telegramBindingAction(target.id, "unbind"), "Group unbound.");
                        }}
                      >
                        Unbind
                      </Button>
                    ) : null}
                    {canManage && unit.status !== "Demobilised" ? (
                      <Button size="sm" variant={current ? "outline" : "default"} disabled={busy !== null} onClick={() => start(unit.id)}>
                        {busy === unit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : current ? "Change group" : "Bind a group"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {current && !current.bot_present ? (
                  <p className="text-xs text-red-600">The bot was removed from this group. Add it back to restore the button and status updates.</p>
                ) : null}

                {shown ? (
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                    <p>
                      Post this in the group within 30 minutes (until {new Date(shown.expires_at).toLocaleTimeString()}). It works once and
                      is not shown again.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="rounded bg-background px-2 py-1 font-mono text-base">{shown.command}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(shown.command).then(() => toast.success("Copied."))}
                      >
                        <Copy className="mr-1 h-4 w-4" /> Copy
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
