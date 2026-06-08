"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  bucket?: string;
  path?: string;
  accept?: string;
  maxSizeMB?: number;
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  currentUrl?: string | null;
}

export function FileUpload({
  bucket = "procurement-attachments",
  path = "uploads",
  accept = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls",
  maxSizeMB = 10,
  onUploaded,
  onRemove,
  currentUrl,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`File too large. Max ${maxSizeMB}MB.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); setUploading(false); return; }

    const fileName = `${path}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (uploadError) { toast.error(uploadError.message); setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    onUploaded(publicUrl);
    toast.success("File uploaded");
    setUploading(false);
  }

  function handleRemove() {
    onRemove?.();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />

      {currentUrl ? (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <FileText className="h-4 w-4 shrink-0 text-blue-500" />
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline truncate">
            {currentUrl.split("/").pop() || "View file"}
          </a>
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={handleRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : "Upload File"}
        </Button>
      )}
    </div>
  );
}
