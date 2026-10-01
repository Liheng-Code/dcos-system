"use client";

import { useEffect, useState } from "react";
import { insertDesignReviewComment, listDesignReviewCommentsByEntityTypeAndEntityId, updateDesignReviewCommentById } from "@/lib/design/design-queries";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Comment {
  id: string; comment: string; comment_type: string;
  resolved: boolean; created_at: string; created_by: string | null;
}

export function DesignReviewComments({ entityType, entityId, discipline }: { entityType: string; entityId: string; discipline: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState("general");
  const [projectId, setProjectId] = useState("");

  function load() {
    listDesignReviewCommentsByEntityTypeAndEntityId(entityType, entityId).then(({ data }) => {
      if (data) setComments(data as Comment[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [entityId]);

  async function handleAdd() {
    if (!newComment.trim()) return;
    const { error } = await insertDesignReviewComment({
      project_id: projectId || crypto.randomUUID(),
      discipline, entity_type: entityType, entity_id: entityId,
      comment: newComment.trim(), comment_type: commentType,
    });
    if (error) { toast.error(error.message); return; }
    setNewComment("");
    toast.success("Comment added");
    load();
  }

  async function handleResolve(id: string) {
    await updateDesignReviewCommentById({ resolved: true }, id);
    load();
  }

  if (loading) return <Loader2 className="h-4 w-4 animate-spin" />;

  const typeColors: Record<string, string> = { general: "bg-gray-100 text-gray-600", internal_review: "bg-blue-100 text-blue-700", client_review: "bg-purple-100 text-purple-700", coordination: "bg-orange-100 text-orange-700", approval: "bg-green-100 text-green-700" };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" value={commentType} onChange={e => setCommentType(e.target.value)}>
          <option value="general">General</option>
          <option value="internal_review">Internal Review</option>
          <option value="client_review">Client Review</option>
          <option value="coordination">Coordination</option>
          <option value="approval">Approval</option>
        </select>
        <Input className="flex-1 h-9 text-sm" placeholder="Add a comment..." value={newComment} onChange={e => setNewComment(e.target.value)} />
        <Button size="sm" className="h-9" onClick={handleAdd}>Add</Button>
      </div>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No comments yet.</p>
      ) : comments.map(c => (
        <div key={c.id} className={`rounded-lg border p-3 text-sm ${c.resolved ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`border-0 text-[9px] ${typeColors[c.comment_type] || ""}`}>{c.comment_type}</Badge>
            <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
            {!c.resolved && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] ml-auto" onClick={() => handleResolve(c.id)}>Resolve</Button>
            )}
            {c.resolved && <Badge className="bg-green-100 text-green-700 border-0 text-[9px] ml-auto">Resolved</Badge>}
          </div>
          <p className="text-xs whitespace-pre-wrap">{c.comment}</p>
        </div>
      ))}
    </div>
  );
}
