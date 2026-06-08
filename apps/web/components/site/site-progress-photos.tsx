"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Trash2, Search, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function SiteProgressPhotos() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [photoUrl, setPhotoUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [photoLocation, setPhotoLocation] = useState("");
  const [takenBy, setTakenBy] = useState("");
  const [takenAt, setTakenAt] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_progress_photos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setPhotoUrl(""); setCaption(""); setPhotoLocation(""); setTakenBy(""); setTakenAt("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      photo_url: photoUrl,
      caption: caption || null,
      location: photoLocation || null,
      taken_by: takenBy || null,
      taken_at: takenAt || null,
      project_id: crypto.randomUUID(),
    };
    const { error } = await supabase.from("site_progress_photos").insert([payload]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Photo added");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("site_progress_photos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} photos</p>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "Add Photo"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>Photo URL *</Label><Input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." required /></div>
              <div className="col-span-2 space-y-1.5"><Label>Caption</Label><Input value={caption} onChange={e => setCaption(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={photoLocation} onChange={e => setPhotoLocation(e.target.value)} placeholder="e.g. Level 3, Zone B" /></div>
              <div className="space-y-1.5"><Label>Taken By</Label><Input value={takenBy} onChange={e => setTakenBy(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Taken At</Label><Input type="datetime-local" value={takenAt} onChange={e => setTakenAt(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map(r => (
          <Card key={r.id} className="group relative overflow-hidden">
            <div className="aspect-video bg-muted flex items-center justify-center">
              {r.photo_url ? (
                <img src={r.photo_url} alt={r.caption || ""} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <CardContent className="p-3">
              {r.caption && <p className="text-sm font-medium truncate">{r.caption}</p>}
              <p className="text-xs text-muted-foreground">{r.taken_at?.slice(0, 10) || r.created_at?.slice(0, 10)}</p>
              {r.location && <p className="text-xs text-muted-foreground">{r.location}</p>}
            </CardContent>
            <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3" /></Button>
          </Card>
        ))}
        {!rows.length && <p className="col-span-full text-sm text-muted-foreground py-8 text-center">No photos yet.</p>}
      </div>
    </div>
  );
}
