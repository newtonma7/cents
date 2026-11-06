# Check draft editing locally

Use a disposable local PostgreSQL database with both migrations applied. Seed `auth.users` with these Seller IDs before running the test:

- `11111111-1111-4111-8111-111111111111`.
- `22222222-2222-4222-8222-222222222222`.

Connect as a local administrator who can `SET ROLE authenticated` and `SET ROLE anon`. Run `psql -X -v ON_ERROR_STOP=1` with your explicit local connection arguments and `-f supabase/tests/draft-editing.sql`. Do not run this against hosted data.

The script checks field grants, ownership, anonymous denial, database metadata, nullable partial saves, vocabulary, codepoint lengths, and that an explicitly revision-filtered SQL update affects no stale row. It rolls back every write and can run again against the same database.

The stale-row assertion tests the database predicate only. The application does not send a revision predicate. It sends unconditional owner-scoped updates, and the database increments the revision for each successful write. A coordinator-run local PostgreSQL check verified that two concurrent authenticated updates both succeeded in lock order, the final row had revision 3 and the last writer's fields, and a foreign Seller updated no rows. Browser fixture tests do not prove SQL authorization or concurrency.
