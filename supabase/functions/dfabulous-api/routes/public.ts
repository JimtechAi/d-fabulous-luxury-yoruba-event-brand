// Public (unauthenticated) API routes.
// Contracts are preserved exactly from the Express backend (server.ts).
import { Hono } from 'hono';
import { anonClient, serviceClient } from '../lib/supabase.ts';
import { isServerDatabaseConfigured, isSupabaseConfigured } from '../lib/env.ts';
import { isValidDate, isValidEmail, isValidPhone, parseGuestCount, readText } from '../lib/validation.ts';
import { readJsonBody } from '../lib/http.ts';
import { enforceRateLimit } from '../lib/rateLimit.ts';
import { sendBookingNotification, sendContactNotification } from '../lib/email.ts';
import { GALLERY_FILENAMES, VIDEO_FILES } from '../lib/media-manifest.ts';

export const publicRoutes = new Hono();

publicRoutes.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

publicRoutes.get('/api/diagnostics', (c) => {
  return c.json({ success: true, status: 'ok' });
});

publicRoutes.get('/api/availability', async (c) => {
  if (!isServerDatabaseConfigured) {
    return c.json({ success: false, error: 'Database Configuration Error' }, 503);
  }

  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const startDate = isValidDate(startParam) ? startParam : new Date().toISOString().slice(0, 10);
  const endDate = isValidDate(endParam) ? endParam : (() => {
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() + 2);
    return date.toISOString().slice(0, 10);
  })();

  try {
    const db = serviceClient();
    const [{ data: bookings, error: bookingsError }, { data: blockedDates, error: blockedDatesError }] = await Promise.all([
      db.from('bookings').select('event_date,status').in('status', ['pending', 'confirmed']).gte('event_date', startDate).lte('event_date', endDate),
      db.from('blocked_dates').select('event_date').gte('event_date', startDate).lte('event_date', endDate),
    ]);

    if (bookingsError) throw bookingsError;
    if (blockedDatesError) throw blockedDatesError;

    const unavailable = new Map<string, 'booked' | 'owner_blocked'>();
    (bookings || []).forEach((booking: { event_date: string }) => unavailable.set(booking.event_date, 'booked'));
    (blockedDates || []).forEach((date: { event_date: string }) => unavailable.set(date.event_date, 'owner_blocked'));

    return c.json({
      success: true,
      data: Array.from(unavailable, ([event_date, reason]) => ({ event_date, available: false, reason })),
    });
  } catch (error) {
    console.error('[Edge API] Availability read error:', error);
    return c.json({ success: false, error: 'Database Operation Error', details: 'Unable to load event availability.' }, 500);
  }
});

publicRoutes.post('/api/bookings', async (c) => {
  if (!isServerDatabaseConfigured) {
    return c.json({
      success: false,
      error: 'Database Configuration Error',
      details: 'The server database connection is not configured.',
    }, 503);
  }

  const limited = await enforceRateLimit(c, 'submission');
  if (limited) return limited;

  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  try {
    const {
      full_name,
      email,
      phone,
      event_date,
      event_location,
      services_requested,
      estimated_guest_count,
      celebration_details,
      website_hp,
    } = parsed.body;

    if (website_hp) {
      return c.json({ success: false, error: 'Invalid submission' }, 400);
    }

    const safeName = readText(full_name, 120);
    const safeEmail = isValidEmail(email) ? (email as string).trim() : null;
    const submittedPhone = typeof phone === 'string' ? phone.trim() : '';
    const safePhone = submittedPhone ? (isValidPhone(submittedPhone) ? submittedPhone : null) : null;
    const safeLocation = readText(event_location, 160);
    const safeDetails = celebration_details === undefined || celebration_details === null
      ? null
      : readText(celebration_details, 4000);
    const safeServices = Array.isArray(services_requested) && services_requested.length <= 10
      ? services_requested.filter((service): service is string => typeof service === 'string' && service.length <= 120)
      : [];

    if (!safeName || !safeEmail || (submittedPhone && !safePhone) || !isValidDate(event_date) || !safeLocation || (celebration_details && !safeDetails)) {
      return c.json({
        success: false,
        error: 'Validation Error',
        details: 'Please provide valid name, email, event date, and event location details.',
      }, 400);
    }

    const parsedGuestCount = parseGuestCount(estimated_guest_count);
    const bookingInsertPayload = {
      full_name: safeName,
      email: safeEmail,
      phone: safePhone,
      event_date,
      event_location: safeLocation,
      services_requested: safeServices,
      estimated_guest_count: parsedGuestCount,
      celebration_details: safeDetails,
      status: 'pending',
    };

    const { data, error, status } = await serviceClient().from('bookings').insert([bookingInsertPayload]);

    if (error) {
      console.error('[Edge API] Booking insert/availability error:', error);
      const dateUnavailable = error.message?.toLowerCase().includes('available')
        || error.code === '23P01'
        || (error.code === '23505' && error.message?.includes('bookings_active_event_date_unique'));
      return c.json({
        success: false,
        error: dateUnavailable ? 'Date Unavailable' : 'Database Operation Error',
        details: dateUnavailable ? 'This date is no longer available. Please select another date.' : 'Unable to record your booking at this time.',
      }, (status >= 400 ? status : 500) as 400);
    }

    // Email delivery is best effort: the booking has already been saved.
    const emailResult = await sendBookingNotification({
      full_name: safeName,
      email: safeEmail,
      phone: safePhone,
      event_date: event_date as string,
      event_location: safeLocation,
      services_requested: safeServices,
      estimated_guest_count: parsedGuestCount,
      celebration_details: safeDetails,
    }).catch((emailError) => {
      console.error('[Edge API] Unexpected booking email error:', emailError);
      const failure = { success: false, status: 'failed' as const, deliveryStatus: 'failed' as const, error: 'Unexpected booking email failure.' };
      return { customer: failure, admin: failure };
    });

    return c.json({
      success: true,
      bookingSaved: true,
      message: 'Booking request successfully received.',
      data,
      email: emailResult,
      emailAccepted: {
        customer: emailResult.customer.success,
        admin: emailResult.admin.success,
      },
    });
  } catch (err) {
    console.error('[Edge API] Unexpected booking error:', err);
    return c.json({
      success: false,
      error: 'Network Connection Failure',
      details: 'Unable to record your booking at this time.',
    }, 500);
  }
});

publicRoutes.post('/api/messages', async (c) => {
  if (!isServerDatabaseConfigured) {
    return c.json({
      success: false,
      error: 'Database Configuration Error',
      details: 'The server database connection is not configured.',
    }, 503);
  }

  const limited = await enforceRateLimit(c, 'submission');
  if (limited) return limited;

  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.response;

  try {
    const { full_name, email, phone, subject, message, website_hp } = parsed.body;

    if (website_hp) {
      return c.json({ success: false, error: 'Invalid submission' }, 400);
    }

    const safeName = readText(full_name, 120);
    const safeEmail = isValidEmail(email) ? (email as string).trim() : null;
    const safePhone = phone ? (isValidPhone(phone) ? (phone as string).trim() : null) : null;
    const safeSubject = subject ? readText(subject, 160) : 'General Inquiry';
    const safeMessage = readText(message, 4000);

    if (!safeName || !safeEmail || !safeMessage || (phone && !safePhone) || !safeSubject) {
      return c.json({
        success: false,
        error: 'Validation Error',
        details: 'Please provide valid name, email, and message details.',
      }, 400);
    }

    const { data, error, status } = await serviceClient()
      .from('messages')
      .insert([
        {
          full_name: safeName,
          email: safeEmail,
          phone: safePhone,
          subject: safeSubject,
          message: safeMessage,
          status: 'unread',
        },
      ]);

    if (error) {
      console.error('[Edge API] Message insert error:', error);
      return c.json({
        success: false,
        error: 'Database Operation Error',
        details: 'Unable to deliver your message at this time.',
      }, (status >= 400 ? status : 500) as 500);
    }

    // Best-effort notification email; the saved message is never lost to an email failure.
    const notificationTask = sendContactNotification({
      full_name: safeName,
      email: safeEmail,
      phone: safePhone,
      subject: safeSubject,
      message: safeMessage,
    }).catch((emailErr) => {
      console.error('[Edge API] Uncaught contact notification error:', emailErr);
    });

    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(notificationTask);
    } else {
      await notificationTask;
    }

    return c.json({
      success: true,
      message: 'Message successfully delivered.',
      data,
    });
  } catch (err) {
    console.error('[Edge API] Unexpected message error:', err);
    return c.json({
      success: false,
      error: 'Network Connection Failure',
      details: 'Unable to deliver your message at this time.',
    }, 500);
  }
});

publicRoutes.get('/api/services', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, data: [] });
  }

  try {
    const { data, error } = await anonClient()
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[Edge API] Services query error:', error);
      return c.json({ success: false, error: 'Unable to load services at this time.', data: [] });
    }

    return c.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[Edge API] Unexpected services query error:', err);
    return c.json({ success: false, error: 'Unable to load services at this time.', data: [] });
  }
});

// Gallery and video assets remain on the existing Vercel static delivery
// architecture. The Edge Function serves metadata from a build-time manifest of
// the committed files, merged with any database gallery rows, replacing the old
// Express filesystem scan. No media processing happens here.
interface GalleryItem {
  id: string;
  title: string;
  image_url: string;
  alt_text: string;
  category: string;
  caption?: string;
  aspect_ratio: string;
  is_featured: boolean;
  display_order: number;
}

function parseFilenameTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function manifestGalleryItems(): GalleryItem[] {
  return GALLERY_FILENAMES.map((filename, index) => {
    const title = parseFilenameTitle(filename);
    return {
      id: `local-gallery-${index + 1}`,
      title,
      image_url: `/images/gallery/${encodeURIComponent(filename)}`,
      alt_text: title,
      category: 'Gallery',
      caption: title,
      aspect_ratio: '4/3',
      is_featured: index < 6,
      display_order: index + 1,
    };
  });
}

function normalizeGalleryFilename(imageUrl: unknown): string | null {
  if (typeof imageUrl !== 'string') return null;
  const trimmedUrl = imageUrl.trim();
  if (!trimmedUrl) return null;

  const galleryPathMatch = trimmedUrl.match(
    /\/(?:assets\/gallery|(?:public\/)?images\/gallery)\/(?:[^/?#]+\/)*([^/?#]+)(?:[?#].*)?$/i
  );
  if (galleryPathMatch) {
    try {
      return decodeURIComponent(galleryPathMatch[1]);
    } catch {
      return galleryPathMatch[1];
    }
  }

  const filenameOnlyMatch = trimmedUrl.match(/^([^/?#]+\.(?:avif|gif|jpe?g|png|webp))(?:[?#].*)?$/i);
  return filenameOnlyMatch ? filenameOnlyMatch[1] : null;
}

function buildCanonicalGalleryResponse(databaseRows: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const localGallery = manifestGalleryItems();
  const localByFilename = new Map(
    localGallery.map((item) => [decodeURIComponent(item.image_url.split('/').pop() || '').toLowerCase(), item])
  );
  const usedFilenames = new Set<string>();
  const canonicalRows: Record<string, unknown>[] = [];
  for (const row of databaseRows) {
    const filename = normalizeGalleryFilename(row?.image_url);
    if (!filename) continue;

    const localItem = localByFilename.get(filename.toLowerCase());
    if (!localItem || usedFilenames.has(filename.toLowerCase())) continue;

    usedFilenames.add(filename.toLowerCase());
    canonicalRows.push({
      ...row,
      image_url: localItem.image_url,
      category: 'Gallery',
      aspect_ratio: (row?.aspect_ratio as string) || localItem.aspect_ratio,
      is_featured: Boolean(row?.is_featured ?? localItem.is_featured),
      display_order: row?.display_order ?? localItem.display_order,
    });
  }

  const missingLocalRows: Record<string, unknown>[] = localGallery
    .filter((item) => {
      const filename = decodeURIComponent(item.image_url.split('/').pop() || '').toLowerCase();
      return !usedFilenames.has(filename);
    })
    .map((item) => ({ ...item }));

  return [...canonicalRows, ...missingLocalRows].sort(
    (a, b) => Number((a.display_order as number | undefined) || 0) - Number((b.display_order as number | undefined) || 0)
  );
}

publicRoutes.get('/api/gallery', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({
      success: true,
      data: buildCanonicalGalleryResponse(),
      warning: 'Supabase is not configured. Serving centralized local gallery images.',
    });
  }

  try {
    const { data, error } = await serviceClient()
      .from('gallery')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      return c.json({
        success: true,
        data: manifestGalleryItems(),
        warning: 'Gallery content is temporarily being served from the local catalogue.',
      });
    }

    return c.json({ success: true, data: buildCanonicalGalleryResponse(data || []) });
  } catch {
    return c.json({
      success: true,
      data: buildCanonicalGalleryResponse(),
      warning: 'Gallery content is temporarily being served from the local catalogue.',
    });
  }
});

publicRoutes.get('/api/videos', (c) => {
  try {
    const localVideos = VIDEO_FILES.map(({ filename, hasThumbnail }, index) => {
      const title = parseFilenameTitle(filename);
      return {
        id: `local-video-${index + 1}`,
        title,
        video_url: `/videos/${encodeURIComponent(filename)}`,
        poster_url: hasThumbnail
          ? `/images/video-thumbnails/${encodeURIComponent(`${title}.jpg`)}`
          : undefined,
        alt_text: title,
        category: 'Videos',
        caption: title,
        display_order: index + 1,
      };
    });
    return c.json({ success: true, data: localVideos });
  } catch (err) {
    console.error('[Edge API] Unexpected videos query error:', err);
    return c.json({ success: false, error: 'Unable to load videos at this time.', data: [] });
  }
});

publicRoutes.get('/api/testimonials', async (c) => {
  if (!isSupabaseConfigured) {
    return c.json({ success: false, data: [] });
  }

  try {
    const { data, error } = await serviceClient()
      .from('testimonials')
      .select('*')
      .eq('is_featured', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[Edge API] Testimonials query error:', error);
      return c.json({ success: false, error: 'Unable to load testimonials at this time.', data: [] });
    }

    return c.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[Edge API] Unexpected testimonials query error:', err);
    return c.json({ success: false, error: 'Unable to load testimonials at this time.', data: [] });
  }
});

// Explicit security block preserved from the Express backend.
publicRoutes.all('/api/settings', (c) => {
  return c.json({ success: false, error: 'Not Found' }, 404);
});
