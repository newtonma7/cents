import Link from "next/link";
import { redirect } from "next/navigation";
import { requestMagicLink } from "./actions";
import { createClient } from "@/lib/supabase/server";

type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const supabase = await createClient();
  const {
    data: { user: seller },
  } = await supabase.auth.getUser();

  if (seller) {
    redirect("/listings");
  }

  const { error } = await searchParams;

  return (
    <main className="landing-shell">
      <section className="hero">
        <Link className="wordmark" href="/">
          cents
        </Link>
        <p className="eyebrow">Built for clothing resellers</p>
        <h1>List once. Sell everywhere.</h1>
        <p className="hero-copy">
          Prepare one accurate Canonical Listing, then publish it across your
          marketplaces without entering everything twice.
        </p>
        <ul className="benefits" aria-label="What Cents does">
          <li>One source of truth for every item</li>
          <li>Your marketplace accounts stay in your browser</li>
          <li>You review every Marketplace Listing before it goes live</li>
        </ul>
      </section>
      <section className="auth-card" aria-labelledby="signup-heading">
        <p className="eyebrow">Get started</p>
        <h2 id="signup-heading">Sign up or sign in</h2>
        <p>No password needed. We&apos;ll email you a secure link.</p>
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <form action={requestMagicLink}>
          <label htmlFor="email">Email address</label>
          <input
            autoComplete="email"
            id="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <button type="submit">Send magic link</button>
        </form>
        <p className="fine-print">
          By continuing, you agree to use Cents only with marketplace accounts
          you control.
        </p>
      </section>
    </main>
  );
}
