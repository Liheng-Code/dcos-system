"use client";

import { type ReactNode } from "react";

export default function EmployeesLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
