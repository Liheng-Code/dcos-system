import { QtoWorkspace } from "@/components/qs/qto/qto-workspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QtoWorkspace itemId={id} />;
}
