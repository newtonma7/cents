import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { emptyDraftInput } from "@cents/contracts";
import { apiOrigin, apiSignIn, mutationHeaders } from "./support/api";

test("create retries acknowledge only matching fields at the original revision", async ({ request }) => {
  await apiSignIn(request);
  const id = randomUUID();
  const fields = { ...emptyDraftInput, title: "Original draft", price_usd: "0.29" };
  const create = (input = fields) => request.post(apiOrigin + "/api/listings", {
    headers: mutationHeaders, data: { id, fields: input },
  });
  expect((await create()).status()).toBe(201);
  expect((await create({ ...fields, title: "  Original draft  ", price_usd: "00.29" })).status()).toBe(201);
  const mismatch = await create({ ...fields, price_usd: "0.30" });
  expect(mismatch.status()).toBe(409);
  expect(await mismatch.json()).toEqual({ kind: "conflict" });
  const endpoint = apiOrigin + "/api/listings/" + id;
  const initial = await (await request.get(endpoint)).json();
  expect(initial.snapshot.revision).toBe(1);
  expect(initial.snapshot.fields.price_usd_cents).toBe(29);
  expect((await request.put(endpoint, {
    headers: mutationHeaders, data: { expectedRevision: 1, fields },
  })).status()).toBe(200);
  const later = await create();
  expect(later.status()).toBe(409);
  expect(await later.json()).toEqual({ kind: "conflict" });
  expect((await (await request.get(endpoint)).json()).snapshot.revision).toBe(2);
});

test("independent Express serves owned DTOs, CAS and response-loss recovery over HTTP", async ({ request }) => {
  expect((await request.get(apiOrigin + "/healthz")).status()).toBe(200);
  expect((await request.get(apiOrigin + "/api/listings")).status()).toBe(401);
  const email = await apiSignIn(request);
  const session = await request.get(apiOrigin + "/api/session");
  expect(await session.json()).toEqual({ seller: { id: expect.any(String), email } });
  const id = randomUUID();
  const fields = { ...emptyDraftInput, title: "Owned draft", price_usd: "0.29" };
  expect((await request.post(apiOrigin + "/api/listings", { headers: mutationHeaders, data: { id, fields } })).status()).toBe(201);
  const initial = await (await request.get(apiOrigin + "/api/listings/" + id)).json();
  expect(initial.snapshot.fields.price_usd_cents).toBe(29);
  expect(initial.snapshot.revision).toBe(1);
  const endpoint = apiOrigin + "/api/listings/" + id;
  const saved = await request.put(endpoint, { headers: mutationHeaders, data: { expectedRevision: 1, fields: { ...fields, title: "Changed" } } });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).snapshot.revision).toBe(2);
  const retry = await request.put(endpoint, { headers: mutationHeaders, data: { expectedRevision: 1, fields: { ...fields, title: "Changed" } } });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).snapshot.revision).toBe(2);
  const stale = await request.put(endpoint, { headers: mutationHeaders, data: { expectedRevision: 1, fields } });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({ kind: "conflict" });
  const dashboard = await (await request.get(apiOrigin + "/api/listings")).json();
  expect(dashboard).toEqual({ listings: [{ id, title: "Changed", description: null }] });
});
