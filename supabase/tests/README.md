# Check draft editing locally

Use a disposable local PostgreSQL database with both migrations applied. Seed `auth.users` with these Seller IDs before running the test:

- `11111111-1111-4111-8111-111111111111`.
- `22222222-2222-4222-8222-222222222222`.

Connect as a local administrator who can `SET ROLE authenticated` and `SET ROLE anon`. Run `psql -X -v ON_ERROR_STOP=1` with your explicit local connection arguments and `-f supabase/tests/draft-editing.sql`. Do not run this against hosted data.

The script checks field grants, ownership, anonymous denial, database metadata, nullable partial saves, vocabulary, codepoint lengths, and stale revision rejection. It rolls back every write and can run again against the same database.

The stale-save assertion runs sequentially. A separate two-session check must verify simultaneous revision-filtered updates. Browser fixture tests do not prove SQL authorization or concurrency.

The app enforces compare-and-save through its revision-filtered UPDATE. Column grants do not force arbitrary same-owner PostgREST clients to include that predicate.
