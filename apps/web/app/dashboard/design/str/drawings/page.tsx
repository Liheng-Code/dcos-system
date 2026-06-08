import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignDrawingList } from "@/components/design/design-drawing-list";
import { FileText } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Structural Drawings" description="STR drawing register" icon={<FileText className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><DesignDrawingList discipline="str" /></DesignPageShell>); }
