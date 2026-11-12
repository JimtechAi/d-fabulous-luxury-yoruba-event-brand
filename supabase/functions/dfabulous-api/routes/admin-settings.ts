// Admin settings and blocked-date management. Ported 1:1 from server.ts.
import { Hono } from 'hono';
import { serviceClient } from '../lib/supabase.ts';
import { guardAdminRequest } from '../lib/adminGuard.ts';
import { appendAuditLog } from '../lib/audit.ts';
import { readJsonBody } from '../lib/http.ts';
import { isValidDate, readText } from '../lib/validation.ts';
import { conflictBody, isUniqueViolation } from '../lib/conflicts.ts';

export const adminSettingsRoutes = new Hono();

// Order for every route: validate request -> authenticate -> verify admin -> rate limit -> execute.
adminSettingsRoutes.post('/api/admin/blocked-dates', async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  const eventDate = parsed.body?.event_date;
  const note = parsed.body?.note === undefined ? null : readText(parsed.body.note, 240);
  if (!isValidDate(eventDate)) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid event date is required.' }, 400);
  }

  const guard = await guardAdminRequest(c, ['bookings.manage'], { rateLimit: 'admin_status' });
  if (!guard.ok) return guard.response;

  try {
    const { data, error } = await serviceClient()
      .from('blocked_dates')
      .insert({ event_date: eventDate, note, created_by: guard.adminUser.userId })
      .select('*')
      .single();
    if (error) {
      console.error('[Edge API] Admin blocked date creation error:', error);
      if (isUniqueViolation(error)) return c.json(conflictBody('dateAlreadyBlocked'), 409);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to block this date.' }, 500);
    }
    return c.json({ success: true, data }, 201);
  } catch (error) {
    console.error('[Edge API] Unexpected blocked date creation error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to block this date.' }, 500);
  }
});

adminSettingsRoutes.delete('/api/admin/blocked-dates/:eventDate', async (c) => {
  let eventDate = '';
  try {
    eventDate = decodeURIComponent(c.req.param('eventDate') || '');
  } catch {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid event date is required.' }, 400);
  }
  if (!isValidDate(eventDate)) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid event date is required.' }, 400);
  }

  const guard = await guardAdminRequest(c, ['bookings.manage'], { rateLimit: 'admin_status' });
  if (!guard.ok) return guard.response;

  try {
    const { error } = await serviceClient().from('blocked_dates').delete().eq('event_date', eventDate);
    if (error) {
      console.error('[Edge API] Admin blocked date deletion error:', error);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to unblock this date.' }, 500);
    }
    return c.json({ success: true, data: { event_date: eventDate } });
  } catch (error) {
    console.error('[Edge API] Unexpected blocked date deletion error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to unblock this date.' }, 500);
  }
});

adminSettingsRoutes.put('/api/admin/settings', async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  const values = parsed.body?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return c.json({ success: false, error: 'Validation Error', details: 'Settings values are required.' }, 400);
  }
  const entries = Object.entries(values).filter(([key, value]) => readText(key, 120) && (typeof value === 'string' || typeof value === 'boolean'));
  if (entries.length !== Object.keys(values).length || entries.length > 50) {
    return c.json({ success: false, error: 'Validation Error', details: 'Settings values are invalid.' }, 400);
  }

  const guard = await guardAdminRequest(c, ['settings.manage'], { rateLimit: 'admin_settings' });
  if (!guard.ok) return guard.response;

  try {
    const db = serviceClient();
    for (const [key, value] of entries) {
      const { data: existing, error: readError } = await db.from('site_settings').select('key').eq('key', key).maybeSingle();
      if (readError) throw readError;
      const result = existing
        ? await db.from('site_settings').update({ value }).eq('key', key)
        : await db.from('site_settings').insert({ key, value });
      if (result.error) throw result.error;
    }
    await appendAuditLog({ actor_user_id: guard.adminUser.userId, action: 'settings.updated', metadata: { keys: entries.map(([key]) => key) } });
    return c.json({ success: true });
  } catch (error) {
    console.error('[Edge API] Admin settings update error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to save settings.' }, 500);
  }
});
