# Express API reference

## Ownership and transport

`apps/api` owns Supabase Auth, session refresh, authoritative input validation, ownership checks, persistence, and ambiguous-write recovery. Every authenticated request creates its own SDK client with the caller's cookies and public Supabase key. Database requests use that caller's session and RLS. There is no service-role bypass.

`apps/web` contains UI renderers, controlled forms, client loaders, and a typed HTTP client. Next's two external rewrites are transport only. No Server Actions, auth proxy, route-handler backend, or Supabase client remains in the frontend. The API uses Effect for listing reads while Express remains the HTTP owner. See [the Effect migration guide](effect-migration.md) for the request-local service shape.

`packages/contracts` exports built ESM and declarations for pure field rules and strict HTTP schemas. The web validates API responses at that boundary. Express alone converts raw dollar strings into persisted integer cents.

## Endpoints

All private responses and callbacks use `Cache-Control: no-store`. Responses contain no auth tokens or raw provider bodies.

| Method and path | Request | Success |
| --- | --- | --- |
| `GET /healthz` | None | `200 { ok: true }`. This is process health, not provider health. |
| `GET /api/session` | Session cookies | `200 { seller: { id, email } }` |
| `POST /api/auth/magic-link` | `{ email }` | `200 { kind: "sent" }` |
| `POST /api/auth/password` | `{ email, password }` | `200 { kind: "signed-in" }` |
| `PUT /api/account/password` | Authenticated `{ password, confirmPassword }` | `200 { kind: "password-updated" }` |
| `POST /api/auth/logout` | `{}` | `204`, clears the current session cookies |
| `GET /auth/confirm` | `code` and optional `sb_flow_id`, or `token_hash` and `type=email` query | `303` to the configured origin's `/listings`, with session cookies |
| `GET /api/listings` | Session cookies | `200 { listings: [{ id, title, description }] }` |
| `POST /api/listings` | `{ id, fields: DraftInput }` | `201 { kind: "created" }` |
| `GET /api/listings/:id` | Session cookies | `200 { kind: "loaded", snapshot }` |
| `PUT /api/listings/:id` | `{ fields: DraftInput }` | `200 { kind: "saved", snapshot }` |

`DraftInput` requires eight raw string fields, including blank strings for unknown facts. The fields are `title`, `description`, `garment_type`, `size_system`, `size_label`, `condition`, `brand`, and `price_usd`.

A Snapshot contains `id`, parsed nullable `fields`, `revision`, `createdAt`, and `updatedAt`. The price in those parsed fields is `price_usd_cents`, an integer or null. Editable DTOs reject injected owner, revision, timestamp, and storage-cent properties.

Creation uses a stable client-generated UUID. A retry acknowledges creation only when that Seller's existing UUID is still at revision 1 and all persisted fields match the submitted fields. Different fields or a later revision return a conflict without overwriting anything. The create form retains unsaved input and offers a link to the saved draft; leaving unsaved input still requires the browser's discard confirmation. Editing replaces all editable fields with one seller-owned update. The database serializes concurrent updates and increments the server-maintained revision for each write. An ambiguous response recovers success when an owner-scoped read finds every submitted field, regardless of revision. Otherwise the API returns a generic temporary error and keeps the editor input. Retrying sends another unconditional update, which can overwrite an intervening save and increment the revision again. Use Load saved version to replace local input after confirming any discard.

## Errors and page shells

| Status | Meaning |
| --- | --- |
| `400` | Malformed JSON |
| `401` | Absent or definitively invalid session, or rejected login credentials |
| `403` | Missing, null, or non-matching Origin on an unsafe request |
| `404` | Foreign, absent, or invalid listing identifier after authentication |
| `409` | Conflicting create retry, with `{ kind: "conflict" }` |
| `413` | JSON body exceeds 32 KiB |
| `415` | Unsafe request does not use `application/json` |
| `422` | Invalid or unknown DTO properties or invalid field values |
| `431` | Node rejects headers above its 16 KiB limit |
| `500` | Unexpected failure or malformed stored data |
| `503` | Temporary provider or persistence failure |

Missing listing reads and edits return `{ kind: "missing" }`. Other errors return `{ kind: "error", message }` with a public message. Effect-based listing reads preserve the existing 503 messages for returned query errors and the generic 500 response for malformed stored data or thrown query exceptions. A temporary provider failure during user lookup or token refresh does not become a 401 or delete the session. Provider failures cannot reach SDK diagnostic messages unchanged; the fetch boundary retains machine error codes but removes raw provider error bodies. It maps rate limits and all upstream 5xx statuses to 503 so SDK refresh recovery treats them as retryable. Logout calls `auth.signOut({ scope: "local" })` and returns 503 on provider errors. The SDK may already clear the local session and cookies for a logout error, so the UI stays in place and offers a retry. A later logout with no session succeeds. A transient refresh failure before logout reaches the provider returns 503 without clearing the session. Local logout revokes the current refresh token, but an access-token JWT remains valid until expiry.

The frontend now loads private data over HTTP. Its neutral HTML shell may return 200 before the API returns 401, 404, or 503. The HTML document is not a resource-authorization response. The API owns those statuses. The UI still redirects signed-out visitors, shows not-found for inaccessible drafts, and distinguishes infrastructure errors. Acceptance tests assert API statuses and visible UI outcomes separately.

Password login accepts an email of at most 254 characters and a nonempty password of at most 1024 characters. It preserves password whitespace and does not apply password-creation rules. Invalid credentials and unconfirmed accounts return the same generic 401 response. The response contains only `{ kind: "signed-in" }`; the cookie adapter stores the session in HttpOnly cookies.

Password setup and changes require an authenticated session. Both submitted values must match and contain 12 to 1024 characters. The API calls Supabase Auth with the caller's session and returns only `{ kind: "password-updated" }`. Provider reauthentication and MFA policy remain enabled. A 403 asks the user to sign out and authenticate again with a fresh magic link. This endpoint is not a forgotten-password email flow.

A 401 during save does not navigate away or discard input. Native editor entry and exit preserve browser Back and beforeunload warnings. Acknowledged creation replaces the spent editor in browser history.

## Cookie and request security

Express uses the SDK's cookie adapter and standard `cookie` parsing and serialization. Supabase cookie Max-Age values are seconds. The adapter does not pass them to Express's millisecond-based `res.cookie` API.

All new and refreshed auth cookies are HttpOnly, host-only, Path=/, and SameSite=Lax. They are Secure when the configured public origin uses HTTPS. Chunk writes and deletions remain separate Set-Cookie headers through Next's development and production rewrites. Session values never appear in application JSON.

Unsafe JSON requests, including magic-link, password-login, password-change, and logout requests, require an Origin that exactly matches the configured public web origin. No wildcard credentialed CORS or second CSRF-token mechanism exists. Browser callers use same-origin fetch.

The callback accepts either a nonempty PKCE `code` of at most 2048 characters with an optional `sb_flow_id` of at most 128 characters, or `type=email` and a nonempty token hash of at most 2048 characters. Mixed proof types and repeated proof parameters are rejected. PKCE exchanges require the verifier cookie from the browser profile that requested the email. Default Supabase email templates use this flow; custom token-hash templates remain supported. The callback ignores request Host and any `next` destination. Invalid proof redirects to a fixed sign-in error at the configured origin. Temporary verification failures return 503 rather than falsely reporting an expired link. Callback responses also use `Referrer-Policy: no-referrer`. Next development access logs omit this callback URL. Configure external ingress and access logs to redact callback query strings, cookies, and authorization headers.

The listings page provides a logout button beside the Seller email. A successful logout clears the current session and performs a full document navigation to `/`. It does not revoke other Seller sessions. No extension authentication, delete, publish, or pairing endpoints are part of this migration.
