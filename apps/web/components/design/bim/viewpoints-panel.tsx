"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Bookmark, Plus, Trash2 } from "lucide-react";
import type { BimViewpoint } from "@/lib/design/bim/bim-types";

interface ViewpointsPanelProps {
  modelId: string;
}

export function ViewpointsPanel({ modelId }: ViewpointsPanelProps) {
  const [viewpoints, setViewpoints] = useState<BimViewpoint[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/bim/models/${modelId}/viewpoints`)
      .then((res) => res.json())
      .then((json) => setViewpoints(json.data ?? []))
      .catch(() => {});
  }, [modelId]);

  const addViewpoint = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/bim/models/${modelId}/viewpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          camera_state: { position: [0, 0, 0], target: [0, 0, 0], projection: "Perspective" },
          visibility_state: {},
        }),
      });
      const json = await res.json();
      if (json.data) {
        setViewpoints((prev) => [json.data, ...prev]);
        setNewName("");
        setIsAdding(false);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold text-gray-200 hover:text-white"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Bookmark className="h-4 w-4" />
        Viewpoints
        <span className="ml-auto text-xs text-gray-500">{viewpoints.length}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {isAdding ? (
            <div className="flex gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Viewpoint name"
                className="h-7 text-xs bg-gray-700 border-gray-600"
                onKeyDown={(e) => e.key === "Enter" && addViewpoint()}
              />
              <Button size="sm" className="h-7 px-2" onClick={addViewpoint}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setIsAdding(false)}>Cancel</Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="w-full text-xs text-gray-400 hover:text-white"
            >
              <Plus className="h-3 w-3 mr-1" /> Save Current View
            </Button>
          )}

          {viewpoints.map((vp) => (
            <div
              key={vp.id}
              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-700 cursor-pointer text-xs text-gray-300"
            >
              <Bookmark className="h-3 w-3 shrink-0 text-gray-500" />
              <span className="truncate">{vp.name}</span>
              <span className="ml-auto text-[10px] text-gray-600">
                {new Date(vp.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
