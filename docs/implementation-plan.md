# Cross-Platform Clothing Listing Automation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a centralized listing system where one normalized clothing listing can be drafted once, then published and synchronized across supported marketplaces.

**Architecture:** Build a multi-tenant-ready standalone web app around a canonical listing model and a marketplace-adapter interface. The web app owns drafts, photos, inventory, platform connections, publication jobs, and status synchronization. Each adapter converts the canonical model into a platform-specific payload, publishes through an approved API where available, and reports a normalized result. Platforms without accessible approved publishing APIs begin as export/manual-assist workflows rather than brittle scraping or browser automation.

**Recommended Tech Stack:** Next.js with TypeScript for the web app and API routes, PostgreSQL with Prisma, S3-compatible object storage for photos, and Docker Compose for local development. Start with a PostgreSQL-backed `publish_jobs` table and a dedicated worker; add Redis with BullMQ later if volume, delayed jobs, or rate-limiting complexity justifies it. Deploy the web app, worker, database, and object storage separately so workers can be scaled and paused independently. Use a provider-neutral email/auth abstraction, with single-user mode first and multi-user boundaries designed into the schema.

---

## Product boundaries and platform reality

- **eBay:** Good first full integration target because eBay provides seller APIs and OAuth flows. Confirm category, inventory, offer, fulfillment, and image requirements before implementation.
- **Facebook Marketplace:** Treat as manual-assist/export initially unless Meta grants an approved commerce integration for the intended account/use case. Avoid automating consumer UI actions with stored credentials; it is fragile and may violate platform rules.
- **Depop:** Verify current partner/API access and permitted publishing workflow before committing to direct posting. Otherwise generate a platform-ready draft/export and keep the final publish action manual.
- Do not store marketplace passwords. Use OAuth tokens where supported, encrypt tokens at rest, and include per-platform kill switches and rate limits.

## Proposed canonical listing fields

- Identity: `id`, `owner_id`, `status`, timestamps
- Product: title, description, brand, category, subcategory, size, gender/style, color, material
- Condition: condition grade, flaws, measurements, care notes
- Commercial: price, currency, quantity, shipping policy, return policy
- Media: ordered photo records with object-storage keys and processing status
- Platform state: one record per marketplace containing external ID, publish status, last error, and last synchronization time

## Step-by-step plan

### Task 1: Initialize the standalone application and lock the MVP

**Objective:** Create the standalone app foundation and make the first release small enough to ship.

**Files:**
- Create: `apps/web/` or repository root Next.js application
- Create: `apps/worker/` or worker entrypoint
- Create: `docker-compose.yml`
- Create: `docs/marketplace-capability-matrix.md`
- Create: `.env.example`

**Steps:**
1. Initialize the Next.js/TypeScript project with linting, formatting, testing, and strict environment-variable validation.
2. Add PostgreSQL, Redis, and S3-compatible storage services for local development.
3. Record API availability, OAuth requirements, listing fields, image limits, fees, and ToS constraints for eBay, Depop, and Facebook Marketplace using current official documentation.
4. Lock MVP scope: one seller account, clothing listings only, draft creation, photo management, eBay Sandbox publishing, and Depop/Facebook manual-assist exports.
5. Explicitly defer payments, shipping-label generation, AI-generated descriptions, order synchronization, analytics, mobile apps, and direct consumer-account browser automation.
6. Add a health endpoint and a worker startup check for database, Redis, and object storage connectivity.

### Product workflow

```text
New listing → Upload/order photos → Enter details → Platform validation
    → Preview each platform → Select publish targets
    → Queue one job per target → Review live/error/manual status
    → Update or mark sold → End active listings where supported
```

### Core entities

- `User`: seller identity and account boundary
- `Listing`: canonical product details and lifecycle status
- `ListingPhoto`: ordered object-storage media and processing metadata
- `InventoryItem`: SKU, quantity, and sold/reserved state
- `MarketplaceConnection`: provider, account identity, encrypted OAuth credentials, status
- `MarketplaceListing`: listing-to-provider mapping, external ID/URL, publication state
- `PublishJob`: one idempotent attempt for one listing/provider operation
- `AuditEvent`: actor, action, result, and safe metadata

### Task 2: Define the canonical listing schema

**Objective:** Create one platform-neutral representation of a clothing listing.

**Files:**
- Create or modify: `src/domain/listings/*` or the repository's equivalent
- Test: `tests/domain/listings/*`

**Steps:**
1. Write validation tests for required fields, money precision, photo ordering, condition, and measurements.
2. Implement the model and validation.
3. Add explicit support for platform overrides without polluting the canonical fields.
4. Run the domain test suite.

### Task 3: Persist listings, photos, and platform publication state

**Objective:** Store drafts and independent per-platform results safely.

**Files:**
- Create: database migration for listings, photos, platform listings, and publish attempts
- Create or modify: repository/data-access modules
- Test: persistence integration tests

**Steps:**
1. Write tests for draft creation, idempotent updates, and independent platform statuses.
2. Add migrations and indexes for owner/status and external platform IDs.
3. Implement transactional writes and encrypted secret/token storage using the existing secret-management convention.
4. Run migrations against a disposable local database and execute integration tests.

### Task 4: Implement the marketplace adapter contract

**Objective:** Make every marketplace integration replaceable and observable.

**Files:**
- Create: `src/integrations/marketplaces/MarketplaceAdapter.*`
- Create: normalized result/error types
- Test: adapter contract tests

**Steps:**
1. Define `connect`, `validate`, `publish`, `update`, `end`, and `getStatus` operations.
2. Define idempotency keys and error categories: auth, validation, rate-limit, transient, and platform rejection.
3. Write contract tests using a fake adapter.
4. Ensure one platform failure does not roll back successful publications to other platforms.

### Task 5: Add eBay OAuth and publishing

**Objective:** Support a real end-to-end publication path through eBay's approved seller APIs.

**Files:**
- Create: `src/integrations/marketplaces/ebay/*`
- Create: OAuth callback/UI route
- Test: mocked API contract tests and sandbox integration tests

**Steps:**
1. Implement OAuth authorization, callback, refresh, revocation, and encrypted token storage.
2. Map canonical listings to eBay inventory, offer, category, image, and fulfillment structures.
3. Add preflight validation that reports missing category-specific fields before a publish attempt.
4. Implement idempotent publish/update/end operations with retry and rate-limit handling.
5. Run mocked tests, then publish a disposable test listing in eBay Sandbox if credentials are available.

### Task 6: Build manual-assist exports for Depop and Facebook Marketplace

**Objective:** Make unsupported or unapproved direct integrations useful without violating platform rules.

**Files:**
- Create: `src/integrations/marketplaces/export/*`
- Create: export templates and UI download route
- Test: snapshot tests for generated payloads

**Steps:**
1. Generate a copy-ready title, description, price, measurements, hashtags, and ordered photo bundle per platform.
2. Produce CSV/JSON/ZIP exports only where the platform's current rules support that workflow.
3. Add a checklist UI showing fields to paste and a link/open action that does not submit credentials or simulate clicks.
4. Add import/manual status controls so the user can mark a listing live and record its external URL.
5. Verify exports with fixtures and test data containing special characters and missing optional fields.

### Task 7: Add orchestration, queueing, and observability

**Objective:** Publish to multiple platforms reliably and make failures recoverable.

**Files:**
- Create: publish job/worker modules
- Create: retry policy and structured event logging
- Test: worker tests for partial success, retry, cancellation, and idempotency

**Steps:**
1. Queue one child job per platform rather than one all-or-nothing job.
2. Add bounded retries with exponential backoff for transient errors only.
3. Record every attempt without logging access tokens or sensitive listing data.
4. Add cancellation, retry-failed, and per-platform enable/disable controls.
5. Verify that repeated publish requests do not create duplicate listings.

### Task 8: Build the listing workflow UI

**Objective:** Let a seller create once, review platform-specific previews, and publish selectively.

**Files:**
- Create or modify: listing editor, photo uploader, preview, publish-status components
- Test: component and end-to-end tests

**Steps:**
1. Add draft editor with autosave and photo ordering.
2. Add platform-specific validation and preview panels.
3. Add explicit publish confirmation per platform and visible warnings for manual-assist platforms.
4. Show live/error/pending statuses and actionable error messages.
5. Run end-to-end tests covering create → preview → eBay publish → export Depop/Facebook → status update.

### Task 9: Security, compliance, and launch verification

**Objective:** Prevent account compromise and unsafe bulk publishing.

**Files:**
- Modify: security/config/deployment files
- Create: `docs/security-and-operations.md`

**Steps:**
1. Verify OAuth state/PKCE, webhook signature checks if applicable, CSRF protection, authorization boundaries, and token encryption.
2. Add audit logs, dry-run mode, rate limits, and a global pause switch.
3. Confirm no secrets appear in logs, exports, tests, commits, or error responses.
4. Run unit, integration, end-to-end, dependency, and migration checks.
5. Launch with a small set of disposable listings and monitor failed jobs before enabling bulk workflows.

## Acceptance criteria

- A seller can create one canonical listing with photos and save it as a draft.
- The system validates platform-specific missing fields before attempting publication.
- eBay can be connected through OAuth and a listing can be published, updated, and ended idempotently in Sandbox.
- Depop and Facebook Marketplace produce useful manual-assist outputs without password storage or prohibited UI automation.
- Partial platform failures are visible and retryable; successful platforms remain successful.
- Tokens and personal data are protected, and logs contain no secrets.

## Open questions

- Which existing repository and stack should this be added to, or is this a new project?
- Is this for one seller or multiple users/accounts?
- Do you need inventory quantity, shipping-label generation, sales/order synchronization, or only listing creation?
- Which region/currency and shipping policies should the MVP support?
- Do you already have approved API/partner access for Depop or Meta?
