"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMiniApp } from "@/lib/telegram/miniapp-context";

// Mirrors PendingApprovalRow (apps/web/lib/hr/leave.ts:151-160) — same shape
// as the list screen, since there is no single "get one pending approval by
// id" endpoint; this screen fetches the full list and finds the matching
// entry client-side.
interface PendingApproval {
  id: string;
  employee_name: string;
  employee_code: string | null;
  leave_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
}

// Human-readable mapping for DecideLeaveRequestError (apps/web/lib/hr/leave.ts:242),
// as returned by the approve/reject routes' `{ error }` body on failure.
const DECISION_ERROR_MESSAGES: Record<string, string> = {
  not_found: "This leave request could not be found.",
  not_pending: "This request was already decided.",
  not_your_turn: "This request isn't awaiting your approval.",
  reason_required: "A reason is required to reject this request.",
};

type DecisionState = { status: "idle" } | { status: "submitting" } | { status: "done"; decision: "approved" | "rejected" };

export default function LeaveApprovalDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const requestId = typeof params.id === "string" ? params.id : "";
  const { initData } = useMiniApp();

  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/miniapp/leave/pending-approvals", {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      setApprovals(body.approvals ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetchApprovals();
  };

  const request = useMemo(
    () => approvals?.find((a) => a.id === requestId) ?? null,
    [approvals, requestId],
  );

  // ── Reject reason UI state ──────────────────────────────────────────────
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ── Decision submission state ───────────────────────────────────────────
  const [decisionState, setDecisionState] = useState<DecisionState>({ status: "idle" });
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const submitDecision = useCallback(
    async (decision: "approved" | "rejected", notes?: string) => {
      if (decisionState.status === "submitting") return;
      setDecisionState({ status: "submitting" });
      setDecisionError(null);

      try {
        const res = await fetch(`/api/telegram/miniapp/leave/${decision === "approved" ? "approve" : "reject"}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `tma ${initData}`,
          },
          body: JSON.stringify({
            request_id: requestId,
            ...(notes ? { notes } : {}),
          }),
        });

        const body = await res.json().catch(() => null);

        if (!res.ok) {
          const message =
            (body?.error && DECISION_ERROR_MESSAGES[body.error]) ||
            (body?.error === "invalid_body" && "Please check the request and try again.") ||
            "Something went wrong. Please try again.";
          setDecisionError(message);
          setDecisionState({ status: "idle" });
          return;
        }

        setDecisionState({ status: "done", decision });
      } catch {
        setDecisionError("Couldn't reach the server. Check your connection and try again.");
        setDecisionState({ status: "idle" });
      }
    },
    [decisionState.status, initData, requestId],
  );

  const handleApproveTap = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.showConfirm) {
      webApp.showConfirm("Approve this leave request?", (confirmed) => {
        if (confirmed) submitDecision("approved");
      });
    } else {
      // Outside Telegram (e.g. plain browser during dev) there's no native
      // confirm bridge — fall back to submitting directly so the screen is
      // still exercisable.
      submitDecision("approved");
    }
  }, [submitDecision]);

  const handleRejectSubmit = useCallback(() => {
    const trimmed = rejectReason.trim();
    if (!trimmed) return;
    submitDecision("rejected", trimmed);
  }, [rejectReason, submitDecision]);

  // BackButton: returns to the approvals list, not the top-level menu.
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const onBack = () => router.push("/telegram-app/leave/approvals");
    webApp.BackButton.show();
    webApp.BackButton.onClick(onBack);
    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [router]);

  // No MainButton on this screen — Approve vs Reject are two competing
  // primary actions, so both are rendered as regular Buttons instead of
  // claiming the single Telegram MainButton for one of them.

  // ── Render ────────────────────────────────────────────────────────────

  if (decisionState.status === "done") {
    const approved = decisionState.decision === "approved";
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4 pt-16 text-center">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-full ${approved ? "bg-green-100" : "bg-red-100"}`}
        >
          {approved ? (
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          ) : (
            <XCircle className="h-7 w-7 text-red-600" />
          )}
        </div>
        <div>
          <p className="text-base font-semibold">{approved ? "Request approved" : "Request rejected"}</p>
          <p className="mt-1 text-sm text-[var(--tg-hint-color)]">
            {approved
              ? "The leave request has been approved."
              : "The leave request has been rejected and the employee will be notified."}
          </p>
        </div>
        <Button onClick={() => router.push("/telegram-app/leave/approvals")}>Back to Approvals</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-24">
      <h1 className="px-1 text-lg font-semibold">Review Request</h1>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-[var(--tg-hint-color)]">Couldn&apos;t load this request.</p>
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && !request && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-[var(--tg-hint-color)]" />
            <p className="text-sm text-[var(--tg-hint-color)]">
              This request is no longer available for your review.
            </p>
            <Button size="sm" onClick={() => router.push("/telegram-app/leave/approvals")}>
              Back to Approvals
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && request && (
        <>
          <Card gradient={false}>
            <CardContent className="flex flex-col gap-2 py-1">
              <div>
                <p className="text-sm font-medium">{request.employee_name}</p>
                {request.employee_code && (
                  <p className="text-xs text-[var(--tg-hint-color)]">{request.employee_code}</p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[var(--tg-secondary-bg-color)] pt-2">
                <span className="text-xs text-[var(--tg-hint-color)]">Leave type</span>
                <span className="text-sm font-medium">{request.leave_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--tg-hint-color)]">Dates</span>
                <span className="text-sm font-medium">
                  {format(parseISO(request.start_date), "dd MMM")} –{" "}
                  {format(parseISO(request.end_date), "dd MMM yyyy")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--tg-hint-color)]">Days requested</span>
                <span className="text-sm font-medium">
                  {request.days_requested} day{request.days_requested !== 1 ? "s" : ""}
                </span>
              </div>
              {request.reason && (
                <div className="border-t border-[var(--tg-secondary-bg-color)] pt-2">
                  <p className="text-xs text-[var(--tg-hint-color)]">Reason</p>
                  <p className="mt-0.5 text-sm">{request.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {decisionError && (
            <Card gradient={false}>
              <CardContent className="flex items-start gap-2 py-2 text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{decisionError}</p>
              </CardContent>
            </Card>
          )}

          {!showReject && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleApproveTap}
                disabled={decisionState.status === "submitting"}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setShowReject(true)}
                disabled={decisionState.status === "submitting"}
              >
                Reject
              </Button>
            </div>
          )}

          {showReject && (
            <Card gradient={false}>
              <CardContent className="flex flex-col gap-1.5 py-1">
                <label className="text-xs font-medium text-[var(--tg-hint-color)]" htmlFor="reject-reason">
                  Reason for rejection
                </label>
                <textarea
                  id="reject-reason"
                  className="min-h-[80px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Explain why this request is being rejected"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                {rejectReason.trim().length === 0 && (
                  <p className="text-xs text-amber-600">A reason is required to reject this request.</p>
                )}
                <div className="mt-1 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason("");
                    }}
                    disabled={decisionState.status === "submitting"}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleRejectSubmit}
                    disabled={decisionState.status === "submitting" || rejectReason.trim().length === 0}
                  >
                    Confirm Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {decisionState.status === "submitting" && (
            <p className="px-1 text-center text-xs text-[var(--tg-hint-color)]">Submitting…</p>
          )}
        </>
      )}
    </div>
  );
}
