# OWNER-RUN HELPER. PREPARED, NOT EXECUTED AGAINST PRODUCTION BY THE ASSISTANT. Never run it from an assistant-driven or recorded terminal.
#
# Native Windows alternative to scripts\export-production-schema.ps1 (no Docker, no Supabase CLI). It runs PostgreSQL 17.11 pg_dump directly and exports
# ONLY the production `public` schema, SCHEMA-ONLY (no rows), through the Supabase SESSION pooler (port 5432, user postgres.<project-ref>).
# TLS is always sslmode=verify-full against the Supabase Root 2021 CA file, whose SHA-256 fingerprint is pinned below and checked before anything else.
# pg_dump is not executed by the checks: its version is read from the file's version resource (and again from the dump header after a real run).
#
# Credential mechanism: a libpq password file (pgpass format) created for this run only, in a per-user folder OUTSIDE the repository, with an
# owner-only ACL (inheritance removed, one allow rule for the current Windows user). pg_dump finds it through PGPASSFILE, which is set for the child
# process only and holds a PATH, never the password. The password never appears in a command line, an environment variable, a script, a log or Git.
# The file is overwritten with zeros and deleted when the run ends, whatever the outcome.
#
# Run it yourself, from the repository root, in a normal PowerShell window that is NOT under Start-Transcript and NOT being screen-recorded:
#     powershell -ExecutionPolicy Bypass -File scripts\export-production-schema-native.ps1
# Local-only self-check (asks for no password, makes no connection, does no DNS lookup, does not start pg_dump):
#     powershell -ExecutionPolicy Bypass -File scripts\export-production-schema-native.ps1 -PreflightOnly
#
# The pooler host default is the one confirmed from Dashboard > Connect > Session pooler (aws-<n>-eu-west-1.pooler.supabase.com). The user is fixed
# to postgres.<production ref>; the port is fixed to 5432. The CA file defaults to %USERPROFILE%\Downloads\prod-ca-2021.crt.

[CmdletBinding()]
param(
  [string] $DbHost        = 'aws-1-eu-west-1.pooler.supabase.com',
  [string] $ProductionRef = 'fbhqegevyvpyzjoslblf',
  [string] $StagingRef    = 'qwoxxroszmwobnzqgndr',
  [string] $PgDump        = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe',
  [string] $ExpectedPgDumpVersion = '17.11',
  [string] $OutFile       = 'supabase/staging/source/production_public_schema.sql',
  [string] $SslRootCert   = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\prod-ca-2021.crt'),
  # SHA-256 of the DER bytes of "Supabase Root 2021 CA" (a public certificate, not a secret); identical to the copy from Supabase's download bucket.
  [string] $ExpectedCaSha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa',
  [switch] $PreflightOnly,
  [switch] $Cleanup
)

$ErrorActionPreference = 'Stop'
$script:Port     = '5432'
$script:Database = 'postgres'

function Get-ExportBaseDirectory {
  Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'DFabulousSchemaExport'
}

function Assert-SessionPoolerTarget {
  param([string] $DbHost, [string] $Port, [string] $User, [string] $ProductionRef, [string] $StagingRef)
  if (-not $DbHost) { throw 'No pooler host given. Copy it from Dashboard > Connect > Session pooler.' }
  if ((("$DbHost $User") -match [regex]::Escape($StagingRef))) { throw 'This looks like STAGING. This export must target production only.' }
  if ($DbHost -match '^db\.[a-z0-9]+\.supabase\.co$') { throw 'That is the Direct connection host. This workflow uses the Session pooler only.' }
  if ($DbHost -notmatch '^aws-\d+-eu-west-1\.pooler\.supabase\.com$') { throw 'The host must be the eu-west-1 shared pooler host (aws-<n>-eu-west-1.pooler.supabase.com), copied from Dashboard > Connect > Session pooler.' }
  if ($Port -eq '6543') { throw 'Port 6543 is the Transaction pooler, which does not support pg_dump. Use the Session pooler (5432).' }
  if ($Port -ne '5432') { throw 'The Session pooler port must be 5432.' }
  if ($User -cne "postgres.$ProductionRef") { throw "The pooler user must be postgres.$ProductionRef." }
}

function Assert-PgDumpVersion {
  param([string] $PgDump, [string] $ExpectedVersion)
  if (-not (Test-Path -LiteralPath $PgDump -PathType Leaf)) { throw "pg_dump not found at $PgDump." }
  # Read from the file's version resource: the executable is not run during checks.
  $info = (Get-Item -LiteralPath $PgDump).VersionInfo
  if ($info.FileDescription -notmatch '^pg_dump\b' -or $info.ProductVersion -ne $ExpectedVersion -or $info.FileVersion -ne $ExpectedVersion) {
    throw "pg_dump must be PostgreSQL $ExpectedVersion (file reports product '$($info.ProductVersion)', file '$($info.FileVersion)')."
  }
  "pg_dump (PostgreSQL) $($info.ProductVersion)"
}

function Assert-SupabaseRootCa {
  param([string] $Path, [string] $ExpectedSha256)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'The CA certificate file does not exist. Pass -SslRootCert <prod-ca-2021.crt>. verify-full is mandatory.' }
  $text = [IO.File]::ReadAllText($Path)
  if ($text -match 'PRIVATE KEY') { throw 'The CA file contains private key material. Refusing to use it.' }
  if ([regex]::Matches($text, '-----BEGIN CERTIFICATE-----').Count -ne 1) { throw 'The CA file must contain exactly one certificate.' }
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($Path)
  $hash = [Security.Cryptography.SHA256]::Create()
  $actual = (($hash.ComputeHash($cert.RawData) | ForEach-Object { $_.ToString('x2') }) -join '')
  if ($actual -ne $ExpectedSha256.ToLowerInvariant()) { throw 'The CA certificate SHA-256 fingerprint does not match the pinned Supabase Root 2021 CA. Refusing to continue.' }
  if ($cert.Subject -notmatch '^CN=Supabase Root 2021 CA,' -or $cert.Subject -ne $cert.Issuer) { throw 'The CA certificate is not the self-signed Supabase Root 2021 CA.' }
  if ([DateTime]::UtcNow -lt $cert.NotBefore.ToUniversalTime() -or [DateTime]::UtcNow -gt $cert.NotAfter.ToUniversalTime()) { throw 'The CA certificate is outside its validity period.' }
  "SHA-256 $actual (pinned match), valid until $($cert.NotAfter.ToString('yyyy-MM-dd'))"
}

function Format-PgpassField {
  param([string] $Value)
  $Value.Replace('\', '\\').Replace(':', '\:')
}

function Get-SecurityTarget {
  param([string] $Path)
  if (Test-Path -LiteralPath $Path -PathType Container) { New-Object IO.DirectoryInfo $Path } else { New-Object IO.FileInfo $Path }
}

# Only the DACL (the Access section) is ever requested or written. Reading or writing the SACL (audit rules) needs SeSecurityPrivilege, which a
# normal user token does not have; Get-Acl/Set-Acl are avoided because they operate on the whole descriptor.
function Get-DaclSecurity {
  param([string] $Path)
  (Get-SecurityTarget $Path).GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
}

function Set-OwnerOnlyAcl {
  param([string] $Path)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $target = Get-SecurityTarget $Path
  $acl = Get-DaclSecurity $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))) { [void] $acl.RemoveAccessRuleSpecific($rule) }
  if ($target -is [IO.DirectoryInfo]) {
    $new = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  } else {
    $new = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
  }
  $acl.AddAccessRule($new)
  $target.SetAccessControl($acl)
}

function Assert-OwnerOnlyAcl {
  param([string] $Path)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = Get-DaclSecurity $Path
  # Explicit and inherited rules are both counted: the descriptor must be protected and hold exactly one allow rule for the current user.
  $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  $ok = $acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and
        $rules[0].IdentityReference.Value -eq $sid.Value -and
        $rules[0].AccessControlType -eq 'Allow' -and
        (($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl)
  if (-not $ok) { throw "The ACL on $Path is not owner-only. Refusing to write the password." }
}

function New-SecureWorkDirectory {
  $base = Get-ExportBaseDirectory
  if (-not (Test-Path -LiteralPath $base)) { New-Item -ItemType Directory -Path $base | Out-Null }
  Set-OwnerOnlyAcl $base
  Assert-OwnerOnlyAcl $base
  $dir = Join-Path $base ([Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir | Out-Null
  Set-OwnerOnlyAcl $dir
  Assert-OwnerOnlyAcl $dir
  $dir
}

function New-OwnerOnlyPgpassFile {
  param([string] $Directory, [string] $DbHost, [string] $Port, [string] $Database, [string] $User, [string] $Password)
  if (-not $Password -or $Password -match '[\r\n]') { throw 'The password is empty or contains a line break.' }
  $path = Join-Path $Directory 'pgpass.conf'
  New-Item -ItemType File -Path $path | Out-Null
  Set-OwnerOnlyAcl $path
  Assert-OwnerOnlyAcl $path
  $line = (@($DbHost, $Port, $Database, $User) | ForEach-Object { Format-PgpassField $_ }) -join ':'
  $line = $line + ':' + (Format-PgpassField $Password) + "`n"
  [IO.File]::WriteAllText($path, $line, (New-Object Text.UTF8Encoding($false)))
  $path
}

function Remove-SecureWorkDirectory {
  param([string] $Directory)
  if (-not $Directory -or -not (Test-Path -LiteralPath $Directory)) { return }
  foreach ($file in @(Get-ChildItem -LiteralPath $Directory -File -Force -ErrorAction SilentlyContinue)) {
    try {
      $bytes = New-Object byte[] ([int] $file.Length)
      [IO.File]::WriteAllBytes($file.FullName, $bytes)
    } catch { }
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $Directory -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Directory) { Write-Warning "Could not fully remove $Directory. Delete it yourself (re-run with -Cleanup)." }
}

function ConvertTo-Argument {
  param([string] $Value)
  '"' + $Value.Replace('"', '\"') + '"'
}

function Get-RedactedMessage {
  param([string] $Text, [string[]] $Sensitive)
  foreach ($item in $Sensitive) { if ($item) { $Text = $Text.Replace($item, '<redacted>') } }
  $Text = [regex]::Replace($Text, '\b\d{1,3}(\.\d{1,3}){3}\b', '<ip>')
  $Text = [regex]::Replace($Text, '(?i)\b[0-9a-f:]{2,}:[0-9a-f:]+\b', '<ip>')
  $Text = [regex]::Replace($Text, '(?i)postgres(ql)?://\S+', '<url>')
  $lines = @($Text -split "\r?\n" | Where-Object { $_.Trim() } | Select-Object -First 8 | ForEach-Object { if ($_.Length -gt 300) { $_.Substring(0, 300) } else { $_ } })
  $lines -join [Environment]::NewLine
}

function Invoke-PgDumpSchemaOnly {
  param([string] $PgDump, [string] $DbHost, [string] $Port, [string] $User, [string] $Database, [string] $PassFile, [string] $RawFile, [string] $SslRootCert)
  # Forward slashes avoid backslash escaping in the libpq key/value string; Windows accepts them in file paths.
  $conninfo = "dbname=$Database connect_timeout=20 sslmode=verify-full sslrootcert='" + $SslRootCert.Replace('\', '/').Replace("'", "\'") + "'"
  $arguments = @(
    '--schema-only', '--schema=public', '--format=plain', '--encoding=UTF8', '--quote-all-identifiers',
    '--no-publications', '--no-subscriptions', '--no-security-labels', '--no-tablespaces', '--lock-wait-timeout=30s',
    '--no-password', "--host=$DbHost", "--port=$Port", "--username=$User", "--file=$RawFile", "--dbname=$conninfo"
  )
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $PgDump
  $psi.Arguments = ($arguments | ForEach-Object { ConvertTo-Argument $_ }) -join ' '
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardError = $true
  $psi.RedirectStandardOutput = $true
  foreach ($key in @($psi.EnvironmentVariables.Keys | Where-Object { $_ -like 'PG*' })) { $psi.EnvironmentVariables.Remove($key) }
  $psi.EnvironmentVariables['PGPASSFILE'] = $PassFile
  $process = [Diagnostics.Process]::Start($psi)
  $stderr = $process.StandardError.ReadToEndAsync()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  if (-not $process.WaitForExit(600000)) { try { $process.Kill() } catch { }; return @{ ExitCode = 124; Stderr = 'pg_dump timed out after 10 minutes and was stopped.' } }
  $process.WaitForExit()
  [void] $stdout.Result
  @{ ExitCode = $process.ExitCode; Stderr = $stderr.Result }
}

function Invoke-ProductionSchemaExport {
  if (-not (Test-Path 'package.json') -or -not (Test-Path 'supabase/staging/source')) { throw 'Run this from the repository root.' }
  $base = Get-ExportBaseDirectory
  if ($Cleanup) { Remove-SecureWorkDirectory $base; Write-Host 'Cleanup finished.'; return 0 }
  if ((Test-Path -LiteralPath $base) -and @(Get-ChildItem -LiteralPath $base -Force).Count -gt 0) { throw "A previous run left files in $base. Re-run with -Cleanup first." }
  if (Test-Path $OutFile) { throw "$OutFile already exists. Review and move it first; this script never overwrites a dump." }

  $DbHost = "$DbHost".Trim().ToLowerInvariant()
  $user = "postgres.$ProductionRef"
  Assert-SessionPoolerTarget -DbHost $DbHost -Port $script:Port -User $user -ProductionRef $ProductionRef -StagingRef $StagingRef
  $version = Assert-PgDumpVersion -PgDump $PgDump -ExpectedVersion $ExpectedPgDumpVersion
  $caInfo = Assert-SupabaseRootCa -Path $SslRootCert -ExpectedSha256 $ExpectedCaSha256

  Write-Host "Target: production $ProductionRef, Session pooler $DbHost, port $($script:Port), database $($script:Database), user $user, schema public, schema-only."
  Write-Host "Tool:   $version"
  Write-Host "TLS:    sslmode=verify-full with CA $SslRootCert"
  Write-Host "CA:     $caInfo"
  Write-Host "Output: $OutFile"
  if ($PreflightOnly) { Write-Host 'PREFLIGHT OK. No password was requested and no connection was made.'; return 0 }

  $answer = Read-Host 'Type CONNECT TO PRODUCTION to continue (anything else stops)'
  if ($answer -cne 'CONNECT TO PRODUCTION') { Write-Host 'Stopped. Nothing was contacted.'; return 3 }

  $secure = Read-Host 'Database password (hidden)' -AsSecureString
  $plain = $null; $workDir = $null; $exitCode = 1
  try {
    $plain = [System.Net.NetworkCredential]::new('', $secure).Password
    $workDir = New-SecureWorkDirectory
    $passFile = New-OwnerOnlyPgpassFile -Directory $workDir -DbHost $DbHost -Port $script:Port -Database $script:Database -User $user -Password $plain
    $rawFile = Join-Path $workDir 'raw_public_schema.sql'
    $result = Invoke-PgDumpSchemaOnly -PgDump $PgDump -DbHost $DbHost -Port $script:Port -User $user -Database $script:Database -PassFile $passFile -RawFile $rawFile -SslRootCert $SslRootCert

    if ($result.ExitCode -ne 0) {
      Write-Host "Export FAILED (pg_dump exit $($result.ExitCode)). Redacted error text:"
      Write-Host (Get-RedactedMessage -Text $result.Stderr -Sensitive @($plain, $DbHost, $user, $ProductionRef))
      $exitCode = $result.ExitCode
    } else {
      $text = [IO.File]::ReadAllText($rawFile)
      if (-not $text.Trim()) { throw 'pg_dump produced an empty file.' }
      if ($text.Contains($plain)) { $exitCode = 2; Write-Host 'The dump contained the password text. It was discarded. Do not share anything.' }
      elseif ($text -notmatch '(?m)^-- Dumped from database version 17\.') { $exitCode = 4; Write-Host 'The dump header does not record PostgreSQL 17.x. It was discarded.' }
      elseif ($text -notmatch ('(?m)^-- Dumped by pg_dump version ' + [regex]::Escape($ExpectedPgDumpVersion) + '\b')) { $exitCode = 4; Write-Host "The dump header does not record pg_dump $ExpectedPgDumpVersion. It was discarded." }
      else {
        $clean = (($text -split "\r?\n") | Where-Object { $_ -notmatch '^\\(un)?restrict(\s|$)' }) -join "`n"
        $stream = [IO.File]::Open((Join-Path (Get-Location) $OutFile), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        try { $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($clean); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        Write-Host "Export written to $OutFile ($((Get-Item $OutFile).Length) bytes). Only \restrict/\unrestrict meta-command lines were removed. Next: npm run schema:validate"
        $exitCode = 0
      }
    }
  } catch {
    Write-Host "Export FAILED before or during processing: $(Get-RedactedMessage -Text $_.Exception.Message -Sensitive @($plain, $DbHost, $user, $ProductionRef))"
  } finally {
    Remove-SecureWorkDirectory $workDir
    $plain = $null; $secure.Dispose(); [GC]::Collect()
  }
  return $exitCode
}

if ($MyInvocation.InvocationName -eq '.') { return }
try { $code = Invoke-ProductionSchemaExport } catch { Write-Host "Stopped: $($_.Exception.Message)"; $code = 1 }
exit $code
