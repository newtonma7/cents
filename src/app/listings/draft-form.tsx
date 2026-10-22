"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import {
  conditions,
  draftInputFieldNames,
  draftInput,
  emptyDraftInput,
  garmentTypeLabels,
  garmentTypes,
  sizeSystems,
  type DraftInput,
  type DraftSnapshot,
} from "@/lib/listings/draft";
import { loadDraft, submitDraft } from "./actions";

type EditorProps =
  | { mode: "create"; id: string }
  | { mode: "edit"; snapshot: DraftSnapshot };
type Feedback =
  | { kind: "idle" }
  | { kind: "created" }
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };
type EditorState = {
  id: string;
  values: DraftInput;
  baseline: DraftInput;
  revision: number;
  feedback: Feedback;
};

const subscribeToHydration = () => () => {};

export function DraftForm(props: EditorProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [editor, setEditor] = useState<EditorState>(() => {
    const values = props.mode === "create" ? emptyDraftInput : draftInput(props.snapshot.fields);
    return {
      id: props.mode === "create" ? props.id : props.snapshot.id,
      values,
      baseline: values,
      revision: props.mode === "create" ? 1 : props.snapshot.revision,
      feedback: { kind: "idle" },
    };
  });
  const [pending, startTransition] = useTransition();
  const disabled = !hydrated || pending || editor.feedback.kind === "created";
  const dirty = draftInputFieldNames.some((key) => editor.values[key] !== editor.baseline[key]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (editor.feedback.kind === "created") window.location.replace("/listings");
  }, [editor.feedback]);

  function change(name: keyof DraftInput, value: string) {
    setEditor((current) => ({
      ...current,
      values: { ...current.values, [name]: value },
      feedback: current.feedback.kind === "saved" ? { kind: "idle" } : current.feedback,
    }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await submitDraft(data);
        setEditor((current) => {
          switch (result.kind) {
            case "created":
              return { ...current, baseline: current.values, feedback: result };
            case "saved": {
              const values = draftInput(result.snapshot.fields);
              return {
                ...current,
                values,
                baseline: values,
                revision: result.snapshot.revision,
                feedback: { kind: "saved" },
              };
            }
            case "missing":
              return {
                ...current,
                feedback: {
                  kind: "error",
                  message: "This draft is no longer available. Your changes are still here.",
                },
              };
            case "conflict":
            case "error":
              return { ...current, feedback: result };
            default: {
              const exhaustive: never = result;
              return exhaustive;
            }
          }
        });
      } catch {
        setEditor((current) => ({
          ...current,
          feedback: {
            kind: "error",
            message: "We could not save this draft. Your changes are still here. Try again.",
          },
        }));
      }
    });
  }

  function loadSaved() {
    if (dirty && !window.confirm("Discard your unsaved changes and load the saved version?")) return;
    startTransition(async () => {
      try {
        const result = await loadDraft(editor.id);
        if (result.kind === "loaded") {
          const values = draftInput(result.snapshot.fields);
          setEditor((current) => ({
            ...current,
            values,
            baseline: values,
            revision: result.snapshot.revision,
            feedback: { kind: "idle" },
          }));
        } else {
          setEditor((current) => ({ ...current, feedback: result }));
        }
      } catch {
        setEditor((current) => ({
          ...current,
          feedback: {
            kind: "error",
            message: "We could not load this draft. Your changes are still here. Try again.",
          },
        }));
      }
    });
  }

  return (
    <form onSubmit={save} className="draft-form" aria-busy={!hydrated || pending}>
      <input name="id" type="hidden" value={editor.id} />
      <input name="mode" type="hidden" value={props.mode} />
      <input name="expectedRevision" type="hidden" value={editor.revision} />
      <fieldset disabled={disabled}>
        <legend>Title and description</legend>
        <label htmlFor="title">Title</label>
        <input
          autoComplete="off"
          id="title"
          name="title"
          value={editor.values.title}
          onChange={(event) => change("title", event.target.value)}
        />
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={7}
          value={editor.values.description}
          onChange={(event) => change("description", event.target.value)}
        />
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Apparel details</legend>
        <label htmlFor="garment_type">Garment type</label>
        <select
          id="garment_type"
          name="garment_type"
          value={editor.values.garment_type}
          onChange={(event) => change("garment_type", event.target.value)}
        >
          <option value="">Not specified</option>
          {garmentTypes.map((value) => (
            <option key={value} value={value}>{garmentTypeLabels[value]}</option>
          ))}
        </select>
        <label htmlFor="size_system">Size system</label>
        <select
          id="size_system"
          name="size_system"
          value={editor.values.size_system}
          onChange={(event) => change("size_system", event.target.value)}
        >
          <option value="">Not specified</option>
          {sizeSystems.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <label htmlFor="size_label">Size label</label>
        <input
          id="size_label"
          name="size_label"
          value={editor.values.size_label}
          onChange={(event) => change("size_label", event.target.value)}
        />
        <label htmlFor="condition">Condition</label>
        <select
          id="condition"
          name="condition"
          value={editor.values.condition}
          onChange={(event) => change("condition", event.target.value)}
        >
          <option value="">Not specified</option>
          {conditions.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <label htmlFor="brand">Brand</label>
        <input
          id="brand"
          name="brand"
          value={editor.values.brand}
          onChange={(event) => change("brand", event.target.value)}
        />
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Pricing</legend>
        <label htmlFor="price_usd">Price (USD)</label>
        <input
          id="price_usd"
          name="price_usd"
          inputMode="decimal"
          value={editor.values.price_usd}
          onChange={(event) => change("price_usd", event.target.value)}
        />
      </fieldset>
      {editor.feedback.kind === "error" ? (
        <p className="error-message" role="alert">{editor.feedback.message}</p>
      ) : null}
      {editor.feedback.kind === "conflict" ? (
        <p className="error-message" role="alert">
          This draft has a newer saved version. Your changes are still here.
          Load the saved version to continue.
        </p>
      ) : null}
      <p role="status">
        {!hydrated ? "Loading editor…"
          : pending ? "Saving or loading draft…"
          : editor.feedback.kind === "saved" ? "Draft saved."
          : dirty ? "Unsaved changes" : "No unsaved changes"}
      </p>
      <button disabled={disabled} type="submit">
        {pending ? "Please wait…" : "Save draft"}
      </button>
      {props.mode === "edit" ? (
        <button disabled={disabled} type="button" onClick={loadSaved}>Load saved version</button>
      ) : null}
    </form>
  );
}
