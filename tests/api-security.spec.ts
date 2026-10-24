import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { emptyDraftInput } from "@cents/contracts";
import { apiOrigin, apiSignIn, fixtureOrigin, mutationHeaders, webOrigin } from "./support/api";

const endpoint = apiOrigin + "/api/listings";

test("every JSON mutation requires the exact configured Origin before authentication", async ({ request }) => {
  for (const origin of [undefined, "null", "https://attacker.invalid", webOrigin + "/", "http://localhost:3000", "http://127.0.0.1:3001"]) {
    const headers: Record<string, string> = origin === undefined ? {} : { Origin: origin };
    for (const [url, method] of [
      [apiOrigin + "/api/auth/magic-link", "POST"], [endpoint, "POST"], [endpoint + "/" + randomUUID(), "PUT"],
    ]) {
      const response = await request.fetch(url, { method, headers, data: {} });
      expect(response.status(), `${method} ${url} Origin=${origin}`).toBe(403);
      expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
    }
  }
  expect((await request.post(endpoint, { headers: mutationHeaders, data: {} })).status()).toBe(401);
});

test("JSON and HTTP bounds distinguish malformed, oversized and unsupported requests", async ({ request }) => {
  const url = apiOrigin + "/api/auth/magic-link";
  const badJson = await request.post(url, {
    headers: { ...mutationHeaders, "Content-Type": "application/json" }, data: "{",
  });
  expect(badJson.status()).toBe(400);
  expect(await badJson.json()).toEqual({ kind: "error", message: "Malformed JSON." });
  expect((await request.post(url, {
    headers: { ...mutationHeaders, "Content-Type": "text/plain" }, data: "{}",
  })).status()).toBe(415);
  expect((await request.post(url, {
    headers: mutationHeaders, data: { email: "x".repeat(33 * 1024) },
  })).status()).toBe(413);
  expect((await request.get(apiOrigin + "/api/session", {
    headers: { Cookie: "a=" + "x".repeat(17 * 1024) },
  })).status()).toBe(431);
});

test("magic-link DTOs reject injected fields and invalid email without provider payloads", async ({ request }) => {
  for (const data of [{ email: "not-an-email" }, { email: "seller@example.com", redirectTo: "https://attacker.invalid" },
    { email: "seller@example.com", shouldCreateUser: false }]) {
    const response = await request.post(apiOrigin + "/api/auth/magic-link", { headers: mutationHeaders, data });
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ kind: "error", message: "Enter a valid email address." });
  }
});

test("strict listing DTOs reject injected ownership, revision, timestamps and storage cents", async ({ request }) => {
  await apiSignIn(request);
  const id = randomUUID();
  for (const extra of [{ seller_id: randomUUID() }, { revision: 12 }, { created_at: "2026-10-23T00:00:00Z" }]) {
    expect((await request.post(endpoint, {
      headers: mutationHeaders, data: { id, fields: emptyDraftInput, ...extra },
    })).status()).toBe(422);
  }
  expect((await request.post(endpoint, {
    headers: mutationHeaders, data: { id, fields: { ...emptyDraftInput, price_usd_cents: 1 } },
  })).status()).toBe(422);
  expect((await request.get(endpoint + "/" + id)).status()).toBe(404);
  expect((await request.post(endpoint, {
    headers: mutationHeaders, data: { id, fields: emptyDraftInput },
  })).status()).toBe(201);
  for (const data of [
    { expectedRevision: 1, fields: emptyDraftInput, seller_id: randomUUID() },
    { expectedRevision: 1, fields: { ...emptyDraftInput, revision: 20 } },
    { expectedRevision: "1", fields: emptyDraftInput },
    { expectedRevision: 0, fields: emptyDraftInput },
    { expectedRevision: 1, fields: { ...emptyDraftInput, price_usd: "1e2" } },
  ]) {
    expect((await request.put(endpoint + "/" + id, { headers: mutationHeaders, data })).status()).toBe(422);
  }
  const snapshot = (await (await request.get(endpoint + "/" + id)).json()).snapshot;
  expect(snapshot.revision).toBe(1);
  expect(snapshot.fields.price_usd_cents).toBeNull();
});

test("API foreign, missing and invalid identifiers are indistinguishable after authentication", async ({ request, playwright }) => {
  const owner = await playwright.request.newContext();
  try {
    await apiSignIn(owner);
    const id = randomUUID();
    expect((await owner.post(endpoint, {
      headers: mutationHeaders, data: { id, fields: { ...emptyDraftInput, title: "Owner-only title" } },
    })).status()).toBe(201);
    expect((await request.get(endpoint + "/not-a-uuid")).status()).toBe(401);
    await apiSignIn(request);
    for (const deniedId of [id, randomUUID(), "not-a-uuid"]) {
      const read = await request.get(endpoint + "/" + deniedId);
      const update = await request.put(endpoint + "/" + deniedId, {
        headers: mutationHeaders, data: { expectedRevision: 1, fields: emptyDraftInput },
      });
      expect(read.status()).toBe(404);
      expect(update.status()).toBe(404);
      expect(await read.json()).toEqual({ kind: "missing" });
      expect(await update.json()).toEqual({ kind: "missing" });
    }
    expect(await (await request.get(endpoint)).json()).toEqual({ listings: [] });
    const snapshot = (await (await owner.get(endpoint + "/" + id)).json()).snapshot;
    expect(snapshot.fields.title).toBe("Owner-only title");
    expect(snapshot.revision).toBe(1);
  } finally { await owner.dispose(); }
});

test("simultaneous HTTP edits with the same revision cannot overwrite the winner", async ({ request }) => {
  await apiSignIn(request);
  const id = randomUUID();
  await request.post(endpoint, { headers: mutationHeaders, data: { id, fields: emptyDraftInput } });
  const results = await Promise.all(["Left title", "Right title"].map((title) =>
    request.put(endpoint + "/" + id, {
      headers: mutationHeaders, data: { expectedRevision: 1, fields: { ...emptyDraftInput, title } },
    })));
  expect(results.map((response) => response.status()).sort()).toEqual([200, 409]);
  const winner = results.find((response) => response.status() === 200);
  expect(winner).toBeDefined();
  const saved = await winner?.json();
  const snapshot = (await (await request.get(endpoint + "/" + id)).json()).snapshot;
  expect(snapshot.revision).toBe(2);
  expect(snapshot).toEqual(saved.snapshot);
});

test("invalid stored rows produce generic 500 errors, not false 404 or raw provider data", async ({ request }) => {
  await apiSignIn(request);
  const id = randomUUID();
  await request.post(fixtureOrigin + "/test/fault", { data: { mode: "invalid-unrelated" } });
  await request.post(endpoint, { headers: mutationHeaders, data: { id, fields: emptyDraftInput } });
  const response = await request.get(endpoint + "/" + id);
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({ kind: "error", message: "We could not complete this request. Try again." });
});
