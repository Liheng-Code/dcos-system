"use client";

import { useState, useMemo } from "react";
import { Popover } from "@base-ui/react/popover";
import { Search, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Staff {
  employeeId: string;
  email: string;
  fullName: string;
  jobTitle: string;
  department: string;
}

const STAFF: Staff[] = [
  { employeeId: "C-0001", email: "liheng@dcos.com",     fullName: "Liheng",    jobTitle: "Managing Director",       department: "management" },
  { employeeId: "C-0002", email: "sophat@dcos.com",     fullName: "Sophat",    jobTitle: "General Manager",         department: "management" },
  { employeeId: "C-0003", email: "vuthy@dcos.com",      fullName: "Vuthy",     jobTitle: "Project Manager",         department: "management" },
  { employeeId: "C-0004", email: "chenda@dcos.com",     fullName: "Chenda",    jobTitle: "Architect Manager",       department: "architecture" },
  { employeeId: "C-0005", email: "pheara@dcos.com",     fullName: "Pheara",    jobTitle: "Architectural Senior",    department: "architecture" },
  { employeeId: "C-0006", email: "dany@dcos.com",       fullName: "Dany",      jobTitle: "Architectural Design-01", department: "architecture" },
  { employeeId: "C-0007", email: "thida@dcos.com",      fullName: "Thida",     jobTitle: "Architectural Design-02", department: "architecture" },
  { employeeId: "C-0008", email: "tangkea@dcos.com",    fullName: "Tangkea",   jobTitle: "Structure Manager",      department: "structural" },
  { employeeId: "C-0009", email: "dara@dcos.com",       fullName: "Dara",      jobTitle: "Structure Senior",        department: "structural" },
  { employeeId: "C-0010", email: "the@dcos.com",        fullName: "The",       jobTitle: "Structure Design-01",     department: "structural" },
  { employeeId: "C-0011", email: "kosal@dcos.com",      fullName: "Kosal",     jobTitle: "Structure Design-02",     department: "structural" },
  { employeeId: "C-0012", email: "visal@dcos.com",      fullName: "Visal",     jobTitle: "Procurement Manager",     department: "procurement" },
  { employeeId: "C-0013", email: "anna@dcos.com",       fullName: "Anna",      jobTitle: "Procurement Senior",      department: "procurement" },
  { employeeId: "C-0014", email: "daros@dcos.com",      fullName: "Daros",     jobTitle: "Procurement-01",          department: "procurement" },
  { employeeId: "C-0015", email: "sovvan@dcos.com",     fullName: "Sovvan",    jobTitle: "Procurement-02",          department: "procurement" },
  { employeeId: "C-0016", email: "sophal@dcos.com",     fullName: "Sophal",    jobTitle: "Construction Manager",    department: "construction" },
  { employeeId: "C-0017", email: "ratanak@dcos.com",    fullName: "Ratanak",   jobTitle: "Construction Senior",     department: "construction" },
  { employeeId: "C-0018", email: "sokun@dcos.com",      fullName: "Sokun",     jobTitle: "Site Engineer - Architect", department: "construction" },
  { employeeId: "C-0019", email: "vannara@dcos.com",    fullName: "Vannara",   jobTitle: "Site Engineer - C&S",     department: "construction" },
  { employeeId: "C-0020", email: "bophea@dcos.com",     fullName: "Bophea",    jobTitle: "Site Engineer - MEP",     department: "construction" },
  { employeeId: "C-0021", email: "kimseng@dcos.com",    fullName: "Kimseng",   jobTitle: "HR Manager",              department: "hr" },
  { employeeId: "C-0022", email: "pepsi@dcos.com",      fullName: "Pepsi",     jobTitle: "HR Senior",               department: "hr" },
  { employeeId: "C-0023", email: "nalin@dcos.com",      fullName: "Nalin",     jobTitle: "HR-01",                   department: "hr" },
  { employeeId: "C-0024", email: "kimly@dcos.com",      fullName: "Kimly",     jobTitle: "HR-02",                   department: "hr" },
  { employeeId: "C-0025", email: "sovanarith@dcos.com", fullName: "Sovanarith", jobTitle: "Account Manager",        department: "accounting" },
  { employeeId: "C-0026", email: "sreymom@dcos.com",    fullName: "Sreymom",   jobTitle: "Account Senior",          department: "accounting" },
  { employeeId: "C-0027", email: "rithy@dcos.com",      fullName: "Rithy",     jobTitle: "Account",                 department: "accounting" },
  { employeeId: "C-0028", email: "hanko@dcos.com",      fullName: "Hanko",     jobTitle: "MEP Manager",             department: "mep" },
  { employeeId: "C-0029", email: "seyha@dcos.com",      fullName: "Seyha",     jobTitle: "MEP Senior",              department: "mep" },
  { employeeId: "C-0030", email: "samnang@dcos.com",    fullName: "Samnang",   jobTitle: "MEP Design",              department: "mep" },
  { employeeId: "C-0031", email: "sophea@dcos.com",     fullName: "Sophea",    jobTitle: "MEP Design",              department: "mep" },
  { employeeId: "C-0032", email: "nita@dcos.com",       fullName: "Nita",      jobTitle: "MEP Design",              department: "mep" },
  { employeeId: "C-0033", email: "vanchhouy@dcos.com",  fullName: "Vanchhouy", jobTitle: "MEP Design",              department: "mep" },
  { employeeId: "C-0034", email: "nisa@dcos.com",       fullName: "nisa",      jobTitle: "Accountant",              department: "accounting" },
  { employeeId: "C0035",  email: "soklay@dcos.com",     fullName: "Soklay",    jobTitle: "Architectural",           department: "architecture" },
];

const DEPARTMENT_ORDER = [
  "management",
  "architecture",
  "structural",
  "procurement",
  "construction",
  "hr",
  "accounting",
  "mep",
] as const;

const DEPARTMENT_LABELS: Record<string, string> = {
  management: "Management",
  architecture: "Architecture",
  structural: "Structural",
  procurement: "Procurement",
  construction: "Construction",
  hr: "Human Resources",
  accounting: "Accounting",
  mep: "MEP",
};

const DEPARTMENT_COLORS: Record<string, string> = {
  management: "bg-blue-500",
  architecture: "bg-violet-500",
  structural: "bg-amber-500",
  procurement: "bg-cyan-500",
  construction: "bg-emerald-500",
  hr: "bg-rose-500",
  accounting: "bg-orange-500",
  mep: "bg-indigo-500",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface DemoUserDropdownProps {
  signIn: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

export function DemoUserDropdown({ signIn, loading }: DemoUserDropdownProps) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const filtered = search.trim()
      ? STAFF.filter(
          (s) =>
            s.fullName.toLowerCase().includes(search.toLowerCase()) ||
            s.jobTitle.toLowerCase().includes(search.toLowerCase()) ||
            s.department.toLowerCase().includes(search.toLowerCase()),
        )
      : STAFF;

    const map = new Map<string, Staff[]>();
    for (const dept of DEPARTMENT_ORDER) map.set(dept, []);
    for (const s of filtered) {
      const list = map.get(s.department);
      if (list) list.push(s);
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [search]);

  async function handleSignIn(email: string) {
    try {
      await signIn(email, "dcosdemo#2026");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign in";
      toast.error(message);
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        Quick Demo Access
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="center" sideOffset={4}>
          <Popover.Popup className="z-50 w-72 origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="border-b border-border px-3 py-2.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {grouped.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No staff found
                </p>
              ) : (
                grouped.map(([dept, staff]) => (
                  <div key={dept}>
                    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {DEPARTMENT_LABELS[dept]}
                    </div>
                    {staff.map((s) => (
                      <button
                        key={s.email}
                        type="button"
                        disabled={loading}
                        onClick={() => handleSignIn(s.email)}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white",
                            DEPARTMENT_COLORS[s.department],
                          )}
                        >
                          {getInitials(s.fullName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {s.fullName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.jobTitle}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
