import {
  listingsSchema, loadedDraftSchema, mutationResultSchema, sentSchema, sessionSchema,
  type DraftInput, type DraftMutationResult,
} from "@cents/contracts";

export class ApiError extends Error {
  constructor(readonly status: number) { super("The API request failed."); }
}

async function read<T>(
  path: string,
  schema: { parse(value: unknown): T },
  init?: RequestInit,
  statuses: readonly number[] = [200],
): Promise<T> {
  const response = await fetch(path, {
    ...init, credentials: "same-origin", cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!statuses.includes(response.status)) throw new ApiError(response.status);
  const body: unknown = await response.json();
  return schema.parse(body);
}

export const session = () => read("/api/session", sessionSchema);
export const listDrafts = () => read("/api/listings", listingsSchema);
export const getDraft = (id: string) => read("/api/listings/" + encodeURIComponent(id), loadedDraftSchema);

export async function requestMagicLink(email: string): Promise<{ kind: "sent" } | { kind: "error"; message: string }> {
  try {
    return await read("/api/auth/magic-link", sentSchema, { method: "POST", body: JSON.stringify({ email }) });
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof ApiError && error.status === 422
        ? "Enter a valid email address." : "We could not send that link. Try again.",
    };
  }
}

export async function submitDraft(input:
  | { mode: "create"; id: string; fields: DraftInput }
  | { mode: "edit"; id: string; fields: DraftInput; expectedRevision: number },
): Promise<DraftMutationResult> {
  const creating = input.mode === "create";
  try {
    return await read(
      creating ? "/api/listings" : "/api/listings/" + encodeURIComponent(input.id),
      mutationResultSchema,
      {
        method: creating ? "POST" : "PUT",
        body: JSON.stringify(creating ? { id: input.id, fields: input.fields }
          : { expectedRevision: input.expectedRevision, fields: input.fields }),
      },
      [200, 201, 404, 409, 422],
    );
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof ApiError && error.status === 401 ? "Sign in to save a draft."
        : creating ? "We could not save this draft. Try again."
        : "We could not save this draft. Your changes are still here. Try again.",
    };
  }
}

export async function loadDraft(id: string) {
  try {
    return await getDraft(id);
  } catch (error) {
    return {
      kind: "error" as const,
      message: error instanceof ApiError && error.status === 404 ? "This draft is no longer available."
        : "We could not load this draft. Your changes are still here. Try again.",
    };
  }
}
