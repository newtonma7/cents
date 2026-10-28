import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const fixtureUrl = "http://127.0.0.1:54321";

async function signIn(page: Page, request: APIRequestContext, email = `${randomUUID()}@example.com`) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const message = await request.get(`${fixtureUrl}/test/inbox?email=${email}`);
  const { link } = await message.json();
  expect(typeof link).toBe("string");
  await page.goto(link);
  await expect(page).toHaveURL(/\/listings$/);
}

async function enterNewDraft(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.request().isNavigationRequest() && new URL(response.url()).pathname === "/listings/new"),
    page.getByRole("link", { name: "Create Canonical Listing" }).click(),
  ]);
  expect(response.request().resourceType()).toBe("document");
  await expect(page.getByRole("heading", { name: "Create a draft" })).toBeVisible();
}

async function createAndOpen(page: Page, request: APIRequestContext, email?: string) {
  await signIn(page, request, email);
  await enterNewDraft(page);
  await page.getByLabel("Title", { exact: true }).fill("Saved title");
  const id = await page.locator('input[name="id"]').inputValue();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.request().isNavigationRequest() && new URL(response.url()).pathname === `/listings/${id}`),
    page.getByRole("link", { name: "Saved title", exact: true }).click(),
  ]);
  expect(response.request().resourceType()).toBe("document");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved title");
  return id;
}

async function saveEdit(page: Page, revision: number) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved.");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue(String(revision));
}

async function fault(request: APIRequestContext, mode: string) {
  expect((await request.post(`${fixtureUrl}/test/fault`, { data: { mode } })).ok()).toBeTruthy();
}

async function cancelLeave(page: Page, navigate: () => Promise<unknown>) {
  await page.getByLabel("Title", { exact: true }).click();
  const nextDialog = page.waitForEvent("dialog");
  const navigation = navigate().catch((error: unknown) => {
    expect(String(error)).toContain("net::ERR_ABORTED");
  });
  const dialog = await nextDialog;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await navigation;
}

test("draft fields stay disabled until hydration can preserve their input", async ({ page, request }) => {
  await signIn(page, request);
  let release = () => {};
  const scripts = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    await scripts;
    await route.continue();
  });
  try {
    await page.goto("/listings/new", { waitUntil: "commit" });
    await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
  await page.getByLabel("Title", { exact: true }).fill("Entered after hydration");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Entered after hydration" })).toBeVisible();
});

test("successful creation does not warn or leave a spent form in browser history", async ({ page, request }) => {
  await signIn(page, request);
  await enterNewDraft(page);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.getByLabel("Title", { exact: true }).fill("Saved without warning");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Saved without warning" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("link", { name: "Create Canonical Listing" })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test("all draft fields save, reopen and edit with exact cents", async ({ page, request }) => {
  await signIn(page, request);
  await enterNewDraft(page);
  await page.getByLabel("Title", { exact: true }).fill("  Linen shirt  ");
  await page.getByLabel("Description").fill("Cream linen.\nOne small mark.");
  await page.getByLabel("Garment type").selectOption("shirt");
  await page.getByLabel("Size system").selectOption("UK");
  await page.getByLabel("Size label").fill("12");
  await page.getByLabel("Condition", { exact: true }).selectOption("Good");
  await page.getByLabel("Brand").fill("Cents sample");
  await page.getByLabel("Price (USD)").fill("0.29");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByRole("link", { name: "Linen shirt", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Linen shirt");
  await expect(page.getByLabel("Description")).toHaveValue("Cream linen.\nOne small mark.");
  await expect(page.getByLabel("Garment type")).toHaveValue("shirt");
  await expect(page.getByLabel("Size system")).toHaveValue("UK");
  await expect(page.getByLabel("Size label")).toHaveValue("12");
  await expect(page.getByLabel("Condition", { exact: true })).toHaveValue("Good");
  await expect(page.getByLabel("Brand")).toHaveValue("Cents sample");
  await expect(page.getByLabel("Price (USD)")).toHaveValue("0.29");
  await page.getByLabel("Title", { exact: true }).fill("Updated linen shirt");
  await page.getByLabel("Price (USD)").fill("21474836.47");
  await saveEdit(page, 2);
  await page.getByRole("link", { name: "Back to listings" }).click();
  await expect(page.getByRole("heading", { name: "Updated linen shirt" })).toBeVisible();
  await page.getByRole("link", { name: "Updated linen shirt", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Updated linen shirt");
  await expect(page.getByLabel("Price (USD)")).toHaveValue("21474836.47");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
});

test("fields clear to null independently and zero USD is not absent", async ({ page, request }) => {
  await createAndOpen(page, request);
  await page.getByLabel("Description").fill("Description to clear");
  await page.getByLabel("Garment type").selectOption("dress");
  await page.getByLabel("Size system").selectOption("US");
  await page.getByLabel("Size label").fill("M");
  await page.getByLabel("Condition", { exact: true }).selectOption("Fair");
  await page.getByLabel("Brand").fill("Brand to clear");
  await page.getByLabel("Price (USD)").fill("0");
  await saveEdit(page, 2);
  await page.reload();
  await expect(page.getByLabel("Price (USD)")).toHaveValue("0.00");

  for (const label of ["Title", "Description", "Brand", "Price (USD)"]) {
    await page.getByLabel(label, { exact: true }).fill("");
  }
  for (const label of ["Garment type", "Size system", "Condition"]) {
    await page.getByLabel(label, { exact: true }).selectOption("");
  }
  await saveEdit(page, 3);
  await page.reload();
  for (const label of ["Title", "Description", "Brand", "Price (USD)", "Garment type", "Size system", "Condition"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  }
  await expect(page.getByLabel("Size label")).toHaveValue("M");
  await page.getByLabel("Size label").fill("");
  await page.getByLabel("Size system").selectOption("One size");
  await saveEdit(page, 4);
  await page.reload();
  await expect(page.getByLabel("Size label")).toHaveValue("");
  await expect(page.getByLabel("Size system")).toHaveValue("One size");
});

test("invalid prices and codepoint lengths preserve unsaved fields and revision", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  await page.getByLabel("Brand").fill("Keep this unsaved brand");
  for (const price of ["-1", "1e2", "1.001", "21474836.48", "999999999999999999999999", ".50", "NaN"]) {
    await page.getByLabel("Price (USD)").fill(price);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Check the draft fields");
    await expect(page.getByLabel("Price (USD)")).toHaveValue(price);
    await expect(page.getByLabel("Brand")).toHaveValue("Keep this unsaved brand");
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  }
  await page.getByLabel("Price (USD)").fill("1.05");
  await page.getByLabel("Title", { exact: true }).fill("🧥".repeat(161));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Check the draft fields");
  await cancelLeave(page, () => page.getByRole("link", { name: "Back to listings" }).click());
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("🧥".repeat(161));
  const saved = await page.context().newPage();
  await saved.goto(`/listings/${id}`);
  await expect(saved.getByLabel("Title", { exact: true })).toHaveValue("Saved title");
  await expect(saved.getByLabel("Brand")).toHaveValue("");
  await saved.close();
  await page.getByLabel("Title", { exact: true }).fill("🧥".repeat(160));
  await saveEdit(page, 2);
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("🧥".repeat(160));
  await expect(page.getByLabel("Price (USD)")).toHaveValue("1.05");
});

test("new draft warns on link, browser Back and reload without autosaving", async ({ page, request }) => {
  await signIn(page, request);
  await enterNewDraft(page);
  await page.getByLabel("Title", { exact: true }).fill("Never saved");
  await cancelLeave(page, () => page.getByRole("link", { name: "Back to listings" }).click());
  await cancelLeave(page, () => page.evaluate(() => window.history.back()));
  await cancelLeave(page, () => page.evaluate(() => window.location.reload()));
  await expect(page).toHaveURL(/\/listings\/new$/);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Never saved");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Back to listings" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByText("No Canonical Listings yet.")).toBeVisible();
  await enterNewDraft(page);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
});

test("saved draft browser Back cancellation retains edits and accepted Back discards them", async ({ page, request }) => {
  await createAndOpen(page, request);
  await page.getByLabel("Title", { exact: true }).fill("Only in this tab");
  await cancelLeave(page, () => page.evaluate(() => window.history.back()));
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Only in this tab");
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByRole("link", { name: "Saved title", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved title");
});

test("unchanged, reverted and successfully saved forms leave without warning", async ({ page, request }) => {
  await createAndOpen(page, request);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.getByRole("link", { name: "Back to listings" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByRole("link", { name: "Saved title", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Reverted title");
  await page.getByLabel("Title", { exact: true }).fill("Saved title");
  await page.goBack();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByRole("link", { name: "Saved title", exact: true }).click();
  await page.getByLabel("Brand").fill("Confirmed brand");
  await saveEdit(page, 2);
  await page.reload();
  await page.getByRole("link", { name: "Back to listings" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  expect(dialogs).toEqual([]);
});

test("stale tabs cannot overwrite and load saved version rereads after explicit discard", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  const stale = await page.context().newPage();
  await stale.goto(`/listings/${id}`);
  await stale.getByLabel("Title", { exact: true }).fill("Stale title");
  await stale.getByLabel("Brand").fill("Unsaved stale brand");
  await page.getByLabel("Title", { exact: true }).fill("First newer title");
  await saveEdit(page, 2);
  await stale.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(stale.locator("form").getByRole("alert")).toContainText("newer saved version");
  await expect(stale.getByLabel("Title", { exact: true })).toHaveValue("Stale title");
  await expect(stale.getByLabel("Brand")).toHaveValue("Unsaved stale brand");
  await expect(stale.locator('input[name="expectedRevision"]')).toHaveValue("1");
  stale.once("dialog", (dialog) => dialog.dismiss());
  await stale.getByRole("button", { name: "Load saved version" }).click();
  await expect(stale.getByLabel("Title", { exact: true })).toHaveValue("Stale title");
  await page.getByLabel("Title", { exact: true }).fill("Latest title");
  await saveEdit(page, 3);
  await stale.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(stale.locator("form").getByRole("alert")).toContainText("newer saved version");
  stale.once("dialog", (dialog) => dialog.accept());
  await stale.getByRole("button", { name: "Load saved version" }).click();
  await expect(stale.getByLabel("Title", { exact: true })).toHaveValue("Latest title");
  await expect(stale.getByLabel("Brand")).toHaveValue("");
  await expect(stale.locator('input[name="expectedRevision"]')).toHaveValue("3");
  await stale.getByLabel("Brand").fill("Saved after loading");
  await saveEdit(stale, 4);
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Latest title");
  await expect(page.getByLabel("Brand")).toHaveValue("Saved after loading");
  await stale.close();
});

test("update failure preserves input and version, then retry saves once", async ({ page, request }) => {
  await createAndOpen(page, request);
  await page.getByLabel("Description").fill("Unsaved description");
  await page.getByLabel("Size label").fill("Uncoupled size");
  await fault(request, "before-commit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("We could not save this draft");
  await expect(page.getByLabel("Description")).toHaveValue("Unsaved description");
  await expect(page.getByLabel("Size label")).toHaveValue("Uncoupled size");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await cancelLeave(page, () => page.evaluate(() => window.history.back()));
  await saveEdit(page, 2);
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue("Unsaved description");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
});

for (const mode of ["after-commit", "after-commit-unreadable"]) {
  test(`lost update response recovers without a second update (${mode})`, async ({ page, request }) => {
    await createAndOpen(page, request);
    await page.getByLabel("Description").fill("Committed description");
    await fault(request, mode);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    if (mode === "after-commit-unreadable") {
      await expect(page.locator("form").getByRole("alert")).toContainText("We could not save this draft");
      await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
      await expect(page.getByLabel("Description")).toHaveValue("Committed description");
      await saveEdit(page, 2);
    } else {
      await expect(page.getByRole("status")).toHaveText("Draft saved.");
    }
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await page.reload();
    await expect(page.getByLabel("Description")).toHaveValue("Committed description");
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
  });
}

test("client response loss preserves edits and retry recovers only the immediate successor", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  await page.getByLabel("Title", { exact: true }).fill("Committed but unacknowledged");
  await page.route(`**/api/listings/${id}`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("We could not save this draft");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Committed but unacknowledged");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await page.unroute(`**/api/listings/${id}`);
  await saveEdit(page, 2);
  await page.reload();
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
});

test("identical fields two revisions later are still a conflict", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  await page.getByLabel("Brand").fill("Desired brand");
  await fault(request, "after-commit-unreadable");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("We could not save this draft");
  const other = await page.context().newPage();
  await other.goto(`/listings/${id}`);
  await expect(other.getByLabel("Brand")).toHaveValue("Desired brand");
  await saveEdit(other, 3);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("newer saved version");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await other.reload();
  await expect(other.locator('input[name="expectedRevision"]')).toHaveValue("3");
  await other.close();
});

test("a pending save disables every editable field", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  await page.getByLabel("Description").fill("Captured submission");
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const dispatched = new Promise<void>((resolve) => {
    void page.route(`**/api/listings/${id}`, async (route) => {
      if (route.request().method() === "PUT") { resolve(); await gate; }
      await route.continue();
    });
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await dispatched;
  for (const label of ["Title", "Description", "Garment type", "Size system", "Size label", "Condition", "Brand", "Price (USD)"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  }
  release();
  await expect(page.getByRole("status")).toHaveText("Draft saved.");
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue("Captured submission");
});

test("a detail read failure is an infrastructure error, not a missing draft", async ({ page, request }) => {
  const id = await createAndOpen(page, request);
  await request.post(`${fixtureUrl}/test/fault`, { data: { mode: "read-failure", count: 10 } });
  try {
    const apiResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/listings/${id}`);
    const response = await page.reload();
    expect(response?.status()).toBe(200);
    expect((await apiResponse).status()).toBe(503);
    await expect(page.locator("main").getByRole("alert")).toContainText("We could not load this page");
  } finally {
    await fault(request, "clear-read-failure");
  }
});

test("a signed-out save keeps unsaved fields without writing", async ({ page, request }) => {
  const email = `${randomUUID()}@example.com`;
  const id = await createAndOpen(page, request, email);
  await page.getByLabel("Brand").fill("Unsaved after sign-out");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Sign in to save");
  await expect(page.getByLabel("Brand")).toHaveValue("Unsaved after sign-out");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await cancelLeave(page, () => page.getByRole("link", { name: "Back to listings" }).click());
  const returning = await page.context().newPage();
  await signIn(returning, request, email);
  await returning.goto(`/listings/${id}`);
  await expect(returning.getByLabel("Brand")).toHaveValue("");
  await expect(returning.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await returning.close();
});

test("foreign, absent, invalid and signed-out detail access is denied; foreign update does not write", async ({ page, request, browser }) => {
  const id = await createAndOpen(page, request);
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  expect((await outsiderContext.request.get(`/api/listings/${id}`)).status()).toBe(401);
  await outsider.goto(`/listings/${id}`);
  await expect(outsider).toHaveURL("/");
  await signIn(outsider, request);
  for (const deniedId of [id, randomUUID(), "not-a-uuid"]) {
    const response = await outsider.goto(`/listings/${deniedId}`);
    expect(response?.status()).toBe(200);
    expect((await outsiderContext.request.get(`/api/listings/${deniedId}`)).status()).toBe(404);
    await expect(outsider.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
    await expect(outsider.getByLabel("Title", { exact: true })).toHaveCount(0);
  }
  await outsider.goto("/listings");
  await enterNewDraft(outsider);
  await outsider.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(outsider).toHaveURL(/\/listings$/);
  await outsider.getByRole("link", { name: "Untitled listing", exact: true }).click();
  await outsider.getByLabel("Title", { exact: true }).fill("Unauthorized replacement");
  await outsider.locator('input[name="id"]').evaluate((input, foreignId) => input.setAttribute("value", foreignId), id);
  await outsider.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(outsider.locator("form").getByRole("alert")).toContainText("no longer available");
  await expect(outsider.getByLabel("Title", { exact: true })).toHaveValue("Unauthorized replacement");
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved title");
  await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
  await outsiderContext.close();
});
