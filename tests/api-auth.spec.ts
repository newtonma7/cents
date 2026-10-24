import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiOrigin, apiSignIn, fixtureOrigin, mutationHeaders, webOrigin } from "./support/api";

async function authMode(request: APIRequestContext, data: { session?: string; fault?: string }) {
  expect((await request.post(fixtureOrigin + "/test/auth", { data })).status()).toBe(200);
}
function cookies(response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return response.headersArray().filter(({ name }) => name.toLowerCase() === "set-cookie").map(({ value }) => value);
}

test.afterEach(async ({ request }) => { await authMode(request, {}); });

test("absent and malformed sessions return 401 without exposing tokens", async ({ request }) => {
  for (const path of ["/api/session", "/api/listings", "/api/listings/not-a-uuid"]) {
    const response = await request.get(apiOrigin + path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ kind: "error", message: "Sign in to save a draft." });
  }
  const response = await request.get(apiOrigin + "/api/session", {
    headers: { Cookie: "sb-127-auth-token=not-a-session" },
  });
  expect(response.status()).toBe(401);
  expect(await response.text()).not.toMatch(/not-a-session|access_token|refresh_token/);
});

test("definitively invalid user identity returns 401 rather than infrastructure success", async ({ request }) => {
  await apiSignIn(request);
  await authMode(request, { fault: "user-invalid" });
  expect((await request.get(apiOrigin + "/api/session")).status()).toBe(401);
});

test("temporary user lookup failure returns 503 without false logout", async ({ request }) => {
  const email = await apiSignIn(request);
  const before = await request.storageState();
  await authMode(request, { fault: "user-outage" });
  const failed = await request.get(apiOrigin + "/api/session");
  expect(failed.status()).toBe(503);
  expect(cookies(failed)).toEqual([]);
  expect(await request.storageState()).toEqual(before);
  await authMode(request, {});
  expect((await (await request.get(apiOrigin + "/api/session")).json()).seller.email).toBe(email);
});

test("invalid refresh returns 401 and propagates HttpOnly cookie deletions", async ({ request }) => {
  await authMode(request, { session: "expired" });
  await apiSignIn(request);
  await authMode(request, { fault: "refresh-invalid" });
  const response = await request.get(apiOrigin + "/api/session");
  expect(response.status()).toBe(401);
  const updates = cookies(response);
  expect(updates.length).toBeGreaterThan(0);
  for (const value of updates) {
    expect(value).toContain("Max-Age=0");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
  }
  expect((await request.storageState()).cookies.filter(({ name }) => name.startsWith("sb-"))).toEqual([]);
});

for (const fault of ["refresh-outage", "refresh-rate-limit", "refresh-unknown-outage"]) {
test(`temporary refresh failure retains cookies and recovers (${fault})`, async ({ request }) => {
  test.setTimeout(60_000);
  await authMode(request, { session: "expired" });
  const email = await apiSignIn(request);
  const before = await request.storageState();
  await authMode(request, { fault });
  const failed = await request.get(apiOrigin + "/api/session");
  expect(failed.status()).toBe(503);
  expect(cookies(failed)).toEqual([]);
  expect(await request.storageState()).toEqual(before);
  await authMode(request, {});
  const recovered = await request.get(apiOrigin + "/api/session");
  expect(recovered.status()).toBe(200);
  expect((await recovered.json()).seller.email).toBe(email);
  expect(cookies(recovered).length).toBeGreaterThan(0);
  for (const value of cookies(recovered)) expect(value).toContain("HttpOnly");
});
}

test("parallel expired requests accept provider refresh reuse without shared mutable SDK sessions", async ({ request }) => {
  await authMode(request, { session: "expired" });
  const email = await apiSignIn(request);
  const state = await request.storageState();
  const frozen = state.cookies.map(({ name, value }) => name + "=" + value).join("; ");
  const responses = await Promise.all(Array.from({ length: 6 }, () =>
    request.get(apiOrigin + "/api/session", { headers: { Cookie: frozen } })));
  const refreshedValues = new Set<string>();
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect((await response.json()).seller.email).toBe(email);
    const updates = cookies(response);
    expect(updates.length).toBeGreaterThan(0);
    for (const value of updates) {
      expect(value).toContain("HttpOnly");
      expect(value).not.toContain("Max-Age=0");
      refreshedValues.add(value.split(";")[0]);
    }
  }
  expect(refreshedValues.size).toBe(1);
  expect((await request.get(apiOrigin + "/api/session")).status()).toBe(200);
});

test("parallel refreshes for different Sellers never exchange identities", async ({ playwright, request }) => {
  const left = await playwright.request.newContext();
  const right = await playwright.request.newContext();
  try {
    await authMode(request, { session: "expired" });
    const leftEmail = await apiSignIn(left);
    await authMode(request, { session: "expired" });
    const rightEmail = await apiSignIn(right);
    const [leftResponse, rightResponse] = await Promise.all([
      left.get(apiOrigin + "/api/session"), right.get(apiOrigin + "/api/session"),
    ]);
    expect(leftResponse.status()).toBe(200);
    expect(rightResponse.status()).toBe(200);
    expect((await leftResponse.json()).seller.email).toBe(leftEmail);
    expect((await rightResponse.json()).seller.email).toBe(rightEmail);
    expect(leftEmail).not.toBe(rightEmail);
  } finally { await left.dispose(); await right.dispose(); }
});

test("callback accepts only bounded email proof and ignores Host and next redirect injection", async ({ request }) => {
  for (const query of ["", "?token_hash=x&type=signup", "?token_hash=x&type=email&type=email",
    "?token_hash=" + "x".repeat(2049) + "&type=email", "?token_hash=x&type=email"]) {
    const response = await request.get(apiOrigin + "/auth/confirm" + query, {
      headers: { Host: "attacker.invalid" }, maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe(webOrigin + "/?error=That%20sign-in%20link%20is%20invalid%20or%20expired.");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(cookies(response)).toEqual([]);
  }
  const email = `${randomUUID()}@example.com`;
  await request.post(apiOrigin + "/api/auth/magic-link", { headers: mutationHeaders, data: { email } });
  const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
  const callback = new URL(link);
  callback.host = new URL(apiOrigin).host;
  callback.searchParams.set("next", "https://attacker.invalid/");
  const response = await request.get(callback.toString(), { headers: { Host: "attacker.invalid" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(webOrigin + "/listings");
  expect(cookies(response).length).toBeGreaterThan(0);
});

test("provider callback and OTP outages remain generic 503 errors", async ({ request }) => {
  await authMode(request, { fault: "verify-outage" });
  const response = await request.get(apiOrigin + "/auth/confirm?token_hash=private-proof&type=email", { maxRedirects: 0 });
  expect(response.status()).toBe(503);
  expect(response.headers().location).toBeUndefined();
  expect(await response.text()).not.toMatch(/private-proof|access_token|refresh_token|Temporary outage/);
  await authMode(request, { fault: "otp-outage" });
  const otp = await request.post(apiOrigin + "/api/auth/magic-link", { headers: mutationHeaders, data: { email: "private-email@example.com" } });
  expect(otp.status()).toBe(503);
  expect(await otp.json()).toEqual({ kind: "error", message: "We could not send that link. Try again." });
});

test("configured HTTPS writes Secure host-only HttpOnly cookies with seconds-based lifetime", async ({ request }) => {
  const endpoint = "http://127.0.0.1:3002";
  const publicOrigin = "https://cents.example.test";
  const email = `${randomUUID()}@example.com`;
  await authMode(request, { session: "expired" });
  expect((await request.post(endpoint + "/api/auth/magic-link", {
    headers: { Origin: publicOrigin }, data: { email },
  })).status()).toBe(200);
  const { link } = await (await request.get(fixtureOrigin + "/test/inbox?email=" + email)).json();
  const callback = new URL(link);
  callback.protocol = "http:";
  callback.host = "127.0.0.1:3002";
  const response = await request.get(callback.toString(), { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(publicOrigin + "/listings");
  const updates = cookies(response);
  expect(updates.length).toBeGreaterThan(0);
  for (const value of updates) {
    expect(value).toContain("Secure");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=34560000");
    expect(value).not.toContain("Domain=");
  }
  const refreshed = await request.get(endpoint + "/api/session", {
    headers: { Cookie: updates.map((value) => value.split(";")[0]).join("; ") },
  });
  expect(refreshed.status()).toBe(200);
  expect(cookies(refreshed).length).toBeGreaterThan(0);
  for (const value of cookies(refreshed)) {
    expect(value).toContain("Secure");
    expect(value).toContain("HttpOnly");
    expect(value).not.toContain("Domain=");
  }
});
