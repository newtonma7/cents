import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="check-email-heading">
        <Link className="wordmark" href="/">
          cents
        </Link>
        <div className="mail-icon" aria-hidden="true">
          ✉
        </div>
        <h1 id="check-email-heading">Check your email</h1>
        <p>
          We sent you a secure link. Open it in this browser to finish signing
          in.
        </p>
        <Link className="secondary-link" href="/">
          Use a different email
        </Link>
      </section>
    </main>
  );
}
