import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiOrigin, fixtureOrigin, mutationHeaders, webOrigin } from "./support/api";

const first = { email: "seller-one@example.com", password: " fixture-password-one " };
const second = { email: "seller-two@example.com", password: "fixture-password-two" };
const endpoint = apiOrigin + "/api/auth/password";
const webEndpoint = webOrigin + "/api/auth/password";

async function setAuthFault(request: APIRequestContext, fault: string) {
  expect((await request.post(fixtureOrigin + "/test/auth", { data: { fault } })).status()).toBe(200);
}

test.afterEach(async ({ request }) => { await setAuthFault(request, ""); });

test("password HTTP responses contain only the success marker and HttpOnly session cookies", async ({ request }) => {
  const response = await request.post(webEndpoint, { headers: mutationHeaders, data: first });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ kind: "signed-in" });
  expect(body).not.toMatch(/access_token|refresh_token|fixture-password/);
  const updates = response.headersArray().filter(({ name }) => name.toLowerCase() === "set-cookie");
  expect(updates.length).toBeGreaterThan(0);
  for (const { value } of updates) expect(value).toContain("HttpOnly");
});

test("password fields stay disabled until hydration can preserve entered credentials", async ({ page }) => {
  let release = () => {};
  const scripts = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    await scripts;
    await route.continue();
  });
  try {
    await page.goto(webOrigin + "/login", { waitUntil: "commit" });
    await expect(page.getByLabel("Email address")).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel("Email address")).toBeEnabled();
  await page.getByLabel("Email address").fill(first.email);
  await expect(page.getByLabel("Email address")).toHaveValue(first.email);
});

test("password login keeps whitespace, issues HttpOnly cookies, and switches accounts after logout", async ({ page, context }) => {
  await page.goto(webOrigin + "/login");
  await expect(page.getByRole("heading", { name: "Sign in with a password" })).toBeVisible();

  const loginResponse = page.waitForResponse((response) => response.url() === webEndpoint);
  await page.getByLabel("Email address").fill(first.email);
  await page.getByLabel("Password", { exact: true }).fill(first.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await loginResponse;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(webOrigin + "/listings");
  await expect(page.getByText(first.email)).toBeVisible();
  const cookies = await context.cookies(webOrigin);
  expect(cookies.filter(({ name }) => name.startsWith("sb-")).length).toBeGreaterThan(0);
  for (const cookie of cookies.filter(({ name }) => name.startsWith("sb-"))) expect(cookie.httpOnly).toBe(true);
  const browserState = await page.evaluate(() => JSON.stringify({
    local: Object.values(localStorage), session: Object.values(sessionStorage),
  }));
  expect(browserState).not.toMatch(/fixture-password|access_token|refresh_token/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(webOrigin + "/");
  await page.getByRole("link", { name: "Sign in with a password" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");
  await expect(page.getByRole("heading", { name: "Sign in with a password" })).toBeVisible();
  await page.getByLabel("Email address").fill(second.email);
  await page.getByLabel("Password", { exact: true }).fill(second.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(webOrigin + "/listings");
  await expect(page.getByText(second.email)).toBeVisible();
});

test("wrong password and unknown email show the same generic error", async ({ page, request }) => {
  for (const credentials of [
    { email: first.email, password: "wrong password" },
    { email: "unknown@example.com", password: "wrong password" },
  ]) {
    const responsePromise = page.waitForResponse((response) => response.url() === webEndpoint);
    await page.goto(webOrigin + "/login");
    await page.getByLabel("Email address").fill(credentials.email);
    await page.getByLabel("Password", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(401);
    await expect(page.locator("#password-login-error")).toHaveText("Email or password is incorrect.");
    const rejected = await request.post(endpoint, { headers: mutationHeaders, data: credentials });
    expect(rejected.status()).toBe(401);
    const body = await rejected.text();
    expect(JSON.parse(body)).toEqual({ kind: "error", message: "Email or password is incorrect." });
    expect(body).not.toMatch(/wrong password|unknown@example.com|access_token|refresh_token/);
  }
  const rejectedWhitespace = await request.post(endpoint, {
    headers: mutationHeaders, data: { email: first.email, password: first.password.trim() },
  });
  expect(rejectedWhitespace.status()).toBe(401);
});

test("password provider outage shows a generic temporary error", async ({ page, request }) => {
  await setAuthFault(request, "password-outage");
  await page.goto(webOrigin + "/login");
  await page.getByLabel("Email address").fill(first.email);
  await page.getByLabel("Password", { exact: true }).fill(first.password);
  const responsePromise = page.waitForResponse((response) => response.url() === webEndpoint);
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(503);
  await expect(page.locator("#password-login-error")).toHaveText("Sign-in is temporarily unavailable. Try again.");
  const failed = await request.post(endpoint, { headers: mutationHeaders, data: first });
  expect(failed.status()).toBe(503);
  const body = await failed.text();
  expect(JSON.parse(body)).toEqual({ kind: "error", message: "Sign-in is temporarily unavailable. Try again." });
  expect(body).not.toMatch(/Temporary outage|private-provider-payload|fixture-password/);
});

test("unknown provider rejection codes become generic 503 errors", async ({ request }) => {
  await setAuthFault(request, "password-unknown-400");
  const response = await request.post(endpoint, {
    headers: mutationHeaders, data: first,
  });
  expect(response.status()).toBe(503);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ kind: "error", message: "Sign-in is temporarily unavailable. Try again." });
  expect(body).not.toMatch(/Private provider failure|unexpected_provider_code|fixture-password/);
});

test("magic-link navigation remains available from both sign-in pages", async ({ page }) => {
  await page.goto(webOrigin + "/");
  await expect(page.getByRole("link", { name: "Sign in with a password" })).toHaveAttribute("href", "/login");
  await page.getByRole("link", { name: "Sign in with a password" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");
  await page.getByRole("link", { name: "Use a magic link instead" }).click();
  await expect(page).toHaveURL(webOrigin + "/");
  await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
});

test("password endpoint rejects invalid and extra fields without exposing credentials", async ({ request }) => {
  for (const data of [
    { email: "not-an-email", password: "some password" },
    { email: first.email, password: "" },
    { email: first.email, password: "x".repeat(1025) },
    { email: first.email, password: first.password, extra: true },
  ]) {
    const response = await request.post(endpoint, { headers: mutationHeaders, data });
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ kind: "error", message: "Enter a valid email address and password." });
  }
  const response = await request.post(endpoint, {
    headers: { "Content-Type": "application/json" }, data: { email: first.email, password: first.password },
  });
  expect(response.status()).toBe(403);
  expect(await response.text()).not.toMatch(/fixture-password|access_token|refresh_token/);
});
