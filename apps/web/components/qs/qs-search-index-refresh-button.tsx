"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshQsSearchIndex } from "@/lib/qs-library-search";

// Fills missing embeddings for the QS library search index (rows added or
// edited since the last refresh). Keyword search works without it; this only
// improves meaning-based matches such as "drywall" finding gypsum board.
export function QsSearchIndexRefreshButton() {
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const { embedded, remaining } = await refreshQsSearchIndex();
      if (remaining && remaining > 0) {
        toast.message(`Search index updated for ${embedded} item${embedded !== 1 ? "s" : ""}; ${remaining} still pending — run again to finish.`);
      } else {
        toast.success(embedded > 0 ? `Search index updated for ${embedded} item${embedded !== 1 ? "s" : ""}` : "Search index is up to date");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search index refresh failed", {
        description: "Keyword search still works; only meaning-based matching is affected.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleClick()}
      disabled={running}
      className="whitespace-nowrap"
      title="Update smart search for items added or edited since the last refresh"
    >
      {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
      Refresh search
    </Button>
  );
}
