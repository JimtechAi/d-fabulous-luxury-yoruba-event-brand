// Admin read endpoints (session, resource data) and message status updates.
// Ported 1:1 from server.ts.
import { Hono } from 'hono';
import { serviceClient } from '../lib/supabase.ts';
import { getAuthenticatedAdminUser, readBearerToken, requireAdminAccess } from '../lib/auth.ts';
import { getAuthorizationError, isRoleOption, readText } from '../lib/validation.ts';

export const adminDataRoutes = new Hono();

adminDataRoutes.get('/api/admin/data/:resource', async (c) => {
  const resource = readText(c.req.param('resource'), 40);
  const permissionsByResource: Record<string, string> = {
    bookings: 'bookings.view',
    payments: 'payments.view',
    messages: 'messages.view',
    services: 'services.view',
    settings: 'settings.view',
    blocked_dates: 'bookings.view',
  };
  const requiredPermission = resource ? permissionsByResource[resource] : undefined;
  if (!requiredPermission) {
    return c.json({ success: false, error: 'Not Found' }, 404);
  }
  const resourceName = resource as string;

  const accessCheck = await requireAdminAccess(c.req.header('authorization'), [requiredPermission]);
  if (accessCheck.response) {
    return c.json(accessCheck.response.json, accessCheck.response.status as 401);
  }

  const selections: Record<string, string> = {
    bookings: 'id, booking_reference, full_name, email, phone, event_date, event_location, booking_amount, currency, services_requested, estimated_guest_count, celebration_details, status, completed_at, archived_at, created_at, updated_at',
    payments: 'id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at',
    messages: 'id, full_name, email, phone, subject, message, status, created_at, updated_at',
    services: 'id, slug, title, yoruba_name, short_description, full_description, category, icon_name, is_active, display_order',
    settings: 'key, value',
    blocked_dates: 'event_date, note, created_by, created_at',
  };

  try {
    const db = serviceClient();
    // The "settings" resource is stored in the site_settings table.
    const tableName = resourceName === 'settings' ? 'site_settings' : resourceName;
    let query = db.from(tableName).select(selections[resourceName]);
    if (resourceName === 'settings') query = query.order('key', { ascending: true });
    else if (resourceName === 'blocked_dates') query = query.order('event_date', { ascending: true });
    else if (resourceName === 'services') query = query.order('display_order', { ascending: true });
    else query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error(`[Edge API] Admin ${resourceName} read error:`, error);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to load administrative data.' }, 500);
    }

    if (resourceName === 'payments') {
      const paymentRows = (data || []) as unknown as Record<string, unknown>[];
      const bookingIds = Array.from(new Set(paymentRows.map((payment) => payment.booking_id).filter(Boolean)));
      if (bookingIds.length) {
        const { data: bookings } = await db.from('bookings').select('id, full_name, email').in('id', bookingIds);
        const customers = new Map((bookings || []).map((booking: { id: string; full_name?: string; email?: string }) => [booking.id, booking]));
        return c.json({ success: true, data: paymentRows.map((payment) => ({
          ...payment,
          customer_name: customers.get(payment.booking_id as string)?.full_name || null,
          customer_email: payment.customer_email || customers.get(payment.booking_id as string)?.email || null,
        })) });
      }
    }

    return c.json({ success: true, data: data || [] });
  } catch (error) {
    console.error(`[Edge API] Unexpected admin ${resourceName} read error:`, error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to load administrative data.' }, 500);
  }
});

adminDataRoutes.get('/api/admin/session', async (c) => {
  const accessToken = readBearerToken(c.req.header('authorization'));
  if (!accessToken) {
    return c.json(getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.'), 401);
  }

  try {
    const adminUser = await getAuthenticatedAdminUser(accessToken);
    if (!adminUser) {
      return c.json(getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.'), 401);
    }
    if (!adminUser.isActive) {
      return c.json(getAuthorizationError('Authorization Error', 'This administrator account is inactive.'), 403);
    }
    if (!isRoleOption(adminUser.role)) {
      return c.json(getAuthorizationError('Authorization Error', 'You are not authorized to access this administrative area.'), 403);
    }
    return c.json({
      success: true,
      data: {
        ...(adminUser.profile || {}),
        id: adminUser.userId,
        role: adminUser.role,
        is_active: adminUser.isActive,
        permissions: Array.from(adminUser.permissions),
      },
    });
  } catch (error) {
    console.error('[Edge API] Admin session lookup error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to verify the administrative session.' }, 500);
  }
});

adminDataRoutes.patch('/api/admin/messages/:id', async (c) => {
  const accessCheck = await requireAdminAccess(c.req.header('authorization'), ['messages.manage']);
  if (accessCheck.response) {
    return c.json(accessCheck.response.json, accessCheck.response.status as 401);
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await c.req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return c.json({ success: false, error: 'Invalid Request', details: 'The request body could not be read.' }, 400);
  }

  const messageId = readText(c.req.param('id'), 120);
  const status = readText(body?.status, 40);
  if (!messageId || !status) {
    return c.json({ success: false, error: 'Validation Error', details: 'A valid message ID and status are required.' }, 400);
  }
  try {
    const { data, error } = await serviceClient()
      .from('messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .select('id, full_name, email, phone, subject, message, status, created_at, updated_at')
      .maybeSingle();
    if (error) {
      console.error('[Edge API] Admin message update error:', error);
      return c.json({ success: false, error: 'Server Error', details: 'Unable to update the message.' }, 500);
    }
    if (!data) {
      return c.json({ success: false, error: 'Message Not Found' }, 404);
    }
    return c.json({ success: true, data });
  } catch (error) {
    console.error('[Edge API] Unexpected admin message update error:', error);
    return c.json({ success: false, error: 'Server Error', details: 'Unable to update the message.' }, 500);
  }
});
