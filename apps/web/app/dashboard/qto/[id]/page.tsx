import { QtoItemRedirect } from "@/components/qs/qto/qto-item-redirect";

// Item links from before take-off sessions open the item inside its session.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QtoItemRedirect itemId={id} />;
}
