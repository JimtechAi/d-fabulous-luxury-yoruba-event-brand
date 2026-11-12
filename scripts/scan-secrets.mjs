// Secret scanner. Reports file:line and rule name only; matched values are never printed.
//
// Usage:
//   node scripts/scan-secrets.mjs            scan the working tree (tracked + untracked, git-ignored files excluded)
//   node scripts/scan-secrets.mjs --dist     additionally scan dist/ browser bundles, including a literal-value
//                                            check against the secrets in local (git-ignored) .env files
//   node scripts/scan-secrets.mjs --history  additionally scan every blob in git history
// Exit code 1 when a finding is reported.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|mp4|webm|mov|m4v|ogg|woff2?|ttf|otf|pdf|zip|gz|lock|lockb)$/i;
const PLACEHOLDER = /(your[-_ a-z]*|example|placeholder|changeme|xxxx|<[^>]+>|\.\.\.|redacted|not-a-secret|dummy)/i;
const IGNORE_MARKER = 'scan-secrets:ignore';
const SELF = 'scripts/scan-secrets.mjs';

const rules = [
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { id: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { id: 'supabase-access-token', re: /\bsbp_[a-f0-9]{30,}/ },
  { id: 'resend-api-key', re: /\bre_[A-Za-z0-9]{8,}_?[A-Za-z0-9]{12,}/ },
  { id: 'stripe-live-key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  {
    id: 'secret-assignment',
    re: /\b(?:[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|API_KEY|PASSWORD|OIDC_TOKEN|ACCESS_TOKEN)[A-Z0-9_]*)\s*[=:]\s*["']?([A-Za-z0-9_\-.+/=]{24,})/,
    group: 1,
  },
];

const findings = [];

function report(file, line, rule) {
  findings.push({ file, line, rule });
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function scanText(file, text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.length > 20000) line = line.slice(0, 20000);
    if (line.includes(IGNORE_MARKER)) return;
    for (const rule of rules) {
      const match = rule.re.exec(line);
      if (!match) continue;
      const value = rule.group ? match[rule.group] : match[0];
      if (PLACEHOLDER.test(line) || PLACEHOLDER.test(value)) continue;
      report(file, index + 1, rule.id);
    }
    const jwts = line.match(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || [];
    for (const token of jwts) {
      const role = jwtRole(token);
      if (role === 'service_role') report(file, index + 1, 'supabase-service-role-jwt');
      else if (role && role !== 'anon') report(file, index + 1, `jwt-role-${role}`);
    }
  });
}

function listWorkingTreeFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function scanWorkingTree() {
  for (const file of listWorkingTreeFiles()) {
    const normalised = file.replace(/\\/g, '/');
    if (normalised === SELF || BINARY_EXT.test(normalised) || !existsSync(join(root, file))) continue;
    const path = join(root, file);
    if (statSync(path).size > MAX_FILE_BYTES) continue;
    scanText(normalised, readFileSync(path, 'utf8'));
  }
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (/\.(js|mjs|cjs|css|html|map|json|txt)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

// Collects secret values from local git-ignored env files so the bundle can be checked for
// their literal presence. Values are kept in memory only and never printed.
function localSecretValues() {
  const names = /(SERVICE_ROLE|SECRET|RESEND_API_KEY|OIDC_TOKEN|PASSWORD|ACCESS_TOKEN)/i;
  const values = [];
  const candidates = ['.env', '.env.local', '.env.production', 'supabase/functions/.env'];
  for (const file of candidates) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match || !names.test(match[1])) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (value.length >= 16) values.push({ name: match[1], value });
    }
  }
  return values;
}

function scanDist() {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('dist/ not found. Run the production build first.');
    process.exitCode = 2;
    return;
  }
  const secrets = localSecretValues();
  const forbiddenNames = /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|SUPABASE_SECRET_KEYS|VERCEL_OIDC_TOKEN/;
  for (const path of walk(dist)) {
    const file = relative(root, path).replace(/\\/g, '/');
    const text = readFileSync(path, 'utf8');
    scanText(file, text);
    // dist/server.cjs is the Node backend bundle (never served; see server.ts) and legitimately reads server env vars.
    if (!/(^|\/)server\.cjs(\.map)?$/.test(file) && forbiddenNames.test(text)) report(file, 0, 'server-secret-variable-name-in-bundle');
    for (const secret of secrets) {
      if (text.includes(secret.value)) report(file, 0, `local-secret-value-in-bundle:${secret.name}`);
    }
  }
}

function scanHistory() {
  return new Promise((resolve) => {
    const child = spawn('git', ['log', '--all', '-p', '--no-color', '--format=commit %h'], { cwd: root });
    let commit = '';
    let file = '';
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('commit ')) commit = line.slice(7);
        else if (line.startsWith('+++ ')) file = line.slice(6);
        else if (line.startsWith('+') && !BINARY_EXT.test(file)) scanText(`history:${commit}:${file}`, line.slice(1));
      }
    });
    child.on('close', resolve);
  });
}

scanWorkingTree();
if (args.has('--dist')) scanDist();
if (args.has('--history')) await scanHistory();

if (findings.length === 0) {
  console.log('Secret scan: no findings.');
} else {
  const seen = new Set();
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${finding.rule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`FINDING ${finding.rule} at ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
  }
  console.log(`Secret scan: ${seen.size} finding(s). Values are intentionally not printed.`);
  process.exitCode = 1;
}
