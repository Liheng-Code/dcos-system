"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Star } from "lucide-react";
import { format } from "date-fns";

interface PerformanceReview {
  id: string;
  review_period_start: string;
  review_period_end: string;
  review_type: string;
  overall_score: number;
  status: string;
  profiles: {
    full_name: string;
    employee_id: string;
  };
}

export default function PerformancePage() {
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Fetch performance review statistics
    supabase
      .from("performance_reviews")
      .select("status, overall_score")
      .then(({ data }) => {
        if (data) {
          const completed = data.filter((r) => r.status === "completed").length;
          const avgScore =
            data.filter((r) => r.overall_score).reduce((sum, r) => sum + (r.overall_score || 0), 0) /
            (data.filter((r) => r.overall_score).length || 1);

          setStats({
            total: data.length,
            completed,
            pending: data.filter((r) => r.status !== "completed").length,
            avgScore: isNaN(avgScore) ? 0 : parseFloat(avgScore.toFixed(2)),
          });
        }
      });

    // Fetch recent reviews
    supabase
      .from("performance_reviews")
      .select(`
        id,
        review_period_start,
        review_period_end,
        review_type,
        overall_score,
        status,
        profiles!inner(full_name, employee_id)
      `)
      .order("review_period_start", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setReviews(data as any);
        setLoading(false);
      });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-700";
      case "approved":
        return "bg-blue-50 text-blue-700";
      case "submitted":
        return "bg-amber-50 text-amber-700";
      case "draft":
        return "bg-gray-50 text-gray-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const renderStars = (score: number | null) => {
    if (!score) return "—";
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i <= score ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Management</h2>
          <p className="text-muted-foreground">Track employee performance and conduct reviews</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Review
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avgScore.toFixed(1)}/5.0</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance Reviews</CardTitle>
          <CardDescription>View and manage employee performance reviews</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading reviews...</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8">
              <Star className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No performance reviews found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="flex items-center justify-between border border-border rounded-lg p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-medium">{review.profiles.full_name}</p>
                      <Badge variant="outline" className="text-xs">
                        {review.review_type.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                      <Badge className={`text-xs ${getStatusColor(review.status)}`}>
                        {review.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(review.review_period_start), "dd MMM yyyy")} -{" "}
                      {format(new Date(review.review_period_end), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {review.overall_score && (
                      <div className="flex flex-col items-center gap-1">
                        {renderStars(review.overall_score)}
                        <span className="text-xs font-medium">{review.overall_score.toFixed(1)}/5.0</span>
                      </div>
                    )}
                    {review.status === "draft" || review.status === "submitted" ? (
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
