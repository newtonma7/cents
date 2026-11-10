import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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
