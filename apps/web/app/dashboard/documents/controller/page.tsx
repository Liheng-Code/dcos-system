"use client";

import { DocumentControllerDashboard } from "@/components/documents/document-controller-dashboard";
import { FileText } from "lucide-react";

export default function DocumentControllerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document Controller Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of document status and pending actions</p>
      </div>
      <DocumentControllerDashboard />
    </div>
  );
}
