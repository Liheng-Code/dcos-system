import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  Filter,
  FolderTree,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const steps = [
  { id: 1, title: "Basic Info", icon: Building2 },
  { id: 2, title: "Contract", icon: Landmark },
  { id: 3, title: "Stakeholders", icon: Users },
  { id: 4, title: "Team", icon: ShieldCheck },
  { id: 5, title: "Calendar", icon: CalendarDays },
  { id: 6, title: "WBS", icon: FolderTree },
  { id: 7, title: "Numbering", icon: FileText },
  { id: 8, title: "Approval", icon: ClipboardList },
  { id: 9, title: "Budget", icon: DollarSign },
  { id: 10, title: "Notification", icon: Bell },
  { id: 11, title: "Activate", icon: CheckCircle2 },
];

const sampleProjects = [
  { code: "24GDTT", name: "GDT Tower Project", type: "Awarded", client: "GDT Group", pm: "Project Manager", status: "Draft", completion: 72 },
  { code: "26MALL", name: "Mixed Use Mall Development", type: "Tender", client: "Private Owner", pm: "Not Assigned", status: "Tender", completion: 35 },
  { code: "DCOS-HQ", name: "Internal DCOS Office Fit-Out", type: "Internal", client: "Internal", pm: "Admin", status: "Active", completion: 100 },
  { code: "25COND", name: "Condominium Tower B", type: "Awarded", client: "Urban Living", pm: "Sokha", status: "Active", completion: 91 },
];

const validationItems = [
  { label: "Project code created", ok: true },
  { label: "Client assigned", ok: true },
  { label: "Project manager assigned", ok: false },
  { label: "Project calendar configured", ok: true },
  { label: "Document numbering rule configured", ok: false },
  { label: "WBS setup selected", ok: true },
];

const stakeholderTemplates = [
  {
    id: "tpl-001",
    name: "Standard High-Rise Project",
    description: "Typical tower project stakeholder structure",
    companies: [
      {
        placeholderName: "Client / Owner",
        type: "Owner",
        mappedCompany: "GDT Group",
        teams: [
          { name: "Client Approval Team", members: 4, permission: "Final approval" },
          { name: "Client Commercial Team", members: 3, permission: "Commercial review" },
        ],
      },
      {
        placeholderName: "Consultant",
        type: "Consultant",
        mappedCompany: "ABC Consultant Co., Ltd.",
        teams: [
          { name: "Design Review Team", members: 6, permission: "Drawing review" },
          { name: "Site Inspection Team", members: 5, permission: "Inspection approval" },
        ],
      },
      {
        placeholderName: "Main Contractor",
        type: "Internal",
        mappedCompany: "Your Company",
        teams: [
          { name: "Construction Team", members: 20, permission: "Progress update" },
          { name: "QA/QC Team", members: 6, permission: "Inspection control" },
        ],
      },
      {
        placeholderName: "Subcontractor",
        type: "Subcontractor",
        mappedCompany: "To be selected",
        teams: [
          { name: "Concrete Works Team", members: 18, permission: "Submit work progress" },
          { name: "Rebar Fixing Team", members: 14, permission: "Upload site photos" },
        ],
      },
    ],
  },
  {
    id: "tpl-002",
    name: "Infrastructure Project",
    description: "Road, bridge, utility and authority-heavy projects",
    companies: [
      {
        placeholderName: "Government Authority",
        type: "Authority",
        mappedCompany: "To be selected",
        teams: [{ name: "Authority Approval Team", members: 3, permission: "Authority approval" }],
      },
      {
        placeholderName: "Consultant",
        type: "Consultant",
        mappedCompany: "To be selected",
        teams: [{ name: "Supervision Team", members: 5, permission: "Site supervision" }],
      },
    ],
  },
];

function StatusBadge({ status }) {
  const tone = status === "Active" ? "bg-emerald-100 text-emerald-700" : status === "Tender" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function Field({ label, placeholder = "", value = "" }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <Input defaultValue={value} placeholder={placeholder} className="h-10 rounded-xl" />
    </div>
  );
}

function SelectBox({ label, value }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="flex h-10 items-center justify-between rounded-xl border bg-white px-3 text-sm text-slate-700">
        <span>{value}</span>
        <ChevronRight className="h-4 w-4 rotate-90 text-slate-400" />
      </div>
    </div>
  );
}

function StakeholderTemplateWorkspace() {
  const [selectedTemplate, setSelectedTemplate] = useState(stakeholderTemplates[0]);
  const [selectedCompanyIndex, setSelectedCompanyIndex] = useState(0);
  const selectedCompany = selectedTemplate.companies[selectedCompanyIndex] ?? selectedTemplate.companies[0];

  function handleTemplateSelect(template) {
    setSelectedTemplate(template);
    setSelectedCompanyIndex(0);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr_1fr]">
      <div className="rounded-3xl border bg-slate-50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">Stakeholder Templates</p>
            <p className="text-xs text-slate-500">Create once, reuse across projects</p>
          </div>
          <Button size="sm" className="rounded-xl">
            <Plus className="mr-1 h-4 w-4" /> Template
          </Button>
        </div>

        <div className="space-y-2">
          {stakeholderTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleTemplateSelect(template)}
              className={`w-full rounded-2xl border p-4 text-left transition hover:bg-white ${selectedTemplate.id === template.id ? "bg-white shadow-sm ring-2 ring-slate-900" : "bg-white/70"}`}
            >
              <p className="font-semibold text-slate-800">{template.name}</p>
              <p className="text-xs text-slate-500">{template.description}</p>
              <p className="mt-2 text-xs text-slate-400">{template.companies.length} company placeholders</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">Template Structure</p>
            <p className="text-xs text-slate-500">Company placeholders → team templates</p>
          </div>
          <Button size="sm" variant="outline" className="rounded-xl">
            Edit Template
          </Button>
        </div>

        <div className="space-y-3">
          {selectedTemplate.companies.map((company, index) => (
            <button
              key={`${company.placeholderName}-${index}`}
              type="button"
              onClick={() => setSelectedCompanyIndex(index)}
              className={`w-full rounded-2xl border p-4 text-left transition hover:bg-slate-50 ${selectedCompanyIndex === index ? "border-slate-900 bg-slate-50" : "bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{company.placeholderName}</p>
                  <p className="text-sm text-slate-500">Mapped company: {company.mappedCompany}</p>
                </div>
                <Badge variant="secondary" className="rounded-full">{company.type}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {company.teams.map((team) => (
                  <div key={team.name} className="flex items-center justify-between rounded-xl bg-white p-3 text-sm">
                    <span className="font-medium text-slate-700">{team.name}</span>
                    <span className="text-xs text-slate-500">{team.members} roles</span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-4">
        <div className="mb-4">
          <p className="font-semibold text-slate-800">Assign Template to Project</p>
          <p className="text-xs text-slate-500">Apply blueprint, then map real companies and users</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-sm text-slate-300">Selected Template</p>
          <p className="mt-1 text-xl font-bold">{selectedTemplate.name}</p>
          <p className="mt-2 text-sm text-slate-300">Selected placeholder: {selectedCompany.placeholderName}</p>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <p className="font-medium text-slate-800">Company Mapping</p>
            <p className="mt-1 text-sm text-slate-500">{selectedCompany.placeholderName} → {selectedCompany.mappedCompany}</p>
            <Button size="sm" variant="outline" className="mt-3 rounded-xl">Change Mapping</Button>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <p className="mb-3 font-medium text-slate-800">Teams Created After Apply</p>
            <div className="space-y-2">
              {selectedCompany.teams.map((team) => (
                <div key={team.name} className="rounded-xl bg-white p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{team.name}</span>
                    <Badge className="rounded-full bg-slate-900">{team.permission}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">Rule</p>
            <p className="mt-1 text-xs text-amber-700">Templates stay as master data. Applying a template creates project-specific stakeholder records.</p>
          </div>
        </div>

        <Button className="mt-4 w-full rounded-2xl">Apply Template to Project</Button>
      </div>
    </div>
  );
}

function StepContent({ activeStep }) {
  if (activeStep === 1) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Project Code" value="24GDTT" />
        <Field label="Project Name" value="GDT Tower Project" />
        <Field label="Project Short Name" value="GDTT" />
        <SelectBox label="Project Type" value="Awarded / Post-Contract" />
        <SelectBox label="Project Category" value="Building / High-Rise" />
        <Field label="Project Location" value="Phnom Penh, Cambodia" />
        <div className="md:col-span-2">
          <Field label="Project Description" value="Commercial tower project with design, procurement, construction, QA/QC and handover control." />
        </div>
      </div>
    );
  }

  if (activeStep === 2) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <SelectBox label="Contract Type" value="Lump Sum" />
        <Field label="Contract Value" value="25,000,000" />
        <SelectBox label="Currency" value="USD" />
        <Field label="Start Date" value="2026-06-01" />
        <Field label="Finish Date" value="2028-06-01" />
        <Field label="DLP Period" value="12 Months" />
        <Field label="Retention" value="5%" />
        <Field label="Advance Payment" value="10%" />
        <Field label="Duration" value="24 Months" />
      </div>
    );
  }

  if (activeStep === 3) {
    return <StakeholderTemplateWorkspace />;
  }

  if (activeStep === 4) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {["Project Director", "Project Manager", "Design Manager", "Construction Manager", "QS Manager", "Procurement Manager", "QA/QC Manager", "HSE Manager", "Document Controller", "STR / ARC / MEP Leads"].map((role) => (
          <div key={role} className="rounded-2xl border bg-white p-4">
            <p className="font-medium text-slate-800">{role}</p>
            <p className="text-sm text-slate-500">Select internal user and responsibility scope.</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeStep === 5) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SelectBox label="Working Days" value="Monday to Saturday" />
        <Field label="Working Hours" value="08:00 - 17:00" />
        <SelectBox label="Weekend Rule" value="Sunday Off" />
        <SelectBox label="Public Holiday Calendar" value="Cambodia National Calendar" />
        <SelectBox label="Shift Type" value="Day Shift" />
        <Field label="Special Exception Days" value="Project-specific non-working days" />
      </div>
    );
  }

  if (activeStep === 6) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {["Use Company WBS Template", "Create WBS Manually", "Import WBS from Excel", "Clone from Existing Project"].map((item, index) => (
          <div key={item} className={`rounded-2xl border p-5 ${index === 0 ? "bg-slate-900 text-white" : "bg-white"}`}>
            <FolderTree className="mb-3 h-6 w-6" />
            <p className="font-semibold">{item}</p>
            <p className={`mt-1 text-sm ${index === 0 ? "text-slate-300" : "text-slate-500"}`}>Project → Building → Level → Zone → Room → Element</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeStep === 7) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-medium uppercase text-slate-500">Document Number Format</p>
          <p className="mt-2 font-mono text-lg text-slate-800">PROJECT-DISC-DOC-BLDG-LEVEL-SEQ-REV</p>
          <p className="mt-1 font-mono text-sm text-slate-500">Example: 24GDTT-STR-DWG-B01-L05-001-R02</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectBox label="Discipline Code" value="ARC / STR / MEP" />
          <SelectBox label="Document Type" value="DWG / RFI / MRA / MOS" />
          <SelectBox label="Revision Format" value="R00, R01, R02" />
        </div>
      </div>
    );
  }

  if (activeStep === 8) {
    return (
      <div className="space-y-3">
        {["Drawing Approval", "RFI Response", "Material Approval", "Method Statement", "PR / PO Approval", "Inspection Request", "NCR Closeout"].map((flow) => (
          <div key={flow} className="rounded-2xl border bg-white p-4">
            <p className="font-medium text-slate-800">{flow}</p>
            <p className="text-sm text-slate-500">Engineer → Discipline Lead → Project Manager → Consultant</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeStep === 9) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Main Contract Value" value="25,000,000" />
        <Field label="Contingency" value="5%" />
        <SelectBox label="Cost Code Template" value="Company Standard Cost Code" />
        <SelectBox label="Approval Limit Rule" value="By Role and Amount" />
      </div>
    );
  }

  if (activeStep === 10) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {["Task Assigned", "Task Overdue", "Document Submitted", "RFI Overdue", "PR Approval Required", "NCR Created", "Safety Incident", "Payment Approval"].map((rule) => (
          <div key={rule} className="flex items-center justify-between rounded-2xl border bg-white p-4">
            <span className="font-medium text-slate-800">{rule}</span>
            <Badge variant="secondary" className="rounded-full">In-app + Telegram</Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-slate-50 p-5">
        <p className="font-semibold text-slate-800">Activation Checklist</p>
        <p className="text-sm text-slate-500">Project can only be activated when required setup items are complete.</p>
      </div>
      {validationItems.map((item) => (
        <div key={item.label} className="flex items-center justify-between rounded-2xl border bg-white p-4">
          <span className="font-medium text-slate-700">{item.label}</span>
          {item.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
        </div>
      ))}
      <Button className="w-full rounded-2xl" disabled={validationItems.some((item) => !item.ok)}>Activate Project</Button>
    </div>
  );
}

export default function DCOSProjectSetupUI() {
  const [activeStep, setActiveStep] = useState(1);
  const [selectedProject, setSelectedProject] = useState(sampleProjects[0]);
  const active = useMemo(() => steps.find((step) => step.id === activeStep), [activeStep]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <LayoutDashboard className="h-4 w-4" />
              DCOS / Projects / Project Setup
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Project Setup</h1>
            <p className="mt-1 text-slate-500">Workspace for project creation, template setup, validation, and activation.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-2xl">
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Configure
            </Button>
            <Button className="rounded-2xl">
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-3xl"><CardContent className="p-5"><p className="text-sm text-slate-500">Total Projects</p><p className="mt-2 text-3xl font-bold">24</p></CardContent></Card>
          <Card className="rounded-3xl"><CardContent className="p-5"><p className="text-sm text-slate-500">Active</p><p className="mt-2 text-3xl font-bold">12</p></CardContent></Card>
          <Card className="rounded-3xl"><CardContent className="p-5"><p className="text-sm text-slate-500">Tender</p><p className="mt-2 text-3xl font-bold">7</p></CardContent></Card>
          <Card className="rounded-3xl"><CardContent className="p-5"><p className="text-sm text-slate-500">Incomplete Setup</p><p className="mt-2 text-3xl font-bold">5</p></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_1.75fr_0.9fr]">
          <Card className="rounded-3xl shadow-sm xl:col-span-1">
            <CardContent className="p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between xl:flex-col xl:items-start">
                <div>
                  <h2 className="text-lg font-semibold">Project Register</h2>
                  <p className="text-sm text-slate-500">Main content table, not left navigation.</p>
                </div>
                <div className="flex w-full gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input className="w-full bg-transparent text-sm outline-none" placeholder="Search project..." />
                  </div>
                  <Button variant="outline" className="rounded-2xl"><Filter className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sampleProjects.map((project) => (
                      <tr key={project.code} onClick={() => setSelectedProject(project)} className={`cursor-pointer hover:bg-slate-50 ${selectedProject.code === project.code ? "bg-slate-50" : ""}`}>
                        <td className="px-4 py-4 font-semibold text-slate-900">{project.code}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-800">{project.name}</p>
                          <p className="text-xs text-slate-500">{project.type} · {project.client}</p>
                        </td>
                        <td className="px-4 py-4"><StatusBadge status={project.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-5">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Project Setup Wizard</h2>
                  <p className="text-sm text-slate-500">Selected: {selectedProject.code} — Step {activeStep} of {steps.length}: {active?.title}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={() => setActiveStep(Math.max(1, activeStep - 1))}>Back</Button>
                  <Button className="rounded-xl" onClick={() => setActiveStep(Math.min(steps.length, activeStep + 1))}>Next</Button>
                </div>
              </div>

              <div className="mb-6 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-2">
                  {steps.map((step) => {
                    const Icon = step.icon;
                    const selected = step.id === activeStep;
                    const done = step.id < activeStep;
                    return (
                      <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${selected ? "bg-slate-900 text-white" : done ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-500"}`}>
                        <Icon className="h-4 w-4" />{step.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.div key={activeStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-3xl border bg-white p-5">
                <div className="mb-5 flex items-center gap-3">
                  {active && <active.icon className="h-6 w-6 text-slate-700" />}
                  <div>
                    <h3 className="text-xl font-semibold">{active?.title}</h3>
                    <p className="text-sm text-slate-500">Configure project setup data before activation.</p>
                  </div>
                </div>
                <StepContent activeStep={activeStep} />
              </motion.div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Setup Summary</h2>
                  <p className="text-sm text-slate-500">{selectedProject.code}</p>
                </div>
                <MoreHorizontal className="h-5 w-5 text-slate-400" />
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-900 p-5 text-white">
                  <p className="text-sm text-slate-300">Current Project</p>
                  <p className="mt-1 text-xl font-bold">{selectedProject.name}</p>
                  <div className="mt-4 h-2 rounded-full bg-slate-700">
                    <div className="h-2 rounded-full bg-white" style={{ width: `${selectedProject.completion}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-300">Setup completion: {selectedProject.completion}%</p>
                </div>

                <div className="space-y-2">
                  {validationItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-2xl border bg-white p-3">
                      <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      {item.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    </div>
                  ))}
                </div>

                <Button className="w-full rounded-2xl" disabled={validationItems.some((item) => !item.ok)}>Activate Project</Button>
                <Button variant="outline" className="w-full rounded-2xl">View Full Setup Report</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
