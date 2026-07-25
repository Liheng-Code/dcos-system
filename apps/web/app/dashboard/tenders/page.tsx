"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, FileSearch, Award, Calculator, DollarSign, TrendingUp, ClipboardList } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const QUICK_LINKS = [
  { href: "/dashboard/tenders/register", label: "Tender Register", icon: FileSearch, desc: "Active and past tenders", color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/tenders/tender-management", label: "Tender Management", icon: ClipboardList, desc: "Invitations, addenda, Q&A", color: "bg-cyan-50 text-cyan-600" },
  { href: "/dashboard/tenders/cost-estimation", label: "Cost Estimation", icon: Calculator, desc: "Tender BOQ, unit rates, bid build-up", color: "bg-emerald-50 text-emerald-600" },
  { href: "/dashboard/tenders/submissions", label: "Submissions", icon: DollarSign, desc: "Bidder submissions and pricing", color: "bg-amber-50 text-amber-600" },
  { href: "/dashboard/tenders/bid-evaluation", label: "Bid Evaluation", icon: Award, desc: "Scoring, comparison, award", color: "bg-purple-50 text-purple-600" },
];

export default function TendersDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState({ total: 0, active: 0, submissions: 0, awarded: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("tender_register").select("id", { count: "exact", head: true }),
      supabase.from("tender_register").select("id", { count: "exact", head: true }).in("status", ["published","invitation","submission"]),
      supabase.from("tender_submissions").select("id", { count: "exact", head: true }),
      supabase.from("tender_award_records").select("id", { count: "exact", head: true }),
    ]).then(([t, a, s, aw]) => {
      setStats({
        total: t.count ?? 0,
        active: a.count ?? 0,
        submissions: s.count ?? 0,
        awarded: aw.count ?? 0,
      });
      setLoading(false);
    });
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tendering</h1>
        <p className="text-sm text-muted-foreground">Pre-contract tender management, cost estimation, and bid evaluation</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileSearch className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Tenders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DollarSign className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">{stats.submissions}</p>
              <p className="text-xs text-muted-foreground">Submissions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Award className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-2xl font-bold">{stats.awarded}</p>
              <p className="text-xs text-muted-foreground">Awards</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${l.color}`}>
                  <l.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-muted-foreground">{l.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
