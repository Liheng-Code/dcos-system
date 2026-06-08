import { DesignPageShell } from "@/components/design/design-page-shell";
import { DesignRfiList } from "@/components/design/design-rfi-list";
import { HelpCircle } from "lucide-react";

export default function Page() { return (<DesignPageShell title="Structural RFI" description="Structural design RFIs" icon={<HelpCircle className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50"><DesignRfiList discipline="str" /></DesignPageShell>); }
