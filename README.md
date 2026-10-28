# Cents

Cents helps clothing resellers prepare one Canonical Listing and publish it across marketplaces they control.

## Run locally

Requires Node.js 24 LTS or newer and npm workspaces.

```sh
npm ci
npm run dev
```

Keep the existing ignored root `.env`. Only the API loads that file. Configure these API variables:

- `NEXT_PUBLIC_SUPABASE_URL` is the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the public anonymous or publishable key.
- `NEXT_PUBLIC_SITE_URL` is the exact public web origin, such as `http://127.0.0.1:3000`.
- `PORT` is optional and defaults to `3001` for the API.

The historical `NEXT_PUBLIC_` names remain unchanged. They are API-only configuration now. Do not put Supabase settings in the frontend. Service-role and database credentials are not needed.

Open the configured public web origin. Next runs on port 3000 and forwards `/api/*` and `/auth/confirm` to Express. Set `API_ORIGIN` for the web process if Express is not at `http://127.0.0.1:3001`. It must be an HTTP origin without a path. Next fixes rewrite destinations during the web build, so rebuild the web when changing that destination.

The API validates its configuration before listening. The web does not load the root `.env` or `.env.local`. Node's API env-file loading does not perform Next-style variable expansion. Use literal values.

## Build and start independently

```sh
npm run build
npm start
```

These commands are also available separately:

```sh
npm run dev:api
npm run dev:web
npm run build:api
npm run build:web
npm run start:api
npm run start:web
```

Build contracts before either independent development command with `npm run build -w @cents/contracts`. Root `npm run dev` builds and watches contracts automatically. Each independent build command also builds contracts.

Express emits Node ESM into `apps/api/dist` and runs without Next. The root start command runs both built applications. Keep the API's listening port private behind your ingress in production. Route the two public paths to Express through the web rewrites or directly through ingress.

## Prepare Supabase separately

The schema prerequisites are both files under `supabase/migrations/`. The edit migration `20261023000000_edit_canonical_listing_drafts.sql` adds the edit grants and revision checks. This migration has not been applied to the hosted project as part of this work. Review it before a later hosted rollout.

Keep Supabase Auth's Site URL and allowed redirect URL aligned with `NEXT_PUBLIC_SITE_URL`. Email signup must be enabled. The existing confirmation and magic-link template remains:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

After switching from the old local Next backend, clear prior local auth cookies and sign in again. Express sets all new and refreshed session cookies to HttpOnly. The application does not attempt to infer or adopt previous cookie attributes.

## Check the migration

```sh
npm run typecheck
npm run lint
npm test
npm run test:api
npm run test:production
```

`npm test` starts a local Supabase fixture, real Express processes, and real Next development server. `test:api` builds and starts Express without Next. `test:production` builds and starts both production applications and runs the same checks, including cookie forwarding through the built rewrites.

The 31 original behavioral checks remain. Added checks exercise real HTTP authentication, strict DTOs, exact-Origin CSRF rejection, status codes, caller isolation, concurrent refresh and edits, and import boundaries. The fixture models Supabase refresh-token reuse for parallel requests. It does not prove hosted provider rotation behavior or PostgreSQL RLS. See [local SQL verification](supabase/tests/README.md).

See [the API reference](docs/api.md) for contracts and intentional HTML status changes. Issue [#25](https://github.com/newtonma7/cents/issues/25) tracks this separation. Dependency advisory work remains separate in [#24](https://github.com/newtonma7/cents/issues/24).
