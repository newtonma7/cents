"use client";

import { useEffect, useState } from "react";
import { ApiError } from "./api";

type PageData<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "missing" }
  | { kind: "error" };

export function usePageData<T>(load: () => Promise<T>): PageData<T> {
  const [state, setState] = useState<PageData<T>>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    load().then((value) => {
      if (active) setState({ kind: "ready", value });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) { window.location.replace("/"); return; }
      setState({ kind: error instanceof ApiError && error.status === 404 ? "missing" : "error" });
    });
    return () => { active = false; };
  }, [load]);
  return state;
}

export function PageNotice({ kind }: { kind: "loading" | "missing" | "error" }) {
  return (
    <main className="workspace-shell">
      <header className="workspace-header"><a className="wordmark" href="/listings">cents</a></header>
      <section className="listing-section">
        <div className="section-heading"><div>
          {kind === "loading" ? <p role="status">Loading…</p>
            : kind === "missing" ? <h1>This page could not be found.</h1>
            : <><p role="alert">We could not load this page. Try again.</p>
              <button onClick={() => window.location.reload()}>Try again</button></>}
        </div></div>
      </section>
    </main>
  );
}
