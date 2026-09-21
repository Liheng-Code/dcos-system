import { ProgrammeProjection } from "@/components/planning/portal/programme-projection";

export default async function ClientProgrammePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ProgrammeProjection projectId={projectId} />
      </div>
    </main>
  );
}