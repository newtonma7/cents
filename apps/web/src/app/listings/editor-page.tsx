"use client";

import { useCallback } from "react";
import { draftIdSchema } from "@cents/contracts";
import { getDraft, session } from "@/lib/api";
import { PageNotice, usePageData } from "@/lib/page-data";
import { DraftForm } from "./draft-form";

async function newDraft() {
  await session();
  return draftIdSchema.parse(crypto.randomUUID());
}

export function NewEditor() {
  const state = usePageData(newDraft);
  if (state.kind === "error" || state.kind === "missing") return <PageNotice kind={state.kind} />;
  return (
    <EditorShell creating>
      {state.kind === "ready" ? <DraftForm mode="create" id={state.value} />
        : state.kind === "loading" ? <fieldset disabled aria-busy="true">
          <legend>Loading editor…</legend>
          <label htmlFor="title">Title</label><input id="title" disabled />
          <button disabled>Save draft</button>
        </fieldset> : null}
    </EditorShell>
  );
}

export function EditEditor({ id }: { id: string }) {
  const load = useCallback(() => getDraft(id), [id]);
  const state = usePageData(load);
  if (state.kind !== "ready") return <PageNotice kind={state.kind} />;
  return <EditorShell creating={false}><DraftForm key={id} mode="edit" snapshot={state.value.snapshot} /></EditorShell>;
}

function EditorShell({ creating, children }: { creating: boolean; children: React.ReactNode }) {
  return (
    <main className="workspace-shell">
      <header className="workspace-header"><a className="wordmark" href="/listings">cents</a></header>
      <section className="listing-section" aria-labelledby="editor-heading">
        <a className="secondary-link" href="/listings">Back to listings</a>
        <div className="draft-card">
          <p className="eyebrow">Canonical Listing</p>
          <h1 id="editor-heading">{creating ? "Create a draft" : "Edit draft"}</h1>
          <p>Save what you know. Every field can be left blank.</p>
          {children}
        </div>
      </section>
    </main>
  );
}
