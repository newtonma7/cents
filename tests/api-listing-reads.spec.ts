import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import { emptyDraftInput } from "@cents/contracts";
import { apiOrigin, apiSignIn, fixtureOrigin, mutationHeaders } from "./support/api";

const privateHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

test("listing reads preserve their HTTP DTOs and status contracts", async ({ request }) => {
  const id = randomUUID();
  const fields = { ...emptyDraftInput, title: "Read contract", price_usd: "1.25" };
  const missingId = randomUUID();

  const anonymous = await request.get(apiOrigin + "/api/listings");
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toEqual({ kind: "error", message: "Sign in to save a draft." });
  expect(anonymous.headers()).toMatchObject(privateHeaders);

  await apiSignIn(request);
  const invalidId = await request.get(apiOrigin + "/api/listings/not-a-uuid");
  expect(invalidId.status()).toBe(404);
  expect(await invalidId.json()).toEqual({ kind: "missing" });
  expect(invalidId.headers()).toMatchObject(privateHeaders);

  const created = await request.post(apiOrigin + "/api/listings", {
    headers: mutationHeaders, data: { id, fields },
  });
  expect(created.status()).toBe(201);

  const collection = await request.get(apiOrigin + "/api/listings");
  expect(collection.status()).toBe(200);
  expect(await collection.json()).toEqual({
    listings: [{ id, title: "Read contract", description: null }],
  });
  expect(collection.headers()).toMatchObject(privateHeaders);

  const detail = await request.get(apiOrigin + "/api/listings/" + id);
  expect(detail.status()).toBe(200);
  const snapshot = (await detail.json()).snapshot;
  expect(snapshot).toEqual({
    id,
    fields: {
      title: "Read contract", description: null, garment_type: null, size_system: null,
      size_label: null, condition: null, brand: null, price_usd_cents: 125,
    },
    revision: 1,
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  });
  expect(detail.headers()).toMatchObject(privateHeaders);

  const missing = await request.get(apiOrigin + "/api/listings/" + missingId);
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ kind: "missing" });
  expect(missing.headers()).toMatchObject(privateHeaders);
});

test("listing GET refreshes expired sessions and isolates concurrent seller cookies", async () => {
  const sellerA = `${randomUUID()}@example.com`;
  const sellerB = `${randomUUID()}@example.com`;
  const contextA = await playwrightRequest.newContext();
  const contextB = await playwrightRequest.newContext();
  try {
    await apiSignIn(contextA, sellerA);
    const idA = randomUUID();
    expect((await contextA.post(apiOrigin + "/api/listings", {
      headers: mutationHeaders,
      data: { id: idA, fields: { ...emptyDraftInput, title: "Seller A private listing" } },
    })).status()).toBe(201);

    await apiSignIn(contextB, sellerB);
    const idB = randomUUID();
    expect((await contextB.post(apiOrigin + "/api/listings", {
      headers: mutationHeaders,
      data: { id: idB, fields: { ...emptyDraftInput, title: "Seller B private listing" } },
    })).status()).toBe(201);

    for (const context of [contextA, contextB]) {
      expect((await context.post(fixtureOrigin + "/test/auth", {
        data: { session: "expired" },
      })).status()).toBe(200);
      await apiSignIn(context, context === contextA ? sellerA : sellerB);
    }

    expect((await contextA.post(fixtureOrigin + "/test/fault", {
      data: { mode: "read-failure", count: 1 },
    })).status()).toBe(200);
    const failedRefreshRead = await contextA.get(apiOrigin + "/api/listings");
    expect(failedRefreshRead.status()).toBe(503);
    expect(failedRefreshRead.headers()["set-cookie"]).toContain("Max-Age=34560000");
    expect(await failedRefreshRead.json()).toEqual({
      kind: "error", message: "Could not load canonical listings.",
    });

    const [collectionA, collectionB] = await Promise.all([
      contextA.get(apiOrigin + "/api/listings"),
      contextB.get(apiOrigin + "/api/listings"),
    ]);
    expect(collectionA.status()).toBe(200);
    expect(await collectionA.json()).toEqual({
      listings: [{ id: idA, title: "Seller A private listing", description: null }],
    });
    expect(collectionB.status()).toBe(200);
    expect(collectionB.headers()["set-cookie"]).toContain("Max-Age=34560000");
    expect(await collectionB.json()).toEqual({
      listings: [{ id: idB, title: "Seller B private listing", description: null }],
    });

    const [detailA, detailB] = await Promise.all([
      contextA.get(apiOrigin + "/api/listings/" + idA),
      contextB.get(apiOrigin + "/api/listings/" + idB),
    ]);
    expect((await detailA.json()).snapshot).toMatchObject({ id: idA, fields: { title: "Seller A private listing" } });
    expect((await detailB.json()).snapshot).toMatchObject({ id: idB, fields: { title: "Seller B private listing" } });
    expect(await (await contextA.get(apiOrigin + "/api/listings")).json()).toEqual({
      listings: [{ id: idA, title: "Seller A private listing", description: null }],
    });
    expect(await (await contextB.get(apiOrigin + "/api/listings")).json()).toEqual({
      listings: [{ id: idB, title: "Seller B private listing", description: null }],
    });
  } finally {
    await contextA.dispose();
    await contextB.dispose();
  }
});

test("listing reads preserve unavailable messages and write recovery", async ({ request }) => {
  await apiSignIn(request);
  expect((await request.post(fixtureOrigin + "/test/fault", {
    data: { mode: "read-failure", count: 2 },
  })).status()).toBe(200);

  const collection = await request.get(apiOrigin + "/api/listings");
  expect(collection.status()).toBe(503);
  expect(await collection.json()).toEqual({
    kind: "error", message: "Could not load canonical listings.",
  });
  expect(collection.headers()).toMatchObject(privateHeaders);

  const detail = await request.get(apiOrigin + "/api/listings/" + randomUUID());
  expect(detail.status()).toBe(503);
  expect(await detail.json()).toEqual({ kind: "error", message: "Could not load this draft." });
  expect(detail.headers()).toMatchObject(privateHeaders);

  const id = randomUUID();
  const fields = { ...emptyDraftInput, title: "Recovery contract" };
  const endpoint = apiOrigin + "/api/listings/" + id;
  expect((await request.post(apiOrigin + "/api/listings", {
    headers: mutationHeaders, data: { id, fields },
  })).status()).toBe(201);
  expect((await request.post(fixtureOrigin + "/test/fault", {
    data: { mode: "after-commit-unreadable" },
  })).status()).toBe(200);
  const recoveredWrite = await request.put(endpoint, {
    headers: mutationHeaders, data: { fields: { ...fields, title: "Saved but unreadable" } },
  });
  expect(recoveredWrite.status()).toBe(503);
  expect(await recoveredWrite.json()).toEqual({
    kind: "error", message: "Could not load this draft.",
  });
  expect(recoveredWrite.headers()).toMatchObject(privateHeaders);
});
