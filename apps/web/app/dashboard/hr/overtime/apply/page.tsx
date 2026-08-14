"use client";

import { OTRequestForm } from "@/components/hr/overtime/ot-request-form";

export default function ApplyOTPage() {
  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h1 className="text-2xl font-bold tracking-tight">Apply for Overtime</h1>
        <p className="text-muted-foreground">Submit a new overtime request for approval</p>
      </div>
      <OTRequestForm />
    </div>
  );
}
