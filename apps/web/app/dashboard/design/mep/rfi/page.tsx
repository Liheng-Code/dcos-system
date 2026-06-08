import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignRfiList } from "@/components/design/design-rfi-list";
import { HelpCircle } from "lucide-react";

export default function Page() { return (<DesignPageShell title="MEP RFI" description="MEP design clarifications" icon={<HelpCircle className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50"><DesignRfiList discipline="mep" /></DesignPageShell>); }
