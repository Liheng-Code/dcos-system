"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BookType, Building2, Users, FileType, FolderTree, Layers } from "lucide-react";
import { NamingDisciplineCodes } from "./naming-discipline-codes";
import { NamingCompanyAbbreviations } from "./naming-company-abbreviations";
import { NamingStakeholderAbbreviations } from "./naming-stakeholder-abbreviations";
import { NamingDocumentTypesSync } from "./naming-document-types-sync";
import { NamingBudgetSectionsEditor } from "./naming-budget-sections-editor";
import { NamingLevelTemplateAdmin } from "./naming-level-template-admin";

type SubTab = "disciplines" | "companies" | "stakeholders" | "doctypes" | "budget" | "level_templates";

const subTabs: { id: SubTab; label: string; icon: typeof BookType }[] = [
  { id: "disciplines", label: "Discipline Codes", icon: BookType },
  { id: "companies", label: "Company Abbreviations", icon: Building2 },
  { id: "stakeholders", label: "Stakeholder Abbreviations", icon: Users },
  { id: "doctypes", label: "Document Type Sync", icon: FileType },
  { id: "budget", label: "Budget Sections", icon: FolderTree },
  { id: "level_templates", label: "Level Templates", icon: Layers },
];

export function NamingConventionAdminPage() {
  const [subTab, setSubTab] = useState<SubTab>("disciplines");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Naming Convention</h2>
          <p className="text-sm text-muted-foreground">
            Configure reference data for the DCOS Standard Naming Convention (DCOS-NCS-001)
          </p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-border">
        {subTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative",
                subTab === t.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {subTab === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      {subTab === "disciplines" && <NamingDisciplineCodes />}
      {subTab === "companies" && <NamingCompanyAbbreviations />}
      {subTab === "stakeholders" && <NamingStakeholderAbbreviations />}
      {subTab === "doctypes" && <NamingDocumentTypesSync />}
      {subTab === "budget" && <NamingBudgetSectionsEditor />}
      {subTab === "level_templates" && <NamingLevelTemplateAdmin />}
    </div>
  );
}
