"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Handshake, HardHat, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import type { ProjectCreateKind } from "@/lib/project/projects/project-routes";
import { createProject } from "@/lib/project/projects/create-project";
import { listWbsTemplates, type WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";
import { ClientField, Field, SectorFields, StaffSelect, inputClass, useStaff } from "@/components/project/projects/fields/project-fields";

const schema = z
  .object({
    kind: z.enum(["tender", "awarded"]),
    name: z.string().trim().min(1, "Enter the project name"),
    clientId: z.string().min(1, "Choose the client"),
    category: z.string().min(1, "Choose the sector"),
    buildingType: z.string(),
    projectManagerId: z.string().min(1, "Choose who is in charge"),
    submissionDeadline: z.string(),
    wbsTemplateId: z.string(),
  })
  .refine((v) => v.kind !== "tender" || !!v.submissionDeadline, {
    path: ["submissionDeadline"],
    message: "Enter the submission deadline",
  });

type FormValues = z.infer<typeof schema>;

interface NewProjectFormProps {
  initialKind: ProjectCreateKind;
  onCancel: () => void;
  onCreated: (project: Project) => void;
}

// The only way to start a project: five fields, then the project opens. Everything else has a
// sensible default and is set later (tender sections, or Settings / guided setup).
export function NewProjectForm({ initialKind, onCancel, onCreated }: NewProjectFormProps) {
  const staff = useStaff();
  const [templates, setTemplates] = useState<WbsTemplate[]>([]);
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: initialKind,
      name: "",
      clientId: "",
      category: "",
      buildingType: "",
      projectManagerId: "",
      submissionDeadline: "",
      wbsTemplateId: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const buildingType = useWatch({ control, name: "buildingType" });

  useEffect(() => {
    listWbsTemplates({ activeOnly: true }).then(setTemplates).catch(() => setTemplates([]));
  }, []);

  async function onSubmit(v: FormValues) {
    try {
      const { project, warning } = await createProject({
        kind: v.kind,
        name: v.name,
        clientId: v.clientId,
        category: v.category,
        buildingType: v.buildingType,
        projectManagerId: v.projectManagerId,
        submissionDeadline: v.kind === "tender" ? new Date(v.submissionDeadline).toISOString() : undefined,
        wbsTemplateId: v.kind === "awarded" ? v.wbsTemplateId || undefined : undefined,
      });
      if (warning) toast.warning(`${project.project_code} created, but ${warning}`);
      else toast.success(`${project.project_code} created`);
      onCreated(project);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The project was not created");
    }
  }

  const kinds: { value: ProjectCreateKind; label: string; hint: string; icon: typeof Handshake }[] = [
    { value: "tender", label: "Tender", hint: "Bidding for the job", icon: Handshake },
    { value: "awarded", label: "Awarded", hint: "Contract in hand", icon: HardHat },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">New project</h2>
          <p className="text-sm text-muted-foreground">The project code is assigned automatically. Everything else can be added later.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cancel">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 sm:col-span-2" role="radiogroup" aria-label="Project type">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setValue("kind", k.value, { shouldValidate: false })}
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors",
                kind === k.value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30",
              )}
            >
              <k.icon className={cn("h-5 w-5", kind === k.value ? "text-primary" : "text-muted-foreground")} />
              <span>
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="block text-xs text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <Field label="Project name *" htmlFor="np_name" error={errors.name?.message} className="sm:col-span-2">
          <input id="np_name" autoFocus {...register("name")} className={inputClass} />
        </Field>

        <Field label="Client *" htmlFor="np_client" error={errors.clientId?.message}>
          <Controller control={control} name="clientId" render={({ field }) => <ClientField id="np_client" value={field.value} onChange={field.onChange} />} />
        </Field>

        <Field label={kind === "tender" ? "Person in charge *" : "Project manager *"} htmlFor="np_pm" error={errors.projectManagerId?.message}>
          <Controller control={control} name="projectManagerId" render={({ field }) => <StaffSelect id="np_pm" value={field.value} onChange={field.onChange} staff={staff} />} />
        </Field>

        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <SectorFields
              idPrefix="np"
              category={field.value}
              buildingType={buildingType}
              categoryError={errors.category?.message}
              onChange={(next) => { field.onChange(next.category); setValue("buildingType", next.buildingType); }}
            />
          )}
        />

        {kind === "tender" ? (
          <Field label="Submission deadline *" htmlFor="np_deadline" error={errors.submissionDeadline?.message} className="sm:col-span-2">
            <input id="np_deadline" type="datetime-local" {...register("submissionDeadline")} className={cn(inputClass, "sm:w-1/2")} />
          </Field>
        ) : (
          <Field
            label="WBS template"
            htmlFor="np_wbs"
            className="sm:col-span-2"
            hint={templates.length ? "Applied from the WBS builder, where you choose the buildings and levels." : "No company WBS templates yet; you can build the WBS later."}
          >
            <select id="np_wbs" {...register("wbsTemplateId")} className={inputClass} disabled={!templates.length}>
              <option value="">— Choose later —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">
          {kind === "tender" ? "Opens the tender at Registration." : "Then a short optional setup: team, calendar, WBS."}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create project
          </Button>
        </div>
      </div>
    </form>
  );
}
