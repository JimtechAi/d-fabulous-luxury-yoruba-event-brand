// Differences between the Express backend and the Edge Function that are understood, intentional or platform-level. Every other difference fails the parity test.
// A rule matches a diff by category (and header name); `scenario` optionally narrows it. `status` says how well the claim is established:
//   'intentional'  - the Edge behaviour is deliberately different or stricter (verified by reading the code and by the parity run)
//   'unverified'   - plausible platform behaviour that cannot be verified without a deployed function (listed as a remaining risk)
export const ACCEPTED = [
  { category: 'header', header: 'content-security-policy', status: 'unverified', reason: 'Express adds a document CSP to every response, including JSON. A CSP has no effect on fetch() JSON responses and the website HTML is served by Vercel (vercel.json sets none), so nothing relies on the API sending it. Not reproduced in the Edge Function.' },
  { category: 'header', header: 'strict-transport-security', status: 'unverified', reason: 'Express sets HSTS in production. Supabase serves Edge Functions only over HTTPS and its gateway is expected to add HSTS; this cannot be confirmed without a deployed function.' },
  { category: 'header', header: /^(x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cross-origin-opener-policy|cross-origin-resource-policy)$/, scenario: /malformed JSON|oversized body/, status: 'intentional', reason: 'Express rejects unreadable or oversized bodies in its body parser, before its security-header middleware runs, so those 400/413 responses carry no hardening headers. The Edge Function sets them on every response (stricter).' },
  { category: 'status', scenario: /CROSS :: unknown API path/, status: 'intentional', reason: 'Express answers an unknown /api/* path with the SPA index.html (HTTP 200) through its catch-all. The Edge Function answers 404 JSON. The website only calls known routes; the SPA fallback stays with Vercel.' },
  { category: 'body', scenario: /CROSS :: (unknown API path|wrong method on a known path)/, status: 'intentional', reason: 'Express returns HTML (SPA page or Express "Cannot PUT" page); the Edge Function returns {"success":false,"error":"Not Found"}.' },
  { category: 'header', header: 'content-type', scenario: /CROSS :: (unknown API path|wrong method on a known path)/, status: 'intentional', reason: 'Same as above: text/html (Express) versus application/json (Edge).' },
];

export function acceptance(scenario, diff) {
  return ACCEPTED.find((a) => a.category === diff.category
    && (a.header === undefined || (a.header instanceof RegExp ? a.header.test(diff.header ?? '') : a.header === diff.header))
    && (a.scenario === undefined || a.scenario.test(scenario.id)));
}
