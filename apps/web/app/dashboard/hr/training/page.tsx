"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Award } from "lucide-react";
import { format } from "date-fns";

interface TrainingRecord {
  id: string;
  enrollment_date: string;
  completion_date: string;
  status: string;
  score: number;
  profiles: {
    full_name: string;
    employee_id: string;
  };
  training_courses: {
    course_name: string;
    provider: string;
    duration_hours: number;
  };
}

interface TrainingCertificate {
  id: string;
  certification_name: string;
  issuing_body: string;
  issue_date: string;
  expiry_date: string;
  status: string;
  profiles: {
    full_name: string;
    employee_id: string;
  };
}

export default function TrainingPage() {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [certificates, setCertificates] = useState<TrainingCertificate[]>([]);
  const [stats, setStats] = useState({
    total_trainings: 0,
    completed: 0,
    in_progress: 0,
    expiring_certs: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Fetch training record statistics
    supabase
      .from("training_records")
      .select("status")
      .then(({ data }) => {
        if (data) {
          const completed = data.filter((r) => r.status === "completed").length;
          const inProgress = data.filter((r) => r.status === "in_progress").length;

          setStats((prev) => ({
            ...prev,
            total_trainings: data.length,
            completed,
            in_progress: inProgress,
          }));
        }
      });

    // Fetch recent training records
    supabase
      .from("training_records")
      .select(`
        id,
        enrollment_date,
        completion_date,
        status,
        score,
        profiles(full_name, employee_id),
        training_courses(course_name, provider, duration_hours)
      `)
      .order("enrollment_date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setRecords(data as any);
      });

    // Fetch certificates expiring within 30 days
    supabase
      .from("training_certificates")
      .select(`
        id,
        certification_name,
        issuing_body,
        issue_date,
        expiry_date,
        status,
        profiles(full_name, employee_id)
      `)
      .lte("expiry_date", thirtyDaysFromNow.toISOString().split("T")[0])
      .gte("expiry_date", new Date().toISOString().split("T")[0])
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setCertificates(data as any);
          setStats((prev) => ({ ...prev, expiring_certs: data.length }));
        }
        setLoading(false);
      });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700";
      case "in_progress":
        return "bg-blue-50 text-blue-700";
      case "enrolled":
        return "bg-amber-50 text-amber-700";
      case "failed":
        return "bg-red-50 text-red-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getCertStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-50 text-green-700";
      case "expired":
        return "bg-red-50 text-red-700";
      case "pending_renewal":
        return "bg-amber-50 text-amber-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Training Management</h2>
          <p className="text-muted-foreground">Manage employee training and certifications</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Training
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Trainings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_trainings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.in_progress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Certs Expiring (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.expiring_certs}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Training Records</CardTitle>
            <CardDescription>Recent training enrollments and completions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading records...</p>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8">
                <Award className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No training records found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {records.slice(0, 5).map((record) => (
                  <div key={record.id} className="flex items-center justify-between border border-border rounded-lg p-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{record.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{record.training_courses.course_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.score && <span className="text-xs font-medium">{record.score}/100</span>}
                      <Badge className={`text-xs ${getStatusColor(record.status)}`}>
                        {record.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expiring Certifications</CardTitle>
            <CardDescription>Certificates expiring within 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading certificates...</p>
              </div>
            ) : certificates.length === 0 ? (
              <div className="text-center py-8">
                <Award className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No expiring certificates</p>
              </div>
            ) : (
              <div className="space-y-3">
                {certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{cert.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{cert.certification_name}</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Expires: {format(new Date(cert.expiry_date), "dd MMM yyyy")}
                      </p>
                    </div>
                    <Badge className={`text-xs ${getCertStatusColor(cert.status)}`}>
                      {cert.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
