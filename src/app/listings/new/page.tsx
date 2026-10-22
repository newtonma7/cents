import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireSeller } from "@/lib/supabase/require-seller";
import { DraftForm } from "./draft-form";

export default async function NewListingPage() {
  await requireSeller();

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link className="wordmark" href="/listings">
          cents
        </Link>
      </header>
      <section className="listing-section" aria-labelledby="new-listing-heading">
        <Link className="secondary-link" href="/listings">
          Back to listings
        </Link>
        <div className="draft-card">
          <p className="eyebrow">Canonical Listing</p>
          <h1 id="new-listing-heading">Create a draft</h1>
          <p>Start with a title and description. You can leave either blank.</p>
          <DraftForm id={randomUUID()} />
        </div>
      </section>
    </main>
  );
}
