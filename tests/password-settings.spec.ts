import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { apiOrigin, fixtureOrigin, mutationHeaders, webOrigin } from "./support/api";

const endpoint = apiOrigin + "/api/account/password";
const webEndpoint = webOrigin + "/api/account/password";
const first = { email: "seller-one@example.com", old: " fixture-password-one ", initial: "Cents password initial 2026" };
const setupOnly = { email: "password-setup-only@example.com", initial: "Cents password initial 2026" };
const second = { email: "seller-two@example.com", password: "fixture-password-two" };
const changed = "Cents password changed 2026";

async function setAuthFault(request: APIRequestContext, fault: string) {
  expect((await request.post(fixtureOrigin + "/test/auth", { data: { fault } })).status()).toBe(200);
}

async function signInWithMagicLink(page: Page, request: APIRequestContext, email: string) {
  expect((await request.post(apiOrigin + "/api/auth/magic-link", {
    headers: mutationHeaders, data: { email },
  })).status()).toBe(200);
  const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
  const callback = new URL(link);
  callback.host = new URL(apiOrigin).host;
  await page.goto(callback.toString());
  await expect(page).toHaveURL(webOrigin + "/listings");
}

async function passwordLogin(page: Page, email: string, password: string) {
  await page.goto(webOrigin + "/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.afterEach(async ({ request }) => { await setAuthFault(request, ""); });

test("magic-link-only account sets a password, retries sign out, and can change it later", async ({ page, request }) => {
  await signInWithMagicLink(page, request, setupOnly.email);
  await page.getByRole("link", { name: "Password" }).click();
  await expect(page.getByRole("heading", { name: "Set or change password" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${setupOnly.email}.`)).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(setupOnly.initial);
  await page.getByLabel("Confirm new password").fill(setupOnly.initial);
  const setResponse = page.waitForResponse((response) => response.url() === webEndpoint);
  await page.getByRole("button", { name: "Save password" }).click();
  expect((await setResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("Your password has been updated.");
  await expect(page.locator("#new-password")).toHaveCount(0);

  await setAuthFault(request, "logout-outage");
  await page.getByRole("button", { name: "Sign out and go to password sign-in" }).click();
  await expect(page.locator(".password-card").getByText("We could not complete sign out. Try again.")).toHaveAttribute("role", "alert");
  await expect(page.getByRole("status")).toHaveText("Your password has been updated.");
  await expect(page.getByRole("button", { name: "Sign out and go to password sign-in" })).toBeVisible();
  await setAuthFault(request, "");
  await page.getByRole("button", { name: "Sign out and go to password sign-in" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");
  await passwordLogin(page, setupOnly.email, setupOnly.initial);
  await expect(page).toHaveURL(webOrigin + "/listings");

  await page.getByRole("link", { name: "Password" }).click();
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toHaveText("Your password has been updated.");
  await page.getByRole("button", { name: "Sign out and go to password sign-in" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");
  await passwordLogin(page, setupOnly.email, changed);
  await expect(page).toHaveURL(webOrigin + "/listings");
});

test("existing password account can change its password without changing another account", async ({ page, request }) => {
  await signInWithMagicLink(page, request, first.email);
  await page.getByRole("link", { name: "Password" }).click();
  await expect(page.getByText(`Signed in as ${first.email}.`)).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(first.initial);
  await page.getByLabel("Confirm new password").fill(first.initial);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toHaveText("Your password has been updated.");
  await page.getByRole("button", { name: "Sign out and go to password sign-in" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");

  await passwordLogin(page, first.email, first.initial);
  await expect(page).toHaveURL(webOrigin + "/listings");
  await page.getByRole("link", { name: "Password" }).click();
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toHaveText("Your password has been updated.");
  await page.getByRole("button", { name: "Sign out and go to password sign-in" }).click();
  await expect(page).toHaveURL(webOrigin + "/login");

  const invalidOld = page.waitForResponse((response) => response.url() === webOrigin + "/api/auth/password");
  await passwordLogin(page, first.email, first.initial);
  expect((await invalidOld).status()).toBe(401);
  await expect(page.locator("#password-login-error")).toHaveText("Email or password is incorrect.");
  await passwordLogin(page, first.email, changed);
  await expect(page).toHaveURL(webOrigin + "/listings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(webOrigin + "/");
  await passwordLogin(page, second.email, second.password);
  await expect(page).toHaveURL(webOrigin + "/listings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(webOrigin + "/");
  await passwordLogin(page, first.email, changed);
  await expect(page).toHaveURL(webOrigin + "/listings");
});

test("password change validates strict inputs, authentication, origin, and content type", async ({ page, request }) => {
  const invalidBodies = [
    { password: "short", confirmPassword: "short" },
    { password: "a sufficiently long password", confirmPassword: "a different long password" },
    { password: "x".repeat(1025), confirmPassword: "x".repeat(1025) },
    { password: "a sufficiently long password", confirmPassword: "a sufficiently long password", userId: "other" },
  ];
  for (const data of invalidBodies) {
    const response = await request.put(endpoint, { headers: mutationHeaders, data });
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ kind: "error", message: "Enter matching passwords of at least 12 characters." });
  }
  const signedOut = await request.put(endpoint, {
    headers: mutationHeaders, data: { password: changed, confirmPassword: changed },
  });
  expect(signedOut.status()).toBe(401);

  const wrongOrigin = await request.put(endpoint, {
    headers: { ...mutationHeaders, Origin: "https://attacker.example" },
    data: { password: changed, confirmPassword: changed },
  });
  expect(wrongOrigin.status()).toBe(403);
  const wrongType = await request.put(endpoint, {
    headers: { Origin: webOrigin, "Content-Type": "text/plain" },
    data: JSON.stringify({ password: changed, confirmPassword: changed }),
  });
  expect(wrongType.status()).toBe(415);

  await signInWithMagicLink(page, request, first.email);
  await page.goto(webOrigin + "/account/password");
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);
  await setAuthFault(request, "password-update-reauth");
  const responsePromise = page.waitForResponse((response) => response.url() === webEndpoint);
  await page.getByRole("button", { name: "Save password" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(403);
  const rejected = await page.request.put(endpoint, {
    headers: mutationHeaders, data: { password: changed, confirmPassword: changed },
  });
  expect(rejected.status()).toBe(403);
  expect(await rejected.text()).not.toMatch(/reauthentication_needed|Recent login required|password-update-reauth|Cents password/);
  await expect(page.locator("form").getByRole("alert")).toContainText("Sign out, then sign in again with a fresh magic link.");
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(changed);
  await expect(page.getByRole("button", { name: "Sign out to request a fresh magic link" })).toBeVisible();
});

test("provider password policy and outages use safe messages and keep input", async ({ page, request }) => {
  await signInWithMagicLink(page, request, first.email);
  await page.goto(webOrigin + "/account/password");
  await page.getByLabel("New password", { exact: true }).fill(changed);
  await page.getByLabel("Confirm new password").fill(changed);

  for (const [fault, status, message] of [
    ["password-update-weak", 422, "Choose matching passwords of at least 12 characters that meet your account requirements."],
    ["password-update-outage", 503, "We could not confirm the password change. Try signing in with the new password before retrying."],
    ["password-update-unknown", 503, "We could not confirm the password change. Try signing in with the new password before retrying."],
  ] as const) {
    await setAuthFault(request, fault);
    const responsePromise = page.waitForResponse((response) => response.url() === webEndpoint);
    await page.getByRole("button", { name: "Save password" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(status);
    const rejected = await page.request.put(endpoint, {
      headers: mutationHeaders, data: { password: changed, confirmPassword: changed },
    });
    expect(rejected.status()).toBe(status);
    const body = await rejected.text();
    expect(body).not.toMatch(/Private provider failure|unknown_auth_error|password-update|Cents password/);
    await expect(page.locator("form").getByRole("alert")).toHaveText(message);
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue(changed);
    await setAuthFault(request, "");
  }
});
