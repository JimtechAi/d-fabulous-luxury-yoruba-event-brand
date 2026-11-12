# Stage 3: Express versus Edge Function parity report

Branch `staging/stage4-preview`. Scope: the 24 functional API routes of the Express backend (`server.ts`) compared with the Supabase Edge Function `dfabulous-api`. The two other Express handlers, `ALL /api/settings` (always 404) and the `GET *` SPA fallback, are not functional API routes and are covered only as cross-cutting cases.

**Nothing was deployed, no Supabase, Vercel or Render setting was touched, and no remote service was contacted.** The repository's real `.env` files were never read by the harness (reads of them are stubbed), and every key in the run is a dummy value.

## Verdict

**No behavioural regression was found.** Across 186 scenarios, the two backends gave identical status codes, response bodies, database operations, credential classes, e-mails and resulting data in every case. The only differences are the six listed under "Accepted differences". Five defects exist identically in **both** backends and are listed separately, because migrating faithfully reproduces them.

This is a **local, simulated** result. It is not a test of a deployed function. See "Not covered".

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
| Every operation the app performs is inside the Stage 4 privilege matrix (except defect D1) | simulated, cross-check | pass |
| `npm run test:node` | static and simulated | 378 of 378 pass |
| `npm run test:edge` | simulated (Deno, in-memory fake) | 65 pass |
| `npm run lint`, `lint:edge`, `scan:secrets`, `stage4:check`, `staging:check` | static | pass |

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
| GET /api/admin/data/:resource | 12 | 7 | 1 | 2 | 1 | 1 (D1) |
| PATCH /api/bookings/:id/status | 12 | 4 | 1 | 3 | 4 | |
| POST /api/bookings/:id/archive | 7 | 2 | 1 | 1 | 3 | |
| PATCH /api/bookings/:id | 10 | 3 | 1 | 1 | 4 | 1 (D2) |
| DELETE /api/bookings/:id | 6 | 3 | 1 | 1 | 1 | |
| POST /api/bookings/:id/payments | 16 | 4 | 1 | 3 | 7 | 1 (D4) |
| PATCH /api/admin/messages/:id | 6 | 3 | 1 | 1 | 1 | |
| POST /api/admin/blocked-dates | 7 | 3 | 1 | 1 | 1 | 1 (D3) |
| DELETE /api/admin/blocked-dates/:eventDate | 5 | 2 | 1 | 1 | 1 | |
| PUT /api/admin/settings | 7 | 3 | 1 | 2 | 1 | |
| GET /api/admin/users | 5 | 2 | 1 | 2 | | |
| POST /api/admin/users | 13 | 4 | 1 | 3 | 4 | 1 (D5) |
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

## Defects present identically in BOTH backends (migration reproduces them)

| # | Where | What happens | Impact | Suggested fix |
|---|---|---|---|---|
| D1 | `GET /api/admin/data/settings` | The code queries a table named `settings`; the approved schema only has `site_settings`. The route returns 500. The admin UI calls it (`src/lib/admin.ts` line 381). | Admin settings screen cannot load its data on the current production schema either. Also the only operation outside the Stage 4 privilege matrix. | Map resource `settings` to table `site_settings` (one line; `service_role` already has SELECT on it in the Stage 4 matrix). |
| D2 | `PATCH /api/bookings/:id` to a blocked date | The database refuses with its own message and the API answers 500. | Admin sees "server error" instead of "date unavailable". | Map the trigger error to 409 with the existing message. |
| D3 | `POST /api/admin/blocked-dates` on an already blocked date | Duplicate key surfaces as 500. | Same. | Map 23505 to 409. |
| D4 | `POST /api/bookings/:id/payments` with a duplicate `gateway_reference` | Surfaces as 500. | Same. | Map 23505 to 409. |
| D5 | `POST /api/admin/users` with an e-mail that already exists | Surfaces as 500. | Same. | Map "already registered" to 409. |

These are not parity failures. Fixing them is a behaviour change and is left for your decision.

## Not covered (remaining risk)

1. **Row-level security.** The fake does not enforce RLS or grants. Whether a `user-jwt` request is allowed depends on the Stage 4 policies. The parity run proves the application only performs operations the privilege matrix allows, and the Stage 4 simulated tests cover the policies, but **no run combines the real policies with the real API**.
2. **Real Supabase Auth and PostgREST.** JWT validation, token expiry, real `createUser` behaviour, PostgREST error shapes and the `on_auth_user_created` trigger.
3. **A deployed function.** Gateway behaviour with `verify_jwt = false`, CORS preflight at the gateway, request-size and timeout limits, cold start, secrets injection, and A1/A2.
4. **Real Resend delivery.** Only request content and failure handling are compared.
5. **Concurrency** (two administrators editing the same booking, simultaneous submissions) and **performance**.
6. **Frontend integration** (Vercel build with the new API base URL, cookies and CORS in a real browser). That is Stage 4 of your plan.
7. **Videos.** `GET /api/videos` matched for the files in the repository today. Express reads `public/videos`; the Edge function reads `lib/media-manifest.ts`, which must be regenerated when videos change.

## Files

Added: `scripts/parity/` (`fake-supabase.mjs`, `scenarios.mjs`, `run.mjs`, `accepted.mjs`, `express-host.mjs`, `edge-host.ts`, `parity.test.mjs`, `report-stats.mjs`), `supabase/staging/reports/parity/parity-results.json`, this report.
Changed: `package.json` (script `test:parity`), `tsconfig.json` (excludes `scripts/parity`, which contains Deno code).
Unchanged: `server.ts`, everything under `supabase/functions/`, and both Supabase projects.

## Recommendation

Proceed to Stage 2 (install the approved schema on `dfabulous-staging`) and then Stage 4 (frontend wiring), carrying D1 to D5 as an explicit decision: fix them in the Edge function (recommended, small, testable) or migrate them as they are.
