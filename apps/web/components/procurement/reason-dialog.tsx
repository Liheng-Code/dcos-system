"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Minimum trimmed length. Without it any non-empty reason is accepted. */
  minLength?: number;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  minLength,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = reason.trim();
  const required = minLength ?? 1;
  const valid = trimmed.length >= required;

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    if (!next) setReason("");
    onOpenChange(next);
  }

  async function handleConfirm() {
    if (!valid) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="proc-reason">Reason</Label>
          <Textarea
            id="proc-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Enter a reason"
            disabled={submitting}
          />
          {minLength != null && (
            <p className={valid ? "text-xs text-muted-foreground" : "text-xs text-amber-600"}>
              {trimmed.length} / {minLength} characters minimum
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!valid || submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
