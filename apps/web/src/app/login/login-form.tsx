"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, passwordLogin, session } from "@/lib/api";

export default function LoginForm() {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    session()
      .then(() => { if (active) window.location.replace("/listings"); })
      .catch((error: unknown) => {
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setError("Sign-in is temporarily unavailable. Try again.");
        }
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") return;

    inFlight.current = true;
    setPending(true);
    setError("");
    const result = await passwordLogin({ email, password });
    if (result.kind === "signed-in") {
      window.location.replace("/listings");
      return;
    }
    setError(result.message);
    inFlight.current = false;
    setPending(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <Link className="wordmark" href="/">cents</Link>
        <p className="eyebrow">Welcome back</p>
        <h1 id="login-heading">Sign in with a password</h1>
        <p>Use the email address and password for your existing account.</p>
        {error ? <p className="error-message" id="password-login-error" role="alert">{error}</p> : null}
        <form onSubmit={submit} aria-busy={pending}>
          <label htmlFor="login-email">Email address</label>
          <input
            autoComplete="username"
            disabled={!ready || pending}
            id="login-email"
            maxLength={254}
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <label htmlFor="login-password">Password</label>
          <input
            autoComplete="current-password"
            disabled={!ready || pending}
            id="login-password"
            maxLength={1024}
            name="password"
            required
            type="password"
          />
          <button disabled={!ready || pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="login-return"><Link className="secondary-link" href="/">Use a magic link instead</Link></p>
      </section>
    </main>
  );
}
