"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Clock3, Loader2, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Entity = { entity_code: string; display_name: string; entity_scope: string; request_enabled: boolean; adapter_status: string; schema_version: number; config_version: number };
type RegistryEvent = { id: string; entity_code: string; actor_id: string | null; prior_enabled: boolean; new_enabled: boolean; config_version: number; created_at: string };
type RequestRow = {
  id: string; entity_code: string; request_type: string; reason: string; status: string;
  requested_by: string; created_at: string; version: number; proposed_values: Record<string, unknown>;
};
type Detail = RequestRow & { events: { id?: string; event_type: string; actor_id: string | null; reason: string | null; created_at: string }[] };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "MDM request failed");
  return body as T;
}

export default function MdmGovernancePage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [registryEvents, setRegistryEvents] = useState<RegistryEvent[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityCode, setEntityCode] = useState("");
  const [editingRequest, setEditingRequest] = useState<{ id: string; version: number } | null>(null);
  const [requestType, setRequestType] = useState<"create" | "update" | "deactivate">("create");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState('{\n  "name": ""\n}');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entityResponse, requestResponse] = await Promise.all([
        fetch("/api/mdm/entities", { cache: "no-store" }),
        fetch("/api/mdm/requests?limit=50", { cache: "no-store" }),
      ]);
      const entityBody = await readJson<{ data: Entity[]; canConfigure: boolean; registryEvents: RegistryEvent[] }>(entityResponse);
      const requestBody = await readJson<{ data: RequestRow[] }>(requestResponse);
      setEntities(entityBody.data);
      setCanConfigure(entityBody.canConfigure);
      setRegistryEvents(entityBody.registryEvents);
      setRequests(requestBody.data);
      setEntityCode((current) => current || entityBody.data.find((item) => item.request_enabled)?.entity_code || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load MDM workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const proposedValues: unknown = JSON.parse(values);
      let createdId: string | undefined;
      if (editingRequest) {
        await readJson(await fetch(`/api/mdm/requests/${editingRequest.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_version: editingRequest.version, proposed_values: proposedValues, reason }),
        }));
        createdId = editingRequest.id;
        setEditingRequest(null);
      } else {
        const payload: Record<string, unknown> = { entity_code: entityCode, request_type: requestType, proposed_values: proposedValues, reason };
        if (requestType !== "create") payload.target_record_id = targetId;
        const result = await readJson<{ data: RequestRow }>(await fetch("/api/mdm/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
        createdId = result.data.id;
      }
      setReason("");
      await load();
      if (createdId) await openDetail(createdId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create request");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    try {
      const result = await readJson<{ data: Detail }>(await fetch(`/api/mdm/requests/${id}`, { cache: "no-store" }));
      setDetail(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load request detail");
    }
  }

  function editRequest(row: RequestRow) {
    setEntityCode(row.entity_code);
    setRequestType(row.request_type as typeof requestType);
    setTargetId((row as RequestRow & { target_record_id?: string }).target_record_id ?? "");
    setReason(row.reason);
    setValues(JSON.stringify(row.proposed_values, null, 2));
    setEditingRequest({ id: row.id, version: row.version });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function transition(row: RequestRow, action: "submit" | "start_review" | "approve" | "reject" | "return" | "cancel") {
    const needsReason = ["reject", "return", "cancel"].includes(action);
    const comment = needsReason ? window.prompt(`Reason to ${action} this request:`)?.trim() : undefined;
    if (needsReason && !comment) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/mdm/requests/${row.id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: row.version, action, reason: comment }),
      }));
      await load();
      if (detail?.id === row.id) await openDetail(row.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function configureEntity(entity: Entity) {
    const enable = !entity.request_enabled;
    const note = window.prompt(`Reason to ${enable ? "enable" : "disable"} requests for ${entity.entity_code}:`)?.trim();
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch("/api/mdm/entities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_code: entity.entity_code, enabled: enable, expected_config_version: entity.config_version, reason: note }),
      }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Entity configuration failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyMaterial(row: RequestRow) {
    if (!window.confirm("Apply this approved material request to the DWL material library?")) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/mdm/requests/${row.id}/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: row.version }),
      }));
      await load();
      if (detail?.id === row.id) await openDetail(row.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Material application failed");
    } finally {
      setBusy(false);
    }
  }

  async function retryMaterialApply(row: RequestRow) {
    const retryReason = window.prompt("Reason to authorize another material apply attempt:")?.trim();
    if (!retryReason) return;
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/mdm/requests/${row.id}/retry-apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: row.version, reason: retryReason }),
      }));
      await load();
      if (detail?.id === row.id) await openDetail(row.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry authorization failed");
    } finally {
      setBusy(false);
    }
  }

  const enabledEntities = entities.filter((item) => item.request_enabled);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Administration / Data Governance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Master data governance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Request changes, review decisions, and inspect the append-only history.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="mr-2 size-4" />Refresh</Button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="size-4" />New change request</CardTitle>
            <CardDescription>Only entities enabled by governance can receive requests. Domain writes remain disabled until an adapter is approved.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading registry…</div> : enabledEntities.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No requestable entities are enabled yet. Ratify the initial entity scope and enable it in the MDM registry to start requests.</div>
            ) : (
              <form className="space-y-4" onSubmit={createRequest}>
                <div className="space-y-2"><Label htmlFor="mdm-entity">Entity</Label><select id="mdm-entity" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={entityCode} onChange={(event) => setEntityCode(event.target.value)} required>
                  {enabledEntities.map((entity) => <option key={entity.entity_code} value={entity.entity_code}>{entity.display_name} ({entity.entity_code})</option>)}
                </select></div>
                <div className="space-y-2"><Label htmlFor="mdm-type">Request type</Label><select id="mdm-type" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={requestType} onChange={(event) => setRequestType(event.target.value as typeof requestType)}><option value="create">Create</option><option value="update">Change</option><option value="deactivate">Deactivate</option></select></div>
                {requestType !== "create" && <div className="space-y-2"><Label htmlFor="mdm-target">Target record UUID</Label><Input id="mdm-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} required placeholder="00000000-0000-0000-0000-000000000000" /></div>}
                <div className="space-y-2"><Label htmlFor="mdm-reason">Business reason</Label><Textarea id="mdm-reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={1} maxLength={2000} rows={3} /></div>
                <div className="space-y-2"><Label htmlFor="mdm-values">Proposed values (JSON)</Label><Textarea id="mdm-values" value={values} onChange={(event) => setValues(event.target.value)} required rows={7} className="font-mono text-xs" /></div>
                {editingRequest && <Button type="button" variant="ghost" className="w-full" onClick={() => setEditingRequest(null)}>Cancel editing</Button>}
                <Button type="submit" disabled={busy || !entityCode} className="w-full"><Send className="mr-2 size-4" />{editingRequest ? "Save draft" : "Create draft"}</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock3 className="size-4" />Requests</CardTitle>
            <CardDescription>Tenant-scoped requests visible to you under database RLS.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading requests…</div> : requests.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No requests found.</p> : (
              <div className="space-y-3">
                {requests.map((row) => <article key={row.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button className="text-left" onClick={() => void openDetail(row.id)}><span className="font-medium">{row.entity_code} · {row.request_type}</span><span className="mt-1 block max-w-xl text-sm text-muted-foreground">{row.reason}</span><span className="mt-2 block font-mono text-xs text-muted-foreground">{row.id}</span></button>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{row.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.status === "draft" || row.status === "returned" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(row, "submit")}><Send className="mr-1.5 size-3.5" />Submit</Button> : null}
                    {row.status === "draft" || row.status === "returned" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => editRequest(row)}>Edit</Button> : null}
                    {row.status === "submitted" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(row, "start_review")}>Start review</Button> : null}
                    {row.status === "under_review" ? <><Button size="sm" disabled={busy} onClick={() => void transition(row, "approve")}><Check className="mr-1.5 size-3.5" />Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(row, "return")}>Return</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void transition(row, "reject")}>Reject</Button></> : null}
                    {row.status === "approved" && row.entity_code === "MAT" && row.request_type === "create" && entities.some((entity) => entity.entity_code === "MAT" && entity.adapter_status === "ready") ? <Button size="sm" disabled={busy} onClick={() => void applyMaterial(row)}>Apply material</Button> : null}
                    {row.status === "apply_failed" && row.entity_code === "MAT" && row.request_type === "create" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void retryMaterialApply(row)}>Authorize retry</Button> : null}
                    {(["draft", "submitted", "returned"].includes(row.status)) ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void transition(row, "cancel")}>Cancel</Button> : null}
                  </div>
                </article>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Entity registry</CardTitle><CardDescription>CAT-001 metadata is seeded per tenant. Intake enablement is audited and restricted to tenant administrators; project-scoped intake remains blocked until project ownership is modeled.</CardDescription></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading registry…</p> : <div className="divide-y rounded-lg border">{entities.map((entity) => <div key={entity.entity_code} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div><p className="text-sm font-medium">{entity.display_name} <span className="font-mono text-xs text-muted-foreground">{entity.entity_code}</span></p><p className="text-xs text-muted-foreground">Scope: {entity.entity_scope.replaceAll("_", " ")} · Adapter: {entity.adapter_status} · Schema v{entity.schema_version}</p></div>
            <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{entity.request_enabled ? "Intake enabled" : "Intake disabled"}</span>{canConfigure && <Button size="sm" variant={entity.request_enabled ? "outline" : "default"} disabled={busy} onClick={() => void configureEntity(entity)}>{entity.request_enabled ? "Disable" : "Enable requests"}</Button>}</div>
          </div>)}</div>}
        </CardContent>
      </Card>

      {canConfigure && registryEvents.length > 0 && <Card>
        <CardHeader><CardTitle>Registry configuration history</CardTitle><CardDescription>Recent audited request-intake changes.</CardDescription></CardHeader>
        <CardContent><div className="divide-y rounded-lg border">{registryEvents.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{event.entity_code}</strong> · intake {event.new_enabled ? "enabled" : "disabled"} (version {event.config_version})</span><span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()} · {event.actor_id ?? "Former user"}</span></div>)}</div></CardContent>
      </Card>}

      {detail && <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Request detail · {detail.status.replaceAll("_", " ")}</CardTitle><CardDescription className="font-mono">{detail.id}</CardDescription></div>
          <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Button>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <section><h2 className="mb-2 text-sm font-semibold">Proposed values</h2><pre className="max-h-80 overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(detail.proposed_values, null, 2)}</pre></section>
          <section><h2 className="mb-2 text-sm font-semibold">Audit history</h2>{detail.events.length === 0 ? <p className="text-sm text-muted-foreground">No events recorded.</p> : <ol className="space-y-3">{detail.events.map((event, index) => <li key={event.id ?? `${event.event_type}-${index}`} className="border-l-2 pl-3"><p className="text-sm font-medium">{event.event_type.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()} · {event.actor_id ?? "System"}</p>{event.reason && <p className="mt-1 text-sm text-muted-foreground">{event.reason}</p>}</li>)}</ol>}</section>
        </CardContent>
      </Card>}
    </main>
  );
}
