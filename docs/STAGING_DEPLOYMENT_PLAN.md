# Staging Deployment Plan: `dfabulous-api` Edge Function

**Status: PLAN ONLY. Nothing in this document has been executed.** Every step targets a dedicated **staging**
Supabase project. Production (Express on Render, Vercel `VITE_API_BASE_URL`, production Supabase project) is
never touched by this plan. Moving production traffic is a separate change that needs its own approval.

## 0. Guard rails (read first)

* Use a **separate staging Supabase project** with its own keys. Never reuse the compromised keys from the archive. Create fresh staging keys.
* Before every CLI command confirm the target: `supabase projects list` and check `supabase/.temp/project-ref` equals the **staging** ref. Pass `--project-ref <STAGING_REF>` explicitly on every command.
* Use throwaway staging data and test mailboxes only. Resend: staging key + `RESEND_TESTING_MODE=true`.
* Do not set `RATE_LIMIT_DEV_FALLBACK` on staging. Staging must behave like production (fail-closed).
* Do not change the production Vercel/Render/Supabase environment at any point.

```powershell
$STAGING = "<staging-project-ref>"      # never the production ref
supabase login                           # personal access token, not stored in the repo
supabase link --project-ref $STAGING
Get-Content supabase\.temp\project-ref   # must print the staging ref
```

### 0a. Expected production `VITE_API_BASE_URL` (verify only; do not change)

Derived from the repository (README, `.env.example`, `src/lib/db.ts`, `vercel.json`); production settings were **not** accessed.

| Item | Expected value today | Why |
|---|---|---|
| Vercel -> Production -> `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com` (https, no trailing slash, **no `/api` suffix**) | The Express backend on Render is the documented production API; the frontend appends `/api/...` itself |
| Vercel -> Preview -> `VITE_API_BASE_URL` | Staging/preview backend or the Render URL; **never** the staging Edge Function unless you are deliberately testing it | Keeps the staging experiment out of the live site |
| Value that would mean traffic was switched | `https://<ref>.supabase.co/functions/v1/dfabulous-api` | Must stay absent from Production until cutover is approved |
| Unset in Production | Build succeeds but every API call throws `VITE_API_BASE_URL is required...` at runtime | Intentional guard; also means "unset" is a broken production, not a default |
| Local `.env` / `.env.local` / `supabase/functions/.env` | Not set (verified locally) | Correct: empty means same-origin local development |

How the owner verifies without changing anything:
1. Vercel dashboard -> Project -> Settings -> Environment Variables: look at the **Production** row for `VITE_API_BASE_URL` (view only; or `vercel env ls production`, which lists names and environments, not values).
2. Compare with the Render service's public URL (Render dashboard -> the Web Service header).
3. In Render -> Environment confirm `CORS_ALLOWED_ORIGINS` contains `https://dfabulous.co.uk` (and `https://www.dfabulous.co.uk` if used) and that `TRUST_PROXY_HOPS` is set only after the hop count was verified.
4. The deployed frontend can be checked without privileged access: view-source/Network tab on the live site should show API requests going to the Render host, never to `*.supabase.co/functions/v1`.

## 1. Staging database baseline

The staging DB must have the same schema as production (tables `bookings`, `blocked_dates`, `profiles`, `user_permissions`, `site_settings`, `messages`, `payments`, `audit_logs`, RLS policies from `08 Development/`).

1. Preferred: restore a **schema-only** dump of production into staging (read-only on production, needs explicit approval):
   `supabase db dump --schema public --linked -f schema.sql` while linked to production, then relink to staging and apply it. Never dump data.
2. Alternative: apply the approved `08 Development/*.sql` files in filename order in the staging SQL editor.
3. Create staging Auth users: `staging-owner` (role `owner`), `staging-admin` (profiles.role = `admin`, `is_active = true`, permissions `bookings.manage`, `settings.manage`, `payments.manage`), `staging-admin2` (same), `staging-usermgr` (role `admin`, permissions `users.manage`, `users.view`, `bookings.manage`), `staging-staff-mgr` (role `staff`, permission `users.manage`), `staging-viewer` (role `viewer`, no permissions), `staging-inactive` (admin, `is_active = false`).
4. Run queries 1-8 from `docs/SECURITY_ARCHITECTURE.md` §2b against staging. Query 8 (direct write privileges of `authenticated` on `user_permissions` / `profiles`) must be understood **before** the user-management tests in §7: if it returns `true`, repeat the check on production (read-only) and request the hardening migration in §2b before cutover.

**Compatibility check (already reviewed):** `20261111090000_api_rate_limits_cleanup_hardening.sql` references only `public.api_rate_limits` (created by `20261110120000_api_rate_limits.sql`). It touches no booking/payment/auth table, no existing policy, and uses no object names that exist elsewhere in the repo. Its `pg_cron` block mirrors the pattern already used by `20260916_booking_archive_purge_cron.sql`.

## 2. Migration procedure (staging)

```powershell
supabase migration list --linked                 # shows which of the two rate-limit migrations are applied
supabase db push --linked --dry-run              # review the exact list; expect only the rate-limit migrations
supabase db push --linked                        # applies pending migrations to STAGING
```

If `migration list` reports remote history drift, stop and reconcile with `supabase migration repair` (staging only) before pushing.

Verification (SQL editor, staging):

```sql
-- objects exist
select to_regclass('public.api_rate_limits'), to_regprocedure('public.consume_rate_limit(text,integer,integer)'),
       to_regprocedure('public.cleanup_expired_rate_limits(integer,integer)');
select indexname from pg_indexes where tablename = 'api_rate_limits';           -- includes api_rate_limits_window_start_idx
select relrowsecurity from pg_class where oid = 'public.api_rate_limits'::regclass;   -- true
select count(*) from pg_policies where tablename = 'api_rate_limits';            -- 0
-- privileges: only service_role may execute
select p.proname, has_function_privilege('anon', p.oid,'EXECUTE') anon,
       has_function_privilege('authenticated', p.oid,'EXECUTE') auth,
       has_function_privilege('service_role', p.oid,'EXECUTE') svc
from pg_proc p where p.proname in ('consume_rate_limit','cleanup_expired_rate_limits');   -- anon=false auth=false svc=true
-- scheduled job (only if pg_cron is installed)
select jobname, schedule from cron.job where jobname = 'dfabulous-api-rate-limit-cleanup';
-- functional
select public.consume_rate_limit('verify:test', 2, 60);   -- true, true, then false
delete from public.api_rate_limits where bucket_key = 'verify:test';
```

Then from a **non-privileged** connection (the REST API with the anon key) confirm `POST /rest/v1/rpc/consume_rate_limit` and `GET /rest/v1/api_rate_limits` are rejected.

**Concurrency checks (two SQL editor sessions, staging):**

1. Insert 3,000 expired rows: `insert into public.api_rate_limits(bucket_key, window_start, request_count, updated_at) select 'exp:'||g, now()-interval '30 hours', 1, now()-interval '30 hours' from generate_series(1,3000) g;`
2. Session A: `begin; select * from public.api_rate_limits where bucket_key like 'exp:1%' for update;` (leave open).
3. Session B: `select public.cleanup_expired_rate_limits(1000, 5);`. It must return immediately with a count that **excludes** A's locked rows (no waiting).
4. Session B (while A still open): `select public.consume_rate_limit('verify:live', 5, 60);` must return without blocking. Then `commit` in A and re-run cleanup until it returns 0.
5. **Deterministic advisory-lock test.** Session A: `begin; select pg_try_advisory_xact_lock(hashtext('dfabulous:api_rate_limits_cleanup'));` (returns `true`; leave the transaction open). Session B: `select public.cleanup_expired_rate_limits(1000, 5);` must return **0 immediately** (another cleanup "is running") and `select public.consume_rate_limit('verify:live2', 5, 60);` must still return without waiting. Session A: `rollback;`, then Session B's cleanup deletes the expired rows again. (Do not run this check in a single session: advisory locks are re-entrant within one session and would not prove anything.)
6. **Observe locks.** While Session A holds the `for update` from step 2, run in a third session `select l.locktype, l.mode, l.granted, a.query from pg_locks l join pg_stat_activity a using (pid) where not l.granted;`. It must return **no rows** (nothing is waiting).
7. **Parallel cleanup + traffic.** From the SQL editor or `psql`, run 20 concurrent loops of `select public.consume_rate_limit('load:' || (g % 50), 1000000, 60) from generate_series(1,200) g;` while another session loops `select public.cleanup_expired_rate_limits(1000,5);` ten times. Expect no errors, no deadlock messages (`40P01`) in the Postgres logs, and each `load:*` bucket's `request_count` equal to the number of calls made to it. Clean up: `delete from public.api_rate_limits where bucket_key like 'exp:%' or bucket_key like 'verify:%' or bucket_key like 'load:%';`

PGlite (used by the local test-suite) is single-connection, so steps 2-7 are the only proof of lock behaviour. **Pass = all of 3-7 behave as stated; any waiting, deadlock or wrong count blocks production.**

## 3. Secret configuration (staging only)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. Do not set them manually.

```powershell
supabase secrets set --project-ref $STAGING `
  CORS_ALLOWED_ORIGINS="https://<staging-frontend-origin>" `
  RESEND_API_KEY="<staging-resend-key>" `
  RESEND_FROM_EMAIL="D'Fabulous Events <onboarding@resend.dev>" `
  RESEND_NOTIFICATION_EMAIL="<test-inbox>" `
  RESEND_TESTING_MODE="true" `
  RESEND_TESTING_EMAIL="<resend-account-email>"
supabase secrets list --project-ref $STAGING     # names + digests only; confirm RATE_LIMIT_DEV_FALLBACK is NOT listed
```

Type secrets interactively or read them from your password manager. Do not paste them into files inside the repo, chat tools, or shell history that is synced.

## 4. Edge Function deployment (staging)

```powershell
npm run lint:edge ; npm run test:edge            # both must exit 0
supabase functions deploy dfabulous-api --project-ref $STAGING --no-verify-jwt
supabase functions list --project-ref $STAGING
$BASE = "https://$STAGING.supabase.co/functions/v1/dfabulous-api"
curl.exe -s "$BASE/api/health"                   # {"status":"ok",...}
curl.exe -s -i "$BASE/api/nope"                  # 404 {"success":false,"error":"Not Found"}
```

`--no-verify-jwt` matches `supabase/config.toml` (`verify_jwt = false`): public booking endpoints are anonymous and all admin authorisation happens inside the function.

Test the function with `curl`/Postman **before** pointing any frontend at it. If a browser test is wanted, use a Vercel **Preview** deployment of a branch with `VITE_API_BASE_URL=$BASE` scoped to Preview only. Do not edit the Production environment variable.

## 5. Client IP verification (blocking gate)

Goal: prove the Edge runtime provides a trustworthy `cf-connecting-ip` and that forged headers cannot change identity.

```powershell
# 1. Baseline from this machine
1..3 | % { curl.exe -s -o NUL -w "%{http_code}`n" -X POST "$BASE/api/bookings" -H "Content-Type: application/json" -d '{}' }
# 2. Same machine, forged headers (values differ every time)
1..3 | % { curl.exe -s -o NUL -w "%{http_code}`n" -X POST "$BASE/api/bookings" -H "Content-Type: application/json" `
     -H "X-Forwarded-For: 10.9.8.$_" -H "X-Real-IP: 10.7.7.$_" -d '{}' }
# 3. Attempt to forge the Cloudflare header itself (Cloudflare may reject with HTTP 403/1000: that is also a pass)
curl.exe -s -i -X POST "$BASE/api/bookings" -H "CF-Connecting-IP: 1.2.3.4" -H "Content-Type: application/json" -d '{}'
```

```sql
select bucket_key, request_count, window_start, updated_at
from public.api_rate_limits order by updated_at desc limit 20;
```

**Pass criteria**

* All 6 requests above increment **one** `submission:ip:<hash>` bucket (request_count = 6); forged `X-Forwarded-For`/`X-Real-IP` values create no new buckets.
* No `submission:fp:` or `submission:noip-global` bucket appears and function logs contain no `No trusted client IP available` warning.
* A second network (mobile hotspot) creates a **different** `submission:ip:<hash>` bucket. If you have IPv6, confirm two addresses in the same /64 share one bucket.
* The forged `CF-Connecting-IP` request either is rejected by Cloudflare or does not create a bucket for `1.2.3.4`'s hash.

**Fail criteria (STOP, do not proceed to production):** the header is missing, forged values change the bucket, or all visitors share one bucket. Then revisit `lib/rateLimit.ts` `getClientIp()` and `docs/SECURITY_ARCHITECTURE.md` §3.

### 5a. Proving the header is the real client address (no raw IPs stored, so compare hashes)

Buckets are keyed by `sha256("ip:" + normalisedIp)` (first 32 hex characters), where `normalisedIp` is `4:<ipv4>` or `6:<first four IPv6 groups>`. You can therefore compute the key you **expect** and compare it with the key the platform **produced**:

```powershell
# Your public IPv4 as seen from the internet (use a second network for the second run)
$ip = (curl.exe -s https://api.ipify.org).Trim()
$h  = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("ip:4:$ip"))
"expected suffix: " + (-join ($h[0..15] | ForEach-Object { $_.ToString('x2') }))
```

(The recipe was checked locally: `203.0.113.5` -> `9c1e2ade21625274065dd0beac154214` identically in PowerShell, Node and Deno.) After sending one booking request from that machine, `select bucket_key from public.api_rate_limits order by updated_at desc limit 5;` must contain `submission:ip:<expected suffix>`. This proves `cf-connecting-ip` equals your real public address and is not a proxy address. For IPv6 networks use `"ip:6:" + the first four groups (lower-case hex, leading zeros removed)`.

Optional raw-header probe (staging project **only**, temporary; delete it afterwards). Create `supabase/functions/ip-probe/index.ts` in a scratch copy, never in the repository:

```ts
Deno.serve((req) => Response.json({
  has_cf_connecting_ip: req.headers.has('cf-connecting-ip'),
  cf_connecting_ip_matches_xff_first: req.headers.get('cf-connecting-ip') === (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim(),
  has_x_real_ip: req.headers.has('x-real-ip'),
  xff_entry_count: (req.headers.get('x-forwarded-for') ?? '').split(',').filter(Boolean).length,
}));
```

Deploy with `supabase functions deploy ip-probe --project-ref $STAGING --no-verify-jwt`, call it normally and with forged `X-Forwarded-For: 1.1.1.1, 2.2.2.2`/`X-Real-IP`/`CF-Connecting-IP` headers, record the booleans, then `supabase functions delete ip-probe --project-ref $STAGING`. Expected: `has_cf_connecting_ip` is always `true`; forging `CF-Connecting-IP` is rejected or overwritten; `xff_entry_count` growing with forged entries confirms why `x-forwarded-for` must stay untrusted.

**Decision table**

| Observation | Decision |
|---|---|
| Expected suffix matches, forged headers ignored, second network differs | **PASS** |
| Header present but equals a Supabase/Cloudflare address (suffix does not match your IP) | **FAIL**: all visitors would share a bucket; change strategy before production |
| Header missing (only `fp:` / `noip-global` buckets appear) | **FAIL**: platform does not provide it; use a different trusted source or accept the global ceiling consciously |
| Forged `CF-Connecting-IP` creates a bucket for the forged address | **FAIL (critical)** |

## 6. Booking submission tests (staging data only)

Use a future date unique to each run.

| # | Request | Expected |
|---|---|---|
| 1 | `GET $BASE/api/availability` | 200 `success:true` |
| 2 | `POST /api/bookings` valid body | 200, `bookingSaved:true`, row in `bookings`, email attempt reported (testing mode) |
| 3 | Same date again | 409/400 `Date Unavailable` (generic message, no SQL text) |
| 4 | Invalid email / missing location | 400 `Validation Error` |
| 5 | Honeypot `website_hp: "x"` | 400 `Invalid submission` |
| 6 | Body > 32 KB | 413 |
| 7 | 6 valid-shaped submissions within 15 min from one IP | 5 pass, 6th = **429** with `Retry-After: 900` |
| 8 | `POST /api/messages` valid | 200; shares the same 5/15 min quota |
| 9 | From `https://<staging-frontend-origin>`: preflight `OPTIONS /api/bookings` | 204 with matching `Access-Control-Allow-Origin` |
| 10 | Preflight from `https://evil.example` | 204 **without** `Access-Control-Allow-Origin` |

Clean up staging test rows afterwards.

## 7. Admin authentication and authorisation tests

Obtain access tokens by signing in as each staging user (`supabase.auth.signInWithPassword` via a small script or the staging frontend). Never log full tokens.

| # | Request | Expected | Also check |
|---|---|---|---|
| 1 | `POST /api/admin/blocked-dates` no token | 401 | no `admin_*` rows in `api_rate_limits` |
| 2 | same, `Authorization: Bearer garbage` | 401 | no `admin_*` rows |
| 3 | same, viewer token | 403 generic message (no permission name) | no `admin_*` rows |
| 4 | same, inactive admin token | 403 | no `admin_*` rows |
| 5 | same, admin token, valid body | 201 | exactly two `admin_status:user:` / `admin_status:ip:` buckets |
| 6 | `GET /api/admin/session` admin | 200 with role + permissions | |
| 7 | `GET /api/admin/users` viewer | 403 | |
| 8 | `PUT /api/admin/settings` admin | 200; preflight `OPTIONS` from staging origin lists `PUT` | audit log row `settings.updated` |
| 9 | status change, archive, update, payment, delete booking (admin; delete = owner) | existing behaviour unchanged | |
| 10 | Revoke/expire the admin session | 401 afterwards | |
| 11 | `POST /api/admin/users` as owner with `role: "admin"` | 201 | audit log `user.created` |
| 12 | same as an administrator holding `users.manage` | 403; no auth user or profile created | no `admin_users:*` rows |
| 13 | administrator PATCH a staff user to `role: "admin"` / grants `users.manage` | 403 | role unchanged |
| 14 | administrator PATCH/DELETE the owner or another administrator | 403 | |
| 15 | staff user with `users.manage` POST/PATCH/DELETE | 403 | no quota consumed |
| 16 | administrator creates/edits/deletes a staff user (non-privileged permissions) | 201/200/200 | quota: 31st request in 15 min = 429 |

Notes for tests 11-16: (a) owner-initiated promotions/demotions (`PATCH role`) may be blocked by the pre-existing `prevent_role_escalation` trigger because the API writes as `service_role` (see `docs/SECURITY_ARCHITECTURE.md` §2b finding 2). Record the staging result; a failure with a generic "Unable to update the user" for the **owner** is a known pre-existing issue to fix in a separate, approved migration, not a policy bug. (b) Policy denials (403) and 401s must leave `api_rate_limits` untouched.

## 8. Rate-limit tests

1. **Admin quota:** loop 31 authenticated `POST /api/admin/blocked-dates` (same valid date; 409/500 from duplicates is fine because the limiter counts first). Request 31 must be **429**, `Retry-After: 900`.
2. **Isolation:** while admin 1 is limited, admin 2 (same machine/IP) succeeds with **201**.
3. **No quota theft:** send 100 unauthenticated and 100 viewer-token requests, then confirm admin 1 and admin 2 quotas are unchanged in `api_rate_limits`.
4. **IP rotation:** a single admin token from two networks still shares the same `admin_status:user:` bucket.
5. **Fail-closed:** in staging only, `revoke execute on function public.consume_rate_limit(text,integer,integer) from service_role;` then: admin write -> **503** and **no row written**; booking -> **503**; unauthenticated admin call -> still **401**. Restore with `grant execute ... to service_role;` and confirm recovery. Log line `Rate limit RPC failure` must appear, with no secrets.
6. **Cleanup:** insert expired rows (§2), run `select public.cleanup_expired_rate_limits(1000,5);` repeatedly: deletes at most 5,000 rows per call and never touches live buckets. If `pg_cron` is installed, confirm the next hourly run via `select * from cron.job_run_details order by start_time desc limit 5;`.
7. **Concurrency:** run 40 parallel authenticated requests (`1..40 | % { Start-Job ... }`): exactly 30 succeed and 10 are 429.

## 9. Rollback procedure

Production is never switched during this plan, so rollback is staging cleanup:

* **Function:** `supabase functions delete dfabulous-api --project-ref $STAGING`, or redeploy the previous commit of `supabase/functions/dfabulous-api` (functions have no built-in version rollback; Git is the source of truth).
* **Secrets:** `supabase secrets unset <NAME> --project-ref $STAGING`.
* **Database (staging; run in the SQL editor):**

```sql
begin;
select cron.unschedule(jobid) from cron.job where jobname = 'dfabulous-api-rate-limit-cleanup';  -- skip if pg_cron absent
drop function if exists public.cleanup_expired_rate_limits(integer, integer);
drop index if exists public.api_rate_limits_window_start_idx;
-- restore the original consume_rate_limit body from 20261110120000_api_rate_limits.sql (re-run that file's CREATE OR REPLACE FUNCTION block)
commit;
```

  Rate-limit rows are disposable counters; `truncate public.api_rate_limits;` is safe on staging.
* **Frontend (for the later, separately approved production cutover):** revert `VITE_API_BASE_URL` to the Render URL and redeploy the Vercel frontend. Keep the Render service running and unchanged for the whole observation period; this makes cutover rollback a one-variable change.

## 10. Exit criteria for requesting production approval

**Staging readiness decision (local work, 2026-11-11): ready to begin staging on approval.** The local security suite is complete and green; the remaining gates can only be proven on a real Supabase project.

*Before staging (owner actions, nothing to deploy):* create the separate staging Supabase project with its own fresh keys (never the archived ones); confirm the Production `VITE_API_BASE_URL` (§0a); run the §2b read-only account review queries on production. *Before production (not before staging):* complete the credential rotation (`docs/SECURITY_ARCHITECTURE.md` §5).

* §2 migrations applied on staging; all verification queries pass; concurrency checks pass.
* **Database privilege review** (`docs/DATABASE_SECURITY_REVIEW.md` §5-§6) completed: read-only queries 1-10 run on production by the owner/DBA and saved; Step 2 (prove the finding on staging) recorded; proposals A and B (and C if chosen) applied on staging one at a time with regression and rollback rehearsal passing. These database proposals are **separate approvals** from the Edge Function migration above.
* §5 client-IP gate passes with evidence (bucket screenshots/SQL output, no secrets).
* §6, §7, §8 all pass, including fail-closed behaviour.
* Credentials listed in `docs/SECURITY_ARCHITECTURE.md` §5 have been rotated, and production secrets are staged but not switched.
* Written approval for: production migration, Edge Function deployment to production, and the `VITE_API_BASE_URL` cutover, each as a separate step.
