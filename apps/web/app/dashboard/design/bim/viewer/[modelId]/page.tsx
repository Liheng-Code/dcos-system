"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import {
  IfcViewer,
  BimComponentsContext,
  BimWorldContext,
  BimFragmentsContext,
  BimItemDataContext,
  type BimHandles,
} from "@/components/bim/ifc-viewer";
import { IfcViewerLayout } from "@/components/bim/ifc-viewer-layout";
import { BimToolbar } from "@/components/bim/bim-toolbar";
import { BimStatusBar } from "@/components/bim/bim-status-bar";
import { SpatialTree } from "@/components/bim/spatial-tree";
import { DisciplineFilter } from "@/components/bim/discipline-filter";
import { ElementProperties } from "@/components/bim/element-properties";
import { ViewCube } from "@/components/bim/view-cube";
import { PresetViews } from "@/components/bim/preset-views";
import { ViewpointsPanel } from "@/components/bim/viewpoints-panel";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import type { BimModel } from "@/lib/bim/bim-types";

export default function ViewerPage() {
  const params = useParams();
  const router = useRouter();
  const modelId = params.modelId as string;
  const [model, setModel] = useState<BimModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bimHandles, setBimHandles] = useState<BimHandles | null>(null);
  const { setModelInfo, selectedItems, elementProperties } = useBimViewer();

  const fetchModel = useCallback(async () => {
    try {
      const res = await fetch(`/api/bim/models/${modelId}`);
      const json = await res.json();
      if (json.data) {
        setModel(json.data);
        setModelInfo({
          modelId: json.data.id,
          modelName: json.data.model_name,
          revision: json.data.revision,
          ifcSchema: json.data.ifc_schema,
        });
      }
    } catch {
      // ignore
    }
  }, [modelId, setModelInfo]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/");
        return;
      }
      fetch(`/api/bim/models/${modelId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.data) {
            setModel(json.data);
            setModelInfo({
              modelId: json.data.id,
              modelName: json.data.model_name,
              revision: json.data.revision,
              ifcSchema: json.data.ifc_schema,
            });
          } else {
            setError(json.error ?? "Model not found");
          }
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load model");
          setLoading(false);
        });
    });
  }, [modelId, router, setModelInfo]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-900 text-white">
        <p className="text-lg font-medium mb-2">Unable to load model</p>
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={() => router.push("/dashboard/design/bim")}
          className="mt-4 text-sm text-blue-400 hover:underline"
        >
          Back to Model Register
        </button>
      </div>
    );
  }

  return (
    <div className="h-full -m-3">
      <BimComponentsContext.Provider value={bimHandles?.components ?? null}>
        <BimWorldContext.Provider value={bimHandles?.world ?? null}>
          <BimFragmentsContext.Provider value={bimHandles?.fragments ?? null}>
            <BimItemDataContext.Provider value={bimHandles?.itemDataRef ?? null}>
            <IfcViewerLayout
              toolbar={<BimToolbar modelId={modelId} model={model} onModelUpdated={fetchModel} />}
              leftPanel={
                <div className="p-3 space-y-4">
                  <SpatialTree />
                  <DisciplineFilter />
                  <ViewpointsPanel modelId={modelId} />
                </div>
              }
              canvas={
                <div className="relative h-full w-full">
                  <IfcViewer fileUrl={model.file_url} modelId={modelId} onReady={setBimHandles} />
                  <div className="absolute top-4 right-4 z-20">
                    <ViewCube />
                  </div>
                  <div className="absolute top-4 left-4 z-20">
                    <PresetViews />
                  </div>
                </div>
              }
              rightPanel={
                <div className="p-3">
                  {selectedItems.size > 0 || elementProperties ? (
                    <ElementProperties />
                  ) : (
                    <div className="text-center text-sm text-gray-400 py-8">
                      Click an element to view its properties
                    </div>
                  )}
                </div>
              }
              statusBar={<BimStatusBar />}
            />
            </BimItemDataContext.Provider>
          </BimFragmentsContext.Provider>
        </BimWorldContext.Provider>
      </BimComponentsContext.Provider>
    </div>
  );
}
