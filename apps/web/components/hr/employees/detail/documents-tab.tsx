"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { labelize, fmtDate } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function DocumentsTab({ c }: { c: LoadedEmployeeDetail }) {
  const { employeeDocuments, checklistStatuses } = c;
  return (
    <TabsContent value="documents" className="mt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Document Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checklistStatuses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No checklist status generated yet.</p> : checklistStatuses.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{item.employee_document_checklist_items?.[0]?.label ?? "Document"}</p>
                  <p className="text-xs text-muted-foreground">{item.employee_document_checklist_items?.[0]?.is_mandatory ? "Mandatory" : "Optional"}</p>
                </div>
                <Badge variant="outline" className="capitalize">{labelize(item.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Uploaded Documents</CardTitle></CardHeader>
          <CardContent className="p-0">
            {employeeDocuments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No documents uploaded yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground"><th className="px-4 py-2.5 text-left font-medium">Document</th><th className="px-4 py-2.5 text-left font-medium">Expiry</th><th className="px-4 py-2.5 text-center font-medium">Verified</th></tr></thead>
                <tbody className="divide-y divide-border">{employeeDocuments.map((doc) => (
                  <tr key={doc.id}><td className="px-4 py-3"><p className="font-medium">{doc.document_name}</p><p className="text-xs text-muted-foreground">{labelize(doc.document_type)}</p></td><td className="px-4 py-3 text-muted-foreground">{fmtDate(doc.expiry_date)}</td><td className="px-4 py-3 text-center">{doc.verified ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : <AlertCircle className="mx-auto h-4 w-4 text-amber-500" />}</td></tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
