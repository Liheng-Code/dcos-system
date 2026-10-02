"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Plus,
  Loader2,
  Trash2,
  Search,
  ImageIcon,
  Upload,
  Calendar,
  MapPin,
  User,
  ExternalLink,
  CheckCircle2,
  X,
  Maximize2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO } from "@/lib/planning/work-calendar";
import { deleteSiteProgressPhotoById, insertSiteProgressPhoto, listSiteProgressPhotosByProjectId, listWbsTasksByProjectId } from "@/lib/construction/construction-queries";

interface PhotoRow {
  id: string;
  project_id: string;
  photo_url: string;
  storage_path?: string | null;
  caption: string | null;
  location: string | null;
  taken_by: string | null;
  taken_at: string | null;
  wbs_task_id?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  created_at: string;
  wbs_tasks?: { task_code?: string; task_name?: string } | null;
}

interface WbsTaskOption {
  id: string;
  task_code: string;
  task_name: string;
}

export function SiteProgressPhotos() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRow | null>(null);

  // Form fields
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [caption, setCaption] = useState("");
  const [photoLocation, setPhotoLocation] = useState("");
  const [takenBy, setTakenBy] = useState("");
  const [takenAt, setTakenAt] = useState(todayISO());
  const [wbsTaskId, setWbsTaskId] = useState("");

  // WBS tasks for dropdown
  const [tasks, setTasks] = useState<WbsTaskOption[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  async function load() {
    if (!selectedProjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await listSiteProgressPhotosByProjectId(selectedProjectId);

      if (error) throw error;
      setRows((data || []) as PhotoRow[]);

      // Load active WBS tasks for picker
      const { data: taskData } = await listWbsTasksByProjectId(selectedProjectId);

      setTasks(taskData || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedProjectId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 20MB.");
      return;
    }

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
  }

  function resetForm() {
    setSelectedFile(null);
    setPreviewUrl("");
    setPhotoUrlInput("");
    setCaption("");
    setPhotoLocation("");
    setTakenBy("");
    setTakenAt(todayISO());
    setWbsTaskId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Please select a project first.");
      return;
    }

    let finalPhotoUrl = photoUrlInput.trim();
    let storagePath: string | null = null;
    let fileSizeBytes: number | null = null;
    let mimeType: string | null = null;

    setSaving(true);
    try {
      if (selectedFile) {
        // Upload to Supabase Storage bucket 'site-progress-photos'
        const fileExt = selectedFile.name.split(".").pop() || "jpg";
        const randomId = Math.random().toString(36).slice(2, 9);
        storagePath = `${selectedProjectId}/${Date.now()}_${randomId}.${fileExt}`;
        fileSizeBytes = selectedFile.size;
        mimeType = selectedFile.type;

        const { error: uploadError } = await supabase.storage
          .from("site-progress-photos")
          .upload(storagePath, selectedFile, {
            contentType: selectedFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("site-progress-photos")
          .getPublicUrl(storagePath);

        finalPhotoUrl = publicUrlData.publicUrl;
      }

      if (!finalPhotoUrl) {
        toast.error("Please choose an image file or provide a photo URL.");
        setSaving(false);
        return;
      }

      const payload = {
        project_id: selectedProjectId,
        photo_url: finalPhotoUrl,
        storage_path: storagePath,
        caption: caption.trim() || null,
        location: photoLocation.trim() || null,
        taken_by: takenBy.trim() || null,
        taken_at: takenAt ? new Date(takenAt).toISOString() : new Date().toISOString(),
        wbs_task_id: wbsTaskId || null,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
      };

      const { error: insertError } = await insertSiteProgressPhoto(payload);

      if (insertError) throw insertError;

      toast.success("Progress photo uploaded successfully");
      setShowForm(false);
      resetForm();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(photo: PhotoRow) {
    if (!confirm("Are you sure you want to delete this progress photo?")) return;

    try {
      // If photo was stored in Supabase storage, remove the object
      if (photo.storage_path) {
        await supabase.storage
          .from("site-progress-photos")
          .remove([photo.storage_path]);
      }

      const { error } = await deleteSiteProgressPhotoById(photo.id);

      if (error) throw error;
      toast.success("Photo deleted");
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.caption || "").toLowerCase().includes(q) ||
      (r.location || "").toLowerCase().includes(q) ||
      (r.taken_by || "").toLowerCase().includes(q) ||
      (r.wbs_tasks?.task_name || "").toLowerCase().includes(q) ||
      (r.wbs_tasks?.task_code || "").toLowerCase().includes(q)
    );
  });

  if (projectLoading || loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search captions, tasks, locations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredRows.length} of {rows.length} photos
          </span>
        </div>

        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="gap-1.5"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload Photo
            </>
          )}
        </Button>
      </div>

      {/* Upload Form Card */}
      {showForm && (
        <Card className="border-primary/20 bg-card shadow-sm">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* File picker / drop area */}
                <div className="col-span-full">
                  <Label className="text-xs font-semibold">Photo File</Label>
                  <div className="mt-1 flex items-center gap-4">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 hover:bg-muted/70 transition-colors"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Upload preview"
                          className="h-full w-full object-contain p-1 rounded-lg"
                        />
                      ) : (
                        <div className="text-center p-4">
                          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                          <p className="mt-1.5 text-xs font-medium text-foreground">
                            Click to select photo or drag here
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            JPEG, PNG, WebP up to 20MB
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Direct URL input fallback */}
                <div className="col-span-full">
                  <Label className="text-xs">Or Photo Direct URL (Optional)</Label>
                  <Input
                    type="url"
                    placeholder="https://images.example.com/site-photo.jpg"
                    value={photoUrlInput}
                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                    className="text-xs mt-1"
                  />
                </div>

                {/* Caption */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Caption / Description</Label>
                  <Input
                    placeholder="e.g. Level 4 Slab Rebar inspection completed"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                {/* Linked WBS Task */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Linked Schedule Activity</Label>
                  <select
                    value={wbsTaskId}
                    onChange={(e) => setWbsTaskId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(None - General Site Photo)</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.task_code}] {t.task_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <Label className="text-xs">Location / Grid / Level</Label>
                  <Input
                    placeholder="e.g. Block A, 3rd Floor, Grid C-D"
                    value={photoLocation}
                    onChange={(e) => setPhotoLocation(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Taken By */}
                <div className="space-y-1">
                  <Label className="text-xs">Taken By</Label>
                  <Input
                    placeholder="e.g. John Doe (Site Inspector)"
                    value={takenBy}
                    onChange={(e) => setTakenBy(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Taken Date */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Date Taken</Label>
                  <Input
                    type="date"
                    value={takenAt}
                    onChange={(e) => setTakenAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading...
                    </>
                  ) : (
                    "Save Photo"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Photo Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredRows.map((r) => (
          <Card
            key={r.id}
            className="group relative overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
          >
            <div
              className="aspect-video bg-muted/60 relative cursor-pointer overflow-hidden flex items-center justify-center"
              onClick={() => setSelectedPhoto(r)}
            >
              {r.photo_url ? (
                <img
                  src={r.photo_url}
                  alt={r.caption || "Progress photo"}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-full bg-white/90 text-slate-800 hover:bg-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhoto(r);
                  }}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-tight line-clamp-2" title={r.caption || ""}>
                  {r.caption || "Untitled photo"}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(r)}
                  title="Delete photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {r.wbs_tasks && (
                <div className="flex items-center gap-1 text-[11px] text-blue-600 font-medium truncate">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {r.wbs_tasks.task_code} {r.wbs_tasks.task_name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>{r.taken_at ? r.taken_at.slice(0, 10) : r.created_at.slice(0, 10)}</span>
                </div>
                {r.location && (
                  <div className="flex items-center gap-1 truncate max-w-[120px]" title={r.location}>
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{r.location}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!filteredRows.length && (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground border border-dashed rounded-xl bg-card">
            <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="font-medium text-foreground">No site photos found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload photos to document physical progression, field inspections, and site conditions.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-background shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {selectedPhoto.caption || "Progress Photo"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Taken on {selectedPhoto.taken_at ? selectedPhoto.taken_at.slice(0, 10) : selectedPhoto.created_at.slice(0, 10)}
                  {selectedPhoto.location && ` • ${selectedPhoto.location}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedPhoto.photo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[68vh] overflow-auto bg-black/90 flex items-center justify-center p-2">
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || "Full view"}
                className="max-h-full max-w-full object-contain rounded"
              />
            </div>

            {selectedPhoto.wbs_tasks && (
              <div className="px-4 py-2 bg-muted/20 border-t flex items-center gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">Linked Activity:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedPhoto.wbs_tasks.task_code}
                </Badge>
                <span className="font-medium text-foreground">
                  {selectedPhoto.wbs_tasks.task_name}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
