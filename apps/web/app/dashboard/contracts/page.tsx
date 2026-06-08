"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, FileSignature, ScrollText, AlertTriangle, MessageSquare, Shield, Clock } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TimeBarAlert {
  id: string; notice_no: string; title: string;
  contract_no: string; deadline_date: string;
  alert_level: "overdue" | "approaching" | "ok";
  status: string;
}

const QUICK_LINKS = [
  { href: "/dashboard/contracts/register", label: "Contract Register", icon: FileSignature, desc: "Head contracts and subcontracts", color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/contracts/notices", label: "Notices", icon: AlertTriangle, desc: "Contractual notices and time bars", color: "bg-red-50 text-red-600" },
  { href: "/dashboard/contracts/employer-instructions", label: "Employer Instructions", icon: ScrollText, desc: "Client directions and instructions", color: "bg-amber-50 text-amber-600" },
  { href: "/dashboard/contracts/correspondence", label: "Correspondence", icon: MessageSquare, desc: "Formal correspondence log", color: "bg-emerald-50 text-emerald-600" },
  { href: "/dashboard/contracts/entitlements", label: "Entitlements", icon: Shield, desc: "Time and cost entitlements", color: "bg-purple-50 text-purple-600" },
];

export default function ContractsDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState({ contracts: 0, notices: 0, overdue: 0, activeContracts: 0, totalValue: 0 });
  const [alerts, setAlerts] = useState<TimeBarAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("contract_register").select("id", { count: "exact", head: true }),
      supabase.from("contractual_notices").select("id", { count: "exact", head: true }),
      supabase.from("contractual_notices").select("id", { count: "exact", head: true })
        .eq("status", "pending").lt("deadline_date", new Date().toISOString()),
      supabase.from("contract_register").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("contract_register").select("contract_value"),
      supabase.from("time_bar_alerts").select("*").order("deadline_date"),
    ]).then(([c, n, o, a, v, al]) => {
      const totalValue = (v.data ?? []).reduce((s: number, r: any) => s + Number(r.contract_value), 0);
      setStats({
        contracts: c.count ?? 0,
        notices: n.count ?? 0,
        overdue: o.count ?? 0,
        activeContracts: a.count ?? 0,
        totalValue,
      });
      setAlerts((al.data ?? []) as TimeBarAlert[]);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contract Administration</h1>
        <p className="text-sm text-muted-foreground">Manage contractual obligations, notices, entitlements, and correspondence</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.contracts}</p>
              <p className="text-xs text-muted-foreground">Total Contracts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeContracts}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.notices}</p>
              <p className="text-xs text-muted-foreground">Notices Served</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.overdue}</p>
              <p className="text-xs text-muted-foreground">Overdue / Time-Barring</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Time-Bar Alerts</p>
            </div>
            <div className="space-y-1">
              {alerts.slice(0, 10).map((a) => (
                <Link key={a.id} href={`/dashboard/contracts/notices/${a.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    a.alert_level === "overdue" ? "bg-red-500" :
                    a.alert_level === "approaching" ? "bg-amber-500" : "bg-green-500"
                  )} />
                  <span className="font-medium flex-1">{a.notice_no}</span>
                  <span className="text-muted-foreground flex-1 truncate">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.contract_no}</span>
                  <span className={cn(
                    "text-xs font-medium",
                    a.alert_level === "overdue" ? "text-red-600" :
                    a.alert_level === "approaching" ? "text-amber-600" : "text-green-600"
                  )}>{a.deadline_date}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${link.color}`}>
                  <link.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
