"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Check, MessageSquare, Loader2, User, Clock, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { insertSubmittalComment, listSubmittalCommentsBySubmittalId, updateSubmittalCommentById } from "@/lib/documents/documents-queries";

export interface CommentRow {
  id: string;
  submittal_id: string;
  revision_code: string;
  item_reference: string | null;
  consultant_comment: string;
  commented_by: string | null;
  commented_at: string;
  contractor_response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  resolved: boolean;
  verified_by: string | null;
  verified_at: string | null;
  commenter?: { full_name: string } | null;
  responder?: { full_name: string } | null;
}

interface CommentResolutionSheetProps {
  submittalId: string;
  revisionCode: string;
  isConsultantReviewer?: boolean;
}

export function CommentResolutionSheet({ submittalId, revisionCode }: CommentResolutionSheetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [newRef, setNewRef] = useState("");
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editResponse, setEditResponse] = useState("");

  function fetchComments() {
    listSubmittalCommentsBySubmittalId(submittalId)
      .then(({ data, error }) => {
        if (!error && data) {
          setComments(data as CommentRow[]);
        }
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchComments();
  }, [submittalId, revisionCode, supabase]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    const { error } = await insertSubmittalComment({
      submittal_id: submittalId,
      revision_code: revisionCode,
      item_reference: newRef.trim() || null,
      consultant_comment: newComment.trim(),
      commented_by: userId,
      resolved: false,
    });

    if (error) {
      toast.error("Failed to add comment: " + error.message);
    } else {
      toast.success("Consultant comment logged to CRS");
      setNewRef("");
      setNewComment("");
      setShowAddModal(false);
      fetchComments();
    }
    setSaving(false);
  }

  async function handleSaveResponse(commentId: string) {
    if (!editResponse.trim()) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    const { error } = await updateSubmittalCommentById({
        contractor_response: editResponse.trim(),
        responded_by: userId,
        responded_at: new Date().toISOString(),
        resolved: true,
      }, commentId);

    if (error) {
      toast.error("Failed to save response: " + error.message);
    } else {
      toast.success("Contractor response recorded");
      setEditingId(null);
      setEditResponse("");
      fetchComments();
    }
  }

  async function toggleResolved(comment: CommentRow) {
    const nextVal = !comment.resolved;
    const { error } = await updateSubmittalCommentById({ resolved: nextVal }, comment.id);

    if (error) {
      toast.error(error.message);
    } else {
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, resolved: nextVal } : c))
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <div className="space-y-4">
      {/* CRS Header & Progress */}
      <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Comment Resolution Sheet (CRS)</h4>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono font-medium text-primary">
              Rev: {revisionCode}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {comments.length === 0
              ? "No consultant comments recorded for this submittal."
              : `${resolvedCount} of ${comments.length} comments addressed (${Math.round((resolvedCount / comments.length) * 100)}%)`}
          </p>
        </div>

        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Consultant Comment
        </Button>
      </div>

      {/* Add Comment Inline / Modal Form */}
      {showAddModal && (
        <form onSubmit={handleAddComment} className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Record New Consultant Comment (Review Note)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Item Reference</label>
              <input
                value={newRef}
                onChange={(e) => setNewRef(e.target.value)}
                placeholder="e.g. DWG A-102 Detail 3"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-hidden focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-foreground">Consultant Comment Text *</label>
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="e.g. Clarify flashing waterproofing detail at parapet junction."
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-hidden focus:border-primary"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !newComment.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save Comment
            </Button>
          </div>
        </form>
      )}

      {/* Comments List / Table */}
      {comments.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-xs font-medium text-foreground">Clean Submittal Sheet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            No consultant exceptions or revisions requested yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border p-3.5 transition-colors",
                item.resolved ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200 bg-amber-50/20"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleResolved(item)}
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      item.resolved
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 hover:border-slate-400 bg-white"
                    )}
                  >
                    {item.resolved && <Check className="h-3 w-3 stroke-[3]" />}
                  </button>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-foreground font-mono">#{idx + 1}</span>
                      {item.item_reference && (
                        <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[11px] font-semibold text-foreground">
                          {item.item_reference}
                        </span>
                      )}
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {item.revision_code}
                      </span>
                    </div>

                    {/* Consultant Comment */}
                    <p className="text-xs text-foreground font-medium bg-background/60 p-2 rounded border border-border/50">
                      <span className="font-semibold text-amber-700 mr-1.5">Consultant:</span>
                      {item.consultant_comment}
                    </p>

                    {/* Contractor Response */}
                    {item.contractor_response ? (
                      <div className="text-xs text-foreground bg-emerald-500/10 p-2 rounded border border-emerald-200/50">
                        <span className="font-semibold text-emerald-800 mr-1.5">Contractor Response:</span>
                        <span>{item.contractor_response}</span>
                        {item.responder?.full_name && (
                          <span className="text-[10px] text-muted-foreground ml-2">
                            — {item.responder.full_name}
                          </span>
                        )}
                      </div>
                    ) : (
                      editingId !== item.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditResponse("");
                          }}
                          className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                        >
                          + Write Contractor Response / Action Taken
                        </button>
                      )
                    )}

                    {/* Response Input Editor */}
                    {editingId === item.id && (
                      <div className="pt-1.5 space-y-2">
                        <textarea
                          value={editResponse}
                          onChange={(e) => setEditResponse(e.target.value)}
                          placeholder="Describe action taken, specification update, or drawing modification..."
                          rows={2}
                          className="w-full rounded-md border border-border bg-background p-2 text-xs outline-hidden focus:border-primary resize-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleSaveResponse(item.id)}
                            disabled={!editResponse.trim()}
                          >
                            Save Response
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                      item.resolved
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    )}
                  >
                    {item.resolved ? "Addressed" : "Pending"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
