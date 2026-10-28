import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const web = "http://127.0.0.1:3000";
const fixture = "http://127.0.0.1:54321";

test("real callback and refresh preserve HttpOnly chunks, deletions and SDK seconds through Next", async ({ request }) => {
  const email = `${randomUUID()}@example.com`;
  expect((await request.post(fixture + "/test/auth", { data: { session: "expired-chunked" } })).ok()).toBeTruthy();
  expect((await request.post(web + "/api/auth/magic-link", {
    headers: { Origin: web }, data: { email },
  })).status()).toBe(200);
  const { link } = await (await request.get(fixture + "/test/inbox?email=" + email)).json();
  const callback = await request.get(link, { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  expect(callback.headers().location).toBe(web + "/listings");
  expect(callback.headers()["cache-control"]).toBe("no-store");
  expect(callback.headers()["referrer-policy"]).toBe("no-referrer");
  const issued = callback.headersArray().filter(({ name }) => name.toLowerCase() === "set-cookie");
  expect(issued.length).toBeGreaterThan(1);
  for (const { value } of issued) {
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Path=/");
    expect(value).toContain("SameSite=Lax");
    expect(value).not.toContain("Domain=");
    expect(value).toMatch(/Max-Age=34560000(?:;|$)/);
  }
  const refreshed = await request.get(web + "/api/session");
  expect(refreshed.status()).toBe(200);
  const payload = await refreshed.json();
  expect(payload.seller.email).toBe(email);
  expect(Object.keys(payload)).toEqual(["seller"]);
  expect(JSON.stringify(payload)).not.toMatch(/access_token|refresh_token|padding/);
  const updates = refreshed.headersArray().filter(({ name }) => name.toLowerCase() === "set-cookie");
  expect(updates.some(({ value }) => value.includes("Max-Age=0"))).toBe(true);
  expect(updates.some(({ value }) => !value.includes("Max-Age=0"))).toBe(true);
  for (const { value } of updates) expect(value).toContain("HttpOnly");
  expect((await request.get(web + "/api/session")).status()).toBe(200);
});
