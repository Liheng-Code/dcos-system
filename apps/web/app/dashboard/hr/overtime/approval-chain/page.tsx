"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveApprovalChain, type ApprovalChainResult } from "@/lib/hr/approval-chain";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, User, Award, AlertTriangle, Pencil } from "lucide-react";
import { getProfileById, listUserRolesByUserIdWithRoleCodeHRManagerAdmin } from "@/lib/hr/hr-queries";

interface ChainStep {
  stepNumber: number;
  approvalLabel: string;
  roleLabel: string;
  personName: string | null;
  personEmail: string | null;
  isResolved: boolean;
  isEscalation: boolean;
}

type PageState = "loading" | "excluded" | "chain" | "functional";

export default function OtApprovalChainPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [myRoleLabel, setMyRoleLabel] = useState("");
  const [steps, setSteps] = useState<ChainStep[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return;
      const uid = userData.user.id;

      const [profileRes, managerRoleRes] = await Promise.all([
        getProfileById(uid, "role"),
        listUserRolesByUserIdWithRoleCodeHRManagerAdmin(uid),
      ]);

      setCanManage(
        profileRes.data?.role === "admin" || ((managerRoleRes.data?.length ?? 0) > 0),
      );

      const result: ApprovalChainResult = await resolveApprovalChain(supabase, uid);

      if (result.isExcluded) {
        setMyRoleLabel(result.myRoleLevel ?? "");
        setPageState("excluded");
        return;
      }

      const newSteps: ChainStep[] = [];

      if (result.firstApprover) {
        newSteps.push({
          stepNumber: 1,
          approvalLabel: "First Approval",
          roleLabel: result.firstApprover.roleLabel,
          personName: result.firstApprover.full_name,
          personEmail: result.firstApprover.email,
          isResolved: !!result.firstApprover.full_name,
          isEscalation: false,
        });
      }

      if (result.finalApprover) {
        newSteps.push({
          stepNumber: newSteps.length + 1,
          approvalLabel: "HR Approval",
          roleLabel: result.finalApprover.roleLabel,
          personName: result.finalApprover.full_name,
          personEmail: result.finalApprover.email,
          isResolved: !!result.finalApprover.full_name,
          isEscalation: false,
        });
      }

      // Escalation level (Level 3) — added when OT exceeds monthly limit
      newSteps.push({
        stepNumber: newSteps.length + 1,
        approvalLabel: "Final Approval",
        roleLabel: "Escalation · HR Manager / Super Admin",
        personName: null,
        personEmail: null,
        isResolved: false,
        isEscalation: true,
      });

      setMyRoleLabel(result.myRoleLevel ?? "");
      setSteps(newSteps);
      setIsManual(result.source === "manual");
      setPageState(result.isFunctionalOnly ? "functional" : "chain");
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">My Approval Chain</h2>
          <p className="text-muted-foreground">
            Who approves your overtime requests
            {myRoleLabel && (
              <>
                {" · "}
                <span className="font-medium text-foreground">{myRoleLabel}</span>
              </>
            )}
            {isManual && (
              <Badge className="ml-2 bg-purple-100 text-purple-700 text-xs border-0 align-middle">
                Configured by HR
              </Badge>
            )}
          </p>
        </div>

        {canManage && (
          <Button className="gap-2" render={<Link href="/dashboard/hr/overtime/approval-chains" />}>
            <Pencil className="h-4 w-4" />
            Edit Approval Chain
          </Button>
        )}
      </div>

      {pageState === "loading" && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Resolving your approval chain...
          </CardContent>
        </Card>
      )}

      {pageState === "excluded" && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-8 flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-800">Super Admin — OT Approval Not Required</p>
              <p className="text-sm text-blue-600 mt-1">
                Your account (<span className="font-medium">{myRoleLabel}</span>) is excluded from
                the overtime approval process.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(pageState === "chain" || pageState === "functional") && steps.length > 0 && (
        <Card>
          <CardContent className="pt-6 pb-4">
            {pageState === "functional" && (
              <p className="text-xs text-muted-foreground mb-5">
                No internal level role assigned. Your OT is approved directly by HR.
              </p>
            )}

            <div>
              {steps.map((step, i) => (
                <div key={step.stepNumber} className="flex items-start gap-4">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold
                      ${step.isEscalation
                        ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200"
                        : step.isResolved
                          ? "bg-green-100 text-green-700 ring-1 ring-green-200"
                          : "bg-amber-100 text-amber-600 ring-1 ring-amber-200"
                      }`}
                    >
                      {step.stepNumber}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="mt-1 h-12 w-px bg-border" />
                    )}
                  </div>

                  <div className={`flex-1 ${i < steps.length - 1 ? "mb-0" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {step.isEscalation
                        ? <Award className="h-3.5 w-3.5 text-orange-600" />
                        : <User className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {step.approvalLabel}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mb-1">{step.roleLabel}</p>

                    {step.isEscalation ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                        <p className="text-sm text-orange-600">
                          Auto-added when monthly OT exceeds 60h limit
                        </p>
                      </div>
                    ) : step.isResolved ? (
                      <>
                        <p className="font-semibold text-foreground">{step.personName}</p>
                        {step.personEmail && (
                          <p className="text-sm text-muted-foreground">{step.personEmail}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <p className="text-sm text-amber-600">
                          No one is currently assigned to this role. Contact HR.
                        </p>
                      </div>
                    )}

                    {i < steps.length - 1 && <div className="h-3" />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pageState !== "loading" && pageState !== "excluded" && (
        <p className="text-xs text-muted-foreground">
          {isManual
            ? "Your approval chain has been configured by HR with manual assignments."
            : "Your approval chain is derived from your role level in the organization hierarchy."}
          {" "}Requests exceeding the monthly limit (60h) require a third escalation approver.
        </p>
      )}
    </div>
  );
}
