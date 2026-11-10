# Effect migration

## Listing reads

The API uses Effect 4.1.3 for collection and detail listing reads. Express still owns HTTP, and `requireSession` still authenticates each request and creates the Supabase client that owns its cookies. The listing service receives that authenticated session through `makeListingReads(session)` and captures its client and Seller in a request-local value.

`ListingReads` exposes only `list()` and `get(id)`. Routes provide one fresh implementation for each read and run the Effect. The service owns the Supabase projections, owner filtering, storage decoding, and typed read failures. It does not own authentication, cookie handling, or HTTP responses.

```ts
const session = await requireSession(req, res, config);
const listings = await runListingRead(session, Effect.gen(function* () {
  const reads = yield* ListingReads;
  return yield* reads.list();
}));
```

`ListingReadUnavailable` represents an SDK query result with an error. The route maps that failure to the existing operation-specific 503 response. `InvalidListingData` represents malformed listing data. The route leaves it on the existing generic 500 path. A thrown query exception remains an Effect defect and also reaches the generic 500 path.

The service does not put the raw SDK session in Context. Context consumers receive listing operations, not a database client, Seller, or write capability. The factory accepts the session at the composition boundary so each request uses its own authenticated client without shared mutable session state.

The existing Zod schemas remain the storage and request validators. The private `querySnapshot` helper shares the detail query with Promise-based write recovery. `readSnapshot` keeps its existing Promise and error behavior, so POST, PUT, and recovery do not depend on Effect.

## Next migration slices

Keep later work narrow and review it against these gates:

1. Migrate write outcomes only with retry, ambiguous-commit recovery, and mutation response tests. Keep their current callers and recovery rules stable until those tests pass.
2. Migrate authentication or boundary handling separately, with cookie refresh, invalid-session deletion, temporary provider outage, and multi-Seller concurrency tests.
3. Change process lifecycle or configuration only if a specific slice removes existing complexity. Do not add a global runtime or a new provider layer without a concrete caller.

Run `npm run test:api`, `npm run typecheck`, and `npm run lint` for each slice. Run the development and production suites before integrating broader changes. Use only the local fixture for these checks. These gates do not prove hosted Supabase RLS or provider refresh behavior.
