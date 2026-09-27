import Link from "next/link";
import { requireSeller } from "@/lib/supabase/require-seller";

export default async function ListingsPage() {
  const seller = await requireSeller();

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link className="wordmark" href="/listings">
          cents
        </Link>
        <span className="seller-email">{seller.email}</span>
      </header>
      <section className="listing-section" aria-labelledby="listings-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your inventory</p>
            <h1 id="listings-heading">Canonical Listings</h1>
            <p>Prepare one Canonical Listing, then take it to every marketplace.</p>
          </div>
          <Link className="primary-link" href="/listings/new">
            Create Canonical Listing
          </Link>
        </div>
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            +
          </div>
          <h2>No Canonical Listings yet.</h2>
          <p>Create your first Canonical Listing to get started.</p>
        </div>
      </section>
    </main>
  );
}
