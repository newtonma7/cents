import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { emptyDraftInput } from "@cents/contracts";
import { apiOrigin, apiSignIn, fixtureOrigin, mutationHeaders } from "./support/api";

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
  const edit = (input: typeof fields) => request.put(endpoint, {
    headers: mutationHeaders, data: { fields: input },
  });
  const firstSave = await edit({ ...fields, title: "Saved once" });
  expect(firstSave.status()).toBe(200);
  expect((await firstSave.json()).snapshot.revision).toBe(2);
  const retry = await edit({ ...fields, title: "Saved once" });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).snapshot.revision).toBe(3);
  const later = await create();
  expect(later.status()).toBe(409);
  expect(await later.json()).toEqual({ kind: "conflict" });
  const matchingCurrent = await create({ ...fields, title: "Saved once" });
  expect(matchingCurrent.status()).toBe(409);
  expect(await matchingCurrent.json()).toEqual({ kind: "conflict" });
  const current = (await (await request.get(endpoint)).json()).snapshot;
  expect(current.revision).toBe(3);
  expect(current.fields.title).toBe("Saved once");
});

test("independent Express serves owned DTOs and recovers matching saves regardless of revision", async ({ request }) => {
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
  const saved = await request.put(endpoint, { headers: mutationHeaders, data: { fields: { ...fields, title: "Changed" } } });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).snapshot.revision).toBe(2);
  const retry = await request.put(endpoint, { headers: mutationHeaders, data: { fields: { ...fields, title: "Changed" } } });
  expect(retry.status()).toBe(200);
  const committed = (await retry.json()).snapshot;
  expect(committed.revision).toBe(3);
  expect((await request.post(fixtureOrigin + "/test/fault", { data: { mode: "before-commit" } })).status()).toBe(200);
  const recovered = await request.put(endpoint, { headers: mutationHeaders, data: { fields: { ...fields, title: "Changed" } } });
  expect(recovered.status()).toBe(200);
  expect((await recovered.json()).snapshot).toEqual(committed);
  expect((await request.post(fixtureOrigin + "/test/fault", { data: { mode: "before-commit" } })).status()).toBe(200);
  const failed = await request.put(endpoint, { headers: mutationHeaders, data: { fields: { ...fields, title: "Not persisted" } } });
  expect(failed.status()).toBe(503);
  expect((await failed.json()).kind).toBe("error");
  expect((await (await request.get(endpoint)).json()).snapshot).toEqual(committed);
  const dashboard = await (await request.get(apiOrigin + "/api/listings")).json();
  expect(dashboard).toEqual({ listings: [{ id, title: "Changed", description: null }] });
});
