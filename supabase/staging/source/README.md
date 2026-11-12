# Production public-schema export: owner runbook

**Status: NOT RUN.** `production_public_schema.sql` does not exist yet. The owner runs the export, because it needs the production database password,
which must never be given to an assistant or appear in a transcript, file, log, command preview or Git history.

Targets (identifiers, not secrets): production `fbhqegevyvpyzjoslblf`, staging `qwoxxroszmwobnzqgndr`, `eu-west-1`, PostgreSQL 17.
The export is read-only against production (`pg_dump --schema-only`).

**Preferred route on this Windows machine: [Native Windows pg_dump workflow](#native-windows-pg_dump-workflow-no-docker)** (below). The Supabase CLI helper
needs Docker and puts the password in a connection URL on a command line; the native helper does neither.

## Verified syntax (Supabase CLI 3.1.0, checked locally; no production contact)

| Question | Verified answer | Evidence |
|---|---|---|
| Is `--db-url` valid? | Deprecated but still accepted; hidden from `db dump --help`. v3 replacement: **`--remote=<url>`**. | v3 migration guide table (`--db-url <url>` → `--remote=<url>`); `db dump --help` lists only `--remote[=<ref\|branch\|url>]` |
| What does bare `--remote` do? | Targets the **linked** project, which must be linked first. **Do not use**: needs `supabase link`. | `db dump` docs |
| What does `--remote=<project-ref>` do? | Resolves the project through the Management API and needs a database password **or an access token so the CLI can create a temporary login role**. **Do not use**: creating a role would modify production. | migration guide, "Database passwords" |
| How is the password supplied with a URL? | **Inside the URL.** `--password` fails with a database URL (exit 1). | migration guide; `db dump --help` ("Not used for ... a database URL") |
| Does `db dump` ask for hosted-change confirmation? | No (it is not in the confirmation list). Do not pass `--yes`: it also lets the CLI remove network bans. | migration guide |
| What does the CLI print about a URL target? | `Target: custom Postgres (host:port)` on stderr. **User and password are not printed** (tested with an obviously fake credential on a loopback address). | local probe |
| **`--dry-run`** | **Prints `PGPASSWORD` in clear text**, including with a URL target (tested with a fake credential). **Never use it with production.** | local probe |
| Is Docker or `pg_dump` needed? | **A container runtime is required**: without it the command fails immediately with `DockerRunError: docker: command not found (podman also not found)` for both the local and the URL target. `pg_dump` itself is not needed on the host (it runs in the container). | local probe |
| What exactly runs? | `pg_dump --schema-only --quote-all-identifier --role "postgres" --exclude-schema "" --schema=public`, then a `sed` pipeline that strips comments, `\restrict` lines, event triggers, the `supabase_realtime` publication and internal-schema ACLs. No `--data-only`, no `--role-only`. | `--dry-run` against the local default and a fake URL |

## Prerequisites

* **Docker Desktop (or Podman), installed and running.** Not installed on this machine; installing it is your decision.
* Node.js (present) and network access to the production database. `npx supabase@3.1.0` is fetched transiently by npm (no global install).
* The connection details from Dashboard → **Connect**: use the **Session pooler** (port 5432, user `postgres.fbhqegevyvpyzjoslblf`) or **Direct** (needs IPv6 or the IPv4 add-on). Not the **Transaction pooler** (port 6543); it does not support `pg_dump`. Use the existing database password and **do not reset it** (a reset is a production change).
* A PostgreSQL 17 `pg_dump`: it must be the same major version as the server or newer, otherwise `pg_dump` refuses with a server-version mismatch (fails closed). `supabase/config.toml` has no `[db]` section; the CLI documents a `db.major_version` setting. Proposed local change (not made, needs your approval): add `[db]` / `major_version = 17`. See "PostgreSQL 17 checks".

## Secure credential handling

* Run in your **own** PowerShell window, not in an assistant-driven or recorded terminal, and not under `Start-Transcript`.
* The password is read with `Read-Host -AsSecureString` (not echoed, not stored in PSReadLine history), URL-encoded in memory, passed as the `--remote` value and discarded. **No environment variable is created or changed.**
* The CLI's stdout/stderr is never shown: stderr goes to `supabase/.temp/production_dump.stderr.txt` (git-ignored). Read it yourself before reporting anything; share only the error text, never a host or password.
* While the command runs, the connection string is visible in the local process list and the container environment on **your** machine. Run it on a trusted single-user machine.
* The helper refuses to run if the host/user does not contain the production ref, if it contains the staging ref, if the dump file already exists, if the port is 6543, or if Docker/Podman is missing. After a successful run it deletes the dump if it contains the password text.

## Exact command

Preferred: the prepared helper (it builds the URL safely and applies the guards):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\export-production-schema.ps1
```

The CLI invocation it performs (shown with a placeholder; never type a real URL into a shared terminal):

```powershell
npx supabase@3.1.0 db dump "--remote=<URL-built-from-prompts>" --schema public --file supabase/staging/source/production_public_schema.sql
```

Forbidden with production: `--dry-run`, `--debug`, `--yes`, `--password`, bare `--remote`, `--remote=<ref>`, `--data-only`, `--role-only`, `--use-copy`, `supabase link`, `db push|pull|reset|diff`, `login`.

## After the export (local, static, nothing executes)

```powershell
npm run schema:validate     # checksum, inventory, validation report; exit 1 on any FAIL
npm run schema:compare      # comparison with supabase/staging/expected/baseline_after_install.pgdump.sql
```

If `schema:validate` fails check 1 (data) or 2 (credentials), delete the file and report only the check number.

## Native Windows pg_dump workflow (no Docker)

Helper: `scripts/export-production-schema-native.ps1`. **Prepared and statically tested; not run against production.** PostgreSQL 17.11 `pg_dump` is at
`C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`. The helper reads the version from the file's version resource (it does not execute `pg_dump` during checks) and refuses anything but **17.11**; the dump header must also say `Dumped by pg_dump version 17.11`.

| Item | Value |
|---|---|
| Connection | **Session pooler** only: host `aws-1-eu-west-1.pooler.supabase.com` (confirmed from Dashboard → Connect; the helper accepts only `aws-<n>-eu-west-1.pooler.supabase.com`), port **5432**, user **`postgres.fbhqegevyvpyzjoslblf`** (fixed by the helper), database `postgres`. Direct host, port 6543 (Transaction pooler), other regions and the staging ref are rejected. Supabase's connection guide lists Direct as the default for `pg_dump`; the Session pooler is its documented alternative for IPv4-only networks. |
| TLS | **`sslmode=verify-full`** with `sslrootcert` = your `prod-ca-2021.crt` (default `%USERPROFILE%\Downloads\prod-ca-2021.crt`), always; weaker modes do not exist in the helper. Before anything else it checks that the file is one certificate, contains no private key, is the self-signed `Supabase Root 2021 CA`, is within its validity (to 2031-04-26) and has SHA-256 (DER) **`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`**. That value was independently confirmed: the copy at `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt` is byte-identical. Supabase publishes no fingerprint of its own; for a third source, compare with the file downloaded from Dashboard → Database Settings → SSL Configuration. |
| What is dumped | `pg_dump --schema-only --schema=public --format=plain --quote-all-identifiers --no-publications --no-subscriptions --no-security-labels --no-tablespaces --lock-wait-timeout=30s --no-password`. No rows, no roles, no other schema. Owners, grants and RLS policies are kept. The header comment is kept, so `schema:validate` check 9 can confirm the source is PostgreSQL 17.x. |
| Credential | A pgpass-format file created for this run in `%LOCALAPPDATA%\DFabulousSchemaExport\<random>\`, outside the repository, with inheritance removed and one allow rule for your Windows account (re-read and verified before the password is written; only the DACL is read or written, never audit rules, so no `SeSecurityPrivilege` is needed). `PGPASSFILE` (a path) is set for the `pg_dump` child process only; every other inherited `PG*` variable is removed from it. Zero-filled and deleted when the run ends. |
| Post-processing | Only `\restrict` / `\unrestrict` meta-command lines are removed (PostgreSQL 17.6+ writes them; `schema:validate` check 11). The password text is searched for and the file is discarded if found. |
| Output | `supabase/staging/source/production_public_schema.sql`; refuses to overwrite. |

Steps (you run them, in your own PowerShell window, not under `Start-Transcript`, not screen-recorded):

```powershell
# 1. Local self-check: no password prompt, no connection, no DNS lookup.
powershell -ExecutionPolicy Bypass -File scripts\export-production-schema-native.ps1 -PreflightOnly
# 2. The export (asks for the host, then for the typed phrase CONNECT TO PRODUCTION, then for the hidden password).
powershell -ExecutionPolicy Bypass -File scripts\export-production-schema-native.ps1
# 3. Static checks of the result.
npm run schema:validate
npm run schema:compare
# Only if a run was interrupted and left a folder behind:
powershell -ExecutionPolicy Bypass -File scripts\export-production-schema-native.ps1 -Cleanup
```

`-SslRootCert <file>` selects a different CA file location; the pinned fingerprint still applies. `verify-full` also checks that the server certificate matches the pooler host name; that handshake can only be confirmed by the first real connection (see remaining risks in the review notes). If it fails, the run stops with a redacted error and nothing is written.
A failed run prints only redacted error text (host, user, project ref, IP addresses, URLs and the password replaced). Share that text only, never a file.

Limits (honest): the password exists briefly as a .NET string in the PowerShell process and, for the run, in the owner-only file; neither is observable by other
non-administrator users. A local administrator could read both. The host and user (not secrets) are visible in the process list. A zero-fill on an SSD or
with file-system journaling is best effort. Do not run it on a shared machine.

Forbidden for this route: any `PGPASSWORD`, `--password`/`-W`, a connection URL, `psql`, `pg_restore`, `--data-only`, `--inserts`, `--clean`, `--create`, the Transaction pooler, creating a database role.

## What the dump will and will not contain

Contains: `public` schema definitions only (tables, columns, constraints, indexes, views, functions, triggers, RLS enablement and policies, ownership, grants, `ALTER DEFAULT PRIVILEGES` for `postgres`, extensions installed into `public`).
Does not contain: any row (`--schema-only`; the validator rejects `INSERT`/`COPY`/`setval`), `auth` or `storage` definitions or rows, other managed schemas, role definitions or passwords, migration history, event triggers, `supabase_admin` default privileges, triggers on `auth.users`, storage policies, hooks. References to `auth.users` appear only as foreign-key text. Those excluded objects are covered by `auth_inspection_request_READONLY_NOT_EXECUTED.sql` (not run, needs approval).

## PostgreSQL 17 checks before any staging installation

1. The CLI strips the `pg_dump` header, so the dump cannot state its source version. Confirm 17.x from the Dashboard (Settings → Infrastructure) and inspection query A11.
2. `pg_dump` older than the server aborts with a version mismatch (no partial acceptance); a successful dump therefore came from a `pg_dump` that is 17 or newer.
3. `npm run schema:validate` rejects PostgreSQL 18-only syntax (`uuidv7()`, virtual generated columns), `\restrict` meta-commands, `pg_cron`, data, credentials and non-public definitions.
4. Staging must report PostgreSQL 17 in its dashboard before installation.
5. Optional, needs approval: parse-load the cleaned dump into a throwaway local `postgres:17` container (not production, not staging) with the Supabase roles stubbed. This needs Docker and is stronger than the in-memory PostgreSQL 18 test engine used so far.

## Still needed from the live project (not in a public dump)

`auth_inspection_request_READONLY_NOT_EXECUTED.sql`: a prepared read-only catalog inspection (auth triggers, storage policies, hooks, default privileges, extensions, relation existence, engine version). **Not run; needs your approval.**
