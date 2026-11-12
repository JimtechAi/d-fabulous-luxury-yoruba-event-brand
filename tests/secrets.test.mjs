// Verifies the secret scanner (scripts/scan-secrets.mjs) in an isolated temporary git repository,
// and verifies that .gitignore keeps every environment file out of version control.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scanner = join(repoRoot, 'scripts', 'scan-secrets.mjs');

function scan(cwd, ...args) {
  return spawnSync(process.execPath, [scanner, ...args], { cwd, encoding: 'utf8' });
}

function makeRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dfab-scan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

const fakeJwt = (role) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.${'s'.repeat(20)}`;
};

test('scanner reports service-role JWTs, Resend keys and secret assignments without printing values', () => {
  const resendKey = `re_${'A1b2C3d4'.repeat(4)}`;
  const serviceJwt = fakeJwt('service_role');
  const dir = makeRepo({
    'src/leak.ts': `const a = '${serviceJwt}';\nconst b = '${resendKey}';\n`,
    'config.txt': 'SUPABASE_SERVICE_ROLE_KEY=abcdefghijklmnopqrstuvwxyz0123456789\n', // scan-secrets:ignore
  });
  try {
    const result = scan(dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /supabase-service-role-jwt at src\/leak\.ts:1/);
    assert.match(result.stdout, /resend-api-key at src\/leak\.ts:2/);
    assert.match(result.stdout, /secret-assignment at config\.txt:1/);
    assert.ok(!result.stdout.includes(resendKey) && !result.stdout.includes(serviceJwt), 'values must never be printed');
    assert.ok(!result.stdout.includes('abcdefghijklmnopqrstuvwxyz0123456789'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanner accepts placeholders, public anon JWTs and git-ignored env files', () => {
  const dir = makeRepo({
    '.gitignore': '.env\n',
    '.env.example': 'SUPABASE_SERVICE_ROLE_KEY="your-server-only-service-role-key"\nRESEND_API_KEY=re_your_resend_api_key_here\n',
    '.env': 'SUPABASE_SERVICE_ROLE_KEY=abcdefghijklmnopqrstuvwxyz0123456789\n', // scan-secrets:ignore
    'src/public.ts': `const anon = '${fakeJwt('anon')}';\n`,
  });
  try {
    const result = scan(dir);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /no findings/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanner --dist flags server secret names and literal local secret values in the browser bundle', () => {
  const secret = 'local-secret-value-0123456789abcdef';
  const dir = makeRepo({
    '.gitignore': '.env\ndist/\n',
    '.env': `RESEND_API_KEY=${secret}\n`,
    'dist/assets/index.js': `console.log('${secret}');\n`,
  });
  try {
    const result = scan(dir, '--dist');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /local-secret-value-in-bundle:RESEND_API_KEY/);
    assert.ok(!result.stdout.includes(secret));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('.gitignore excludes every environment file but keeps placeholder templates trackable', () => {
  const ignored = ['.env', '.env.local', '.env.production', '.env.development.local', 'supabase/functions/.env', 'supabase/functions/dfabulous-api/.env', 'supabase/.env.local', 'supabase/.temp/cli-latest'];
  const allowed = ['.env.example', 'supabase/functions/.env.example'];
  for (const path of ignored) {
    const result = spawnSync('git', ['check-ignore', '-q', path], { cwd: repoRoot });
    assert.equal(result.status, 0, `${path} must be git-ignored`);
  }
  for (const path of allowed) {
    const result = spawnSync('git', ['check-ignore', '-q', path], { cwd: repoRoot });
    assert.equal(result.status, 1, `${path} must remain trackable`);
  }
});

test('no environment file is tracked by git (other than placeholder templates)', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).split(/\r?\n/);
  const offenders = tracked.filter((file) => /(^|\/)\.env/.test(file) && !/\.env\.example$/.test(file));
  assert.deepEqual(offenders, []);
});

test('the working tree (including .env.example templates) has no secret findings', () => {
  const result = spawnSync(process.execPath, [scanner], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
});
