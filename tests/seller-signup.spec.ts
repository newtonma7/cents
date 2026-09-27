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
