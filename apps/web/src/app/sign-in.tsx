"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, requestMagicLink, session } from "@/lib/api";

export default function SignIn({ initialError }: { initialError: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    session().then(() => { if (active) window.location.replace("/listings"); }).catch((error: unknown) => {
      if (active && !(error instanceof ApiError && error.status === 401)) setError("Sign-in is temporarily unavailable. Try again.");
    });
    return () => { active = false; };
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    if (typeof email !== "string" || pending) return;
    setPending(true);
    const result = await requestMagicLink(email);
    if (result.kind === "sent") router.push("/check-email");
    else { setError(result.message); setPending(false); }
  }

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
        <form onSubmit={send} aria-busy={pending}>
          <label htmlFor="email">Email address</label>
          <input
            disabled={pending}
            autoComplete="email"
            id="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <button disabled={pending} type="submit">{pending ? "Sending…" : "Send magic link"}</button>
        </form>
        <p className="fine-print">
          By continuing, you agree to use Cents only with marketplace accounts
          you control.
        </p>
      </section>
    </main>
  );
}
