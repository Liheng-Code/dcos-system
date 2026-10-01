"use client";

import { useEffect, useState } from "react";
import { insertDrawingMarkup, listDesignDrawingsOfIdAndDrawingNo, listDrawingMarkups } from "@/lib/design/design-queries";
import { Loader2, PenTool, Plus, Eye, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DrawingMarkup {
  id: string;
  drawing_id: string;
  title: string;
  markup_type: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
}

export default function DrawingMarkupPage() {
  const [markups, setMarkups] = useState<DrawingMarkup[]>([]);
  const [drawings, setDrawings] = useState<{id:string,drawing_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    drawing_id: "", title: "", description: "", markup_type: "markup",
  });

  useEffect(() => {
    listDesignDrawingsOfIdAndDrawingNo().then(({ data }) => {
      if (data) setDrawings(data);
    });
    listDrawingMarkups().then(({ data }) => {
      if (data) setMarkups(data as DrawingMarkup[]);
      setLoading(false);
    });
  }, []);

  async function handleCreate() {
    setSaving(true);
    const { error } = await insertDrawingMarkup({
      drawing_id: form.drawing_id,
      title: form.title,
      description: form.description || null,
      markup_type: form.markup_type,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Markup created");
    setShowForm(false);
    setForm({ drawing_id: "", title: "", description: "", markup_type: "markup" });
    listDrawingMarkups().then(({ data }) => {
      if (data) setMarkups(data as DrawingMarkup[]);
    });
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drawing Markup & Redline</h1>
          <p className="text-sm text-muted-foreground">Annotate, review, and track markup on drawings</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Markup
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PenTool className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{markups.length}</p>
              <p className="text-xs text-muted-foreground">Total Markups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">{markups.filter((m) => m.status === "open" || m.status === "responded").length}</p>
              <p className="text-xs text-muted-foreground">Open / Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold">{markups.filter((m) => m.status === "closed" || m.status === "accepted").length}</p>
              <p className="text-xs text-muted-foreground">Closed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Drawing *</label>
                <select value={form.drawing_id} onChange={(e) => setForm({ ...form, drawing_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select drawing...</option>
                  {drawings.map((d) => (<option key={d.id} value={d.id}>{d.drawing_no}</option>))}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.markup_type} onChange={(e) => setForm({ ...form, markup_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="markup">Markup</option>
                  <option value="redline">Redline</option>
                  <option value="as_built">As-Built</option>
                  <option value="review">Review</option>
                  <option value="comment">Comment</option>
                  <option value="approval">Approval</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.drawing_id || !form.title.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {markups.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No markups created yet
        </div>
      ) : (
        <div className="space-y-2">
          {markups.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  m.status === "open" ? "bg-amber-50 text-amber-600" :
                  m.status === "accepted" ? "bg-emerald-50 text-emerald-600" :
                  m.status === "closed" ? "bg-gray-50 text-gray-600" : "bg-blue-50 text-blue-600"
                )}><PenTool className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.markup_type.replace(/_/g, " ")} · {m.status}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
