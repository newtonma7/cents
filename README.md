# Cents

Cents helps clothing resellers prepare one Canonical Listing and publish it across marketplaces they control.

## Development

Requires Node.js 20.9 or newer.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Set the public Supabase project URL and publishable/anonymous key in `.env.local`. Keep service-role and database credentials server-only; this application does not need them for authentication.

Apply `supabase/migrations/20261022000000_create_canonical_listings.sql` to the Supabase project before using the listing pages. The migration creates the owner-scoped `canonical_listings` table and grants authenticated sellers read and insert access only. Titles are limited to 160 Unicode code points and descriptions to 5,000 Unicode code points. The form trims surrounding whitespace, and the server and database enforce these limits using the same character-counting rules.

In Supabase Auth:

1. Enable email signup.
2. Set the Site URL and allowed redirect URL to the deployed Cents origin.
3. Configure the confirmation and magic-link email templates to link to:

   ```text
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs browser-level Seller signup and listing flows against a deterministic local Supabase fixture. It checks draft creation, owner-filtered dashboard reads, and persistence across reloads. The fixture does not run PostgreSQL or prove the hosted migration and row-level security policies. Verify those against the Supabase project before enabling listing creation for sellers.
