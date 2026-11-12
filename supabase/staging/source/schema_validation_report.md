# Schema export validation report (generated)

File: `production_public_schema.sql` | 52351 bytes | SHA-256 `f41bf2fee49c315b0b6806552f512960381c635907cc88a73004b1f708f2ad50`
Overall: **no FAIL findings** (REVIEW items need a human decision).
Method: static text analysis by `scripts/schema-export.mjs`. The SQL was not executed anywhere. Matched secret text is never printed; only the pattern name and line number.

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | No INSERT, COPY or sequence-value (data) statements at top level | **PASS** |  |
| 2 | No credentials, connection strings, passwords or API keys | **PASS** |  |
| 3 | No custom role definitions or role passwords | **PASS** |  |
| 4 | No email addresses (customer or owner identifiers) embedded in definitions | **PASS** |  |
| 5 | No object definitions outside the public schema (no managed auth/storage/realtime/cron definitions) | **PASS** |  |
| 6 | No managed Auth or Storage table definitions | **PASS** |  |
| 7 | Extension dependencies identified | **INFO** | none created by the dump; extensions installed in other schemas are not part of a public-only dump and must be listed from the project dashboard |
| 8 | pg_cron is not part of the initial staging installation | **PASS** |  |
| 9 | Dump header records the source PostgreSQL version (expected major 17) | **PASS** | dumped from 17.6 |
| 10 | No PostgreSQL 18-only syntax (staging is PostgreSQL 17) | **PASS** | SET transaction_timeout (PostgreSQL 17+, accepted on 17) |
| 11 | psql meta-commands (\restrict / \unrestrict) absent or ignorable | **PASS** |  |
| 12 | Every top-level statement was classified | **PASS** |  |
| 13 | Row level security enabled on every table | **PASS** |  |
