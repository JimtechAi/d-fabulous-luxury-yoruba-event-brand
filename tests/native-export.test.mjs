// Static and local-only tests for scripts/export-production-schema-native.ps1 (the native Windows pg_dump export helper).
// Nothing here connects to a database. The functional test uses an obviously fake password, assembled at runtime, in a temporary folder.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateDump } from '../scripts/schema-export.mjs';

// Public certificate "Supabase Root 2021 CA" (not a secret), identical to https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
const ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

const scriptPath = fileURLToPath(new URL('../scripts/export-production-schema-native.ps1', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');
const runbook = readFileSync(new URL('../supabase/staging/source/README.md', import.meta.url), 'utf8');
const code = script.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const isWindows = process.platform === 'win32';

describe('native export helper: pg_dump invocation', () => {
  test('exports only the public schema, schema-only, plain format, without prompting for a password', () => {
    for (const flag of ["'--schema-only'", "'--schema=public'", "'--format=plain'", "'--quote-all-identifiers'", "'--no-publications'", "'--no-subscriptions'", "'--no-password'"]) {
      assert.ok(code.includes(flag), `missing ${flag}`);
    }
    assert.doesNotMatch(code, /--quote-all-identifier(?!s)/, 'the singular spelling is not the documented option');
    for (const forbidden of ['--data-only', '--role-only', '--clean', '--create', '--inserts', '--column-inserts', '--use-copy', '--verbose', ' -v ', '--password', '--format=custom', '-Fc']) {
      assert.ok(!code.includes(forbidden), `must not contain ${forbidden}`);
    }
  });

  test('uses no container runtime, Supabase CLI, psql, pg_restore or SQL execution', () => {
    for (const forbidden of [/docker/i, /podman/i, /supabase@/i, /npx\b/, /\bpsql\b/i, /pg_restore/i, /Invoke-Sqlcmd/i, /Invoke-Expression|\biex\b/i, /Start-Transcript/i]) {
      assert.doesNotMatch(code, forbidden);
    }
  });

  test('exactly one process is started, it is pg_dump, and no check executes pg_dump', () => {
    assert.equal((code.match(/\[Diagnostics\.Process\]::Start/g) ?? []).length, 1);
    assert.equal((code.match(/Start-Process/g) ?? []).length, 0);
    assert.equal((code.match(/& \$PgDump\b/g) ?? []).length, 0, 'preflight reads the version resource instead of running pg_dump --version');
    assert.doesNotMatch(code, /pg_dumpall|--version/);
    assert.match(code, /\.VersionInfo/);
    assert.match(code, /\$ExpectedPgDumpVersion = '17\.11'/);
    assert.match(code, /-- Dumped by pg_dump version/, 'the dump header must also record the expected pg_dump version');
  });

  test('TLS is always sslmode=verify-full with the pinned Supabase Root 2021 CA; weaker modes are absent', () => {
    assert.match(code, /sslmode=verify-full sslrootcert='/);
    assert.doesNotMatch(code, /sslmode=(require|prefer|allow|disable|verify-ca)/);
    assert.match(code, /\$ExpectedCaSha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa'/);
    assert.ok(code.indexOf('Assert-SupabaseRootCa -Path $SslRootCert') < code.indexOf("Read-Host 'Type CONNECT TO PRODUCTION"), 'the CA is verified before any prompt');
    assert.match(code, /PRIVATE KEY/);
  });

  test('scope is public schema only: exactly one --schema, no exclusions, no data, no roles, no managed schemas named', () => {
    assert.equal((code.match(/--schema=/g) ?? []).length, 1);
    assert.match(code, /'--schema=public'/);
    for (const forbidden of ['--exclude-schema', '--table=', '--extension', '--blobs', '--large-objects', '--globals-only', '--roles-only', '--no-owner', '--no-privileges', 'pg_cron', 'auth.users', 'storage.objects']) {
      assert.ok(!code.includes(forbidden), `must not contain ${forbidden}`);
    }
  });

  test('the connection method cannot create a database role: no Management API, access token, Supabase CLI or SQL', () => {
    for (const forbidden of [/api\.supabase\.com/i, /access[_-]?token/i, /SUPABASE_/i, /CREATE\s+ROLE/i, /Invoke-RestMethod|Invoke-WebRequest|\bcurl\b/i, /System\.Net\.Sockets|TcpClient|Resolve-DnsName/i]) {
      assert.doesNotMatch(code, forbidden);
    }
  });

  test('the target is pinned: confirmed Session pooler host, port 5432, database, fixed user, guards for staging, Direct and the Transaction pooler', () => {
    assert.match(code, /\$DbHost\s+= 'aws-1-eu-west-1\.pooler\.supabase\.com'/);
    assert.match(code, /\$script:Port\s+= '5432'/);
    assert.match(code, /\$script:Database = 'postgres'/);
    assert.match(code, /\$user = "postgres\.\$ProductionRef"/);
    assert.match(code, /\$ProductionRef = 'fbhqegevyvpyzjoslblf'/);
    for (const guard of ['This looks like STAGING', 'Transaction pooler', 'Direct connection host', 'pooler\\.supabase\\.com', 'eu-west-1', "-cne \"postgres.$ProductionRef\""]) {
      assert.ok(code.includes(guard), guard);
    }
    assert.match(code, /Test-Path \$OutFile\)\s*\{\s*throw[^}]*never overwrites/);
    assert.match(code, /CreateNew/);
  });
});

describe('native export helper: credential handling', () => {
  test('the password is never placed on a command line, in an environment variable, a URL or a log line', () => {
    assert.doesNotMatch(code, /PGPASSWORD/i);
    assert.doesNotMatch(code, /postgres(ql)?:\/\/(?!\\S)/i, 'no connection string is built');
    assert.doesNotMatch(code, /\$env:|SetEnvironmentVariable|setx\b/i, 'no environment variable is created or modified');
    assert.doesNotMatch(code, /Write-(Host|Output|Verbose|Debug|Warning|Error)(?![^\n]*Get-RedactedMessage)[^\n]*\$(plain|secure|Password)\b/i);
    assert.doesNotMatch(code, /\$arguments[^\n]*\$(plain|Password)\b|\$psi\.Arguments[^\n]*\$(plain|Password)\b/);
    assert.match(code, /Read-Host 'Database password \(hidden\)' -AsSecureString/);
  });

  test('only the pgpass path reaches the child process, and every inherited PG* variable is removed first', () => {
    assert.match(code, /\$_ -like 'PG\*'\s*\}\)\)\s*\{\s*\$psi\.EnvironmentVariables\.Remove/);
    assert.match(code, /\$psi\.EnvironmentVariables\['PGPASSFILE'\] = \$PassFile/);
    assert.equal((code.match(/EnvironmentVariables\[/g) ?? []).length, 1);
  });

  test('ACL handling never requests audit rules (SACL / SeSecurityPrivilege) and keeps the strict DACL checks', () => {
    assert.doesNotMatch(code, /Get-Acl|Set-Acl/, 'whole-descriptor cmdlets are avoided');
    assert.doesNotMatch(code, /GetAuditRules|AddAuditRule|RemoveAuditRule|SetAuditRule|AccessControlSections\]::(All|Audit)|\bSacl\b|SeSecurityPrivilege\s*\)/i);
    assert.equal((code.match(/GetAccessControl\(/g) ?? []).length, 1, 'one read path');
    assert.match(code, /GetAccessControl\(\[Security\.AccessControl\.AccessControlSections\]::Access\)/);
    assert.match(code, /\$target\.SetAccessControl\(\$acl\)/);
    assert.equal((code.match(/GetAccessRules\(\$true, \$true, \[Security\.Principal\.SecurityIdentifier\]\)/g) ?? []).length, 2, 'explicit and inherited rules are both counted when asserting and when clearing');
    assert.match(code, /\$acl\.AreAccessRulesProtected -and \$rules\.Count -eq 1/);
    assert.match(code, /AccessControlType -eq 'Allow'/);
    assert.match(code, /FullControl/);
  });

  test('the password file is owner-only, outside the repository, verified before the password is written, and wiped afterwards', () => {
    assert.match(code, /GetFolderPath\('LocalApplicationData'\)/);
    const create = code.indexOf('function New-OwnerOnlyPgpassFile');
    const body = code.slice(create, code.indexOf('function Remove-SecureWorkDirectory'));
    assert.ok(body.indexOf('Assert-OwnerOnlyAcl $path') < body.indexOf('WriteAllText'), 'ACL is verified before the password is written');
    assert.match(code, /SetAccessRuleProtection\(\$true, \$false\)/);
    assert.match(code, /UTF8Encoding\(\$false\)/, 'no byte-order mark, which would corrupt the first pgpass field');
    assert.match(code, /finally \{\s*Remove-SecureWorkDirectory \$workDir/);
    assert.match(code, /WriteAllBytes\(\$file\.FullName, \$bytes\)/, 'overwritten with zeros before delete');
  });

  test('failure text is redacted and the dump is rejected if it contains the password', () => {
    assert.match(code, /Get-RedactedMessage -Text \$result\.Stderr -Sensitive @\(\$plain, \$DbHost, \$user, \$ProductionRef\)/);
    assert.match(code, /\$text\.Contains\(\$plain\)/);
    assert.match(code, /Dumped from database version 17/);
  });

  test('the owner must type a confirmation phrase before any password prompt or connection', () => {
    assert.ok(code.indexOf('CONNECT TO PRODUCTION') < code.indexOf("Read-Host 'Database password (hidden)'"));
    assert.ok(code.indexOf('$PreflightOnly) {') < code.indexOf("Read-Host 'Database password (hidden)'"));
  });

  test('the script and runbook contain no credential-looking value', () => {
    for (const text of [script, runbook]) {
      assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/);
      assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_-]{8,}/);
      assert.doesNotMatch(text, /postgres(ql)?:\/\/[^\s:@/]+:[^\s@]+@/i);
    }
  });
});

describe('native export helper: what the downstream validator would accept or reject', () => {
  const header = '-- Dumped from database version 17.11\n-- Dumped by pg_dump version 17.11\nSET statement_timeout = 0;\nSELECT pg_catalog.set_config(\'search_path\', \'\', false);\n';
  const table = 'CREATE TABLE "public"."services" (\n    "id" "uuid" NOT NULL,\n    "name" "text" NOT NULL\n);\nALTER TABLE "public"."services" OWNER TO "postgres";\nALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;\n';
  const failing = (text) => validateDump(text).checks.filter((check) => check.status === 'FAIL').map((check) => check.id);

  test('a public-only schema-only dump in the native pg_dump 17.11 format has no blocking finding', () => {
    assert.deepEqual(failing(header + table), []);
  });

  for (const [name, extra, id] of [
    ['row data (COPY)', 'COPY "public"."services" ("id") FROM stdin;\n1\n\\.\n', 1],
    ['row data (INSERT)', 'INSERT INTO "public"."services" ("id") VALUES (1);\n', 1],
    ['Auth user data', 'COPY "auth"."users" ("id") FROM stdin;\n1\n\\.\n', 1],
    ['the auth schema and users table', 'CREATE SCHEMA "auth";\nCREATE TABLE "auth"."users" ("id" "uuid");\n', 5],
    ['Storage objects', 'CREATE TABLE "storage"."objects" ("id" "uuid");\n', 5],
    ['pg_cron', 'CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";\n', 8],
    ['custom roles', 'CREATE ROLE "app_reader";\n', 3],
  ]) {
    test(`rejects ${name}`, () => assert.ok(failing(header + table + extra).includes(id), `${name} -> check ${id}`));
  }

  test('the helper removes only \\restrict / \\unrestrict meta-command lines, which the validator reports as REVIEW', () => {
    assert.match(code, /-notmatch '\^\\\\\(un\)\?restrict\(\\s\|\$\)'/);
    const withRestrict = validateDump(`\\restrict abc123\n${header}${table}\\unrestrict abc123\n`);
    assert.equal(withRestrict.checks.find((check) => check.id === 11).status, 'REVIEW');
  });
});

describe('native export helper: documented in the runbook', () => {
  test('the runbook describes the native workflow and its forbidden options', () => {
    assert.match(runbook, /export-production-schema-native\.ps1/);
    assert.match(runbook, /Native Windows pg_dump workflow/);
    assert.match(runbook, /Session pooler/);
    assert.match(runbook, /-PreflightOnly/);
  });
});

describe('native export helper: local behaviour (Windows only, no network)', { skip: !isWindows }, () => {
  const ps = (command, env = {}) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', env: { ...process.env, ...env } });

  test('parses without errors under Windows PowerShell', () => {
    const out = ps(`$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/'/g, "''")}',[ref]$t,[ref]$e);$e.Count`);
    assert.equal(out.trim(), '0');
  });

  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const caDir = mkdtempSync(join(tmpdir(), 'native-export-ca-'));
  const caPath = join(caDir, 'prod-ca-2021.crt');
  writeFileSync(caPath, ROOT_CA_PEM);
  after(() => rmSync(caDir, { recursive: true, force: true }));
  const runScript = (extra = []) => {
    const outArgs = extra.includes('-OutFile') ? [] : ['-OutFile', join(caDir, 'preflight-output-never-written.sql')];
    const caArgs = extra.includes('-SslRootCert') ? [] : ['-SslRootCert', caPath];
    try {
      return { code: 0, out: execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PreflightOnly', ...caArgs, ...outArgs, ...extra], { encoding: 'utf8', stdio: 'pipe', cwd }) };
    } catch (error) { return { code: error.status, out: `${error.stdout}${error.stderr}` }; }
  };

  test('the public CA fixture has the pinned SHA-256 fingerprint and the independently confirmed value', () => {
    const der = Buffer.from(ROOT_CA_PEM.replace(/-----[A-Z ]+-----|\s/g, ''), 'base64');
    assert.equal(createHash('sha256').update(der).digest('hex'), '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa');
    assert.match(script, /807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa/);
  });

  test('preflight with the confirmed defaults passes: pooler host, port, database, user, 17.11 from file metadata, verify-full CA; asks for no password', () => {
    const ok = runScript();
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Session pooler aws-1-eu-west-1\.pooler\.supabase\.com, port 5432, database postgres, user postgres\.fbhqegevyvpyzjoslblf, schema public, schema-only/);
    assert.match(ok.out, /pg_dump \(PostgreSQL\) 17\.11/);
    assert.match(ok.out, /sslmode=verify-full with CA/);
    assert.match(ok.out, /\(pinned match\)/);
    assert.match(ok.out, /PREFLIGHT OK\. No password was requested and no connection was made/);
  });

  test('preflight rejects Direct, Transaction pooler, wrong region and staging hosts, a wrong fingerprint, a missing or wrong CA file, a wrong pg_dump version and an existing output file', () => {
    for (const bad of ['db.fbhqegevyvpyzjoslblf.supabase.co', 'aws-0-us-east-1.pooler.supabase.com', 'aws-1-eu-west-1.pooler.supabase.com.example.org', 'aws-1-eu-west-1.pooler.supabase.com:6543', 'db.qwoxxroszmwobnzqgndr.supabase.co']) {
      assert.equal(runScript(['-DbHost', bad]).code, 1, bad);
    }
    assert.equal(runScript(['-PgDump', 'C:\\does-not-exist\\pg_dump.exe']).code, 1);
    assert.equal(runScript(['-ExpectedPgDumpVersion', '17.10']).code, 1, 'exact version is enforced');
    assert.equal(runScript(['-OutFile', 'package.json']).code, 1, 'never overwrites an existing file');
    assert.equal(runScript(['-ExpectedCaSha256', '0'.repeat(64)]).code, 1, 'fingerprint pin');
    assert.equal(runScript(['-SslRootCert', join(caDir, 'missing.crt')]).code, 1, 'verify-full needs the CA file');
    assert.equal(runScript(['-SslRootCert', join(cwd, 'package.json')]).code, 1, 'not a certificate');
    const withKey = join(caDir, 'with-key.crt');
    writeFileSync(withKey, `${ROOT_CA_PEM}-----BEGIN ${'PRIVATE'} KEY-----\nAAAA\n-----END ${'PRIVATE'} KEY-----\n`);
    assert.equal(runScript(['-SslRootCert', withKey]).code, 1, 'private key material is refused');
    const twoCerts = join(caDir, 'two.crt');
    writeFileSync(twoCerts, ROOT_CA_PEM + ROOT_CA_PEM);
    assert.equal(runScript(['-SslRootCert', twoCerts]).code, 1, 'exactly one certificate');
  });

  test('the password file is owner-only, correctly escaped, free of a byte-order mark, and wiped on removal (fake password)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-export-'));
    try {
      const fake = ['fake', 'pw:with', 'back\\slash'].join('-');
      const out = ps(`. '${scriptPath.replace(/'/g, "''")}'
        $d = Join-Path '${dir.replace(/'/g, "''")}' 'work'
        New-Item -ItemType Directory -Path $d | Out-Null
        Set-OwnerOnlyAcl $d; Assert-OwnerOnlyAcl $d
        $f = New-OwnerOnlyPgpassFile -Directory $d -DbHost 'aws-0-eu-west-1.pooler.supabase.com' -Port '5432' -Database 'postgres' -User 'postgres.example' -Password ([Environment]::GetEnvironmentVariable('NATIVE_TEST_FAKE'))
        Assert-OwnerOnlyAcl $f
        $rules = @((Get-DaclSecurity $f).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        $bytes = [IO.File]::ReadAllBytes($f)
        'RULES=' + $rules.Count
        'BOM=' + ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF)
        'LINE=' + [Text.Encoding]::UTF8.GetString($bytes).TrimEnd("\`n")
        Remove-SecureWorkDirectory $d
        'GONE=' + (-not (Test-Path -LiteralPath $d))`, { NATIVE_TEST_FAKE: fake });
      assert.match(out, /RULES=1/);
      assert.match(out, /BOM=False/);
      assert.match(out, /LINE=aws-0-eu-west-1\.pooler\.supabase\.com:5432:postgres:postgres\.example:fake-pw\\:with-back\\\\slash/);
      assert.match(out, /GONE=True/);
      assert.deepEqual(readdirSync(dir), []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('the DACL is owner-only after Set-OwnerOnlyAcl, the owner is untouched, and weakened ACLs are still rejected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-export-'));
    try {
      const out = ps(`. '${scriptPath.replace(/'/g, "''")}'
        $root = '${dir.replace(/'/g, "''")}'
        $d = Join-Path $root 'work'; New-Item -ItemType Directory -Path $d | Out-Null
        $f = Join-Path $d 'f.txt'; New-Item -ItemType File -Path $f | Out-Null
        function Try-Assert($p) { try { Assert-OwnerOnlyAcl $p; 'PASS' } catch { 'REJECT' } }
        'FRESH_FILE_INHERITED=' + (Try-Assert $f)
        'FRESH_DIR_INHERITED=' + (Try-Assert $d)
        $ownerBefore = (New-Object IO.FileInfo $f).GetAccessControl('Owner').GetOwner([Security.Principal.SecurityIdentifier]).Value
        Set-OwnerOnlyAcl $d; Set-OwnerOnlyAcl $f
        'DIR_AFTER=' + (Try-Assert $d)
        'FILE_AFTER=' + (Try-Assert $f)
        'OWNER_UNCHANGED=' + ($ownerBefore -eq (New-Object IO.FileInfo $f).GetAccessControl('Owner').GetOwner([Security.Principal.SecurityIdentifier]).Value)
        'AUDIT_RULES_REQUESTED=' + [bool]((Get-DaclSecurity $f).GetAuditRules($true,$true,[Security.Principal.SecurityIdentifier]).Count)
        $info = New-Object IO.FileInfo $f
        $weak = $info.GetAccessControl('Access')
        $users = New-Object Security.Principal.SecurityIdentifier ([Security.Principal.WellKnownSidType]::BuiltinUsersSid, $null)
        $weak.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'Read', 'Allow')))
        $info.SetAccessControl($weak)
        'EXTRA_RULE=' + (Try-Assert $f)
        $unprotected = $info.GetAccessControl('Access'); $unprotected.SetAccessRuleProtection($false, $true); $info.SetAccessControl($unprotected)
        'UNPROTECTED=' + (Try-Assert $f)`);
      assert.match(out, /FRESH_FILE_INHERITED=REJECT/);
      assert.match(out, /FRESH_DIR_INHERITED=REJECT/);
      assert.match(out, /DIR_AFTER=PASS/);
      assert.match(out, /FILE_AFTER=PASS/);
      assert.match(out, /OWNER_UNCHANGED=True/);
      assert.match(out, /EXTRA_RULE=REJECT/);
      assert.match(out, /UNPROTECTED=REJECT/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('redaction removes the host, user, password, IP addresses and URLs from error text', () => {
    const out = ps(`. '${scriptPath.replace(/'/g, "''")}'
      Get-RedactedMessage -Text 'connection to server at "h.example" (10.1.2.3), port 5432 failed: FATAL: password authentication failed for user "u.ref" with pw-123 postgresql://a:b@c/d' -Sensitive @('pw-123','h.example','u.ref')`);
    assert.doesNotMatch(out, /pw-123|h\.example|u\.ref|10\.1\.2\.3|postgresql:\/\//);
    assert.match(out, /password authentication failed/);
  });

  test('no work directory is left behind in the real export base folder by these tests', () => {
    const base = ps(`. '${scriptPath.replace(/'/g, "''")}'; Get-ExportBaseDirectory`).trim();
    assert.ok(!existsSync(base) || readdirSync(base).length === 0);
  });
});
