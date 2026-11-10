import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Effect } from "effect";
import { sellerSchema } from "@cents/contracts";
import {
  InvalidListingData, ListingReads, ListingReadUnavailable, makeListingReads,
} from "../apps/api/src/listings.js";

const sellerA = sellerSchema.parse({ id: "11111111-1111-4111-8111-111111111111", email: "a@example.com" });
const sellerB = sellerSchema.parse({ id: "22222222-2222-4222-8222-222222222222", email: "b@example.com" });
const listingId = "33333333-3333-4333-8333-333333333333";
const listingIdB = "44444444-4444-4444-8444-444444444444";

function row(sellerId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    seller_id: sellerId,
    title: "Stored title",
    description: null,
    garment_type: null,
    size_system: null,
    size_label: null,
    condition: null,
    brand: null,
    price_usd_cents: 125,
    revision: 1,
    created_at: "2026-01-02T03:04:05.000Z",
    updated_at: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

function readsFor(seller: typeof sellerA, responder: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const client = createClient("http://supabase.test", "test-anon-key", {
    global: { fetch: (input, init) => Promise.resolve(responder(new URL(String(input)), init ?? {})) },
  });
  return makeListingReads({ client, seller });
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "content-range": "0-0/1" },
  });
}

test("listing service uses the real SDK query builder and keeps its read projections", async () => {
  const requests: URL[] = [];
  const reads = readsFor(sellerA, (url) => {
    requests.push(url);
    return response([
      row(sellerA.id),
      row(sellerA.id, { title: 42 }),
      row(sellerB.id, { id: "44444444-4444-4444-8444-444444444444" }),
      row(sellerA.id, { id: "55555555-5555-4555-8555-555555555555", title: "Second" }),
    ]);
  });

  const listingEffect = reads.list();
  expect(requests).toHaveLength(0);
  expect(await Effect.runPromise(listingEffect)).toEqual([
    { id: listingId, title: "Stored title", description: null },
    { id: "55555555-5555-4555-8555-555555555555", title: "Second", description: null },
  ]);
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get("select")).toBe("id,seller_id,title,description");
  expect(requests[0].searchParams.get("order")).toBe("created_at.desc");
  expect(requests[0].searchParams.has("seller_id")).toBe(false);

  const detail = readsFor(sellerA, (url) => {
    requests.push(url);
    return response(row(sellerA.id));
  });
  expect(await Effect.runPromise(detail.get(listingId))).toMatchObject({ id: listingId, revision: 1 });
  const detailUrl = requests[1];
  expect(detailUrl.searchParams.get("id")).toBe(`eq.${listingId}`);
  expect(detailUrl.searchParams.get("seller_id")).toBe(`eq.${sellerA.id}`);
  expect(detailUrl.searchParams.get("select")).toContain("revision,created_at,updated_at");
});

test("listing service types returned failures and preserves query defects", async () => {
  const unavailable = readsFor(sellerA, () => response({ code: "XX000", message: "database failed" }, 400));
  const collectionError = await Effect.runPromise(Effect.catchTag(unavailable.list(), "ListingReadUnavailable", (error) => Effect.succeed(error)));
  if (!(collectionError instanceof ListingReadUnavailable)) throw new Error("Expected collection unavailable failure.");
  expect(collectionError.operation).toBe("collection");
  const detailError = await Effect.runPromise(Effect.catchTag(unavailable.get(listingId), "ListingReadUnavailable", (error) => Effect.succeed(error)));
  if (!(detailError instanceof ListingReadUnavailable)) throw new Error("Expected detail unavailable failure.");
  expect(detailError.operation).toBe("detail");

  const malformedCollection = readsFor(sellerA, () => response({ not: "an array" }));
  const malformedResult = await Effect.runPromise(Effect.catchTag(malformedCollection.list(), "InvalidListingData", (error) => Effect.succeed(error)));
  if (!(malformedResult instanceof InvalidListingData)) throw new Error("Expected invalid collection data failure.");
  expect(malformedResult.operation).toBe("collection");

  const malformedDetail = readsFor(sellerA, () => response(row(sellerA.id, { revision: 0 })));
  const invalidResult = await Effect.runPromise(Effect.catchTag(malformedDetail.get(listingId), "InvalidListingData", (error) => Effect.succeed(error)));
  if (!(invalidResult instanceof InvalidListingData)) throw new Error("Expected invalid detail data failure.");
  expect(invalidResult.operation).toBe("detail");

  const notFound = readsFor(sellerA, () => response(null, 200));
  expect(await Effect.runPromise(notFound.get(listingId))).toBeNull();
  let requests = 0;
  const invalidId = readsFor(sellerA, () => {
    requests += 1;
    return response(null);
  });
  expect(await Effect.runPromise(invalidId.get("not-a-uuid"))).toBeNull();
  expect(requests).toBe(0);

  const sentinel = new Error("query construction failed");
  const client = createClient("http://supabase.test", "test-anon-key");
  const throwingClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "from") throw sentinel;
      return Reflect.get(target, property, receiver);
    },
  });
  const defect = makeListingReads({ client: throwingClient, seller: sellerA });
  await expect(Effect.runPromise(defect.list())).rejects.toBe(sentinel);
});

test("concurrent listing capabilities keep collection and detail reads with their sellers", async () => {
  const calls: Array<{ owner: string; url: URL; release: () => void }> = [];
  let arrivals = 0;
  const arrivalSignals = new Map<number, () => void>();
  const waitForArrivals = (count: number) => new Promise<void>((resolve) => arrivalSignals.set(count, resolve));
  const bothCollectionsArrived = waitForArrivals(2);
  const bothDetailsArrived = waitForArrivals(4);
  const makeReads = (seller: typeof sellerA, index: number) => readsFor(seller, (url) => new Promise<Response>((resolve) => {
    const detail = url.searchParams.has("id");
    const id = index === 0 ? listingId : listingIdB;
    const title = index === 0 ? "Seller A listing" : "Seller B listing";
    calls.push({
      owner: seller.id,
      url,
      release: () => resolve(response(detail
        ? row(seller.id, { id, title })
        : [row(seller.id, { id, title })])),
    });
    arrivalSignals.get(++arrivals)?.();
  }));
  const readsA = makeReads(sellerA, 0);
  const readsB = makeReads(sellerB, 1);
  const collectionProgram = Effect.gen(function* () {
    const reads = yield* ListingReads;
    return yield* reads.list();
  });
  const detailProgram = (id: string) => Effect.gen(function* () {
    const reads = yield* ListingReads;
    return yield* reads.get(id);
  });
  let collectionASettled = false;
  let detailASettled = false;
  const collectionA = Effect.runPromise(Effect.provideService(collectionProgram, ListingReads, readsA))
    .then((value) => { collectionASettled = true; return value; });
  const collectionB = Effect.runPromise(Effect.provideService(collectionProgram, ListingReads, readsB));
  await bothCollectionsArrived;
  calls[1].release();
  expect(await collectionB).toEqual([{ id: listingIdB, title: "Seller B listing", description: null }]);
  expect(collectionASettled).toBe(false);
  calls[0].release();
  expect(await collectionA).toEqual([{ id: listingId, title: "Seller A listing", description: null }]);

  const detailA = Effect.runPromise(Effect.provideService(detailProgram(listingId), ListingReads, readsA))
    .then((value) => { detailASettled = true; return value; });
  const detailB = Effect.runPromise(Effect.provideService(detailProgram(listingIdB), ListingReads, readsB));
  await bothDetailsArrived;
  calls[3].release();
  expect(await detailB).toMatchObject({ id: listingIdB, fields: { title: "Seller B listing" } });
  expect(detailASettled).toBe(false);
  calls[2].release();
  expect(await detailA).toMatchObject({ id: listingId, fields: { title: "Seller A listing" } });
  expect(calls.map(({ owner, url }) => [owner, url.searchParams.get("seller_id")])).toEqual([
    [sellerA.id, null], [sellerB.id, null],
    [sellerA.id, `eq.${sellerA.id}`], [sellerB.id, `eq.${sellerB.id}`],
  ]);
});
