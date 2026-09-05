"use client";

// Shared shell for module pages that show a header tab bar above their content
// (used by the procurement, inventory and QS route layouts).
export function ModulePageLayout({ headerTabs, children }: { headerTabs: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {headerTabs}
      <div className="flex min-h-0 flex-1 flex-col pt-2">
        {children}
      </div>
    </div>
  );
}
