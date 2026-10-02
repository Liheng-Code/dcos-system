"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Eye, Loader2, Box, Pencil, Trash2 } from "lucide-react";
import { BimUploadDialog } from "./bim-upload-dialog";
import { BimEditDialog } from "./bim-edit-dialog";
import { BimDeleteDialog } from "./bim-delete-dialog";
import type { BimModel } from "@/lib/design/bim/bim-types";

export function BimModelRegister() {
  const router = useRouter();
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [models, setModels] = useState<BimModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editModel, setEditModel] = useState<BimModel | null>(null);
  const [deleteModel, setDeleteModel] = useState<BimModel | null>(null);

  const fetchModels = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bim/models?project_id=${pid}`);
      const json = await res.json();
      setModels(json.data ?? []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchModels(selectedProjectId);
    } else if (!projectLoading) {
      setLoading(false);
    }
  }, [selectedProjectId, projectLoading, fetchModels]);

  const handleUploadComplete = () => {
    if (selectedProjectId) fetchModels(selectedProjectId);
    setUploadOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CURRENT":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Current</Badge>;
      case "SUPERSEDED":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Superseded</Badge>;
      case "ARCHIVED":
        return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatSize = (mb: number) => {
    if (mb < 1) return `${Math.round(mb * 1024)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <Box className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Select a project to view BIM models.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Import and view IFC models in 3D. All project members see the same current revision.
        </p>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Import IFC
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Box className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No IFC models uploaded yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Click &quot;Import IFC&quot; to upload your first model.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model Name</TableHead>
                <TableHead>Discipline</TableHead>
                <TableHead>Schema</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Elements</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.model_name}</TableCell>
                  <TableCell>{m.discipline}</TableCell>
                  <TableCell className="text-xs">{m.ifc_schema}</TableCell>
                  <TableCell>{m.revision}</TableCell>
                  <TableCell>{formatSize(m.file_size_mb)}</TableCell>
                  <TableCell>{m.element_count.toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(m.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {m.status === "CURRENT" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/design/bim/viewer/${m.id}`)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditModel(m)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteModel(m)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {uploadOpen && (
        <BimUploadDialog
          projectId={selectedProjectId}
          onClose={() => setUploadOpen(false)}
          onComplete={handleUploadComplete}
        />
      )}

      {editModel && (
        <BimEditDialog
          open={!!editModel}
          onOpenChange={(open) => { if (!open) setEditModel(null); }}
          model={editModel}
          onComplete={() => {
            if (selectedProjectId) fetchModels(selectedProjectId);
            setEditModel(null);
          }}
        />
      )}

      {deleteModel && (
        <BimDeleteDialog
          open={!!deleteModel}
          onOpenChange={(open) => { if (!open) setDeleteModel(null); }}
          model={deleteModel}
          onComplete={() => {
            if (selectedProjectId) fetchModels(selectedProjectId);
            setDeleteModel(null);
          }}
        />
      )}
    </div>
  );
}
