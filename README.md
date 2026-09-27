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

`npm test` runs the browser-level Seller signup flow against a deterministic local Supabase Auth fixture. It needs no Docker instance or hosted Supabase credentials.
