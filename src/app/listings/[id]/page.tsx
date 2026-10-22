import { notFound } from "next/navigation";
import { getDraft } from "@/lib/listings/server";
import { requireSeller } from "@/lib/supabase/require-seller";
import { DraftForm } from "../draft-form";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSeller();
  const { id } = await params;
  const snapshot = await getDraft(id);
  if (!snapshot) notFound();

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <a className="wordmark" href="/listings">cents</a>
      </header>
      <section className="listing-section" aria-labelledby="edit-listing-heading">
        <a className="secondary-link" href="/listings">Back to listings</a>
        <div className="draft-card">
          <p className="eyebrow">Canonical Listing</p>
          <h1 id="edit-listing-heading">Edit draft</h1>
          <p>Save what you know. Every field can be left blank.</p>
          <DraftForm mode="edit" snapshot={snapshot} />
        </div>
      </section>
    </main>
  );
}
