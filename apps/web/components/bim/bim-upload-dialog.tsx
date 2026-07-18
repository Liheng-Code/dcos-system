"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileWarning, Loader2, CheckCircle2 } from "lucide-react";

const MAX_FILE_SIZE_MB = 50;

interface BimUploadDialogProps {
  projectId: string;
  onClose: () => void;
  onComplete: () => void;
}

export function BimUploadDialog({ projectId, onClose, onComplete }: BimUploadDialogProps) {
  const [modelName, setModelName] = useState("");
  const [discipline, setDiscipline] = useState("FED");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (!f.name.toLowerCase().endsWith(".ifc")) {
      setError("Only .ifc files are accepted (IFC 2x3 or IFC4).");
      return;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      return;
    }
    setFile(f);
    if (!modelName) setModelName(f.name.replace(/\.ifc$/i, ""));
  }, [modelName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const fakeEvent = { target: { files: [f] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fakeEvent);
    }
  }, [handleFileChange]);

  const handleUpload = async () => {
    if (!file || !modelName.trim()) return;
    setUploading(true);
    setUploadPct(0);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop() ?? "ifc";
      const storagePath = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("bim-models")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      setUploadPct(100);

      const { data: urlData } = supabase.storage.from("bim-models").getPublicUrl(storagePath);

      const res = await fetch("/api/bim/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          model_name: modelName.trim(),
          discipline,
          ifc_schema: "IFC4",
          file_url: urlData.publicUrl,
          file_size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to create model record");
      }

      setDone(true);
      setTimeout(onComplete, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import IFC Model</h2>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-8 text-green-600">
            <CheckCircle2 className="h-12 w-12 mb-2" />
            <p className="font-medium">Model uploaded successfully</p>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              {file ? (
                <p className="text-sm font-medium">{file.name} ({Math.round(file.size / (1024 * 1024) * 10) / 10} MB)</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Drag & drop an IFC file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">IFC 2x3 TC1 / IFC4 - Max {MAX_FILE_SIZE_MB} MB</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".ifc"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label>Model Name</Label>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. Tower A - Structural"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Discipline</Label>
                <Select value={discipline} onValueChange={(v) => { if (v) setDiscipline(v); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FED">Federated (All)</SelectItem>
                    <SelectItem value="ARC">Architecture</SelectItem>
                    <SelectItem value="STR">Structure</SelectItem>
                    <SelectItem value="MEP">MEP</SelectItem>
                    <SelectItem value="CIVIL">Civil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded bg-red-50 p-3 text-sm text-red-700">
                <FileWarning className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {uploading && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">{uploadPct}%</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
              <Button
                onClick={handleUpload}
                disabled={!file || !modelName.trim() || uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
