export type { QsElementLibraryItem as QsElementRow, QsDescriptionLibraryItem as DescriptionRow } from "@/lib/qs/tender-cost-service";

export interface BudgetCodeOption {
  id: string;
  code: string;
  description: string;
}

export interface PostgrestLikeError {
  code?: string;
  message: string;
}

export function friendlyError(error: PostgrestLikeError): string {
  if (error.code === "23505") {
    return "This combination already exists — discipline, section, sub-section and sub-element must be unique together.";
  }
  return error.message;
}

export function friendlyDescError(error: PostgrestLikeError): string {
  return error.code === "23505" ? "This description already exists for this element." : error.message;
}

export const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary";
