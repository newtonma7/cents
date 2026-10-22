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

test("a signed-out visitor cannot open the draft form", async ({ page }) => {
  await page.goto("/listings/new");
  await expect(page).toHaveURL("/");
});
