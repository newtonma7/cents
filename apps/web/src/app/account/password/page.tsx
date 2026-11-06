"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, changePassword, logout, session } from "@/lib/api";

type RequestState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; reauthentication: boolean };

type LogoutState = "idle" | "submitting" | "error";

export default function PasswordSettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [state, setState] = useState<RequestState>({ kind: "idle" });
  const [logoutState, setLogoutState] = useState<LogoutState>("idle");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    session().then(({ seller }) => {
      if (active) setEmail(seller.email);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        window.location.replace("/login");
      } else {
        setLoadingError(true);
      }
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting" || password.length < 12 || password.length > 1024 || password !== confirmPassword) return;
    setState({ kind: "submitting" });
    const result = await changePassword({ password, confirmPassword });
    if (result.kind === "password-updated") {
      setPassword("");
      setConfirmPassword("");
      setState({ kind: "success" });
    } else {
      setState({ kind: "error", message: result.message, reauthentication: result.reauthentication });
    }
  }

  async function signOut(destination: "/" | "/login") {
    setLogoutState("submitting");
    try {
      await logout();
      window.location.replace(destination);
    } catch {
      setLogoutState("error");
    }
  }

  const pending = state.kind === "submitting";
  const logoutPending = logoutState === "submitting";
  const formError = state.kind === "error" ? state.message
    : state.kind === "idle" && password.length > 0 && password.length < 12
      ? "Use at least 12 characters."
      : state.kind === "idle" && confirmPassword.length > 0 && password !== confirmPassword
        ? "The passwords do not match."
        : "";

  return (
    <main className="auth-shell">
      <section className="auth-card password-card" aria-labelledby="password-heading">
        <Link className="wordmark" href="/listings">cents</Link>
        <p className="eyebrow">Account security</p>
        <h1 id="password-heading">Set or change password</h1>
        {email ? <p>Signed in as <strong>{email}</strong>.</p> : null}
        {loadingError ? <p className="error-message" role="alert">We could not load your account. Try again.</p> : null}
        {state.kind === "success" ? (
          <div>
            <p role="status">Your password has been updated.</p>
            <p>Sign out, then sign in with your email and new password.</p>
            {logoutState === "error" ? <p className="error-message" role="alert">We could not complete sign out. Try again.</p> : null}
            <button disabled={logoutPending} onClick={() => void signOut("/login")} type="button">Sign out and go to password sign-in</button>
            <p><Link className="secondary-link" href="/listings">Return to listings</Link></p>
          </div>
        ) : (
          <form onSubmit={submit} aria-busy={pending}>
            <label htmlFor="new-password">New password</label>
            <input
              autoComplete="new-password"
              disabled={pending || !email}
              id="new-password"
              maxLength={1024}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              autoComplete="new-password"
              disabled={pending || !email}
              id="confirm-password"
              maxLength={1024}
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
            {formError ? <p className="error-message" role="alert">{formError}</p> : null}
            {logoutState === "error" ? <p className="error-message" role="alert">We could not complete sign out. Try again.</p> : null}
            {state.kind === "error" && state.reauthentication ? (
              <button disabled={logoutPending} onClick={() => void signOut("/")} type="button">Sign out to request a fresh magic link</button>
            ) : null}
            <button disabled={pending || !email} type="submit">{pending ? "Saving…" : "Save password"}</button>
            <p><Link className="secondary-link" href="/listings">Cancel and return to listings</Link></p>
          </form>
        )}
      </section>
    </main>
  );
}
