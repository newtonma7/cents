import Link from "next/link";
import { listDrafts } from "@/lib/listings/server";
import { requireSeller } from "@/lib/supabase/require-seller";

export default async function ListingsPage() {
  const seller = await requireSeller();
  const listings = await listDrafts();

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
        {listings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">
              +
            </div>
            <h2>No Canonical Listings yet.</h2>
            <p>Create your first Canonical Listing to get started.</p>
          </div>
        ) : (
          <ul className="listing-grid" aria-label="Your Canonical Listings">
            {listings.map((listing) => (
              <li className="listing-card" key={listing.id}>
                <p className="eyebrow">Draft</p>
                <h2>{listing.title || "Untitled listing"}</h2>
                {listing.description ? <p>{listing.description}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
