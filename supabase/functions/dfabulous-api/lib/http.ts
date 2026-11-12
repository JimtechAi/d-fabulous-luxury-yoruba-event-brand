// Shared HTTP helpers for the Hono app: JSON body reading with the same 32kb cap
// and error contract as the Express backend (413 Request Too Large / 400 Invalid Request).
import type { Context } from 'hono';

export const MAX_JSON_BODY_BYTES = 32 * 1024;

export type JsonBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

export async function readJsonBody(c: Context): Promise<JsonBodyResult> {
  const declaredLength = Number.parseInt(c.req.header('content-length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'Request Too Large', details: 'Please reduce the request size and try again.' }, 413),
    };
  }

  let text = '';
  try {
    text = await c.req.text();
  } catch {
    return {
      ok: false,
      response: c.json({ success: false, error: 'Invalid Request', details: 'The request body could not be read.' }, 400),
    };
  }

  if (text.length > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: c.json({ success: false, error: 'Request Too Large', details: 'Please reduce the request size and try again.' }, 413),
    };
  }

  if (!text.trim()) {
    return { ok: true, body: {} };
  }

  try {
    const parsed = JSON.parse(text);
    return { ok: true, body: parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {} };
  } catch {
    return {
      ok: false,
      response: c.json({ success: false, error: 'Invalid Request', details: 'The request body could not be read.' }, 400),
    };
  }
}
