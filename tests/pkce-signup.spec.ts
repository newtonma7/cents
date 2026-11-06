import { randomUUID } from "node:crypto";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { z } from "zod";
import { fixtureOrigin } from "./support/api";

async function requestLink(page: Page, request: APIRequestContext, email: string) {
  await request.post(fixtureOrigin + "/test/auth", { data: { emailFlow: "pkce" } });
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const inbox = await request.get(fixtureOrigin + "/test/inbox?email=" + email);
  return z.object({ link: z.url() }).parse(await inbox.json()).link;
}

test.afterEach(async ({ request }) => {
  await request.post(fixtureOrigin + "/test/auth", { data: {} });
});

test("default provider emails support signup and returning PKCE sign-in", async ({ page, request }) => {
  const email = `${randomUUID()}@example.com`;
  for (const type of ["signup", "magiclink"]) {
    const link = await requestLink(page, request, email);
    expect(new URL(link).searchParams.get("type")).toBe(type);
    await page.goto(link);
    await expect(page).toHaveURL(/\/listings$/);
    await expect(page.getByRole("heading", { name: "Canonical Listings", exact: true })).toBeVisible();
    expect((await (await page.request.get("/api/session")).json()).seller.email).toBe(email);
    const sessionCookies = (await page.context().cookies()).filter(({ name }) => name.includes("auth-token") && !name.includes("verifier"));
    expect(sessionCookies.length).toBeGreaterThan(0);
    for (const cookie of sessionCookies) {
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");
    await page.context().clearCookies();
  }
});

test("PKCE exchange outages return a generic 503 without creating a session", async ({ page, request }) => {
  const link = await requestLink(page, request, `${randomUUID()}@example.com`);
  const verified = await request.get(link, { maxRedirects: 0 });
  await request.post(fixtureOrigin + "/test/auth", { data: { fault: "verify-outage" } });
  const response = await page.request.get(verified.headers().location, { maxRedirects: 0 });
  expect(response.status()).toBe(503);
  expect(response.headers().location).toBeUndefined();
  expect(await response.json()).toEqual({ kind: "error", message: "Sign-in is temporarily unavailable. Try again." });
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("PKCE link cannot sign in a different browser profile", async ({ page, request, browser }) => {
  const link = await requestLink(page, request, `${randomUUID()}@example.com`);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage.getByText("That sign-in link is invalid or expired.", { exact: true })).toBeVisible();
    expect((await otherPage.request.get("http://127.0.0.1:3000/api/session")).status()).toBe(401);
  } finally { await other.close(); }
});

test("PKCE callback rejects reused codes and ignores external next destinations", async ({ page, request }) => {
  const link = await requestLink(page, request, `${randomUUID()}@example.com`);
  const verified = await request.get(link, { maxRedirects: 0 });
  expect(verified.status()).toBe(303);
  const callback = new URL(verified.headers().location);
  callback.searchParams.set("next", "https://attacker.invalid/");
  const verifierCookies = await page.context().cookies();
  await page.goto(callback.toString());
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByRole("heading", { name: "Canonical Listings", exact: true })).toBeVisible();
  await page.context().clearCookies();
  await page.context().addCookies(verifierCookies);
  const replay = await page.request.get(callback.toString(), { maxRedirects: 0 });
  expect(replay.status()).toBe(303);
  expect(new URL(replay.headers().location).searchParams.get("error")).toBe("That sign-in link is invalid or expired.");
  expect((await page.request.get("/api/session")).status()).toBe(401);
});
