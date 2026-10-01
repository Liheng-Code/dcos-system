"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Bell, Mail, Send, GanttChartSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getProfileById, updateProfileById } from "@/lib/settings/settings-queries";

interface NotificationPreferences {
  email: boolean;
  telegram: boolean;
  telegram_chat_id: string | null;
  /** Schedule alerts (critical path, overrun, float consumed…) — defaults to the general email toggle until set. */
  schedule_alerts_email?: boolean;
}

export function NotificationPreferencesPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    email: true,
    telegram: false,
    telegram_chat_id: null,
    schedule_alerts_email: true,
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data: profile } = await getProfileById(user.id, "notification_preferences");

      if (profile?.notification_preferences) {
        setPrefs((p) => ({ ...p, ...(profile.notification_preferences as NotificationPreferences) }));
      }
      setLoading(false);
    })();
  }, [supabase]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const { error } = await updateProfileById({ notification_preferences: prefs }, userId);
    if (error) toast.error(error.message);
    else toast.success("Notification preferences saved");
    setSaving(false);
  }

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4 text-muted-foreground" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between space-y-5">
        {/* Email */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">Receive task alerts via email</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={prefs.email}
              onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="h-5 w-9 rounded-full bg-orange-200 transition-colors peer-checked:bg-orange-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        <hr className="border-border" />

        {/* Planning schedule alerts */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <GanttChartSquare className="mt-0.5 h-4 w-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">Schedule alert emails</p>
              <p className="text-xs text-muted-foreground">Critical path changes, programme overrun, float consumed on your projects</p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={prefs.schedule_alerts_email ?? prefs.email}
              onChange={(e) => setPrefs((p) => ({ ...p, schedule_alerts_email: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="h-5 w-9 rounded-full bg-orange-200 transition-colors peer-checked:bg-orange-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        <hr className="border-border" />

        {/* Telegram */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Send className="mt-0.5 h-4 w-4 text-slate-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">Telegram notifications</p>
                <p className="text-xs text-muted-foreground">Receive alerts via Telegram bot</p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={prefs.telegram}
                onChange={(e) => setPrefs((p) => ({ ...p, telegram: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="h-5 w-9 rounded-full bg-orange-200 transition-colors peer-checked:bg-orange-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>
          {prefs.telegram && (
            <div className="space-y-1.5 pl-7">
              <Label className="text-xs">Telegram Chat ID</Label>
              <input
                type="text"
                value={prefs.telegram_chat_id ?? ""}
                onChange={(e) => setPrefs((p) => ({ ...p, telegram_chat_id: e.target.value || null }))}
                placeholder="e.g. 123456789"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground">
                Start a chat with @DCOSNotifyBot and send /start to get your Chat ID.
              </p>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="rounded-lg">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
