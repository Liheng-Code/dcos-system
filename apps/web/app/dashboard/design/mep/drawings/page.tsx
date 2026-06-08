import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignDrawingList } from "@/components/design/design-drawing-list";
import { FileText } from "lucide-react";

export default function Page() { return (<DesignPageShell title="MEP Drawings" description="MEP drawing register" icon={<FileText className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><DesignDrawingList discipline="mep" /></DesignPageShell>); }
