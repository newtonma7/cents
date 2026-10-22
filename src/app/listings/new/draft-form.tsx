"use client";

import { useActionState, useState } from "react";
import { saveDraft, type DraftFormState } from "../actions";

export function DraftForm({ id }: { id: string }) {
  const initialState: DraftFormState = { message: "" };
  const [state, action, pending] = useActionState(saveDraft, initialState);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form action={action} className="draft-form">
      <input name="id" type="hidden" value={id} />
      <label htmlFor="title">Title</label>
      <input
        autoComplete="off"
        id="title"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="description">Description</label>
      <textarea
        id="description"
        name="description"
        rows={7}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {state.message ? (
        <p className="error-message" role="alert">
          {state.message}
        </p>
      ) : null}
      <button disabled={pending} type="submit">
        {pending ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}
