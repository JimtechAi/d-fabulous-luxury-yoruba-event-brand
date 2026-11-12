# Stage 3: Express versus Edge Function parity report

Branch `staging/stage4-preview`. Scope: the 24 functional API routes of the Express backend (`server.ts`) compared with the Supabase Edge Function `dfabulous-api`. The two other Express handlers, `ALL /api/settings` (always 404) and the `GET *` SPA fallback, are not functional API routes and are covered only as cross-cutting cases.

**Nothing was deployed, no Supabase, Vercel or Render setting was touched, and no remote service was contacted.** The repository's real `.env` files were never read by the harness (reads of them are stubbed), and every key in the run is a dummy value.

## Verdict

**No behavioural regression was found, and the five defects found in both backends (D1 to D5) are now corrected in both and regression-tested.** Across 186 scenarios, the two backends gave identical status codes, response bodies, database operations, credential classes, e-mails and resulting data in every case. The only differences are the six listed under "Accepted differences". No scenario now ends in a 5xx on either backend.

This is a **local, simulated** result. It is not a test of a deployed function. See "Not covered".

## Corrections made after the first run (D1 to D5)

Both backends were changed the same way and share one helper, `supabase/functions/dfabulous-api/lib/conflicts.ts` (imported by `server.ts` and by the Edge routes), so the conditions and the wording cannot drift apart.

| # | Route | Before | After |
|---|---|---|---|
| D1 | `GET /api/admin/data/settings` | 500: the code queried a table called `settings`; the schema has `site_settings` | 200 with the stored keys; the `settings` resource now reads `site_settings` |
| D2 | `PATCH /api/bookings/:id` to a blocked or taken date | 500 | **409** `Date Unavailable`: "This date is no longer available. Please select another date." (same wording the public booking route already uses) |
| D3 | `POST /api/admin/blocked-dates` for an already blocked date | 500 | **409** `Date Already Blocked`: "This date is already blocked." |
| D4 | `POST /api/bookings/:id/payments` with a duplicate `gateway_reference` | 500 | **409** `Duplicate Payment Reference`: "A payment with this gateway reference already exists." Only the `gateway_reference` constraint is mapped; a duplicate on any other column stays a 500. |
| D5 | `POST /api/admin/users` for an e-mail already registered | 500 | **409** `User Already Exists`: "A user with this email address already exists." |

All four 409 bodies have the shape `{ "success": false, "error": "<title>", "details": "<sentence>." }`, like every other error response. Invalid input stays 400, missing rows stay 404, authentication and authorisation stay 401 and 403. The public `POST /api/bookings` conflict is unchanged (it keeps its existing status and body).

Regression tests:
- `tests/conflicts.test.mjs` (Node, 5 tests) and `supabase/functions/dfabulous-api/tests/conflicts.test.ts` (Deno, 5 tests): the helpers against realistic PostgreSQL, PostgREST and Supabase Auth errors, including the cases that must **not** become 409.
- `scripts/parity/parity.test.mjs`: `[REGRESSION D1]` and `[REGRESSION D2 to D5]`, which assert the exact status and body on **both** backends, identical database state, the duplicate-payment sequence `[200, 409]`, and that no scenario returns a 5xx.
- `tests/db-staging-baseline.test.mjs`: the test that documented D1 now asserts the fix in both backends.
- The parity fake now reports unique violations the way PostgreSQL does (constraint name and `Key (...) already exists.` detail), so the classification is exercised on realistic errors.
- While rerunning the suite I also fixed a flaky assertion in `tests/stage4-review.test.mjs` (two audit rows written in one transaction share a timestamp; the test now identifies them by content). It was unrelated to D1 to D5.

## Method

| Part | What it is |
|---|---|
| Backends | Express (`server.ts`, unmodified, `NODE_ENV=production`) in Node; the Edge app (`app.ts`, unmodified) in Deno. Separate processes, real HTTP on 127.0.0.1. |
| Fake Supabase | `scripts/parity/fake-supabase.mjs`, one implementation shared by both. Auth (`getUser`, `admin.createUser`), PostgREST (select, filters, order, insert, upsert, update, delete, single object), the rate-limit RPC and Resend. Tables and columns come from the **approved schema** (`01_production_schema.sql`), so a query for a nonexistent column or table fails as PostgREST would. Models the unique, not-null and foreign-key rules the routes touch and the two booking triggers (reference generation, blocked-date refusal). Does **not** model RLS. |
| Scenarios | `scripts/parity/scenarios.mjs`: 186 requests, each replayed against freshly reset, identical data. |
| Compared | HTTP status; selected headers (CORS, security, `Retry-After`, `Content-Type`); response body; every database call (credential class `service-role` / `user-jwt` / `anon`, method, table, filters, order, select, upsert, payload); auth calls; every e-mail request (sender, recipients, subject, HTML, text, authorisation); the full database state afterwards. |
| Rate limiting | The Express limiter cannot be reset, so Express is restarted every 10 scenarios and the Edge limiter state is cleared at the same moment; both always see the same bucket history. |
| Mutation check | Changing one error message in the Edge function made the parity run fail on the affected scenarios; the change was reverted. |

Run it with `npm run test:parity` (about 2 minutes; needs Deno on `PATH`). Raw results: `supabase/staging/reports/parity/parity-results.json`.

## Results

### Test results (all executed on the final tree)

| Check | Kind | Result |
|---|---|---|
| `npm run test:parity` | local, simulated, two real servers | 13 of 13 pass |
| Route tables (24 methods and paths identical; catalogue covers exactly these) | static | pass |
| Harness soundness (fake served every request, nothing left the machine) | simulated | pass |
| Every route has success, 401 and 403 cases where authentication applies, plus validation or not-found cases | simulated | pass |
| No unexplained difference of any kind | simulated | pass |
| Identical status and body on every request except the documented 404 cases | simulated | pass |
| Identical database operations and credential class; identical resulting state | simulated | pass |
| Identical e-mails under 4 configurations and 2 provider failures | simulated | pass |
| Rate limiting: 6th submission refused identically; Edge limiter parameters equal Express (5 per 900 s submissions; 30 and 90 for administrators) | simulated | pass |
| Service-role key refused as a user token; non-Bearer credentials refused | simulated | pass |
| Every operation the app performs is inside the Stage 4 privilege matrix (no exceptions since D1 was fixed) | simulated, cross-check | pass |
| D1 to D5 regression tests (both backends, in the parity run) | simulated | pass |
| `tests/conflicts.test.mjs` (Node) and `conflicts.test.ts` (Deno) | static unit tests | 5 + 5 pass |
| **`npm run test:parity` (final)** | local, simulated, two real servers | **15 of 15 pass** |
| **`npm run test:node` (final, run twice)** | static and simulated | **383 of 383 pass** |
| **`npm run test:edge` (final)** | simulated (Deno, in-memory fake) | **70 passed, 0 failed** |
| `npm run lint`, `lint:edge`, `scan:secrets`, `stage4:check`, `staging:check` | static | pass |
| `node scripts/build-server.mjs` (Express bundle with the shared helper) | static build check | pass |

### Coverage by route (scenarios executed; outcomes on Express, identical on Edge)

| Route | Scenarios | Success | 401 | 403 | Other 4xx | 5xx |
|---|---|---|---|---|---|---|
| GET /api/health | 1 | 1 | | | | |
| GET /api/diagnostics | 1 | 1 | | | | |
| GET /api/availability | 3 | 3 | | | | |
| POST /api/bookings | 18 | 9 | | | 9 | |
| GET /api/services, /gallery, /videos, /testimonials | 1 each | 4 | | | | |
| POST /api/messages | 11 | 6 | | | 5 | |
| GET /api/admin/session | 8 | 4 | 2 | 2 | | |
| GET /api/admin/data/:resource | 12 | 8 | 1 | 2 | 1 | |
| PATCH /api/bookings/:id/status | 12 | 4 | 1 | 3 | 4 | |
| POST /api/bookings/:id/archive | 7 | 2 | 1 | 1 | 3 | |
| PATCH /api/bookings/:id | 10 | 3 | 1 | 1 | 5 (incl. D2 409) | |
| DELETE /api/bookings/:id | 6 | 3 | 1 | 1 | 1 | |
| POST /api/bookings/:id/payments | 16 | 4 | 1 | 3 | 8 (incl. D4 409) | |
| PATCH /api/admin/messages/:id | 6 | 3 | 1 | 1 | 1 | |
| POST /api/admin/blocked-dates | 7 | 3 | 1 | 1 | 2 (incl. D3 409) | |
| DELETE /api/admin/blocked-dates/:eventDate | 5 | 2 | 1 | 1 | 1 | |
| PUT /api/admin/settings | 7 | 3 | 1 | 2 | 1 | |
| GET /api/admin/users | 5 | 2 | 1 | 2 | | |
| POST /api/admin/users | 13 | 4 | 1 | 3 | 5 (incl. D5 409) | |
| PATCH /api/admin/users/:id | 14 | 5 | 1 | 5 | 3 | |
| DELETE /api/admin/users/:id | 9 | 2 | 1 | 5 | 1 | |
| Cross-cutting (CORS, 404s, odd credentials) | 11 | | | | | |

What the scenarios exercise: personas (anonymous, invalid token, viewer, inactive admin, staff view-only, admin, owner, user manager); validation (bad e-mail, phone, dates, amounts, enums, honeypot, oversize and malformed bodies); the role and permission hierarchy for user create, edit and delete; payments (balance check, defaults, duplicate gateway reference, provider and type validation); blocked dates and the database's own refusal to book a blocked date; archive rules; CORS preflight and origin echo; rate limits; e-mail on, off, redirected to a sandbox address, and rejected by the provider.

## Accepted differences (all documented in `scripts/parity/accepted.mjs`)

| # | Difference | Status | Assessment |
|---|---|---|---|
| A1 | Express adds `Content-Security-Policy` to every response; Edge does not | unverified | A CSP does nothing for JSON read by `fetch`. The website HTML comes from Vercel, and `vercel.json` sets no CSP, so no browser behaviour depends on it. |
| A2 | Express adds `Strict-Transport-Security`; Edge does not | unverified | Supabase serves functions over HTTPS only and is expected to add HSTS at its gateway. Cannot be confirmed until a function is deployed. |
| A3 | Malformed-JSON and oversize (413) responses: Express omits the hardening headers, Edge sets them | intentional | Express rejects these in its body parser before its header middleware runs. Edge is stricter. |
| A4 | Unknown `/api/*` path: Express returns the SPA page with HTTP 200; Edge returns 404 JSON | intentional | Edge is correct for an API. The website only calls known routes. |
| A5 | Wrong method on a known path: Express returns an HTML "Cannot PUT" page; Edge returns 404 JSON | intentional | Same reason. |
| A6 | Rate limiting architecture: Express in-memory per process; Edge uses the durable `consume_rate_limit` RPC, so Edge makes about one extra database call per limited request (542 versus 379 database requests across the whole run) | intentional | Same limits and identical decisions. The durable limiter is the safer design on a stateless platform. |

## Not covered (remaining risk)

1. **Row-level security.** The fake does not enforce RLS or grants. Whether a `user-jwt` request is allowed depends on the Stage 4 policies. The parity run proves the application only performs operations the privilege matrix allows, and the Stage 4 simulated tests cover the policies, but **no run combines the real policies with the real API**.
2. **Real Supabase Auth and PostgREST.** JWT validation, token expiry, real `createUser` behaviour, PostgREST error shapes and the `on_auth_user_created` trigger.
3. **A deployed function.** Gateway behaviour with `verify_jwt = false`, CORS preflight at the gateway, request-size and timeout limits, cold start, secrets injection, and A1/A2.
4. **Real Resend delivery.** Only request content and failure handling are compared.
5. **Concurrency** (two administrators editing the same booking, simultaneous submissions) and **performance**.
6. **Frontend integration** (Vercel build with the new API base URL, cookies and CORS in a real browser). That is Stage 4 of your plan.
7. **Videos.** `GET /api/videos` matched for the files in the repository today. Express reads `public/videos`; the Edge function reads `lib/media-manifest.ts`, which must be regenerated when videos change.

## Files

Added (Stage 3): `scripts/parity/` (`fake-supabase.mjs`, `scenarios.mjs`, `run.mjs`, `accepted.mjs`, `express-host.mjs`, `edge-host.ts`, `parity.test.mjs`, `report-stats.mjs`), `supabase/staging/reports/parity/parity-results.json`, this report.
Added (corrections): `supabase/functions/dfabulous-api/lib/conflicts.ts`, `tests/conflicts.test.mjs`, `supabase/functions/dfabulous-api/tests/conflicts.test.ts`.
Changed (corrections): `server.ts`, `supabase/functions/dfabulous-api/routes/admin-data.ts`, `admin-bookings.ts`, `admin-settings.ts`, `admin-users.ts`, `scripts/parity/fake-supabase.mjs`, `scripts/parity/parity.test.mjs`, `tests/db-staging-baseline.test.mjs`, `tests/stage4-review.test.mjs`.
Changed (Stage 3): `package.json` (script `test:parity`), `tsconfig.json` (excludes `scripts/parity`).
Not touched: `master`, both Supabase projects, Vercel, Render. Nothing was deployed. (The git-ignored `dist/server.cjs` build output was regenerated by the build check.)

## Recommendation

D1 to D5 are closed. Proceed to Stage 2 (install the approved schema on `dfabulous-staging`), then Stage 4 (frontend wiring).
