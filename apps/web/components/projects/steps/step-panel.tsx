"use client";

import { Building2, Landmark, Users, ShieldCheck, CalendarDays, FolderTree, FileText, ClipboardList, DollarSign, Bell, CheckCircle2, type LucideIcon } from "lucide-react";
import type { Project } from "@/components/projects/project-edit-sheet";

export interface StepInfo {
  id: number;
  title: string;
  icon: LucideIcon;
}

export const STEPS: StepInfo[] = [
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

export interface WizardFormState {
  project_code: string;
  project_name: string;
  project_type: string;
  client_id: string;
  contract_type: string;
  contract_number: string;
  contract_value: string;
  currency: string;
  start_date: string;
  end_date: string;
  project_status: string;
  project_manager_id: string;
  project_director_id: string;
  engineering_manager_id: string;
  planning_manager_id: string;
  description: string;
  short_name: string;
  category: string;
  building_type: string;
  location: string;
  time_zone: string;
  dlp_period: string;
  retention: string;
  advance_payment: string;
  duration: string;
}

export function formStateFromProject(p: Project | null): WizardFormState {
  return {
    project_code: p?.project_code ?? "",
    project_name: p?.project_name ?? "",
    project_type: p?.project_type ?? "tender",
    client_id: p?.client_id ?? "",
    contract_type: p?.contract_type ?? "",
    contract_number: p?.contract_number ?? "",
    contract_value: p?.contract_value?.toString() ?? "",
    currency: p?.currency ?? "USD",
    start_date: p?.start_date ?? "",
    end_date: p?.end_date ?? "",
    project_status: p?.project_status ?? "draft",
    project_manager_id: p?.project_manager_id ?? "",
    project_director_id: p?.project_director_id ?? "",
    engineering_manager_id: p?.engineering_manager_id ?? "",
    planning_manager_id: p?.planning_manager_id ?? "",
    description: p?.description ?? "",
    short_name: p?.short_name ?? "",
    category: p?.category ?? "",
    building_type: p?.building_type ?? "",
    location: p?.location ?? "",
    time_zone: p?.time_zone ?? "Asia/Phnom_Penh",
    dlp_period: p?.dlp_period ?? "",
    retention: p?.retention?.toString() ?? "",
    advance_payment: p?.advance_payment?.toString() ?? "",
    duration: p?.duration ?? "",
  };
}

export function formToPayload(form: WizardFormState) {
  return {
    project_code: form.project_code.toUpperCase(),
    project_name: form.project_name,
    project_type: form.project_type,
    client_id: form.client_id || null,
    contract_type: form.contract_type || null,
    contract_number: form.contract_number || null,
    contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
    currency: form.currency,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    project_status: form.project_status,
    project_manager_id: form.project_manager_id || null,
    project_director_id: form.project_director_id || null,
    engineering_manager_id: form.engineering_manager_id || null,
    planning_manager_id: form.planning_manager_id || null,
    description: form.description || null,
    short_name: form.short_name || null,
    category: form.category || null,
    building_type: form.building_type || null,
    location: form.location || null,
    time_zone: form.time_zone || "Asia/Phnom_Penh",
    dlp_period: form.dlp_period || null,
    retention: form.retention ? parseFloat(form.retention) : null,
    advance_payment: form.advance_payment ? parseFloat(form.advance_payment) : null,
    duration: form.duration || null,
  };
}
