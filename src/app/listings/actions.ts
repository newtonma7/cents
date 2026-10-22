"use server";

import { redirect } from "next/navigation";
import { createDraft } from "@/lib/listings/server";

export type DraftFormState = { message: string };

export async function saveDraft(
  _previousState: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const id = formData.get("id");
  const title = formData.get("title");
  const description = formData.get("description");
  const values = {
    id: typeof id === "string" ? id : "",
    title: typeof title === "string" ? title : "",
    description: typeof description === "string" ? description : "",
  };

  try {
    const result = await createDraft(values);
    if (!result.ok) return { message: result.message };
  } catch {
    return {
      message: "We could not save this draft. Your text is still here. Try again.",
    };
  }

  redirect("/listings");
}
