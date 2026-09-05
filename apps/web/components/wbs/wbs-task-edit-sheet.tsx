"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2, X, Upload, FileText, Clock, UserCheck, User, Calendar, MapPin, AlertCircle, ImageIcon, Paperclip, ArrowLeft, ArrowLeftRight, Flag, GitBranch } from "lucide-react";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { type WbsTaskRecord, type WbsAuditLogRecord, type WbsNodeRecord, type WbsTaskAlertType } from "@/components/wbs/wbs-types";
import { getUserPermissions, hasPermission, type UserPermissions } from "@/lib/permissions";
import { createTaskAlert } from "@/lib/task-alerts";
import { assignTaskToProfile } from "@/lib/tasks/assign-task";
import { findOrCreateResourceForProfile, addAssignment as addPlanAssignment } from "@/lib/planning/resource-service";
import { useProject } from "@/components/dashboard/project-context";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";

interface WbsTaskEditSheetProps {
  task: WbsTaskRecord | null;
  projectId: string;
  wbsNodeId: string | null;
  wbsNodes?: WbsNodeRecord[];
  onClose: () => void;
  onSave: () => void;
  fullPage?: boolean;
}

const DISCIPLINES = ["", "STR", "ARC", "MEP", "QA", "CIV", "GEO", "ENV", "HSE"];
const TASK_TYPES = ["", "design", "procurement", "construction", "inspection", "testing", "commissioning", "documentation", "hse"];
const TASK_CATEGORIES = ["", "structural", "architectural", "mep", "civil", "geotechnical", "environmental", "quality", "safety"];

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  department: string | null;
}

interface WbsNodeBrief {
  wbs_code: string;
  wbs_name: string;
  full_path: string | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function wbsOptionLabel(node: WbsNodeRecord) {
  if (node.full_path) return node.wbs_name ? `${node.full_path} · ${node.wbs_name}` : node.full_path;
  return node.wbs_name ? `${node.wbs_code} · ${node.wbs_name}` : node.wbs_code;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    open: "bg-slate-100 text-slate-700 border-slate-200",
    assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
    review: "bg-purple-50 text-purple-700 border-purple-200",
    submitted: "bg-cyan-50 text-cyan-700 border-cyan-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
    completed: "bg-gray-100 text-gray-600 border-gray-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

function actionIcon(action: string) {
  if (action.includes("progress") || action.includes("Progress")) return Clock;
  if (action.includes("assign") || action.includes("owner")) return UserCheck;
  if (action.includes("note") || action.includes("comment")) return Paperclip;
  if (action.includes("status")) return AlertCircle;
  return Clock;
}

function isImageType(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
}

function isDuplicateTaskCodeError(message: string) {
  return message.includes("wbs_tasks_project_id_task_code_key") || message.toLowerCase().includes("duplicate key");
}

function FilePreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={file.name} className="h-10 w-10 rounded object-cover border border-border shrink-0" />;
}

export function WbsTaskEditSheet({ task, projectId, wbsNodeId, wbsNodes: propWbsNodes = [], onClose, onSave, fullPage }: WbsTaskEditSheetProps) {
  const isCreating = task === null;
  const defaultCreateWbsNodeId = wbsNodeId ?? propWbsNodes[0]?.id ?? "";
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { setSelectedProjectId } = useProject();

  const [wbsNodes, setWbsNodes] = useState<WbsNodeRecord[]>(propWbsNodes);

  const [form, setForm] = useState({
    wbs_node_id: task?.wbs_node_id ?? defaultCreateWbsNodeId,
    task_code: task?.task_code ?? "",
    task_name: task?.task_name ?? "",
    description: task?.description ?? "",
    task_type: task?.task_type ?? "",
    category: task?.category ?? "",
    status: task?.status ?? "open",
    progress: task?.progress?.toString() ?? "0",
    priority: task?.priority ?? "medium",
    discipline: task?.discipline ?? "",
    owner_name: task?.owner_name ?? "",
    start_date: task?.start_date ?? "",
    end_date: task?.end_date ?? "",
    delay_status: task?.delay_status ?? "on_track",
    qa_status: task?.qa_status ?? "not_required",
    docs_count: task?.docs_count?.toString() ?? "0",
    photos_count: task?.photos_count?.toString() ?? "0",
  });
  const [saving, setSaving] = useState(false);

  const [progressVal, setProgressVal] = useState(task?.progress?.toString() ?? "0");
  const [noteText, setNoteText] = useState("");
  const [delayStatus, setDelayStatus] = useState(task?.delay_status ?? "on_track");
  const [delayReason, setDelayReason] = useState(task?.delay_reason ?? "");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(task?.owner_id ?? "");
  const [planStart, setPlanStart] = useState(task?.start_date ?? "");
  const [planFinish, setPlanFinish] = useState(task?.end_date ?? "");
  const [baselineStart,   setBaselineStart]   = useState<string | null>(task?.baseline_start_date  ?? null);
  const [baselineFinish,  setBaselineFinish]  = useState<string | null>(task?.baseline_finish_date ?? null);
  const [baselineSetAt,   setBaselineSetAt]   = useState<string | null>(task?.baseline_set_at      ?? null);
  const [settingBaseline, setSettingBaseline] = useState(false);
  const [depTaskId,      setDepTaskId]      = useState<string | null>(task?.dependency_task_id ?? null);
  const [depType,        setDepType]        = useState(task?.dependency_type ?? "fs");
  const [depLagDays,     setDepLagDays]     = useState(String(task?.lag_days ?? 0));
  const [depPickerOpen,  setDepPickerOpen]  = useState(false);
  const [depSearch,      setDepSearch]      = useState("");
  const [depTasks,       setDepTasks]       = useState<{ id: string; task_code: string; task_name: string }[]>([]);
  const [depTasksLoaded, setDepTasksLoaded] = useState(false);
  const [savingDep,      setSavingDep]      = useState(false);
  const [depCycleError,  setDepCycleError]  = useState(false);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<WbsAuditLogRecord[]>([]);
  const [wbsNode, setWbsNode] = useState<WbsNodeBrief | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectMode, setRejectMode] = useState<"assignment" | "approval">("assignment");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectFiles, setRejectFiles] = useState<File[]>([]);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurFrequency, setRecurFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurInterval, setRecurInterval] = useState("1");
  const [recurEndDate, setRecurEndDate] = useState("");
  const [perms, setPerms] = useState<UserPermissions | null>(null);
  const [crossDeptEnabled, setCrossDeptEnabled] = useState(false);
  const [crossDeptId, setCrossDeptId] = useState("");
  const [crossDeptNote, setCrossDeptNote] = useState("");
  const [departmentsList, setDepartmentsList] = useState<{ id: string; department_code: string; department_name: string }[]>([]);
  const [myDepartmentId, setMyDepartmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreating) return;
    let cancelled = false;
    (async () => {
      const [{ data: { user } }, deptsRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("departments").select("id, department_code, department_name").order("department_name"),
      ]);
      if (cancelled) return;
      if (deptsRes.data) setDepartmentsList(deptsRes.data as { id: string; department_code: string; department_name: string }[]);
      if (user?.id) {
        setUserId(user.id);
        const meRes = await supabase.from("profiles").select("department_id").eq("id", user.id).maybeSingle();
        if (!cancelled && meRes.data) setMyDepartmentId((meRes.data.department_id as string | null) ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [isCreating, supabase]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rejectFileInputRef = useRef<HTMLInputElement>(null);

  const { markTaskRead } = useTaskAlerts();
  useEffect(() => {
    if (!task?.id) return;
    void markTaskRead(task.id);
  }, [task?.id, markTaskRead]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    supabase
      .from("wbs_nodes")
      .select("*")
      .eq("project_id", projectId)
      .order("full_path", { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const fresh = data as WbsNodeRecord[];
        setWbsNodes(fresh);
        if (isCreating) {
          setForm((prev) => {
            const currentValid = prev.wbs_node_id && fresh.some((node) => node.id === prev.wbs_node_id);
            if (currentValid) return prev;
            const nextId = wbsNodeId ?? fresh[0]?.id ?? "";
            return nextId !== prev.wbs_node_id ? { ...prev, wbs_node_id: nextId } : prev;
          });
        }
      });
    return () => { cancelled = true; };
  }, [projectId, supabase, isCreating, wbsNodeId]);

  // Load candidate predecessor tasks when the picker opens (lazy, once per mount)
  useEffect(() => {
    if (!depPickerOpen || depTasksLoaded || !task) return;
    supabase
      .from("wbs_tasks")
      .select("id, task_code, task_name")
      .eq("project_id", projectId)
      .neq("id", task.id)
      .order("task_code")
      .limit(200)
      .then(({ data }) => {
        if (data) setDepTasks(data as { id: string; task_code: string; task_name: string }[]);
        setDepTasksLoaded(true);
      });
  }, [depPickerOpen, depTasksLoaded, task, supabase, projectId]);

  useEffect(() => {
    if (isCreating || !task) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setUserId(user?.id ?? null);

      const [profilesRes, logsRes, nodeRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role, avatar_url, department").order("full_name"),
        supabase.from("wbs_audit_log").select("*").eq("wbs_task_id", task.id).order("created_at", { ascending: false }),
        supabase.from("wbs_nodes").select("wbs_code, wbs_name, full_path").eq("id", task.wbs_node_id).single(),
      ]);
      if (cancelled) return;
      if (profilesRes.data) setProfiles(profilesRes.data as StaffProfile[]);
      if (logsRes.data) setAuditLogs(logsRes.data as WbsAuditLogRecord[]);
      if (nodeRes.data) setWbsNode(nodeRes.data as WbsNodeBrief);

      if (user?.id) {
        const permsResult = await getUserPermissions(supabase, user.id, "task_management");
        if (!cancelled) setPerms(permsResult);
      }
    })();
    return () => { cancelled = true; };
  }, [isCreating, task?.id, supabase, task]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRejectFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setRejectFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    e.target.value = "";
  }

  function removeRejectFile(index: number) {
    setRejectFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function closeRejectModal() {
    if (saving) return;
    setShowRejectModal(false);
    setRejectMode("assignment");
    setRejectReason("");
    setRejectFiles([]);
    onSave();
  }

  async function uploadFiles(prefix: string, files: File[]): Promise<number> {
    let uploaded = 0;
    for (const file of files) {
      const path = `${task!.id}/${prefix}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("task-attachments").upload(path, file, { contentType: file.type });
      if (error) console.error("Upload failed:", path, error.message);
      else uploaded++;
    }
    return uploaded;
  }

  const progressNum = useMemo(() => parseInt(progressVal) || 0, [progressVal]);

  const isOwner = !!task && !!userId && task.owner_id === userId;
  const isSuperAdminL0 = perms?.roles.some((role) => role.code === "L0") ?? false;
  const isApprovedTask = !!task && (task.status === "approved" || task.status === "completed" || task.status === "closed" || task.qa_status === "approved");
  const isTaskLocked = isApprovedTask && !isSuperAdminL0;
  const canEditAssignee = !isTaskLocked && ((!isOwner && perms ? hasPermission(perms.permissions, "task_management", "assign_task", "can_create") : false) || isSuperAdminL0);
  const canEditReceiver = !isTaskLocked && (isOwner || (perms ? hasPermission(perms.permissions, "task_management", "update_progress", "edit") : false) || isSuperAdminL0);
  const canApprove = !isTaskLocked && (perms ? hasPermission(perms.permissions, "task_management", "approve_task", "approve") : false);
  const canReject = !isTaskLocked && (perms ? hasPermission(perms.permissions, "task_management", "approve_task", "reject") : false);

  const departments = [...new Set(profiles.map((p) => p.department).filter(Boolean) as string[])];
  const filteredProfiles = deptFilter ? profiles.filter((p) => p.department === deptFilter) : profiles;
  const selectedStaff = profiles.find((p) => p.id === selectedStaffId);
  const latestAssignmentLog = auditLogs.find((log) => log.field_name === "owner_name" && log.action.toLowerCase().includes("assign"));
  const assignerId = latestAssignmentLog?.user_id ?? null;
  const assignerProfile = profiles.find((p) => p.id === assignerId);
  const assignerName = assignerProfile?.full_name ?? (assignerId === userId ? "You" : "Unknown");
  const assignerRole = assignerProfile ? [assignerProfile.role, assignerProfile.department].filter(Boolean).join(" · ") : null;
  const currentUserName = profiles.find((p) => p.id === userId)?.full_name ?? null;

  async function insertAuditLog(entry: { action: string; field_name: string; old_value: string; new_value: string }) {
    const { data, error } = await supabase
      .from("wbs_audit_log")
      .insert({
        wbs_task_id: task?.id,
        wbs_node_id: task?.wbs_node_id,
        project_id: task?.project_id,
        user_id: userId,
        ...entry,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data?.id ?? null;
  }

  async function createAlertFromAudit(
    sourceKey: string | null,
    recipientId: string | null | undefined,
    alertType: WbsTaskAlertType,
    title: string,
    body?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    if (!task || !sourceKey) return;
    await createTaskAlert(supabase, {
      projectId: task.project_id,
      taskId: task.id,
      actorId: userId,
      actorName: currentUserName,
      recipientId,
      sourceKey,
      alertType,
      title,
      body,
      taskCode: task.task_code,
      taskName: task.task_name,
      metadata,
    });
  }
  async function handlePostUpdate() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }
    const newProgress = parseInt(progressVal) || 0;
    if (newProgress < 0 || newProgress > 100) {
      toast.error("Progress must be between 0 and 100");
      return;
    }

    setSaving(true);

    const docFiles = selectedFiles.filter((f) => !f.type.startsWith("image/"));
    const imgFiles = selectedFiles.filter((f) => f.type.startsWith("image/"));
    const newDocs = await uploadFiles("documents", docFiles);
    const newPhotos = await uploadFiles("photos", imgFiles);

    const oldProgress = task.progress.toString();
    const updates: Record<string, unknown> = {
      progress: newProgress,
      docs_count: task.docs_count + newDocs,
      photos_count: task.photos_count + newPhotos,
      delay_status: delayStatus,
      delay_reason: (delayStatus === "delayed" || delayStatus === "blocked") ? (delayReason.trim() || null) : null,
    };

    if (newProgress === 100 && task.status !== "closed" && task.status !== "cancelled") {
      updates.status = "submitted";
    } else if (newProgress > 0 && task.status === "open") {
      updates.status = "in_progress";
    }

    const { error: updateErr } = await supabase.from("wbs_tasks").update(updates).eq("id", task.id);
    if (updateErr) {
      toast.error(updateErr.message);
      setSaving(false);
      return;
    }

    const auditEntries: { action: string; field_name: string; old_value: string; new_value: string }[] = [];
    if (oldProgress !== String(newProgress)) {
      auditEntries.push({ action: "Progress Updated", field_name: "progress", old_value: oldProgress, new_value: String(newProgress) });
    }
    if (noteText.trim()) {
      auditEntries.push({ action: "Note Added", field_name: "note", old_value: "", new_value: noteText.trim() });
    }
    if (newDocs > 0) {
      auditEntries.push({ action: "Document Added", field_name: "docs_count", old_value: String(task.docs_count), new_value: String(task.docs_count + newDocs) });
    }
    if (newPhotos > 0) {
      auditEntries.push({ action: "Photo Added", field_name: "photos_count", old_value: String(task.photos_count), new_value: String(task.photos_count + newPhotos) });
    }
    if (task.delay_status !== delayStatus) {
      auditEntries.push({ action: "Delay Status Changed", field_name: "delay_status", old_value: task.delay_status, new_value: delayStatus });
    }
    if (delayReason.trim() && task.delay_reason !== delayReason.trim()) {
      auditEntries.push({ action: "Delay Reason Updated", field_name: "delay_reason", old_value: task.delay_reason ?? "", new_value: delayReason.trim() });
    }

    for (const entry of auditEntries) {
      const auditId = await insertAuditLog(entry);
      if (entry.action === "Progress Updated" && updates.status === "submitted" && task.status !== "submitted") {
        await createAlertFromAudit(
          auditId,
          assignerId,
          "task_submitted",
          "Task submitted for approval",
          `${task.owner_name ?? "Receiver"} submitted this task at ${newProgress}% progress.`,
          { progress: newProgress },
        );
      }
    }

    setSaving(false);
    setSelectedFiles([]);
    setNoteText("");
    setProgressVal(String(newProgress));

    toast.success("Update posted");
    onSave();
  }

  async function handleApprove() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("wbs_tasks").update({
      status: "approved",
      qa_status: "approved",
    }).eq("id", task.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const auditId = await insertAuditLog({
      action: "Approved",
      field_name: "status",
      old_value: task.status,
      new_value: "approved",
    });
    await createAlertFromAudit(
      auditId,
      task.owner_id,
      "task_approved",
      "Task approved",
      "Your submitted task was approved and moved to Completed.",
    );
    toast.success("Task approved");
    onSave();
  }

  async function handleReject() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setSaving(true);
    const docFiles = rejectFiles.filter((f) => !f.type.startsWith("image/"));
    const imgFiles = rejectFiles.filter((f) => f.type.startsWith("image/"));
    const newDocs = await uploadFiles("reject/documents", docFiles);
    const newPhotos = await uploadFiles("reject/photos", imgFiles);
    const { error } = await supabase.from("wbs_tasks").update({
      status: "in_progress",
      qa_status: "failed",
      docs_count: task.docs_count + newDocs,
      photos_count: task.photos_count + newPhotos,
    }).eq("id", task.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const auditId = await insertAuditLog({
      action: "Rejected",
      field_name: "reject_reason",
      old_value: task.status,
      new_value: rejectReason.trim(),
    });
    if (newDocs + newPhotos > 0) {
      await insertAuditLog({
        action: "Reject Attachment Added",
        field_name: "attachments",
        old_value: "0",
        new_value: String(newDocs + newPhotos),
      });
    }
    await createAlertFromAudit(
      auditId,
      task.owner_id,
      "task_rejected",
      "Task rejected for redo",
      rejectReason.trim(),
      { attachments: newDocs + newPhotos },
    );
    setShowRejectModal(false);
    setRejectMode("assignment");
    setRejectReason("");
    setRejectFiles([]);
    toast.success("Task rejected — returned to In Progress");
    onSave();
  }

  async function handleAccept() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("wbs_tasks").update({ status: "in_progress" }).eq("id", task.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const auditId = await insertAuditLog({
      action: "Task Accepted",
      field_name: "status",
      old_value: task.status,
      new_value: "in_progress",
    });
    await createAlertFromAudit(
      auditId,
      assignerId,
      "task_assignment_accepted",
      "Assignment accepted",
      `${task.owner_name ?? "Receiver"} accepted the assigned task.`,
    );
    toast.success("Task accepted");
    onSave();
  }

  async function handleRejectAssignment() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setSaving(true);
    const docFiles = rejectFiles.filter((f) => !f.type.startsWith("image/"));
    const imgFiles = rejectFiles.filter((f) => f.type.startsWith("image/"));
    const newDocs = await uploadFiles("reject/documents", docFiles);
    const newPhotos = await uploadFiles("reject/photos", imgFiles);
    const { error } = await supabase.from("wbs_tasks").update({
      status: "in_progress",
      docs_count: task.docs_count + newDocs,
      photos_count: task.photos_count + newPhotos,
    }).eq("id", task.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const auditId = await insertAuditLog({
      action: "Assignment Rejected",
      field_name: "reject_reason",
      old_value: task.owner_name ?? "",
      new_value: rejectReason.trim(),
    });
    if (newDocs + newPhotos > 0) {
      await insertAuditLog({
        action: "Reject Attachment Added",
        field_name: "attachments",
        old_value: "0",
        new_value: String(newDocs + newPhotos),
      });
    }
    await createAlertFromAudit(
      auditId,
      assignerId,
      "task_assignment_rejected",
      "Assignment rejected",
      rejectReason.trim(),
      { attachments: newDocs + newPhotos },
    );
    setShowRejectModal(false);
    setRejectMode("assignment");
    setRejectReason("");
    setRejectFiles([]);
    toast.success("Assignment rejected — task returned to In Progress");
    onSave();
  }

  async function handleSaveAssignment() {
    if (!task) return;
    if (isTaskLocked) {
      toast.error("Approved tasks are locked");
      return;
    }

    if (!selectedStaffId) {
      toast.error("Assign to is required");
      return;
    }
    if (!planStart) {
      toast.error("Plan start is required");
      return;
    }
    if (!planFinish) {
      toast.error("Plan finish is required");
      return;
    }

    const selectedProfile = profiles.find((p) => p.id === selectedStaffId);
    const assignProfile = { id: selectedStaffId, full_name: selectedProfile?.full_name ?? null };
    const newStart = planStart || null;
    const newFinish = planFinish || null;

    setSaving(true);

    try {
      await assignTaskToProfile(
        supabase,
        task,
        assignProfile,
        { id: userId, name: currentUserName },
        { start: newStart, end: newFinish },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save assignment");
      setSaving(false);
      return;
    }

    try {
      const resource = await findOrCreateResourceForProfile(task.project_id, assignProfile.id, assignProfile.full_name ?? "");
      await addPlanAssignment(task.id, resource.id, 100);
    } catch (error) {
      console.warn("Failed to mirror assignment to Planning resources:", error);
    }

    setSaving(false);
    toast.success("Assignment saved");
    onSave();
  }

  async function handleSetBaseline() {
    if (!task || !planStart || !planFinish || baselineFinish) return;
    setSettingBaseline(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("wbs_tasks")
      .update({
        baseline_start_date: planStart,
        baseline_finish_date: planFinish,
        baseline_set_at: now,
        baseline_set_by: userId,
      })
      .eq("id", task.id);
    if (error) { toast.error(error.message); setSettingBaseline(false); return; }
    await insertAuditLog({ action: "Baseline Set", field_name: "baseline_finish_date", old_value: "", new_value: planFinish });
    setBaselineStart(planStart);
    setBaselineFinish(planFinish);
    setBaselineSetAt(now);
    setSettingBaseline(false);
    toast.success("Baseline locked");
  }

  async function hasDependencyCycle(predecessorId: string): Promise<boolean> {
    let currentId: string | null = predecessorId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      if (currentId === task!.id) return true;
      visited.add(currentId);
      const depRes = await supabase
        .from("wbs_tasks")
        .select("dependency_task_id")
        .eq("id", currentId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const depRow = depRes.data as any;
      currentId = depRow?.dependency_task_id ?? null;
    }
    return false;
  }

  async function handleSaveDependency() {
    if (!task) return;
    setSavingDep(true);
    setDepCycleError(false);
    if (depTaskId) {
      const cycle = await hasDependencyCycle(depTaskId);
      if (cycle) {
        setDepCycleError(true);
        setSavingDep(false);
        toast.error("Circular dependency detected — choose a different predecessor");
        return;
      }
    }
    const selectedTask = depTasks.find((t) => t.id === depTaskId) ?? null;
    const newDepText = selectedTask
      ? `${depType.toUpperCase()}: ${selectedTask.task_code} – ${selectedTask.task_name}`
      : null;
    const { error } = await supabase.from("wbs_tasks").update({
      dependency_task_id: depTaskId,
      dependency_type:    depTaskId ? depType : null,
      dependency_text:    newDepText,
      lag_days:           depTaskId ? (parseFloat(depLagDays) || 0) : 0,
    }).eq("id", task.id);
    if (error) { toast.error(error.message); setSavingDep(false); return; }
    await insertAuditLog({
      action: depTaskId ? "Dependency Set" : "Dependency Removed",
      field_name: "dependency_task_id",
      old_value: task.dependency_task_id ?? "",
      new_value: depTaskId ?? "",
    });
    setSavingDep(false);
    toast.success(depTaskId ? "Dependency saved" : "Dependency removed");
  }

  async function handlePostComment() {
    if (!task || !commentText.trim()) return;
    setPostingComment(true);
    const newComment = {
      user: currentUserName ?? "Unknown",
      text: commentText.trim(),
      timestamp: new Date().toISOString(),
    };
    const updatedComments = [...(task.comments ?? []), newComment];
    const { error } = await supabase.from("wbs_tasks").update({ comments: updatedComments }).eq("id", task.id);
    if (error) { toast.error(error.message); setPostingComment(false); return; }
    await insertAuditLog({ action: "Comment Added", field_name: "comment", old_value: "", new_value: commentText.trim() });
    setCommentText("");
    setPostingComment(false);
    toast.success("Comment posted");
    onSave();
  }

  async function handleCreateTask() {
    if (!form.task_code.trim() || !form.task_name.trim()) {
      toast.error("Task code and task name are required");
      return;
    }
    if (!form.wbs_node_id) {
      toast.error("WBS location is required");
      return;
    }
    if (!form.task_type) {
      toast.error("Task type is required");
      return;
    }
    if (!form.category) {
      toast.error("Category is required");
      return;
    }
    if (!form.priority) {
      toast.error("Priority is required");
      return;
    }

    if (crossDeptEnabled) {
      if (!crossDeptId) {
        toast.error("Select the executing department for the cross-department request");
        return;
      }
      if (!myDepartmentId) {
        toast.error("Your profile has no department assigned — cannot raise a cross-department request");
        return;
      }
    }

    const taskCode = form.task_code.trim();
    const { data: existingTask, error: checkError } = await supabase
      .from("wbs_tasks")
      .select("id")
      .eq("project_id", projectId)
      .eq("task_code", taskCode)
      .maybeSingle();

    if (checkError) {
      toast.error(checkError.message);
      return;
    }
    if (existingTask) {
      toast.error(`Task code "${taskCode}" already exists in this project. Please use a different code.`);
      return;
    }

    const payload: Record<string, unknown> = {
      task_code: taskCode,
      task_name: form.task_name.trim(),
      description: form.description.trim(),
      task_type: form.task_type || null,
      category: form.category || null,
      status: "open",
      progress: 0,
      priority: form.priority || "medium",
      discipline: form.discipline || null,
      project_id: projectId,
      wbs_node_id: form.wbs_node_id,
      end_date: form.end_date || null,
      sort_order: Date.now(),
      ...(crossDeptEnabled
        ? {
            requesting_department_id: myDepartmentId,
            department_id: crossDeptId,
            cross_dept_status: "requested" as const,
            cross_dept_note: crossDeptNote.trim() || null,
          }
        : {}),
    };

    setSaving(true);
    const { data: newTask, error } = await supabase.from("wbs_tasks").insert(payload).select("id").single();
    if (error) {
      toast.error(isDuplicateTaskCodeError(error.message) ? `Task code "${taskCode}" already exists in this project. Please use a different code.` : error.message);
      setSaving(false);
      return;
    }
    if (crossDeptEnabled && newTask?.id) {
      const headRes = await supabase
        .from("departments")
        .select("department_head")
        .eq("id", crossDeptId)
        .maybeSingle();
      await createTaskAlert(supabase, {
        projectId,
        taskId: newTask.id,
        actorId: userId,
        actorName: currentUserName,
        recipientId: (headRes.data?.department_head as string | undefined) ?? null,
        alertType: "cross_dept_requested",
        title: "New cross-department task request",
        body: `${taskCode} · ${form.task_name.trim()}`,
        taskCode,
        taskName: form.task_name.trim(),
        metadata: { note: crossDeptNote.trim() || null, requesting_department_id: myDepartmentId },
      });
    }
    if (recurringEnabled && newTask?.id) {
      const startDate = form.end_date || new Date().toISOString().slice(0, 10);
      const { error: recurErr } = await supabase.from("task_recurrences").insert({
        project_id: projectId,
        template_task_id: newTask.id,
        frequency: recurFrequency,
        interval_value: parseInt(recurInterval) || 1,
        start_date: startDate,
        end_date: recurEndDate || null,
        next_run_at: startDate,
        is_active: true,
        created_by: userId,
      });
      if (recurErr) console.warn("Recurrence not saved (migration pending?):", recurErr.message);
    }
    toast.success("Task created");
    onSave();
  }

  const selectedDep = depTasks.find((t) => t.id === depTaskId) ?? null;
  const filteredDepTasks = depSearch.trim()
    ? depTasks.filter((t) =>
        t.task_code.toLowerCase().includes(depSearch.toLowerCase()) ||
        t.task_name.toLowerCase().includes(depSearch.toLowerCase()))
    : depTasks;

  const scheduleVarianceDays =
    baselineFinish && task?.end_date
      ? differenceInDays(new Date(task.end_date), new Date(baselineFinish))
      : null;

  const content = task ? (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5 min-h-0 flex-1 lg:overflow-hidden">
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={closeRejectModal}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{rejectMode === "approval" ? "Reject task" : "Reject assignment"}</h3>
                <p className="mt-1 text-xs text-slate-500">Provide the reject reason and attach supporting files if needed.</p>
              </div>
              <button type="button" onClick={closeRejectModal} disabled={saving} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-[11px]">Reject reason <span className="text-red-500">*</span></Label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why you reject this assignment..."
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>

              <div>
                <Label className="mb-1.5 block text-[11px]">Attachment <span className="font-normal text-slate-400">(Optional)</span></Label>
                <button
                  type="button"
                  onClick={() => rejectFileInputRef.current?.click()}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="h-4 w-4" />
                  Add PDF, document, or photo
                </button>
                <input ref={rejectFileInputRef} type="file" multiple className="hidden" onChange={handleRejectFilePick} disabled={saving} />
                {rejectFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {rejectFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                        {f.type.startsWith("image/") ? <FilePreview file={f} /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-white"><FileText className="h-5 w-5 text-slate-400" /></div>}
                        <span className="min-w-0 flex-1 truncate text-slate-600">{f.name}</span>
                        <span className="shrink-0 text-[9px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => removeRejectFile(i)} disabled={saving} className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-50">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button onClick={closeRejectModal} disabled={saving} size="sm" variant="outline" className="rounded-lg text-xs">Cancel</Button>
                <Button onClick={rejectMode === "approval" ? handleReject : handleRejectAssignment} disabled={saving || !rejectReason.trim()} size="sm" className="rounded-lg bg-red-600 text-xs hover:bg-red-700">
                  {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} {rejectMode === "approval" ? "Reject Task" : "Reject and Redo"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isTaskLocked && (
        <div className="lg:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          This approved task is locked and available for view only.
        </div>
      )}
      {/* LEFT COLUMN: Assignee (top) + Receiver (bottom) */}
      <div className="grid grid-rows-[auto_1fr] gap-5 min-h-0">
        {/* ASSIGNEE CARD */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 min-h-0 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> Assignee
          </h3>

          <div className="relative">
            <Label className="text-[11px] mb-1.5 block">Assign to <span className="text-red-400 cursor-help" title="Required">*</span></Label>
            <button
              type="button"
              onClick={() => { if (canEditAssignee) setStaffOpen((o) => !o); }}
              disabled={!canEditAssignee}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left truncate">
                {selectedStaff ? selectedStaff.full_name : <span className="text-muted-foreground italic text-xs">Not assigned</span>}
              </span>
              <svg className={`h-4 w-4 text-muted-foreground transition-transform ${staffOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </button>

            {staffOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStaffOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg">
                  <div className="p-2 border-b border-border">
                    <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-hidden focus:border-primary">
                      <option value="">All departments</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredProfiles.length === 0 && <p className="px-2 py-3 text-[10px] text-center text-muted-foreground">No staff found</p>}
                    {filteredProfiles.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedStaffId(p.id); setStaffOpen(false); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left hover:bg-muted transition-colors ${p.id === selectedStaffId ? "bg-blue-50 text-blue-700" : ""}`}>
                        <div className="relative shrink-0">
                          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-500">{p.full_name.charAt(0).toUpperCase()}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.full_name}</span>
                          <span className="block text-[9px] text-muted-foreground">{p.role}{p.department ? ` · ${p.department}` : ""}</span>
                        </div>
                        {p.id === selectedStaffId && (
                          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setSelectedStaffId(""); setStaffOpen(false); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setSelectedStaffId(""); setStaffOpen(false); } }} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-500 cursor-pointer" title="Remove assignment">
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Plan Start <span className="text-red-400 cursor-help" title="Required">*</span></Label>
              <input type="date" value={planStart} onChange={(e) => setPlanStart(e.target.value)} disabled={!canEditAssignee} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Plan Finish <span className="text-red-400 cursor-help" title="Required">*</span></Label>
              <input type="date" value={planFinish} onChange={(e) => setPlanFinish(e.target.value)} disabled={!canEditAssignee} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
          </div>

          {/* DEPENDENCY SECTION */}
          <div className="space-y-2">
            <Label className="text-[11px] flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" /> Predecessor
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { if (canEditAssignee) setDepPickerOpen((o) => !o); }}
                disabled={!canEditAssignee}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate text-xs">
                  {selectedDep
                    ? `${selectedDep.task_code} · ${selectedDep.task_name}`
                    : <span className="text-muted-foreground italic text-xs">No predecessor</span>}
                </span>
                {depTaskId && canEditAssignee && (
                  <span
                    role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setDepTaskId(null); setDepPickerOpen(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setDepTaskId(null); } }}
                    className="shrink-0 text-muted-foreground hover:text-red-500 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
              {depPickerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDepPickerOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg">
                    <div className="p-2 border-b border-border">
                      <input
                        autoFocus
                        value={depSearch}
                        onChange={(e) => setDepSearch(e.target.value)}
                        placeholder="Search by code or name…"
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-hidden focus:border-primary"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {!depTasksLoaded && <p className="px-2 py-3 text-[10px] text-center text-muted-foreground">Loading…</p>}
                      {depTasksLoaded && filteredDepTasks.length === 0 && (
                        <p className="px-2 py-3 text-[10px] text-center text-muted-foreground">No tasks found</p>
                      )}
                      {filteredDepTasks.map((t) => (
                        <button key={t.id} type="button"
                          onClick={() => { setDepTaskId(t.id); setDepPickerOpen(false); setDepCycleError(false); }}
                          className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors ${t.id === depTaskId ? "bg-blue-50 text-blue-700" : ""}`}
                        >
                          <span className="text-[11px] font-medium">{t.task_code}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{t.task_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {depTaskId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Type</Label>
                  <select value={depType} onChange={(e) => setDepType(e.target.value)}
                    disabled={!canEditAssignee}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="fs">FS — Finish to Start</option>
                    <option value="ss">SS — Start to Start</option>
                    <option value="ff">FF — Finish to Finish</option>
                    <option value="sf">SF — Start to Finish</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Lag (days)</Label>
                  <input type="number" step="0.5" value={depLagDays}
                    onChange={(e) => setDepLagDays(e.target.value)}
                    disabled={!canEditAssignee}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
              </div>
            )}
            {depCycleError && (
              <p className="text-[10px] text-red-600">Circular dependency — this predecessor creates a scheduling loop.</p>
            )}
            {canEditAssignee && (
              <Button onClick={handleSaveDependency} disabled={savingDep} size="sm" variant="outline"
                className="w-full rounded-lg text-xs">
                {savingDep && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Save Dependency
              </Button>
            )}
          </div>

          <Button onClick={handleSaveAssignment} disabled={saving || !canEditAssignee} size="sm" className="w-full rounded-lg text-xs">
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>

          {!baselineFinish && planStart && planFinish && canEditAssignee && (
            <Button
              onClick={handleSetBaseline}
              disabled={settingBaseline || saving}
              size="sm" variant="outline"
              className="w-full rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {settingBaseline
                ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                : <Flag className="mr-1 h-3 w-3" />}
              Set Baseline
            </Button>
          )}
          {baselineFinish && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                <Flag className="h-3 w-3 text-amber-500" /> Baseline Locked
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-[10px]">
                <div><span className="block text-slate-400">Baseline Start</span><span className="font-medium">{formatDate(baselineStart)}</span></div>
                <div><span className="block text-slate-400">Baseline Finish</span><span className="font-medium">{formatDate(baselineFinish)}</span></div>
              </div>
              {baselineSetAt && <div className="text-[9px] text-slate-400">Set on {formatDate(baselineSetAt)}</div>}
            </div>
          )}

          {(task.status === "submitted" || task.status === "review") && (canApprove || canReject) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
              <h4 className="text-[11px] font-semibold text-amber-700">Approval Required</h4>
              <p className="text-[10px] text-slate-500">This task is pending approval.</p>
              <div className="flex gap-2">
                {canApprove && (
                  <Button onClick={handleApprove} disabled={saving} size="sm" className="flex-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700">
                    {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Approve
                  </Button>
                )}
                {canReject && (
                  <Button onClick={() => { setRejectMode("approval"); setShowRejectModal(true); }} disabled={saving} size="sm" variant="outline" className="flex-1 rounded-lg text-xs border-red-300 text-red-600 hover:bg-red-50">
                    {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Reject
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RECEIVER CARD */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-5 min-h-0 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Receiver
          </h3>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <Label className="text-[11px] mb-1.5 block">Assigned by</Label>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                {assignerName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">{assignerName}</p>
                {assignerRole && <p className="truncate text-[10px] text-slate-500">{assignerRole}</p>}
              </div>
            </div>
          </div>

          {task.owner_id === userId && (task.status === "open" || task.status === "assigned" || task.status === "rejected") && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <p className="text-[10px] text-slate-600">You have been assigned this task.</p>
              <div className="flex gap-2">
                <Button onClick={handleAccept} disabled={saving} size="sm" className="flex-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700">
                  {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Accept
                </Button>
                <Button onClick={() => { setRejectMode("assignment"); setShowRejectModal(true); }} disabled={saving} size="sm" variant="outline" className="flex-1 rounded-lg text-xs border-red-300 text-red-600 hover:bg-red-50">
                  Reject
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label className="text-[11px] mb-1.5 block">Progress</Label>
            <div className="flex items-center gap-3">
              <input type="number" min="0" max="100" value={progressVal} onChange={(e) => setProgressVal(e.target.value)} disabled={!canEditReceiver} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-center outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed" />
              <span className="text-sm text-muted-foreground">%</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, progressNum))}%` }} />
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{progressNum}%<span className="text-slate-300">/100%</span></span>
            </div>
          </div>

          <div>
            <Label className="text-[11px] mb-1.5 block">Status <span className="text-red-400 cursor-help" title="Required">*</span></Label>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} disabled={!canEditReceiver} placeholder="Write an update on the current status..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] block">Delay Status</Label>
            <select
              value={delayStatus}
              onChange={(e) => setDelayStatus(e.target.value)}
              disabled={!canEditReceiver}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-hidden focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="on_track">On Track</option>
              <option value="risk">At Risk</option>
              <option value="delayed">Delayed</option>
              <option value="blocked">Blocked</option>
            </select>
            {(delayStatus === "delayed" || delayStatus === "blocked") && (
              <textarea
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                disabled={!canEditReceiver}
                placeholder={delayStatus === "blocked" ? "What is blocking this task?" : "Why is this task delayed?"}
                rows={2}
                className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-xs outline-hidden focus:border-amber-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            )}
          </div>

          <div>
            <Label className="text-[11px] mb-1.5 block">Files <span className="font-normal text-slate-400">(Optional)</span></Label>
            <div className="space-y-2">
              <div onClick={() => { if (canEditReceiver) fileInputRef.current?.click(); }} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-xs transition-colors ${canEditReceiver ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-600" : "border-slate-100 text-slate-300 cursor-not-allowed"}`}>
                <Upload className="h-4 w-4" />
                Click to add files (documents, images, etc.)
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePick} disabled={!canEditReceiver} />
              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      {f.type.startsWith("image/") ? <FilePreview file={f} /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-white"><FileText className="h-5 w-5 text-slate-400" /></div>}
                      <span className="flex-1 truncate text-slate-600">{f.name}</span>
                      <span className="shrink-0 text-[9px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => removeFile(i)} className="shrink-0 text-slate-400 hover:text-red-500 ml-1">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button onClick={handlePostUpdate} disabled={saving || !canEditReceiver} className="w-full rounded-lg">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Upload className="mr-1.5 h-4 w-4" />
            Post Update
          </Button>
        </div>
      </div>

      {/* RIGHT COLUMN: Details (top) + Activity (bottom) */}
      <div className="grid grid-rows-[auto_1fr] gap-5 min-h-0">
        {/* DETAILS CARD */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 min-h-0 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div><span className="text-muted-foreground block text-[10px]">Task Code</span><span className="font-medium">{task.task_code}</span></div>
            <div><span className="text-muted-foreground block text-[10px]">Status</span><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium mt-0.5 ${statusColor(task.status)}`}>{task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground block text-[10px]">Task Name</span><span className="font-medium">{task.task_name}</span></div>
            <div><span className="text-muted-foreground block text-[10px]">Discipline</span><span>{task.discipline || "-"}</span></div>
            <div><span className="text-muted-foreground block text-[10px]">Priority</span><span className="font-medium capitalize">{task.priority}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground block text-[10px]">WBS</span><span className="font-medium">{wbsNode ? `${wbsNode.wbs_code} · ${wbsNode.wbs_name}` : "-"}</span></div>
            {task.delay_status !== "on_track" && (
              <div className="col-span-2">
                <span className="text-muted-foreground block text-[10px]">Delay Status</span>
                <span className="font-medium capitalize text-amber-600">{task.delay_status.replace(/_/g, " ")}</span>
                {task.delay_reason && <p className="mt-0.5 text-[10px] text-amber-700/80">{task.delay_reason}</p>}
              </div>
            )}
            {task.task_type && <div><span className="text-muted-foreground block text-[10px]">Task Type</span><span className="font-medium capitalize">{task.task_type.replace(/_/g, " ")}</span></div>}
            {task.category && <div><span className="text-muted-foreground block text-[10px]">Category</span><span className="font-medium capitalize">{task.category.replace(/_/g, " ")}</span></div>}
            {scheduleVarianceDays !== null && (
              <div className="col-span-2">
                <span className="text-muted-foreground block text-[10px]">Schedule Variance</span>
                <span className={`font-medium text-xs ${scheduleVarianceDays > 0 ? "text-red-600" : scheduleVarianceDays < 0 ? "text-emerald-600" : "text-slate-600"}`}>
                  {scheduleVarianceDays > 0 ? `+${scheduleVarianceDays}d` : scheduleVarianceDays < 0 ? `${scheduleVarianceDays}d` : "On Baseline"}
                </span>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground text-[10px]">Progress</span>
              <span className="font-semibold tabular-nums text-xs">{task.progress}%<span className="text-slate-300">/100%</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
          {task.description && (
            <div><span className="text-muted-foreground block text-[10px] mb-1">Description</span><p className="text-xs text-slate-700 leading-relaxed">{task.description}</p></div>
          )}
        </div>

        {/* ACTIVITY CARD */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-3 min-h-0 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Activity
          </h3>
          <div className="space-y-2">
            {auditLogs.length === 0 && <p className="text-[10px] text-slate-400">No activity yet</p>}
            {auditLogs.map((log, idx) => {
              const Icon = actionIcon(log.action);
              const isLatest = idx === 0;
              return (
                <div key={log.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${isLatest ? "border-blue-200 bg-blue-50/60 ring-1 ring-blue-200/50" : "border-border bg-slate-50/50"}`}>
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isLatest ? "bg-blue-200" : "bg-slate-200"}`}>
                    <Icon className={`h-3 w-3 ${isLatest ? "text-blue-600" : "text-slate-500"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[11px] font-semibold ${isLatest ? "text-blue-800" : "text-slate-700"}`}>{log.action}</span>
                        {isLatest && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-semibold text-blue-700 border border-blue-200">Latest</span>}
                      </div>
                      <span className="shrink-0 text-[9px] text-slate-400">{formatDate(log.created_at)} {formatTime(log.created_at)}</span>
                    </div>
                    {log.field_name && (
                      <p className={`mt-0.5 text-[10px] ${isLatest ? "text-blue-600/70" : "text-slate-500"}`}>
                        {log.field_name.replace(/_/g, " ")}
                        {log.old_value ? `: ${log.old_value} → ${log.new_value}` : log.new_value ? `: ${log.new_value}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COMMENTS CARD */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> Comments
          </h3>
          <div className="space-y-2">
            {(task.comments ?? []).length === 0 && <p className="text-[10px] text-slate-400">No comments yet</p>}
            {(task.comments ?? []).map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-slate-50/50 px-3 py-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                  {c.user?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">{c.user}</span>
                    <span className="shrink-0 text-[9px] text-slate-400">{formatDate(c.timestamp)} {formatTime(c.timestamp)}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-600 leading-relaxed">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
            />
            <div className="flex justify-end">
              <Button onClick={handlePostComment} disabled={postingComment || !commentText.trim()} size="sm" className="rounded-lg text-xs">
                {postingComment && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Post Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (fullPage) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => router.back()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{task ? form.task_name : "New Task"}</h2>
                <p className="text-xs text-muted-foreground">{task ? form.task_code : ""}</p>
                {task?.requesting_department_id && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-indigo-600">
                    <ArrowLeftRight className="h-3 w-3" /> Cross-department · {task.cross_dept_status ?? "requested"}
                  </p>
                )}
              </div>
            </div>
            {!isCreating && task && (
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusColor(task.status)}`}>
                {task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex lg:flex-col">
          {isCreating ? (
            <div className="flex flex-col gap-5 p-5 max-w-2xl mx-auto">
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Details</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="wbs_node_id">WBS Location *</Label>
                  <select id="wbs_node_id" value={form.wbs_node_id} onChange={(e) => update("wbs_node_id", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    <option value="">Select WBS location</option>
                    {wbsNodes.map((node) => (
                      <option key={node.id} value={node.id}>{wbsOptionLabel(node)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task_code">Task Code *</Label>
                    <input id="task_code" value={form.task_code} onChange={(e) => update("task_code", e.target.value)} placeholder="e.g. T-STR-001" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="discipline">Discipline</Label>
                    <select id="discipline" value={form.discipline} onChange={(e) => update("discipline", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                      {DISCIPLINES.map((d) => <option key={d} value={d}>{d || "-"}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task_name">Task Title *</Label>
                  <input id="task_name" value={form.task_name} onChange={(e) => update("task_name", e.target.value)} placeholder="e.g. Rebar fixing for L05 slab" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <textarea id="description" value={form.description} onChange={(e) => update("description", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task_type">Task Type *</Label>
                    <select id="task_type" value={form.task_type} onChange={(e) => update("task_type", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                      {TASK_TYPES.map((t) => <option key={t} value={t}>{t ? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Select type"}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Task Category *</Label>
                    <select id="category" value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                      {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c ? c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "Select category"}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="priority">Priority *</Label>
                    <select id="priority" value={form.priority} onChange={(e) => update("priority", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end_date">Due Date</Label>
                    <input id="end_date" type="date" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                  </div>
                </div>
              </fieldset>
              <fieldset className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recurring Schedule</legend>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={recurringEnabled} onChange={(e) => setRecurringEnabled(e.target.checked)} className="h-3.5 w-3.5 rounded accent-slate-900" />
                    <span className="text-xs text-slate-600">Enable</span>
                  </label>
                </div>
                {recurringEnabled && (
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Frequency</Label>
                      <select value={recurFrequency} onChange={(e) => setRecurFrequency(e.target.value as "daily" | "weekly" | "monthly")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Every N</Label>
                      <input type="number" min="1" max="99" value={recurInterval} onChange={(e) => setRecurInterval(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">End Date (optional)</Label>
                      <input type="date" value={recurEndDate} onChange={(e) => setRecurEndDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                    </div>
                  </div>
                )}
              </fieldset>
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                <Button onClick={handleCreateTask} disabled={saving || !form.wbs_node_id || !form.task_code.trim() || !form.task_name.trim() || !form.task_type || !form.category}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Create Task
                </Button>
              </div>
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-7xl bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{task ? form.task_name : "New Task"}</h2>
            <p className="text-xs text-muted-foreground">{task ? form.task_code : `WBS Node: ${wbsNodeId?.slice(0, 8) ?? "-"}`}</p>
            {task?.requesting_department_id && (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-indigo-600">
                <ArrowLeftRight className="h-3 w-3" /> Cross-department · {task.cross_dept_status ?? "requested"}
              </p>
            )}
          </div>
          {!isCreating && task && (
            <button
              type="button"
              onClick={() => {
                setSelectedProjectId(task.project_id);
                router.push("/dashboard/planning/gantt");
              }}
              className="mr-3 whitespace-nowrap text-[11px] font-medium text-primary hover:underline"
            >
              View in Gantt Chart →
            </button>
          )}
          {!isCreating && task && (
            <span className={`mr-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusColor(task.status)}`}>
              {task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isCreating ? (
          <div className="flex flex-col gap-5 p-5">
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Details</legend>
              <div className="space-y-1.5">
                <Label htmlFor="sheet_wbs_node_id">WBS Location *</Label>
                <select id="sheet_wbs_node_id" value={form.wbs_node_id} onChange={(e) => update("wbs_node_id", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  <option value="">Select WBS location</option>
                  {wbsNodes.map((node) => (
                    <option key={node.id} value={node.id}>{wbsOptionLabel(node)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task_code">Task Code *</Label>
                  <input id="task_code" value={form.task_code} onChange={(e) => update("task_code", e.target.value)} placeholder="e.g. T-STR-001" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="discipline">Discipline</Label>
                  <select id="discipline" value={form.discipline} onChange={(e) => update("discipline", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    {DISCIPLINES.map((d) => <option key={d} value={d}>{d || "-"}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task_name">Task Title *</Label>
                <input id="task_name" value={form.task_name} onChange={(e) => update("task_name", e.target.value)} placeholder="e.g. Rebar fixing for L05 slab" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <textarea id="description" value={form.description} onChange={(e) => update("description", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task_type">Task Type *</Label>
                  <select id="task_type" value={form.task_type} onChange={(e) => update("task_type", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    {TASK_TYPES.map((t) => <option key={t} value={t}>{t ? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Select type"}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Task Category *</Label>
                  <select id="category" value={form.category} onChange={(e) => update("category", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c ? c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "Select category"}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority *</Label>
                  <select id="priority" value={form.priority} onChange={(e) => update("priority", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">Due Date</Label>
                  <input id="end_date" type="date" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                </div>
              </div>
            </fieldset>
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cross-Department Request</legend>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={crossDeptEnabled} onChange={(e) => setCrossDeptEnabled(e.target.checked)} className="h-3.5 w-3.5 rounded accent-slate-900" />
                  <span className="text-xs text-slate-600">Enable</span>
                </label>
              </div>
              {crossDeptEnabled && (
                <div className="space-y-3 pt-1">
                  {!myDepartmentId && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700">
                      Your profile has no department assigned — cross-department requests require one.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="cross_dept">Executing Department *</Label>
                    <select
                      id="cross_dept"
                      value={crossDeptId}
                      onChange={(e) => setCrossDeptId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    >
                      <option value="">Select department</option>
                      {departmentsList.map((d) => (
                        <option key={d.id} value={d.id}>{d.department_code} · {d.department_name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">The receiving department&apos;s head must accept this request before work starts.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cross_dept_note">Scope / Notes</Label>
                    <textarea
                      id="cross_dept_note"
                      value={crossDeptNote}
                      onChange={(e) => setCrossDeptNote(e.target.value)}
                      rows={2}
                      placeholder="Describe what you need from the receiving department…"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    />
                  </div>
                </div>
              )}
            </fieldset>
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recurring Schedule</legend>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={recurringEnabled} onChange={(e) => setRecurringEnabled(e.target.checked)} className="h-3.5 w-3.5 rounded accent-slate-900" />
                  <span className="text-xs text-slate-600">Enable</span>
                </label>
              </div>
              {recurringEnabled && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Frequency</Label>
                    <select value={recurFrequency} onChange={(e) => setRecurFrequency(e.target.value as "daily" | "weekly" | "monthly")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Every N</Label>
                    <input type="number" min="1" max="99" value={recurInterval} onChange={(e) => setRecurInterval(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">End Date (optional)</Label>
                    <input type="date" value={recurEndDate} onChange={(e) => setRecurEndDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                  </div>
                </div>
              )}
            </fieldset>
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreateTask} disabled={saving || !form.wbs_node_id || !form.task_code.trim() || !form.task_name.trim() || !form.task_type || !form.category}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create Task
              </Button>
            </div>
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
