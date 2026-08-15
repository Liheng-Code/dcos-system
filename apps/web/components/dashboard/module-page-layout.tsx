"use client";

// Shared shell for module pages that show a header tab bar above their content
// (used by the procurement, inventory and QS route layouts).
export function ModulePageLayout({ headerTabs, children }: { headerTabs: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {headerTabs}
      <div className="flex-1 pt-4">
        {children}
      </div>
    </div>
  );
}
