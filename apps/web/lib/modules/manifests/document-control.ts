import { FileText, History } from "lucide-react";
import { DOCUMENT_CONTROL_GROUPS } from "@/lib/documents/document-control-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const documentControlModule: ModuleManifest = {
  key: "document_control",
  name: "Document Control",
  rbacModules: ["document_control"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/documents", "/dashboard/transmittals"],
  navGroups: DOCUMENT_CONTROL_GROUPS,
  groupIcons: {
    documents: FileText,
    controller: History,
  },
  hub: {
    title: "Document Control",
    description: "Documents, transmittals, and audit log",
    href: "/dashboard/documents",
    icon: FileText,
    gradient: "from-sky-500 to-blue-600",
    order: 3,
  },
};
