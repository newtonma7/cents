import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { emptyDraftInput, loadedDraftSchema } from "@cents/contracts";
import { apiOrigin, apiSignIn, mutationHeaders } from "./support/api";

test("the last saved tab replaces the entire draft even when opened before another save", async ({ page }) => {
  await apiSignIn(page.request);
  const id = randomUUID();
  expect((await page.request.post(apiOrigin + "/api/listings", {
    headers: mutationHeaders,
    data: { id, fields: { ...emptyDraftInput, title: "Original title", description: "Original description" } },
  })).status()).toBe(201);
  await page.goto("/listings/" + id);
  const olderTab = await page.context().newPage();
  try {
    await olderTab.goto("/listings/" + id);
    await expect(olderTab.getByLabel("Title", { exact: true })).toHaveValue("Original title");
    await olderTab.getByLabel("Title", { exact: true }).fill("Last saved title");
    await olderTab.getByLabel("Brand", { exact: true }).fill("Last saved brand");
    await page.getByLabel("Title", { exact: true }).fill("First saved title");
    await page.getByLabel("Description", { exact: true }).fill("Description from first save");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved.");

    const saved = olderTab.waitForResponse(response => response.request().method() === "PUT"
      && new URL(response.url()).pathname === "/api/listings/" + id);
    await olderTab.getByRole("button", { name: "Save draft", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(olderTab.getByRole("status")).toHaveText("Draft saved.");
    const result = loadedDraftSchema.parse(await (await page.request.get(apiOrigin + "/api/listings/" + id)).json());
    expect(result.snapshot.revision).toBe(3);
    expect(result.snapshot.fields).toMatchObject({
      title: "Last saved title", brand: "Last saved brand", description: "Original description",
    });
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Last saved title");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Original description");
  } finally { await olderTab.close(); }
});
