"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Building2,
  Briefcase,
  Clock,
  LogOut,
  CheckSquare,
  FileText,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const HR_MODULES = [
  {
    title: "Employees",
    description: "Manage employee profiles, documents, and certifications",
    href: "/dashboard/hr/employees",
    icon: Users,
    color: "bg-blue-50 text-blue-600",
  },
  {
    title: "Organization",
    description: "Configure departments, teams, positions, and org structure",
    href: "/dashboard/hr/organization",
    icon: Building2,
    color: "bg-purple-50 text-purple-600",
  },
  {
    title: "Resources",
    description: "Allocate employees to projects and WBS elements",
    href: "/dashboard/hr/resources",
    icon: Briefcase,
    color: "bg-green-50 text-green-600",
  },
  {
    title: "Attendance",
    description: "Track daily attendance and absences",
    href: "/dashboard/hr/attendance",
    icon: Clock,
    color: "bg-orange-50 text-orange-600",
  },
  {
    title: "E-Leave",
    description: "Manage leave requests and balances",
    href: "/dashboard/hr/leave",
    icon: LogOut,
    color: "bg-red-50 text-red-600",
  },
  {
    title: "Timesheets",
    description: "Track work hours and overtime",
    href: "/dashboard/hr/timesheet",
    icon: CheckSquare,
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    title: "Documents",
    description: "Upload and manage employee documents",
    href: "/dashboard/hr/documents",
    icon: FileText,
    color: "bg-amber-50 text-amber-600",
  },
  {
    title: "Analytics",
    description: "HR metrics and workforce analytics",
    href: "/dashboard/hr/analytics",
    icon: BarChart3,
    color: "bg-pink-50 text-pink-600",
  },
];

export default function HRDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">HR Module</h1>
        <p className="mt-2 text-muted-foreground">Manage human resources, employee records, and workforce planning</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {HR_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.href} href={module.href}>
              <Card className="h-full transition-all hover:border-primary hover:shadow-md cursor-pointer">
                <CardHeader>
                  <div className={`w-fit rounded-lg p-2 ${module.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription>{module.description}</CardDescription>
                  <Button variant="ghost" size="sm" className="gap-2 p-0">
                    View <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
