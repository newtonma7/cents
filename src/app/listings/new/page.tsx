import Link from "next/link";
import { requireSeller } from "@/lib/supabase/require-seller";

export default async function NewListingPage() {
  await requireSeller();

  return (
    <main className="workspace-shell">
      <section className="placeholder-card">
        <p className="eyebrow">Canonical Listing</p>
        <h1>Create Canonical Listing</h1>
        <p>The draft editor is the next implementation slice.</p>
        <Link className="secondary-link" href="/listings">
          Back to listings
        </Link>
      </section>
    </main>
  );
}
