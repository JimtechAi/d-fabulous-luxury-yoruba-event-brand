// Prints summary statistics of the last parity run (supabase/staging/reports/parity/parity-results.json) for the Stage 3 report.
import { readFileSync } from 'node:fs';
import { acceptance } from './accepted.mjs';
import { SCENARIOS } from './scenarios.mjs';

const results = JSON.parse(readFileSync('supabase/staging/reports/parity/parity-results.json', 'utf8'));
const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
let identical = 0; let accepted = 0; let unexplained = 0; const kinds = {};
for (const r of results) {
  if (!r.diffs.length) { identical += 1; continue; }
  if (r.diffs.some((d) => !acceptance(byId[r.id], d))) unexplained += 1; else accepted += 1;
  for (const d of r.diffs) { const k = d.category + (d.header ? `:${d.header}` : ''); kinds[k] = (kinds[k] ?? 0) + 1; }
}
console.log({ total: results.length, strictlyIdentical: identical, identicalApartFromAcceptedDifferences: accepted, unexplained });
console.log('differences by kind', kinds);
const perRoute = {};
for (const r of results) { const p = (perRoute[r.route] ??= { scenarios: 0, success: 0, c401: 0, c403: 0, c4xx_other: 0, c5xx: 0 }); p.scenarios += 1; const s = r.express.status; if (s < 300) p.success += 1; else if (s === 401) p.c401 += 1; else if (s === 403) p.c403 += 1; else if (s < 500) p.c4xx_other += 1; else p.c5xx += 1; }
console.table(perRoute);
console.log('express/edge totals: database requests', results.reduce((n, r) => n + r.express.db, 0), results.reduce((n, r) => n + r.edge.db, 0), '| e-mails', results.reduce((n, r) => n + r.express.emails, 0), results.reduce((n, r) => n + r.edge.emails, 0));
