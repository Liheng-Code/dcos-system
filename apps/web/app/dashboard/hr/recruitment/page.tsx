"use client";

import { useEffect, useState } from "react";
import { listCandidates, listCandidatesOrderedByCreatedAt, listInterviews, listJobRequisitions, listJobRequisitionsOrderedByCreatedAt } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users } from "lucide-react";
import { format } from "date-fns";

interface JobRequisition {
  id: string;
  job_title: string;
  status: string;
  created_at: string;
  target_hire_date: string;
  departments: {
    dept_name: string;
  };
}

interface Candidate {
  id: string;
  candidate_name: string;
  email: string;
  current_company: string;
  status: string;
  created_at: string;
  job_requisitions: {
    job_title: string;
  };
}

interface Interview {
  id: string;
  interview_type: string;
  interview_date: string;
  score: number;
  recommendation: string;
  status: string;
  candidates: {
    candidate_name: string;
  };
}

export default function RecruitmentPage() {
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [stats, setStats] = useState({
    open_positions: 0,
    total_candidates: 0,
    scheduled_interviews: 0,
    pending_offers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Fetch job requisition statistics
    listJobRequisitions()
      .then(({ data }) => {
        if (data) {
          const openPositions = data.filter((r) => r.status === "open").length;
          setStats((prev) => ({
            ...prev,
            open_positions: openPositions,
          }));
        }
      });

    // Fetch requisitions
    listJobRequisitionsOrderedByCreatedAt()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setRequisitions(data as any);
      });

    // Fetch candidates statistics and records
    listCandidates()
      .then(({ data }) => {
        if (data) {
          const scheduled = data.filter((c) => c.status === "interview").length;
          setStats((prev) => ({
            ...prev,
            total_candidates: data.length,
            scheduled_interviews: scheduled,
          }));
        }
      });

    // Fetch recent candidates
    listCandidatesOrderedByCreatedAt()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setCandidates(data as any);
      });

    // Fetch interviews
    listInterviews()
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setInterviews(data as any);
          const pending = data.filter((i) => i.status === "scheduled").length;
          setStats((prev) => ({
            ...prev,
            pending_offers: pending,
          }));
        }
        setLoading(false);
      });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-green-50 text-green-700";
      case "closed":
        return "bg-gray-50 text-gray-700";
      case "filled":
        return "bg-blue-50 text-blue-700";
      case "approved":
        return "bg-blue-50 text-blue-700";
      case "draft":
        return "bg-amber-50 text-amber-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getCandidateStatusColor = (status: string) => {
    switch (status) {
      case "hired":
        return "bg-green-50 text-green-700";
      case "rejected":
        return "bg-red-50 text-red-700";
      case "interview":
        return "bg-blue-50 text-blue-700";
      case "offer":
        return "bg-purple-50 text-purple-700";
      case "applied":
        return "bg-gray-50 text-gray-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "strong_yes":
        return "bg-green-50 text-green-700";
      case "yes":
        return "bg-blue-50 text-blue-700";
      case "maybe":
        return "bg-yellow-50 text-yellow-700";
      case "no":
        return "bg-red-50 text-red-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Recruitment Management</h2>
          <p className="text-muted-foreground">Manage job requisitions, candidates, and interviews</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Requisition
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.open_positions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_candidates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.scheduled_interviews}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Offers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{stats.pending_offers}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job Requisitions</CardTitle>
            <CardDescription>Open and recent job positions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading requisitions...</p>
              </div>
            ) : requisitions.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No job requisitions found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requisitions.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-medium">{req.job_title}</p>
                      <p className="text-xs text-muted-foreground">{req.departments?.dept_name || "Unknown"}</p>
                      {req.target_hire_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Target: {format(new Date(req.target_hire_date), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                    <Badge className={`text-xs ${getStatusColor(req.status)}`}>{req.status.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Candidates</CardTitle>
            <CardDescription>Latest applications and status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading candidates...</p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No candidates found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.slice(0, 5).map((candidate) => (
                  <div key={candidate.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-medium">{candidate.candidate_name}</p>
                      <p className="text-xs text-muted-foreground">{candidate.job_requisitions?.job_title || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{candidate.current_company || "—"}</p>
                    </div>
                    <Badge className={`text-xs ${getCandidateStatusColor(candidate.status)}`}>
                      {candidate.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interview Schedule</CardTitle>
          <CardDescription>Upcoming and completed interviews</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading interviews...</p>
            </div>
          ) : interviews.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No interviews found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left font-medium py-3 px-4">Candidate</th>
                    <th className="text-left font-medium py-3 px-4">Type</th>
                    <th className="text-left font-medium py-3 px-4">Date</th>
                    <th className="text-center font-medium py-3 px-4">Score</th>
                    <th className="text-left font-medium py-3 px-4">Recommendation</th>
                    <th className="text-left font-medium py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.slice(0, 10).map((interview) => (
                    <tr key={interview.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{interview.candidates?.candidate_name || "Unknown"}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {interview.interview_type?.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {interview.interview_date ? format(new Date(interview.interview_date), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="py-3 px-4 text-center">{interview.score || "—"}/10</td>
                      <td className="py-3 px-4">
                        {interview.recommendation && (
                          <Badge className={`text-xs ${getRecommendationColor(interview.recommendation)}`}>
                            {interview.recommendation.replace(/_/g, " ").toUpperCase()}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {interview.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
