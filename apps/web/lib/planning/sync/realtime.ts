// Server-side broadcast helper. After a sync commit the server publishes an
// event on the project channel so open Gantt / look-ahead views can refetch.
// Uses the broadcast API of the admin client — send failures are non-fatal.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function broadcastScheduleSync(
  supabase: SupabaseClient,
  projectId: string,
  payload: { sessionId: string; direction: "import" | "export" },
) {
  try {
    const channel = supabase.channel(`planning-sync:project:${projectId}`);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "schedule_synced",
          payload: { ...payload, at: new Date().toISOString() },
        });
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await supabase.removeChannel(channel);
  } catch {
    // Realtime is best-effort; the UI refetches on commit regardless.
  }
}
