import { QtoSessionWorkspace } from "@/components/qs/qto/qto-session-workspace";

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <QtoSessionWorkspace sessionId={sessionId} />;
}
