import React, { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronRight, Building2, Layers, MapPinned, DoorOpen, Box, CheckCircle2, AlertTriangle, Clock3, Plus, MoreHorizontal, Filter, CalendarDays, Users, FileText, MessageSquare, ShieldCheck, ClipboardCheck, Link2, LayoutDashboard, ListChecks, GanttChartSquare, Columns3, Eye, UploadCloud, BellRing, Flag, GitBranch, Camera, ClipboardList, CircleDot, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const wbsTree = [
  {
    id: "project",
    code: "P001",
    name: "GDT Tower Project",
    type: "Project",
    progress: 65,
    status: "risk",
    children: [
      {
        id: "b01",
        code: "B01",
        name: "Main Tower",
        type: "Building",
        progress: 72,
        status: "ok",
        children: [
          {
            id: "l05",
            code: "L05",
            name: "Level 05",
            type: "Level",
            progress: 63,
            status: "risk",
            children: [
              {
                id: "z03",
                code: "Z03",
                name: "North Zone",
                type: "Zone",
                progress: 45,
                status: "delay",
                children: [
                  {
                    id: "r045",
                    code: "R045",
                    name: "Office Room",
                    type: "Room",
                    progress: 30,
                    status: "delay",
                    children: [
                      { id: "el-slab", code: "STR-019", name: "Slab", type: "Element", progress: 60, status: "risk" },
                      { id: "el-beam", code: "STR-017", name: "Beam", type: "Element", progress: 20, status: "delay" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "l06",
            code: "L06",
            name: "Level 06",
            type: "Level",
            progress: 78,
            status: "ok",
            children: [],
          },
        ],
      },
      {
        id: "b02",
        code: "B02",
        name: "Podium",
        type: "Building",
        progress: 54,
        status: "risk",
        children: [],
      },
    ],
  },
];

const tasks = [
  { code: "T-STR-001", name: "Rebar fixing for L05 slab", status: "In Progress", progress: 60, owner: "Tangkea", start: "27 May", finish: "29 May", delay: "On Track", priority: "High", dependency: "Ready", discipline: "STR", wbs: "B01-L05-Z03-R045", docs: 3, photos: 8, qa: "Pending", x: 8, width: 24 },
  { code: "T-STR-002", name: "Beam formwork inspection", status: "Blocked", progress: 20, owner: "Kosal", start: "28 May", finish: "30 May", delay: "Blocked", priority: "Critical", dependency: "Waiting slab rebar", discipline: "STR", wbs: "B01-L05-Z03-R045", docs: 2, photos: 4, qa: "Failed", x: 28, width: 18 },
  { code: "T-ARC-014", name: "Wall setting out", status: "Open", progress: 0, owner: "Lis", start: "30 May", finish: "02 Jun", delay: "Not Started", priority: "Medium", dependency: "After structural clearance", discipline: "ARC", wbs: "B01-L05-Z03-R045", docs: 1, photos: 0, qa: "Not Required", x: 50, width: 22 },
  { code: "T-QA-006", name: "Concrete pre-pour checklist", status: "Submitted", progress: 100, owner: "The", start: "27 May", finish: "27 May", delay: "On Track", priority: "High", dependency: "Ready for approval", discipline: "QA", wbs: "B01-L05-Z03-R045", docs: 5, photos: 12, qa: "Submitted", x: 4, width: 12 },
  { code: "T-MEP-022", name: "Sleeve opening confirmation", status: "Review", progress: 80, owner: "MEP Team", start: "29 May", finish: "31 May", delay: "Risk", priority: "High", dependency: "Before casting", discipline: "MEP", wbs: "B01-L05-Z03", docs: 4, photos: 6, qa: "Review", x: 38, width: 18 },
];

const stats = [
  { label: "Progress", value: "65%", hint: "Project roll-up" },
  { label: "Open Tasks", value: "128", hint: "32 due this week" },
  { label: "Delayed", value: "14", hint: "5 critical" },
  { label: "Pending Approval", value: "22", hint: "QA + documents" },
];

function statusClass(status) {
  if (status === "ok" || status === "On Track") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "delay" || status === "Blocked" || status === "Critical") return "bg-red-50 text-red-700 border-red-200";
  if (status === "risk" || status === "High") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function typeIcon(type) {
  const cls = "w-4 h-4";
  if (type === "Project") return <LayoutDashboard className={cls} />;
  if (type === "Building") return <Building2 className={cls} />;
  if (type === "Level") return <Layers className={cls} />;
  if (type === "Zone") return <MapPinned className={cls} />;
  if (type === "Room") return <DoorOpen className={cls} />;
  return <Box className={cls} />;
}

function WbsNode({ node, level = 0, selectedId, onSelect }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const active = selectedId === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(node)}
        className={`group w-full flex items-center gap-2 rounded-xl px-2 py-2 text-left transition ${active ? "bg-slate-900 text-white shadow-sm" : "hover:bg-slate-100 text-slate-700"}`}
        style={{ paddingLeft: `${8 + level * 18}px` }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen(!open);
          }}
          className="w-4 shrink-0"
        >
          {hasChildren ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
        </span>
        <span className={`shrink-0 ${active ? "text-white" : "text-slate-500"}`}>{typeIcon(node.type)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{node.code} · {node.name}</span>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${active ? "border-white/30 text-white/80" : statusClass(node.status)}`}>{node.type} · {node.progress}%</span>
        </span>
      </button>
      {open && hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <WbsNode key={child.id} node={child} level={level + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full bg-slate-900" style={{ width: `${value}%` }} />
    </div>
  );
}

function ExecutionView() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {["Ready", "Blocked", "Need QA", "Due This Week"].map((label, i) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold">{[18, 5, 9, 32][i]}</div>
          </div>
        ))}
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="py-3 pl-4">Task</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Progress</th>
              <th>Schedule</th>
              <th>Dependency</th>
              <th>Evidence</th>
              <th>QA</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.code} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-4 pl-4">
                  <div className="font-semibold">{task.name}</div>
                  <div className="text-xs text-slate-500">{task.code} · {task.discipline} · {task.wbs}</div>
                </td>
                <td><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(task.status)}`}>{task.status}</span></td>
                <td><div className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" />{task.owner}</div></td>
                <td className="w-40"><div className="flex items-center gap-2"><ProgressBar value={task.progress} /><span className="text-xs">{task.progress}%</span></div></td>
                <td><div>{task.start} → {task.finish}</div><div className="text-xs text-slate-500">{task.delay}</div></td>
                <td><div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-slate-400" />{task.dependency}</div></td>
                <td><div className="flex gap-3 text-xs text-slate-600"><span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{task.docs}</span><span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{task.photos}</span></div></td>
                <td><span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs">{task.qa}</span></td>
                <td><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(task.priority)}`}>{task.priority}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GanttView() {
  const days = ["27 May", "28 May", "29 May", "30 May", "31 May", "01 Jun", "02 Jun", "03 Jun"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><GanttChartSquare className="h-4 w-4" /> Baseline vs Actual Timeline</div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Critical Path</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1">FS / SS / FF Links</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1">Delay Highlight</span>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[280px_1fr] border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <div className="p-3">Task</div>
            <div className="grid grid-cols-8">
              {days.map((day) => <div key={day} className="border-l p-3 text-center">{day}</div>)}
            </div>
          </div>

          {tasks.map((task, index) => (
            <div key={task.code} className="grid grid-cols-[280px_1fr] border-b border-slate-100">
              <div className="p-3">
                <div className="font-semibold text-sm">{task.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Flag className="h-3.5 w-3.5" /> {task.code} · {task.owner}</div>
              </div>
              <div className="relative grid grid-cols-8 bg-white">
                {days.map((day) => <div key={day} className="min-h-[72px] border-l border-slate-100" />)}
                <div
                  className={`absolute top-5 h-7 rounded-full border px-3 text-xs font-semibold leading-7 shadow-sm ${task.status === "Blocked" ? "border-red-200 bg-red-50 text-red-700" : task.priority === "High" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-900 text-white"}`}
                  style={{ left: `${task.x}%`, width: `${task.width}%` }}
                >
                  {task.progress}% · {task.status}
                </div>
                {index < tasks.length - 1 && (
                  <div className="absolute left-[42%] top-[48px] flex items-center text-slate-400">
                    <div className="h-px w-10 bg-slate-300" /><ArrowRight className="h-4 w-4" /><span className="ml-1 text-[10px]">FS</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ task }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{task.name}</div>
          <div className="text-xs text-slate-500">{task.code}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass(task.priority)}`}>{task.priority}</span>
      </div>
      <ProgressBar value={task.progress} />
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{task.owner}</span>
        <span>{task.finish}</span>
      </div>
      <div className="mt-3 flex gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-1">{task.discipline}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1">{task.photos} photos</span>
      </div>
    </div>
  );
}

function KanbanView() {
  const columns = [
    { title: "Open", icon: CircleDot, items: tasks.filter((t) => t.status === "Open") },
    { title: "In Progress", icon: Clock3, items: tasks.filter((t) => t.status === "In Progress" || t.status === "Review") },
    { title: "Blocked", icon: AlertTriangle, items: tasks.filter((t) => t.status === "Blocked") },
    { title: "Submitted / Approval", icon: ShieldCheck, items: tasks.filter((t) => t.status === "Submitted") },
  ];

  return (
    <div className="grid min-w-[920px] grid-cols-4 gap-3 overflow-auto">
      {columns.map((col) => {
        const Icon = col.icon;
        return (
          <div key={col.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{col.title}</div>
              <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{col.items.length}</span>
            </div>
            <div className="space-y-3">
              {col.items.length ? col.items.map((task) => <KanbanCard key={task.code} task={task} />) : <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">Drop task here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WbsSummaryView({ selectedNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="mb-3 font-semibold">WBS Node Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>Node Type</span><b>{selectedNode.type}</b></div>
            <div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>Roll-up Progress</span><b>{selectedNode.progress}%</b></div>
            <div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>Linked Tasks</span><b>5</b></div>
            <div className="flex justify-between rounded-xl bg-slate-50 p-3"><span>Linked Documents</span><b>18</b></div>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="mb-3 font-semibold">Control Checklist</h3>
          {["WBS code approved", "Responsible team assigned", "Schedule baseline linked", "BOQ cost linked", "Document folder ready"].map((item, i) => (
            <div key={item} className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm"><CheckCircle2 className={`h-4 w-4 ${i < 3 ? "text-slate-900" : "text-slate-300"}`} />{item}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DCOSWbsManagementScreen() {
  const [selectedNode, setSelectedNode] = useState(wbsTree[0].children[0].children[0].children[0].children[0]);
  const [mode, setMode] = useState("Execution");

  const breadcrumb = useMemo(() => "P001 / B01 / L05 / Z03 / R045", []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm border border-slate-200">
          <div>
            <div className="text-xs font-medium text-slate-500">DCOS / WBS Management</div>
            <h1 className="text-2xl font-bold tracking-tight">Project Breakdown Control Center</h1>
            <div className="mt-1 text-sm text-slate-500">{breadcrumb}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl"><BellRing className="mr-2 h-4 w-4" /> Alerts</Button>
            <Button variant="outline" className="rounded-xl"><UploadCloud className="mr-2 h-4 w-4" /> Import WBS</Button>
            <Button className="rounded-xl bg-slate-900"><Plus className="mr-2 h-4 w-4" /> Add Node</Button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="text-sm text-slate-500">{s.label}</div>
                <div className="mt-1 text-2xl font-bold">{s.value}</div>
                <div className="mt-1 text-xs text-slate-400">{s.hint}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <main className="grid grid-cols-1 gap-4 xl:grid-cols-[330px_minmax(0,1fr)_360px]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="font-semibold">WBS Tree</h2>
                <p className="text-xs text-slate-500">Location → Element → Task</p>
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent text-sm outline-none" placeholder="Search B01 L05 slab..." />
            </div>
            <div className="max-h-[670px] space-y-1 overflow-auto pr-1">
              {wbsTree.map((node) => (
                <WbsNode key={node.id} node={node} selectedId={selectedNode.id} onSelect={setSelectedNode} />
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selectedNode.code} · {selectedNode.name}</h2>
                  <p className="text-sm text-slate-500">{selectedNode.type} workspace · roll-up progress {selectedNode.progress}%</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["WBS", "Execution", "Gantt", "Kanban"].map((m) => (
                    <Button key={m} onClick={() => setMode(m)} variant={mode === m ? "default" : "outline"} className={`rounded-xl ${mode === m ? "bg-slate-900" : ""}`}>
                      {m === "WBS" && <ListChecks className="mr-2 h-4 w-4" />}
                      {m === "Execution" && <ClipboardCheck className="mr-2 h-4 w-4" />}
                      {m === "Gantt" && <GanttChartSquare className="mr-2 h-4 w-4" />}
                      {m === "Kanban" && <Columns3 className="mr-2 h-4 w-4" />}
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-2 flex justify-between text-sm"><span>Progress</span><span className="font-semibold">{selectedNode.progress}%</span></div>
                  <ProgressBar value={selectedNode.progress} />
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="text-slate-500">Health</div>
                  <div className="mt-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Delay risk detected</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="text-slate-500">Quick filters</div>
                  <div className="mt-1 flex gap-2"><span>Critical</span><span>My tasks</span><span>Due</span></div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input className="w-64 bg-transparent text-sm outline-none" placeholder="Search task, owner, status..." />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl"><Filter className="mr-2 h-4 w-4" /> Filter</Button>
                <Button variant="outline" className="rounded-xl"><CalendarDays className="mr-2 h-4 w-4" /> Date</Button>
                <Button className="rounded-xl bg-slate-900"><Plus className="mr-2 h-4 w-4" /> Add Task</Button>
              </div>
            </div>

            <div className="overflow-auto p-4">
              {mode === "WBS" && <WbsSummaryView selectedNode={selectedNode} />}
              {mode === "Execution" && <ExecutionView />}
              {mode === "Gantt" && <GanttView />}
              {mode === "Kanban" && <KanbanView />}
            </div>
          </section>

          <aside className="space-y-4">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Node Detail</h2>
                  <Button variant="ghost" size="icon" className="rounded-xl"><Eye className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Code</span><div className="font-semibold">{selectedNode.code}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Path</span><div className="font-semibold">{breadcrumb}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Responsible</span><div className="font-semibold">Structural Team</div></div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <h2 className="mb-3 font-semibold">Linked Control Items</h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-slate-200 p-3"><FileText className="mb-2 h-4 w-4" /> Documents<br /><b>18</b></div>
                  <div className="rounded-xl border border-slate-200 p-3"><ClipboardCheck className="mb-2 h-4 w-4" /> QA Checks<br /><b>6</b></div>
                  <div className="rounded-xl border border-slate-200 p-3"><MessageSquare className="mb-2 h-4 w-4" /> RFIs<br /><b>3</b></div>
                  <div className="rounded-xl border border-slate-200 p-3"><ShieldCheck className="mb-2 h-4 w-4" /> Approvals<br /><b>5</b></div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <h2 className="mb-3 font-semibold">Activity Timeline</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4" /><div><b>QA submitted</b><br /><span className="text-slate-500">Concrete checklist ready for approval</span></div></div>
                  <div className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4" /><div><b>Task updated</b><br /><span className="text-slate-500">Rebar fixing changed to 60%</span></div></div>
                  <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4" /><div><b>Dependency blocked</b><br /><span className="text-slate-500">Beam inspection waiting for slab clearance</span></div></div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </main>
      </div>
    </div>
  );
}
