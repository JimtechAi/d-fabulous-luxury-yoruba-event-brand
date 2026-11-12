# OWNER-RUN HELPER. PREPARED, NOT EXECUTED BY THE ASSISTANT. Never run it from an assistant-driven or recorded terminal.
#
# Exports the PRODUCTION `public` schema, SCHEMA-ONLY, with the official Supabase CLI (pinned to 3.1.0), using the connection-string target
# `--remote=<url>`. It reads only; it creates no role, link, migration, file other than the dump and a local stderr file, and no environment variable.
#
# Run it yourself, from the repository root, in a normal PowerShell window that is NOT under Start-Transcript and NOT being screen-recorded:
#     powershell -ExecutionPolicy Bypass -File scripts\export-production-schema.ps1
#
# Prerequisites: Docker Desktop (or Podman) running; Node.js; network access to the production database.
# The password is requested as a secure string (not echoed, not stored in history). It is URL-encoded in memory, passed to the CLI as the
# --remote value, and discarded. It is never written to a file by this script and never printed.

[CmdletBinding()]
param(
  [string] $ProductionRef = 'fbhqegevyvpyzjoslblf',
  [string] $StagingRef    = 'qwoxxroszmwobnzqgndr'
)

$ErrorActionPreference = 'Stop'
$cliVersion = '3.1.0'
$dumpFile   = 'supabase/staging/source/production_public_schema.sql'
$stderrFile = 'supabase/.temp/production_dump.stderr.txt'   # inside a git-ignored folder; review it yourself before sharing anything

if (-not (Test-Path 'package.json') -or -not (Test-Path 'supabase/staging/source')) { throw 'Run this from the repository root.' }
if (Test-Path $dumpFile) { throw "$dumpFile already exists. Review and move it first; this script never overwrites a dump." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and -not (Get-Command podman -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop or Podman is required: the CLI runs pg_dump in a container. Install it yourself, start it, and re-run.'
}
New-Item -ItemType Directory -Force (Split-Path $stderrFile) | Out-Null

Write-Host 'Production database export (schema only, public schema). Nothing will be printed that contains the password.'
$dbHost = (Read-Host 'Database host from Dashboard > Connect (Session pooler or Direct, never the Transaction pooler)').Trim()
$port   = (Read-Host 'Port [5432]').Trim(); if (-not $port) { $port = '5432' }
$user   = (Read-Host "Database user [postgres.$ProductionRef for the pooler, postgres for Direct]").Trim()
if (-not $user) { $user = "postgres.$ProductionRef" }
$secure = Read-Host 'Database password (hidden)' -AsSecureString

# Guards: wrong project, staging, transaction pooler.
if (($dbHost + $user) -match [regex]::Escape($StagingRef)) { throw 'This looks like STAGING. This export must target production only.' }
if (($dbHost + $user) -notmatch [regex]::Escape($ProductionRef)) { throw "Neither the host nor the user contains the production project ref ($ProductionRef). Stopping." }
if ($port -eq '6543') { throw 'Port 6543 is the Transaction pooler, which does not support pg_dump. Use the Session pooler (5432) or Direct.' }
if ($port -notmatch '^\d{2,5}$') { throw 'Invalid port.' }

$plain = [System.Net.NetworkCredential]::new('', $secure).Password
if (-not $plain) { throw 'Empty password.' }
$url = 'postgresql://{0}:{1}@{2}:{3}/postgres' -f [uri]::EscapeDataString($user), [uri]::EscapeDataString($plain), $dbHost, $port

$exitCode = 1
try {
  $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  # No --dry-run (it prints PGPASSWORD), no --yes, no --password, no --debug, no bare --remote and no --remote=<ref> (those can create a temporary login role).
  & npx "supabase@$cliVersion" db dump "--remote=$url" --schema public --file $dumpFile 2> $stderrFile
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($exitCode -ne 0) {
    if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force }
    Write-Host "Export FAILED (exit $exitCode). Open $stderrFile yourself and check it for the password before sharing any of it. Tell the assistant only the error code/message text without any host or password."
  } elseif ((Test-Path $dumpFile) -and (Get-Content $dumpFile -Raw).Contains($plain)) {
    Remove-Item $dumpFile -Force
    $exitCode = 2
    Write-Host 'The dump contained the password text. It was deleted. Do not share anything.'
  } else {
    Write-Host "Export written to $dumpFile ($((Get-Item $dumpFile).Length) bytes). Next: npm run schema:validate"
  }
} finally {
  $plain = $null; $url = $null; $secure.Dispose(); [GC]::Collect()
}
exit $exitCode
