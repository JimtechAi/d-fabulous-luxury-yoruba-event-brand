import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegBinaryPath from 'ffmpeg-static';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { sendBookingNotification, sendBookingStatusNotification, sendContactNotification } from './server/email';

const execFileAsync = promisify(execFile);

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

function cleanUrl(val: string | undefined): string {
  const cleaned = cleanEnv(val);
  if (!cleaned) return '';
  let url = cleaned;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

const supabaseUrl = cleanUrl(
  process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
);

const supabaseAnonKey = cleanEnv(
  process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const supabaseServiceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-supabase-project') &&
    supabaseUrl.startsWith('https://')
);

// Create Supabase client with public anon key for server-proxied requests
const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// This client is intentionally server-only. Do not expose its key through Vite variables.
const serverDatabase = createClient(
  supabaseUrl ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseUrl && supabaseServiceRoleKey ? supabaseServiceRoleKey : 'placeholder-service-role-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const isServerDatabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-supabase-project') &&
    supabaseServiceRoleKey
);

function formatError(error: any): string {
  if (!error) return 'Unknown server error';
  if (typeof error === 'string') return error;

  const fullStr = `${error.message || ''} ${error.details || ''} ${error.stack || ''} ${String(error)}`;
  if (fullStr.includes('ENOTFOUND') || fullStr.includes('getaddrinfo')) {
    let hostname = 'Supabase Host';
    try {
      if (supabaseUrl) hostname = new URL(supabaseUrl).hostname;
    } catch {}
    return `Domain Resolution Failure (ENOTFOUND): Unable to resolve hostname '${hostname}'. Please double-check your VITE_SUPABASE_URL environment variable setting to ensure it points to an active Supabase project URL (e.g. https://<project-ref>.supabase.co).`;
  }

  const msg = error.message || 'Error occurred during database operation';
  const code = error.code ? ` [Code: ${error.code}]` : '';
  const hint = error.hint ? ` (Hint: ${error.hint})` : '';
  const details = error.details ? ` (Details: ${error.details})` : '';

  return `${msg}${code}${details}${hint}`;
}

async function getLocalGalleryItems() {
  const galleryDir = path.join(process.cwd(), 'public', 'images', 'gallery');
  const files = await fs.readdir(galleryDir, { withFileTypes: true });
  const imageFiles = files
    .filter((file) => file.isFile() && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name))
    .map((file) => file.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return imageFiles.map((filename, index) => {
    const title = path.parse(filename).name;
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

async function buildCanonicalGalleryResponse(databaseRows: any[] = []) {
  const localGallery = await getLocalGalleryItems();
  const localByFilename = new Map(
    localGallery.map((item) => [decodeURIComponent(path.basename(item.image_url)).toLowerCase(), item])
  );
  const usedFilenames = new Set<string>();
  const canonicalRows = databaseRows
    .map((row) => {
      const filename = normalizeGalleryFilename(row?.image_url);
      if (!filename) return null;

      const localItem = localByFilename.get(filename.toLowerCase());
      if (!localItem || usedFilenames.has(filename.toLowerCase())) return null;

      usedFilenames.add(filename.toLowerCase());
      return {
        ...row,
        image_url: localItem.image_url,
        category: 'Gallery',
        aspect_ratio: row?.aspect_ratio || localItem.aspect_ratio,
        is_featured: Boolean(row?.is_featured ?? localItem.is_featured),
        display_order: row?.display_order ?? localItem.display_order,
      };
    })
    .filter(Boolean);

  const missingLocalRows = localGallery.filter((item) => {
    const filename = decodeURIComponent(path.basename(item.image_url)).toLowerCase();
    return !usedFilenames.has(filename);
  });

  return [...canonicalRows, ...missingLocalRows].sort(
    (a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)
  );
}

const videoThumbnailsDir = path.join(process.cwd(), 'public', 'images', 'video-thumbnails');

function getVideoThumbnailFilename(videoFilename: string): string {
  return `${path.parse(videoFilename).name}.jpg`;
}

/**
 * Generates a first-frame poster image for every video in public/videos that does not
 * already have a matching thumbnail in public/images/video-thumbnails. Existing thumbnail
 * files (manually supplied, using the same naming convention) are never overwritten.
 */
async function ensureVideoThumbnails(videoFilenames: string[]): Promise<void> {
  if (!ffmpegBinaryPath) {
    console.warn('ffmpeg-static binary unavailable on this platform; skipping video thumbnail generation.');
    return;
  }
  const ffmpegBinary: string = ffmpegBinaryPath;

  await fs.mkdir(videoThumbnailsDir, { recursive: true });
  const videosDir = path.join(process.cwd(), 'public', 'videos');

  await Promise.all(
    videoFilenames.map(async (filename) => {
      const thumbnailPath = path.join(videoThumbnailsDir, getVideoThumbnailFilename(filename));
      if (existsSync(thumbnailPath)) return;

      try {
        await execFileAsync(ffmpegBinary, [
          '-y',
          '-ss', '00:00:01',
          '-i', path.join(videosDir, filename),
          '-frames:v', '1',
          '-vf', 'scale=640:-1',
          thumbnailPath,
        ]);
      } catch (err) {
        console.warn(`Failed to generate thumbnail for ${filename}:`, formatError(err));
      }
    })
  );
}

async function getLocalVideoItems() {
  const videosDir = path.join(process.cwd(), 'public', 'videos');
  const files = await fs.readdir(videosDir, { withFileTypes: true });
  const videoFiles = files
    .filter((file) => file.isFile() && /\.(?:mp4|webm|ogg|mov|m4v)$/i.test(file.name))
    .map((file) => file.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return videoFiles.map((filename, index) => {
    const title = path.parse(filename).name;
    const thumbnailPath = path.join(videoThumbnailsDir, getVideoThumbnailFilename(filename));
    return {
      id: `local-video-${index + 1}`,
      title,
      video_url: `/videos/${encodeURIComponent(filename)}`,
      poster_url: existsSync(thumbnailPath)
        ? `/images/video-thumbnails/${encodeURIComponent(getVideoThumbnailFilename(filename))}`
        : undefined,
      alt_text: title,
      category: 'Videos',
      caption: title,
      display_order: index + 1,
    };
  });
}

const submissionAttempts = new Map<string, { count: number; resetAt: number }>();
const submissionWindowMs = 15 * 60 * 1000;
const submissionLimit = 5;
const adminStatusAttempts = new Map<string, { count: number; resetAt: number }>();
const adminStatusLimit = 30;

function pruneExpiredRateLimitEntries(at: number) {
  for (const attempts of [submissionAttempts, adminStatusAttempts]) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= at) attempts.delete(key);
    }
  }
}

function submissionRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  if (submissionAttempts.size > 1_000) pruneExpiredRateLimitEntries(now);
  const key = req.ip || 'unknown';
  const current = submissionAttempts.get(key);

  if (!current || current.resetAt <= now) {
    submissionAttempts.set(key, { count: 1, resetAt: now + submissionWindowMs });
    next();
    return;
  }

  if (current.count >= submissionLimit) {
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      details: 'Please wait a few minutes before submitting another enquiry.',
    });
    return;
  }

  current.count += 1;
  next();
}

function adminStatusRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  if (adminStatusAttempts.size > 1_000) pruneExpiredRateLimitEntries(now);
  const key = req.ip || 'unknown';
  const current = adminStatusAttempts.get(key);

  if (!current || current.resetAt <= now) {
    adminStatusAttempts.set(key, { count: 1, resetAt: now + submissionWindowMs });
    next();
    return;
  }

  if (current.count >= adminStatusLimit) {
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      details: 'Too many booking status changes were requested. Please try again later.',
    });
    return;
  }

  current.count += 1;
  next();
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: unknown): value is string {
  return typeof value === 'string' && /^[+\d\s().-]{7,30}$/.test(value.trim());
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function parseGuestCount(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 10000 ? value : null;

  const rangeValues: Record<string, number> = {
    'under-100': 50,
    '100-250': 175,
    '250-500': 375,
    '500-1000': 750,
    '1000+': 1000,
  };
  if (value in rangeValues) return rangeValues[value];

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : null;
}

function parseCurrencyAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string') return null;
  const numeric = Number.parseFloat(value.replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function parseCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const currency = value.trim().toUpperCase();
  return ['NGN', 'USD', 'GBP', 'EUR'].includes(currency) ? currency : null;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

async function getAuthenticatedAdminUser(accessToken: string): Promise<{ userId: string; isAdmin: boolean; isOwner: boolean } | null> {
  const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await requestSupabase.auth.getUser(accessToken);
  if (userError || !userData.user) return null;

  const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
    requestSupabase.rpc('is_admin'),
    requestSupabase.rpc('is_owner'),
  ]);

  return {
    userId: userData.user.id,
    isAdmin: Boolean(isAdmin),
    isOwner: Boolean(isOwner),
  };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';
  const allowedOrigins = cleanEnv(
    process.env.CORS_ALLOWED_ORIGINS || 'https://d-fabulous-luxury-yoruba-event-bran.vercel.app'
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const listenOnPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = app.listen(port, host, () => {
        console.log(`Server running on ${host}:${port}`);
        resolve(port);
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Please stop the existing process and free port ${port} before starting the app.`));
          return;
        }

        reject(error);
      });
    });

  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const connectSources = [`'self'`, `ws:`, `wss:`, supabaseUrl].filter(Boolean).join(' ');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; base-uri 'self'; frame-ancestors 'self'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src ${connectSources}`
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Serves generated video poster thumbnails directly from the source public folder so
  // newly generated or manually supplied thumbnails are always available without a rebuild.
  app.use('/images/video-thumbnails', express.static(videoThumbnailsDir));

  try {
    const videosDir = path.join(process.cwd(), 'public', 'videos');
    const videoFiles = (await fs.readdir(videosDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && /\.(?:mp4|webm|ogg|mov|m4v)$/i.test(file.name))
      .map((file) => file.name);
    await ensureVideoThumbnails(videoFiles);
  } catch (err) {
    console.warn('Video thumbnail generation skipped:', formatError(err));
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      supabaseConfigured: isSupabaseConfigured,
      submissionDatabaseConfigured: isServerDatabaseConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  // Diagnostics endpoint
  app.get('/api/diagnostics', (req, res) => {
    res.json({
      success: true,
      supabaseConfigured: isSupabaseConfigured,
      submissionDatabaseConfigured: isServerDatabaseConfigured,
    });
  });

  // Submit Booking Endpoint
  app.post('/api/bookings', submissionRateLimit, async (req, res) => {
    if (!isServerDatabaseConfigured) {
      res.status(503).json({
        success: false,
        error: 'Database Configuration Error',
        details:
          'The server database connection is not configured.',
      });
      return;
    }

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
  booking_amount,
  quote,
  website_hp,
} = req.body || {};

      const initialBookingAmount = parseCurrencyAmount(booking_amount ?? quote ?? 0) ?? 0;

      if (website_hp) {
        res.status(400).json({ success: false, error: 'Invalid submission' });
        return;
      }

      const safeName = readText(full_name, 120);
      const safeEmail = isValidEmail(email) ? email.trim() : null;
      const safePhone = isValidPhone(phone) ? phone.trim() : null;
      const safeLocation = readText(event_location, 160);
      const safeDetails = celebration_details === undefined || celebration_details === null
        ? null
        : readText(celebration_details, 4000);
      const safeServices = Array.isArray(services_requested) && services_requested.length <= 10
        ? services_requested.filter((service): service is string => typeof service === 'string' && service.length <= 120)
        : [];

      if (!safeName || !safeEmail || !safePhone || !isValidDate(event_date) || !safeLocation || (celebration_details && !safeDetails)) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: 'Please provide valid name, email, phone, and event location details.',
        });
        return;
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
  booking_amount: initialBookingAmount,
  currency: 'GBP',
  status: 'pending',
};

      let result = await serverDatabase.from('bookings').insert([bookingInsertPayload]);
      const missingOptionalBookingColumn = result.error?.code === '42703' || /(?:currency|booking_amount).*does not exist/i.test(result.error?.message || '');
      if (result.error && missingOptionalBookingColumn) {
        console.warn('[Server API] Optional bookings financial columns missing; retrying booking insert without them.');
        result = await serverDatabase.from('bookings').insert([{
          full_name: safeName,
          email: safeEmail,
          phone: safePhone,
          event_date,
          event_location: safeLocation,
          services_requested: safeServices,
          estimated_guest_count: parsedGuestCount,
          celebration_details: safeDetails,
          status: 'pending',
        }]);
      }

      const { data, error, status } = result;

      if (error) {
        console.error('[Server API] Booking insert/availability error:', error);
        const dateUnavailable = error.message?.toLowerCase().includes('available') || error.code === '23P01' || error.code === '23505';
        res.status(status >= 400 ? status : 500).json({
          success: false,
          error: dateUnavailable ? 'Date Unavailable' : 'Database Operation Error',
          details: dateUnavailable ? 'This date is no longer available. Please select another date.' : 'Unable to record your booking at this time.',
          code: error.code,
        });
        return;
      }

      // Email delivery is best effort: the booking has already been saved.
      const emailResult = await sendBookingNotification({
        full_name: safeName,
        email: safeEmail,
        phone: safePhone,
        event_date,
        event_location: safeLocation,
        services_requested: safeServices,
        estimated_guest_count: parsedGuestCount,
        celebration_details: safeDetails,
      }).catch((emailError) => {
        console.error('[Server API] Unexpected booking email error:', emailError);
        const failure = { success: false, status: 'failed' as const, deliveryStatus: 'failed' as const, error: 'Unexpected booking email failure.' };
        return { customer: failure, admin: failure };
      });

      res.json({
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
    } catch (err: any) {
      console.error('[Server API] Unexpected booking error:', err);
      res.status(500).json({
        success: false,
        error: 'Network Connection Failure',
        details: formatError(err),
      });
    }
  });

  // Update booking status and send only transition-specific customer notifications.
  app.patch('/api/bookings/:id/status', adminStatusRateLimit, async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({ success: false, error: 'Database Configuration Error' });
      return;
    }

    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const bookingId = readText(req.params.id, 120);
    const requestedStatus = readText(req.body?.status, 40)?.toLowerCase();
    const allowedStatuses = ['pending', 'confirmed', 'deposit paid', 'fully paid', 'completed', 'cancelled'];

    if (!accessToken || !bookingId || !requestedStatus || !allowedStatuses.includes(requestedStatus)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID, session, and status are required.' });
      return;
    }

    try {
      const adminUser = await getAuthenticatedAdminUser(accessToken);
      if (!adminUser) {
        res.status(401).json({ success: false, error: 'Authentication Error', details: 'Your admin session is invalid or expired.' });
        return;
      }

      if (!adminUser.isAdmin) {
        console.error('[Server API] Booking status admin authorization error: not an admin');
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You are not authorized to update bookings.' });
        return;
      }

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const { data: existing, error: readError } = await requestSupabase
        .from('bookings')
        .select('id, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at')
        .eq('id', bookingId)
        .maybeSingle();
      if (readError) {
        console.error('[Server API] Booking status read error:', readError);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before updating it.' });
        return;
      }
      if (!existing) {
        res.status(404).json({ success: false, error: 'Booking Not Found' });
        return;
      }

      const previousStatus = String(existing.status || 'pending').trim().toLowerCase();
      const changed = previousStatus !== requestedStatus;
      const shouldNotify = changed && (
        (previousStatus === 'pending' && (requestedStatus === 'confirmed' || requestedStatus === 'cancelled')) ||
        (previousStatus === 'confirmed' && requestedStatus === 'cancelled')
      );

      const { data: updated, error: updateError } = await requestSupabase
        .from('bookings')
        .update({ status: requestedStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', previousStatus)
        .select('id, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at')
        .maybeSingle();
      if (updateError) {
        console.error('[Server API] Booking status update error:', updateError);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to update the booking status.' });
        return;
      }
      if (!updated) {
        res.status(409).json({ success: false, error: 'Booking Status Changed', details: 'The booking was changed by another request. Refresh and try again.' });
        return;
      }

      let emailWarning: string | undefined;
      if (shouldNotify && (requestedStatus === 'confirmed' || requestedStatus === 'cancelled')) {
        const emailResult = await sendBookingStatusNotification(updated, requestedStatus).catch((emailError) => {
          console.error('[Server API] Unexpected booking status email error:', emailError);
          return { success: false, status: 'failed' as const, deliveryStatus: 'failed' as const, error: 'Unexpected booking status email failure.' };
        });
        if (!emailResult.success) {
          emailWarning = emailResult.error || 'The status changed, but the customer email was not submitted.';
          console.error('[Server API] Booking status email error:', emailWarning);
        }
      }

      res.json({ success: true, data: updated, emailWarning });
    } catch (error) {
      console.error('[Server API] Unexpected booking status error:', error);
      res.status(500).json({ success: false, error: 'Booking Status Error', details: 'Unable to update the booking status.' });
    }
  });

  app.patch('/api/bookings/:id', adminStatusRateLimit, async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({ success: false, error: 'Database Configuration Error' });
      return;
    }

    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const bookingId = readText(req.params.id, 120);
    if (!accessToken || !bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID and session are required.' });
      return;
    }

    try {
      const adminUser = await getAuthenticatedAdminUser(accessToken);
      if (!adminUser) {
        res.status(401).json({ success: false, error: 'Authentication Error', details: 'Your admin session is invalid or expired.' });
        return;
      }
      if (!adminUser.isAdmin) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You are not authorized to update booking details.' });
        return;
      }

      const payload = req.body || {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (payload.event_date !== undefined) {
        const eventDate = payload.event_date === null || payload.event_date === '' ? null : payload.event_date;
        if (eventDate !== null && !isValidDate(eventDate)) {
          res.status(400).json({ success: false, error: 'Validation Error', details: 'The booking event date is invalid.' });
          return;
        }
        updates.event_date = eventDate;
      }

      if (payload.event_location !== undefined) {
        const location = readText(payload.event_location, 160);
        updates.event_location = location ?? null;
      }

      if (payload.celebration_details !== undefined) {
        const message = payload.celebration_details === null ? null : readText(payload.celebration_details, 4000);
        updates.celebration_details = message;
      }

      if (payload.estimated_guest_count !== undefined) {
        const guestCount = parseGuestCount(payload.estimated_guest_count);
        if (payload.estimated_guest_count !== null && payload.estimated_guest_count !== '' && guestCount === null) {
          res.status(400).json({ success: false, error: 'Validation Error', details: 'The estimated guest count is invalid.' });
          return;
        }
        updates.estimated_guest_count = guestCount;
      }

      let bookingAmount: number | null = null;
      if (payload.booking_amount !== undefined) {
        bookingAmount = payload.booking_amount === null || payload.booking_amount === '' ? 0 : parseCurrencyAmount(payload.booking_amount);
        if (bookingAmount === null || bookingAmount <= 0) {
          res.status(400).json({ success: false, error: 'Validation Error', details: 'The total amount charged must be a positive number greater than zero.' });
          return;
        }
        updates.booking_amount = bookingAmount;
      }

      if (payload.currency !== undefined) {
        const bookingCurrency = parseCurrencyCode(payload.currency) || 'GBP';
        updates.currency = bookingCurrency;
      }

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const bookingSelect = 'id, full_name, email, phone, event_date, event_location, booking_amount, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at';
      let { data: updated, error } = await requestSupabase
        .from('bookings')
        .update(updates)
        .eq('id', bookingId)
        .select(bookingSelect)
        .maybeSingle();

      if (error && error.code === '42703' && updates.currency !== undefined) {
        console.warn('[Server API] bookings.currency column missing; retrying booking update without currency field.');
        const { currency: _unusedCurrency, ...updatesWithoutCurrency } = updates;
        ({ data: updated, error } = await requestSupabase
          .from('bookings')
          .update(updatesWithoutCurrency)
          .eq('id', bookingId)
          .select(bookingSelect)
          .maybeSingle());
      }

      if (error) {
        console.error('[Server API] Booking detail update error:', error);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: error.message || 'Unable to update the booking details.' });
        return;
      }
      if (!updated) {
        res.status(404).json({ success: false, error: 'Booking Not Found', details: 'The booking could not be updated. Confirm your admin account still has update access to this booking.' });
        return;
      }

      const persistedBookingAmount = parseCurrencyAmount(updated.booking_amount);
      if (payload.booking_amount !== undefined && persistedBookingAmount !== bookingAmount) {
        console.error('[Server API] Booking amount persistence verification failed:', {
          bookingId,
          requested: bookingAmount,
          persisted: updated.booking_amount,
        });
        res.status(500).json({ success: false, error: 'Database Verification Error', details: 'The booking total was not persisted.' });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('[Server API] Unexpected booking update error:', error);
      res.status(500).json({ success: false, error: 'Booking Update Error', details: 'Unable to update the booking details.' });
    }
  });

  app.delete('/api/bookings/:id', adminStatusRateLimit, async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({ success: false, error: 'Database Configuration Error' });
      return;
    }

    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const bookingId = readText(req.params.id, 120);
    if (!accessToken || !bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID and session are required.' });
      return;
    }

    try {
      const adminUser = await getAuthenticatedAdminUser(accessToken);
      if (!adminUser) {
        res.status(401).json({ success: false, error: 'Authentication Error', details: 'Your admin session is invalid or expired.' });
        return;
      }
      if (!adminUser.isAdmin) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You are not authorized to delete bookings.' });
        return;
      }

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const { data: existingBooking, error: existingError } = await requestSupabase
        .from('bookings')
        .select('id, status')
        .eq('id', bookingId)
        .maybeSingle();

      if (existingError) {
        console.error('[Server API] Booking delete pre-read error:', existingError);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before deleting it.' });
        return;
      }
      if (!existingBooking) {
        res.status(404).json({ success: false, error: 'Booking Not Found', details: 'This booking no longer exists.' });
        return;
      }

      const { data: deleted, error } = await requestSupabase
        .from('bookings')
        .delete()
        .eq('id', bookingId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[Server API] Booking delete error:', error);
        // 23503: a dependent row (for example a payment) still references this booking.
        if (error.code === '23503') {
          res.status(409).json({
            success: false,
            error: 'Deletion Blocked',
            details: 'This booking still has linked records (such as payments) and the database is refusing to delete it. Remove or reassign those records first.',
            code: error.code,
          });
          return;
        }
        // 42501: the authenticated role has no DELETE privilege on the table.
        if (error.code === '42501') {
          res.status(403).json({
            success: false,
            error: 'Database Privilege Missing',
            details: 'The database has not granted DELETE on public.bookings to authenticated users, so no admin can delete a booking. Run: GRANT DELETE ON public.bookings TO authenticated;',
            code: error.code,
          });
          return;
        }
        res.status(500).json({ success: false, error: 'Database Operation Error', details: error.message || 'Unable to delete this booking.', code: error.code });
        return;
      }

      if (!deleted) {
        // The booking exists but no row was removed, so a delete policy refused it.
        console.error('[Server API] Booking delete blocked by row level security:', { bookingId, isOwner: adminUser.isOwner });
        res.status(403).json({
          success: false,
          error: 'Authorization Error',
          details: adminUser.isOwner
            ? 'The database refused the deletion. No delete policy currently matches this account.'
            : 'Permanent deletion is restricted to the owner account.',
        });
        return;
      }

      const { data: stillPresent } = await requestSupabase
        .from('bookings')
        .select('id')
        .eq('id', bookingId)
        .maybeSingle();

      if (stillPresent) {
        console.error('[Server API] Booking delete verification failed; row still present:', bookingId);
        res.status(500).json({ success: false, error: 'Database Verification Error', details: 'The booking was reported as deleted but is still present.' });
        return;
      }

      res.json({ success: true, data: deleted });
    } catch (error) {
      console.error('[Server API] Unexpected booking delete error:', error);
      res.status(500).json({ success: false, error: 'Booking Delete Error', details: 'Unable to permanently delete the booking.' });
    }
  });

  app.post('/api/bookings/:id/payments', adminStatusRateLimit, async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({ success: false, error: 'Database Configuration Error' });
      return;
    }

    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const bookingId = readText(req.params.id, 120);
    const payload = req.body || {};

    if (!accessToken || !bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID and session are required.' });
      return;
    }

    const amount = parseCurrencyAmount(payload.amount);
    const currency = parseCurrencyCode(payload.currency) || 'GBP';
    const paymentType = readText(payload.payment_type, 20);
    const provider = readText(payload.provider, 20);
    const paymentStatus = readText(payload.status, 30)?.toLowerCase() || 'successful';
    const paymentMethod = readText(payload.payment_method, 60);
    const gatewayReference = payload.gateway_reference === undefined || payload.gateway_reference === null ? null : readText(payload.gateway_reference, 180);
    const gatewayTransactionId = payload.gateway_transaction_id === undefined || payload.gateway_transaction_id === null ? null : readText(payload.gateway_transaction_id, 180);
    const allowedPaymentTypes = ['deposit', 'balance', 'full', 'refund'];
    const allowedProviders = ['paystack', 'flutterwave', 'manual'];
    const allowedPaymentStatuses = ['pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded', 'partially_refunded'];

    if (!amount || amount <= 0 || !paymentType || !allowedPaymentTypes.includes(paymentType) || !provider || !allowedProviders.includes(provider) || !allowedPaymentStatuses.includes(paymentStatus)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid positive amount, currency, payment type, provider, and status are required.' });
      return;
    }

    try {
      const adminUser = await getAuthenticatedAdminUser(accessToken);
      if (!adminUser) {
        res.status(401).json({ success: false, error: 'Authentication Error', details: 'Your admin session is invalid or expired.' });
        return;
      }
      if (!adminUser.isAdmin) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You are not authorized to record payments.' });
        return;
      }

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const { data: booking, error: bookingError } = await requestSupabase
        .from('bookings')
        .select('id, full_name, email, booking_amount')
        .eq('id', bookingId)
        .maybeSingle();

      if (bookingError) {
        console.error('[Server API] Payment booking lookup error:', bookingError);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to read the booking before recording payment.' });
        return;
      }
      if (!booking) {
        res.status(404).json({ success: false, error: 'Booking Not Found' });
        return;
      }

      const totalBookingAmount = parseCurrencyAmount(booking.booking_amount ?? 0) ?? 0;
      if (paymentStatus === 'successful' && totalBookingAmount > 0) {
        const { data: successfulPayments, error: successfulPaymentError } = await requestSupabase
          .from('payments')
          .select('amount, status, payment_type')
          .eq('booking_id', bookingId)
          .eq('status', 'successful');

        if (successfulPaymentError) {
          console.error('[Server API] Successful payment total lookup error:', successfulPaymentError);
          res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to validate the remaining booking balance.' });
          return;
        }

        const paidToDate = (successfulPayments ?? []).reduce((sum, payment) => {
          const value = parseCurrencyAmount(payment.amount) ?? 0;
          return payment.payment_type === 'refund' ? sum - value : sum + value;
        }, 0);
        const remainingBalance = Math.max(0, totalBookingAmount - paidToDate);
        if (amount > remainingBalance) {
          res.status(400).json({ success: false, error: 'Validation Error', details: `This payment exceeds the remaining balance of ${remainingBalance}.` });
          return;
        }
      }

      const { data: paymentRow, error: paymentError } = await requestSupabase
        .from('payments')
        .insert([{
          booking_id: bookingId,
          user_id: adminUser.userId,
          amount,
          currency,
          payment_type: paymentType,
          provider,
          status: paymentStatus,
          gateway_reference: gatewayReference,
          gateway_transaction_id: gatewayTransactionId,
          payment_method: paymentMethod,
          customer_email: booking.email,
          metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
          paid_at: paymentStatus === 'successful' ? new Date().toISOString() : null,
        }])
        .select('id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at')
        .maybeSingle();

      if (paymentError) {
        console.error('[Server API] Payment record insert error:', paymentError);
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'The payments table may be missing or the database rules may be blocking the insert.' });
        return;
      }

      const { data: persistedBooking, error: persistedBookingError } = await requestSupabase
        .from('bookings')
        .select('id, booking_amount')
        .eq('id', bookingId)
        .maybeSingle();
      const { data: persistedPayments, error: persistedPaymentsError } = await requestSupabase
        .from('payments')
        .select('amount, status, payment_type')
        .eq('booking_id', bookingId);

      if (persistedBookingError || persistedPaymentsError || !persistedBooking) {
        console.error('[Server API] Payment persistence verification failed:', {
          bookingId,
          bookingError: persistedBookingError,
          paymentsError: persistedPaymentsError,
          persistedBooking,
        });
        res.status(500).json({ success: false, error: 'Database Verification Error', details: 'The payment was inserted but its accounting totals could not be verified.' });
        return;
      }

      const persistedBookingAmount = parseCurrencyAmount(persistedBooking.booking_amount ?? 0) ?? 0;
      const totalAmountPaid = Math.max(0, (persistedPayments ?? []).reduce((sum, payment) => {
        if ((payment.status || '').toLowerCase() !== 'successful') return sum;
        const value = parseCurrencyAmount(payment.amount) ?? 0;
        return payment.payment_type === 'refund' ? sum - value : sum + value;
      }, 0));
      const balanceDue = Math.max(0, persistedBookingAmount - totalAmountPaid);
      console.info('[D’Fabulous Admin] Payment accounting:', {
        bookingId,
        bookingAmount: persistedBookingAmount,
        newPaymentAmount: amount,
        totalAmountPaid,
        balanceDue,
      });

      const calculatedPaymentStatus = persistedBookingAmount <= 0
        ? 'unpaid'
        : totalAmountPaid <= 0
          ? 'unpaid'
          : totalAmountPaid < persistedBookingAmount
            ? 'part payment'
            : 'fully paid';
      res.json({
        success: true,
        data: paymentRow,
        accounting: {
          bookingAmount: persistedBookingAmount,
          amountPaid: totalAmountPaid,
          balanceDue,
          paymentStatus: calculatedPaymentStatus,
          currency,
        },
      });
    } catch (error) {
      console.error('[Server API] Unexpected payment recording error:', error);
      res.status(500).json({ success: false, error: 'Payment Error', details: 'Unable to record the payment.' });
    }
  });

  // Submit Message Endpoint
  app.post('/api/messages', submissionRateLimit, async (req, res) => {
    if (!isServerDatabaseConfigured) {
      res.status(503).json({
        success: false,
        error: 'Database Configuration Error',
        details:
          'The server database connection is not configured.',
      });
      return;
    }

    try {
      const { full_name, email, phone, subject, message, website_hp } = req.body || {};

      if (website_hp) {
        res.status(400).json({ success: false, error: 'Invalid submission' });
        return;
      }

      const safeName = readText(full_name, 120);
      const safeEmail = isValidEmail(email) ? email.trim() : null;
      const safePhone = phone ? (isValidPhone(phone) ? phone.trim() : null) : null;
      const safeSubject = subject ? readText(subject, 160) : 'General Inquiry';
      const safeMessage = readText(message, 4000);

      if (!safeName || !safeEmail || !safeMessage || (phone && !safePhone) || !safeSubject) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: 'Please provide valid name, email, and message details.',
        });
        return;
      }

      const { data, error, status } = await serverDatabase
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
        console.error('[Server API] Message insert error:', error);
        res.status(status >= 400 ? status : 500).json({
          success: false,
          error: 'Database Operation Error',
          details: formatError(error),
          code: error.code,
        });
        return;
      }

      // Trigger server-side notification email (errors handled internally so user submission is preserved)
      sendContactNotification({
        full_name: safeName,
        email: safeEmail,
        phone: safePhone,
        subject: safeSubject,
        message: safeMessage,
      }).catch((emailErr) => {
        console.error('[Server API] Uncaught contact notification error:', emailErr);
      });

      res.json({
        success: true,
        message: 'Message successfully delivered.',
        data,
      });
    } catch (err: any) {
      console.error('[Server API] Unexpected message error:', err);
      res.status(500).json({
        success: false,
        error: 'Network Connection Failure',
        details: formatError(err),
      });
    }
  });

  // Get Services Endpoint
  app.get('/api/services', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.json({ success: false, data: [] });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        res.json({ success: false, error: formatError(error), data: [] });
        return;
      }

      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      res.json({ success: false, error: formatError(err), data: [] });
    }
  });

  // Get Gallery Endpoint
  app.get('/api/gallery', async (req, res) => {
    if (!isSupabaseConfigured) {
      const localGallery = await buildCanonicalGalleryResponse();
      res.json({
        success: true,
        data: localGallery,
        warning: 'Supabase is not configured. Serving centralized local gallery images.',
      });
      return;
    }

    try {
      const { data, error } = await serverDatabase
        .from('gallery')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        const localGallery = await getLocalGalleryItems();
        res.json({
          success: true,
          data: localGallery,
          warning: `Supabase gallery query failed. Serving centralized local gallery images. Supabase error: ${formatError(error)}`,
        });
        return;
      }

      const canonicalGallery = await buildCanonicalGalleryResponse(data || []);
      res.json({ success: true, data: canonicalGallery });
    } catch (err: any) {
      const localGallery = await buildCanonicalGalleryResponse();
      res.json({
        success: true,
        data: localGallery,
        warning: `Supabase gallery query failed. Serving centralized local gallery images. Supabase error: ${formatError(err)}`,
      });
    }
  });

  // Get Videos Endpoint
  app.get('/api/videos', async (req, res) => {
    try {
      const localVideos = await getLocalVideoItems();
      res.json({ success: true, data: localVideos });
    } catch (err: any) {
      res.json({ success: false, error: formatError(err), data: [] });
    }
  });

  // Get Testimonials Endpoint
  app.get('/api/testimonials', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.json({ success: false, data: [] });
      return;
    }

    try {
      const { data, error } = await serverDatabase
        .from('testimonials')
        .select('*')
        .eq('is_featured', true)
        .order('display_order', { ascending: true });

      if (error) {
        res.json({ success: false, error: formatError(error), data: [] });
        return;
      }

      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      res.json({ success: false, error: formatError(err), data: [] });
    }
  });

  // Get Site Settings Endpoint
  app.get('/api/settings', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.json({ success: false, data: {} });
      return;
    }

    try {
      const { data, error } = await serverDatabase.from('site_settings').select('key, value');

      if (error) {
        res.json({ success: false, error: formatError(error), data: {} });
        return;
      }

      const settingsMap: Record<string, unknown> = {};
      (data || []).forEach((row: { key: string; value: unknown }) => {
        settingsMap[row.key] = row.value;
      });

      res.json({ success: true, data: settingsMap });
    } catch (err: any) {
      res.json({ success: false, error: formatError(err), data: {} });
    }
  });

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        host: 'localhost',
          port,
        strictPort: true,
        middlewareMode: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  await listenOnPort(port);
}

startServer();
