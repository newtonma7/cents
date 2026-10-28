import { EditEditor } from "../editor-page";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditEditor key={id} id={id} />;
}
