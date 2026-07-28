"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, PackageCheck } from "lucide-react"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

interface WbsNode {
  id: string
  wbs_code: string
  wbs_name: string
}

interface UserOption {
  id: string
  full_name: string | null
  email: string
}

interface ToolIssueFormProps {
  toolId: string
  toolCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssued: () => void
}

function defaultDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export function ToolIssueForm({ toolId, toolCode, open, onOpenChange, onIssued }: ToolIssueFormProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [projectId, setProjectId] = useState("")
  const [wbsNodeId, setWbsNodeId] = useState("")
  const [custodianId, setCustodianId] = useState("")
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [conditionOut, setConditionOut] = useState("")

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    Promise.all([
      supabase.from("projects").select("id, project_code, project_name").order("project_code"),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]).then(([pRes, uRes]) => {
      if (pRes.data) setProjects(pRes.data as ProjectOption[])
      if (uRes.data) setUsers(uRes.data as UserOption[])
    })
  }, [open])

  const onProjectChange = useCallback(async (pid: string) => {
    setProjectId(pid)
    setWbsNodeId("")
    setWbsNodes([])
    if (!pid) return
    const supabase = createClient()
    const { data } = await supabase
      .from("wbs_nodes")
      .select("id, wbs_code, wbs_name")
      .eq("project_id", pid)
      .order("wbs_code")
    setWbsNodes((data ?? []) as WbsNode[])
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!custodianId) { toast.error("Select a custodian"); return }
    if (!projectId) { toast.error("Select a project"); return }
    if (!dueDate) { toast.error("Select a due date"); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/tools/${toolId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custodian_id: custodianId,
          project_id: projectId,
          wbs_node_id: wbsNodeId || null,
          due_date: dueDate,
          condition_out: conditionOut || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to issue tool")
      toast.success(`${toolCode} issued`)
      onIssued()
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            Issue {toolCode}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Custodian <span className="text-destructive">*</span></Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={custodianId}
              onChange={e => setCustodianId(e.target.value)}
            >
              <option value="">Select custodian…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Project <span className="text-destructive">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={projectId}
                onChange={e => onProjectChange(e.target.value)}
              >
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>WBS Node (optional)</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={wbsNodeId}
                onChange={e => setWbsNodeId(e.target.value)}
                disabled={!projectId || wbsNodes.length === 0}
              >
                <option value="">No specific WBS</option>
                {wbsNodes.map(n => <option key={n.id} value={n.id}>{n.wbs_code} — {n.wbs_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Due Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Condition Out</Label>
              <Input value={conditionOut} onChange={e => setConditionOut(e.target.value)} placeholder="e.g. Good, minor scratches" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue Tool
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
