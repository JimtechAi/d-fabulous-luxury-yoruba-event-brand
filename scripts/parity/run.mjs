// Differential parity driver: starts the Express backend (Node) and the Edge Function (Deno) as separate processes, each wired to its own instance of the shared
// fake Supabase, replays every scenario against both, and compares status, headers, body, database operations (credential class, table, filters, payload),
// auth calls, e-mail requests and the resulting database state. Nothing here touches the network beyond 127.0.0.1, and no real credential exists in the process.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { IDS } from './fake-supabase.mjs';
import { CONFIGS, SCENARIOS } from './scenarios.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;
const KNOWN_IDS = new Set(Object.values(IDS));
const COMPARED_HEADERS = ['content-type', 'retry-after', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods', 'access-control-allow-headers', 'vary', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'content-security-policy', 'strict-transport-security'];

export function normalise(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => normalise(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, normalise(v, k)]));
  if (typeof value === 'string') {
    if (UUID.test(value)) return KNOWN_IDS.has(value) ? value : '<new-id>';
    if (ISO.test(value)) return '<ts>';
    return value.replace(/\s+/g, ' ').trim();
  }
  return value;
}
const stable = (v) => JSON.stringify(normalise(v));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, ms = 60000, child) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`host exited early (code ${child.exitCode})`);
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function startHost(kind, overrides = {}) {
  const port = await freePort(); const control = await freePort();
  const env = { ...process.env, PORT: String(port), CONTROL_PORT: String(control), PARITY_ENV_OVERRIDES: JSON.stringify(overrides) };
  const [cmd, args, prefix] = kind === 'express'
    ? [process.execPath, ['--import', 'tsx', 'scripts/parity/express-host.mjs'], '']
    : [process.env.DENO_PATH || 'deno', ['run', '--allow-env', '--allow-net', '--allow-read', '--no-prompt', '--config', 'supabase/functions/dfabulous-api/deno.json', 'scripts/parity/edge-host.ts'], '/dfabulous-api'];
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  await waitFor(`http://127.0.0.1:${port}${prefix}/api/health`, 90000, child).catch((e) => { child.kill(); throw new Error(`${kind}: ${e.message}\n${out.slice(-1500)}`); });
  return {
    kind, base: `http://127.0.0.1:${port}${prefix}`, control: `http://127.0.0.1:${control}`, child, output: () => out,
    stop: () => new Promise((resolve) => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); setTimeout(resolve, 3000); }),
  };
}

async function send(host, scenario, ip) {
  const headers = { 'user-agent': 'parity-test', 'x-forwarded-for': ip, accept: 'application/json' };
  if (scenario.token) headers.authorization = `Bearer ${scenario.token}`;
  if (scenario.rawAuth) headers.authorization = scenario.rawAuth;
  if (scenario.origin) headers.origin = scenario.origin;
  Object.assign(headers, scenario.extraHeaders ?? {});
  let body;
  if (scenario.raw !== undefined) { body = scenario.raw; headers['content-type'] = 'application/json'; }
  else if (scenario.body !== undefined) { body = JSON.stringify(scenario.body); headers['content-type'] = 'application/json'; }
  const res = await fetch(`${host.base}${scenario.path}`, { method: scenario.method, headers, body, redirect: 'manual' });
  const text = await res.text();
  let parsed; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 200); }
  const h = {}; for (const name of COMPARED_HEADERS) { const v = res.headers.get(name); if (v !== null) h[name] = name === 'content-type' ? v.split(';')[0].trim() : v; }
  return { status: res.status, headers: h, body: parsed };
}

async function runOn(host, scenario, ip) {
  await fetch(`${host.control}/reset`);
  if (scenario.fault?.resend) await fetch(`${host.control}/fault?resend=${scenario.fault.resend}`);
  const statuses = []; let last;
  for (let i = 0; i < (scenario.repeat ?? 1) + (scenario.twice ? 1 : 0); i += 1) { last = await send(host, scenario, ip); statuses.push(last.status); }
  await sleep(150);
  const log = await (await fetch(`${host.control}/log`)).json();
  return { ...last, statuses, log };
}

const isRateLimitRpc = (e) => e.op === 'RPC' && e.table === 'consume_rate_limit';
const dbKey = (e) => stable({ cred: e.cred, op: e.op, table: e.table, filters: e.filters, select: e.select, order: e.order, limit: e.limit, upsert: e.upsert, single: e.single, body: e.body, error: e.error ?? null });
function multisetDiff(a, b) {
  const count = (list) => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const ca = count(a); const cb = count(b); const onlyA = []; const onlyB = [];
  for (const [k, n] of ca) for (let i = 0; i < n - (cb.get(k) ?? 0); i += 1) onlyA.push(k);
  for (const [k, n] of cb) for (let i = 0; i < n - (ca.get(k) ?? 0); i += 1) onlyB.push(k);
  return { onlyA, onlyB };
}

export function compare(scenario, ex, ed) {
  const diffs = [];
  if (ex.status !== ed.status) diffs.push({ category: 'status', express: ex.status, edge: ed.status });
  if (ex.statuses.length > 1 && stable(ex.statuses) !== stable(ed.statuses)) diffs.push({ category: 'status sequence', express: ex.statuses, edge: ed.statuses });
  const volatile = new Set(scenario.volatile ?? []);
  const strip = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries(Object.entries(b).filter(([k]) => !volatile.has(k))) : b);
  if (stable(strip(ex.body)) !== stable(strip(ed.body))) diffs.push({ category: 'body', express: normalise(strip(ex.body)), edge: normalise(strip(ed.body)) });
  for (const name of COMPARED_HEADERS) if ((ex.headers[name] ?? null) !== (ed.headers[name] ?? null)) diffs.push({ category: 'header', header: name, express: ex.headers[name] ?? null, edge: ed.headers[name] ?? null });
  // Rate limiting is an intentional architectural difference (Express: in-memory buckets; Edge: durable consume_rate_limit RPC). The calls are compared separately.
  const dbd = multisetDiff(ex.log.db.filter((e) => !isRateLimitRpc(e)).map(dbKey), ed.log.db.filter((e) => !isRateLimitRpc(e)).map(dbKey));
  if (dbd.onlyA.length || dbd.onlyB.length) diffs.push({ category: 'database operations', onlyExpress: dbd.onlyA.map((s) => JSON.parse(s)), onlyEdge: dbd.onlyB.map((s) => JSON.parse(s)) });
  const authKey = (e) => stable({ call: e.call, cred: e.cred, email: e.email, email_confirm: e.email_confirm, has_password: e.has_password, user_metadata: e.user_metadata, token_known: e.token_known });
  const ad = multisetDiff(ex.log.auth.map(authKey), ed.log.auth.map(authKey));
  if (ad.onlyA.length || ad.onlyB.length) diffs.push({ category: 'auth calls', onlyExpress: ad.onlyA.map((s) => JSON.parse(s)), onlyEdge: ad.onlyB.map((s) => JSON.parse(s)) });
  const mailKey = (e) => stable({ authorized: e.authorized, from: e.from, to: e.to, subject: e.subject, reply_to: e.reply_to, html: e.html, text: e.text });
  const md = multisetDiff(ex.log.emails.map(mailKey), ed.log.emails.map(mailKey));
  if (md.onlyA.length || md.onlyB.length) diffs.push({ category: 'emails', onlyExpress: md.onlyA.map((s) => JSON.parse(s)), onlyEdge: md.onlyB.map((s) => JSON.parse(s)) });
  if (stable(ex.log.snapshot) !== stable(ed.log.snapshot)) {
    const tables = Object.keys({ ...ex.log.snapshot, ...ed.log.snapshot }).filter((t) => stable(ex.log.snapshot[t]) !== stable(ed.log.snapshot[t]));
    diffs.push({ category: 'resulting database state', tables, express: Object.fromEntries(tables.map((t) => [t, normalise(ex.log.snapshot[t])])), edge: Object.fromEntries(tables.map((t) => [t, normalise(ed.log.snapshot[t])])) });
  }
  for (const [who, r] of [['express', ex], ['edge', ed]]) if (r.log.unhandled.length) diffs.push({ category: 'harness: request the fake could not serve', backend: who, unhandled: r.log.unhandled });
  return diffs;
}

export async function runParity({ only, batch = 10 } = {}) {
  const all = [];
  for (const [name, overrides] of Object.entries(CONFIGS)) {
    const list = SCENARIOS.filter((s) => (s.config ?? 'default') === name && (!only || only.test(s.id)));
    if (list.length) all.push(...await runConfig(name, overrides, list, batch));
  }
  return all;
}

async function runConfig(configName, overrides, list, batch) {
  let [express, edge] = await Promise.all([startHost('express', overrides), startHost('edge', overrides)]);
  const results = [];
  try {
    let n = 0;
    for (const scenario of list) {
      // The Express rate limiter is private to the process and cannot be reset, so Express is restarted every `batch` scenarios and the Edge limiter state is
      // cleared at the same moment: both backends always see identical bucket history.
      if (n > 0 && n % batch === 0) { await express.stop(); express = await startHost('express', overrides); await fetch(`${edge.control}/reset?hard=1`); }
      n += 1;
      const ip = scenario.fixedIp ? `198.51.100.${200 + (n % 50)}` : `198.51.100.${(n % 240) + 1}`;
      const [ex, ed] = [await runOn(express, scenario, ip), await runOn(edge, scenario, ip)];
      const diffs = compare(scenario, ex, ed);
      results.push({ id: scenario.id, route: scenario.route, request: { method: scenario.method, path: scenario.path, token: scenario.token ?? null, body: scenario.body ?? scenario.raw ?? null }, ops: [...new Set(ed.log.db.filter((e) => !isRateLimitRpc(e)).map((e) => `${e.cred}|${e.op}${e.upsert ? '+upsert' : ''}|${e.table}`))].sort(), express: { status: ex.status, statuses: ex.statuses, body: normalise(ex.body), db: ex.log.db.length, emails: ex.log.emails.length }, edge: { status: ed.status, statuses: ed.statuses, body: normalise(ed.body), db: ed.log.db.length, emails: ed.log.emails.length, rateLimitCalls: ed.log.db.filter(isRateLimitRpc).map((e) => ({ limit: e.body.p_limit, window: e.body.p_window_seconds, scope: e.body.p_bucket_key.split(':')[0] })) }, diffs, pass: diffs.length === 0 });
    }
  } finally {
    await Promise.all([express.stop(), edge.stop()]);
  }
  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('run.mjs')) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : undefined;
  const results = await runParity({ only });
  mkdirSync('supabase/staging/reports/parity', { recursive: true });
  if (!only) writeFileSync('supabase/staging/reports/parity/parity-results.json', `${JSON.stringify(results, null, 2)}\n`);
  const failed = results.filter((r) => !r.pass);
  console.log(`scenarios: ${results.length}, identical: ${results.length - failed.length}, different: ${failed.length}`);
  for (const r of failed) console.log(`DIFF ${r.id}: ${r.diffs.map((d) => d.category + (d.header ? `(${d.header})` : '')).join(', ')}`);
  process.exit(0);
}
