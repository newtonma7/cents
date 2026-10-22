import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function requestMagicLink(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  const message = await request.get(
    `http://127.0.0.1:54321/test/inbox?email=${encodeURIComponent(email)}`,
  );
  expect(message.ok()).toBeTruthy();
  const { link } = await message.json();
  return link as string;
}

test("a Seller can create an account and return with magic links", async ({
  page,
  request,
}) => {
  const email = "seller@example.com";

  await page.goto("/");
  const firstLink = await requestMagicLink(page, request, email);

  await page.goto(firstLink);
  await expect(page).toHaveURL(/\/listings$/);
  await expect(
    page.getByRole("heading", { name: "Canonical Listings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No Canonical Listings yet.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create Canonical Listing" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/listings");
  await expect(page).toHaveURL("/");

  const returningLink = await requestMagicLink(page, request, email);

  expect(returningLink).not.toBe(firstLink);
  await page.goto(returningLink);
  await expect(page).toHaveURL(/\/listings$/);
});

test("a Seller can save and reload a Canonical Listing draft", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "draft-seller@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();

  await expect(page.getByRole("heading", { name: "Create a draft" })).toBeVisible();
  await page.getByLabel("Title").fill("Vintage denim jacket");
  await page.getByLabel("Description").fill("Blue, gently worn, size medium.");
  const listingId = await page.locator('input[name="id"]').inputValue();
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Vintage denim jacket" })).toBeVisible();
  await expect(page.getByText("Blue, gently worn, size medium.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vintage denim jacket" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/");
  const otherSellerLink = await requestMagicLink(
    page,
    request,
    "another-seller@example.com",
  );
  await page.goto(otherSellerLink);
  await expect(page.getByText("No Canonical Listings yet.")).toBeVisible();
  await expect(page.getByText("Vintage denim jacket")).toHaveCount(0);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Another seller's draft");
  await page.locator('input[name="id"]').evaluate((input, id) => {
    input.setAttribute("value", id);
  }, listingId);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("We could not save this draft. Try again.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Another seller's draft");
});

test("a blank draft appears as Untitled listing", async ({ page, request }) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "untitled-seller@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Untitled listing" })).toBeVisible();
});

test("a Seller can retry the same draft after an insert failure", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "retry-seller@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Retry this draft");
  await page.getByLabel("Description").fill("Keep both fields on retry.");
  const id = await page.locator('input[name="id"]').inputValue();

  expect((await request.post("http://127.0.0.1:54321/test/fault", {
    data: { mode: "before-commit" },
  })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".error-message")).toContainText("We could not save this draft");
  await expect(page.locator('input[name="id"]')).toHaveValue(id);
  await expect(page.getByLabel("Title")).toHaveValue("Retry this draft");
  await expect(page.getByLabel("Description")).toHaveValue("Keep both fields on retry.");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Retry this draft" })).toBeVisible();
  await expect(page.getByText("Keep both fields on retry.")).toBeVisible();
});

test("an owned UUID collision recovers without overwriting the listing", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "owned-collision@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Original title");
  await page.getByLabel("Description").fill("Original description.");
  const id = await page.locator('input[name="id"]').inputValue();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/listings$/);

  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Do not replace the existing title");
  await page.getByLabel("Description").fill("Do not replace the existing description.");
  await page.locator('input[name="id"]').evaluate((input, value) => {
    input.setAttribute("value", value);
  }, id);
  await expect(page.locator('input[name="id"]')).toHaveValue(id);
  expect(
    await page.locator("form").evaluate((form) => {
      return form instanceof HTMLFormElement ? new FormData(form).get("id") : null;
    }),
  ).toBe(id);
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Original title" })).toBeVisible();
  await expect(page.getByText("Original description.")).toBeVisible();
  await expect(page.getByText("Do not replace the existing title")).toHaveCount(0);
});

test("a committed draft appears once after its insert response is lost", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "lost-response@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Committed before response loss");
  await page.getByLabel("Description").fill("The first request committed.");
  expect((await request.post("http://127.0.0.1:54321/test/fault", {
    data: { mode: "after-commit" },
  })).ok()).toBeTruthy();

  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Committed before response loss" })).toHaveCount(1);
  await expect(page.getByText("The first request committed.")).toBeVisible();
});

test("a Unicode title within the database character limit appears on the dashboard", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "unicode-seller@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  const title = "🧥".repeat(100);
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("a dashboard row remains visible when unrelated stored fields are invalid", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = await requestMagicLink(page, request, "narrow-row@example.com");
  await page.goto(link);
  await page.getByRole("link", { name: "Create Canonical Listing" }).click();
  await page.getByLabel("Title").fill("Visible despite unrelated data");
  expect((await request.post("http://127.0.0.1:54321/test/fault", {
    data: { mode: "invalid-unrelated" },
  })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Visible despite unrelated data" })).toBeVisible();
});

test("a signed-out visitor cannot open the draft form", async ({ page }) => {
  await page.goto("/listings/new");
  await expect(page).toHaveURL("/");
});
