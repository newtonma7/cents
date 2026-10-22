import { randomUUID } from "node:crypto";
import { requireSeller } from "@/lib/supabase/require-seller";
import { DraftForm } from "../draft-form";

export default async function NewListingPage() {
  await requireSeller();

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <a className="wordmark" href="/listings">
          cents
        </a>
      </header>
      <section className="listing-section" aria-labelledby="new-listing-heading">
        <a className="secondary-link" href="/listings">
          Back to listings
        </a>
        <div className="draft-card">
          <p className="eyebrow">Canonical Listing</p>
          <h1 id="new-listing-heading">Create a draft</h1>
          <p>Save what you know. Every field can be left blank.</p>
          <DraftForm mode="create" id={randomUUID()} />
        </div>
      </section>
    </main>
  );
}
