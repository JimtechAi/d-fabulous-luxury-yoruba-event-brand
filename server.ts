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

  const publicApiBaseUrl = 'https://d-fabulous-luxury-yoruba-event-brand-1.onrender.com';

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
    // Exclude responsive image variants (files ending with -400w, -800w, -1200w, -1600w, etc.)
    .filter((file) => !/-(?:400|800|1200|1600)w\./i.test(file.name))
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
const ALL_PERMISSION_KEYS = [
  'bookings.view', 'bookings.manage',
  'messages.view', 'messages.manage',
  'payments.view', 'payments.manage',
  'testimonials.view', 'testimonials.manage',
  'gallery.view', 'gallery.manage',
  'services.view', 'services.manage',
  'settings.view', 'settings.manage',
  'users.view', 'users.manage',
  'diagnostics.view',
] as const;

const ROLE_OPTIONS = ['owner', 'admin', 'staff', 'viewer'] as const;

function normalizePermissions(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  const unique = new Set<string>();
  for (const item of permissions) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || !ALL_PERMISSION_KEYS.includes(trimmed as typeof ALL_PERMISSION_KEYS[number])) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function isRoleOption(value: unknown): value is (typeof ROLE_OPTIONS)[number] {
  return typeof value === 'string' && ROLE_OPTIONS.includes(value as (typeof ROLE_OPTIONS)[number]);
}

function sanitizeUserRecord(record: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!record) return null;
  return {
    id: record.id,
    email: record.email ?? null,
    full_name: record.full_name ?? record.name ?? null,
    role: record.role ?? 'viewer',
    is_active: Boolean(record.is_active !== false),
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
    last_sign_in_at: record.last_sign_in_at ?? null,
  };
}

async function appendAuditLog(entry: {
  actor_user_id: string | null;
  action: string;
  target_user_id?: string | null;
  metadata?: Record<string, any>;
}) {
  if (!isServerDatabaseConfigured) return;

  try {
    await serverDatabase
      .from('audit_logs')
      .insert([
        {
          actor_user_id: entry.actor_user_id,
          action: entry.action,
          target_user_id: entry.target_user_id ?? null,
          metadata: entry.metadata ?? {},
          created_at: new Date().toISOString(),
        },
      ]);
  } catch (error) {
    console.warn('[Server API] Audit log write failed:', formatError(error));
  }
}

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

async function getAuthenticatedAdminUser(accessToken: string): Promise<{
  userId: string;
  role: string;
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  permissions: Set<string>;
  profile: Record<string, any> | null;
} | null> {
  const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await requestSupabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    console.info('[AUTH DEBUG]', { authenticated: false, user_id: null, profile_found: false, role: null, is_active: false, permissions_count: 0, authorized: false, reason: 'supabase_user_validation_failed' });
    return null;
  }

  const { data: profileData, error: profileError } = await requestSupabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    const databaseReason = profileError
      ? profileError.code === 'PGRST116' ? 'profile_query_multiple_or_missing_row'
        : profileError.code === 'PGRST204' ? 'profile_column_missing'
          : profileError.code === '42P01' ? 'profile_table_missing'
            : profileError.code === '42501' ? 'profile_permission_denied'
              : 'profile_query_failed'
      : 'profile_not_found';
    console.info('[AUTH DEBUG]', { authenticated: true, user_id: userData.user.id, profile_found: false, role: null, is_active: false, permissions_count: 0, authorized: false, reason: databaseReason, database_error_code: profileError?.code || null });
    return null;
  }

  const profile = sanitizeUserRecord(profileData) || {
    id: userData.user.id,
    email: userData.user.email ?? null,
    full_name: userData.user.user_metadata?.full_name ?? null,
    role: 'viewer',
    is_active: true,
    created_at: null,
    updated_at: null,
    last_sign_in_at: null,
  };

  const role = String(profile.role || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || isOwner;
  const isActive = profile.is_active === true;

  let permissions = new Set<string>();
  if (isOwner) {
    for (const permission of ALL_PERMISSION_KEYS) permissions.add(permission);
  } else if (isServerDatabaseConfigured) {
    const { data: permissionRows } = await requestSupabase
      .from('user_permissions')
      .select('permission_key')
      .eq('user_id', userData.user.id);

    const rows = Array.isArray(permissionRows) ? permissionRows : [];
    for (const row of rows) {
      if (typeof row?.permission_key === 'string') permissions.add(row.permission_key);
    }
  }

  console.info('[AUTH DEBUG]', { authenticated: true, user_id: userData.user.id, profile_found: true, profile_columns: Object.keys(profileData).sort(), role, is_active: isActive, permissions_count: permissions.size, permissions: Array.from(permissions), authorized: isActive && isRoleOption(role), reason: !Object.prototype.hasOwnProperty.call(profileData, 'is_active') ? 'is_active_column_missing' : !isActive ? 'inactive_profile' : !isRoleOption(role) ? 'unsupported_role' : 'profile_loaded' });

  return {
    userId: userData.user.id,
    role,
    isAdmin,
    isOwner,
    isActive,
    permissions,
    profile,
  };
}

function getAuthorizationError(code: string, message: string) {
  return { success: false, error: code, details: message };
}

async function requireAdminAccess(
  req: express.Request,
  requiredPermissions: string[] = []
): Promise<{ adminUser: { userId: string; role: string; isAdmin: boolean; isOwner: boolean; isActive: boolean; permissions: Set<string>; profile: Record<string, any> | null } | null; response: { status: number; json: any } | null }> {
  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!accessToken) {
    return {
      adminUser: null,
      response: { status: 401, json: getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.') },
    };
  }

  const adminUser = await getAuthenticatedAdminUser(accessToken);
  if (!adminUser) {
    return {
      adminUser: null,
      response: { status: 401, json: getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.') },
    };
  }

  if (!adminUser.isActive) {
    return {
      adminUser: null,
      response: { status: 403, json: getAuthorizationError('Authorization Error', 'This administrator account is inactive.') },
    };
  }

  if (!adminUser.isAdmin && !adminUser.isOwner && requiredPermissions.length === 0) {
    return {
      adminUser: null,
      response: { status: 403, json: getAuthorizationError('Authorization Error', 'You are not authorized to access this administrative area.') },
    };
  }

  if (requiredPermissions.length > 0 && !adminUser.isOwner) {
    const missingPermission = requiredPermissions.find((permission) => !adminUser.permissions.has(permission));
    if (missingPermission) {
      return {
        adminUser,
        response: { status: 403, json: getAuthorizationError('Authorization Error', `You are missing the required permission: ${missingPermission}.`) },
      };
    }
  }

  return { adminUser, response: null };
}

async function startServer() {
  // Validate critical environment variables at startup
  const missingVars: string[] = [];

  if (!isSupabaseConfigured) {
    missingVars.push('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  if (!isServerDatabaseConfigured) {
    console.warn(
      '[Warning] Server-side Supabase configuration incomplete. ' +
      'Admin features (bookings, payments, settings) will not work. ' +
      'Ensure SUPABASE_SERVICE_ROLE_KEY is set.'
    );
  }

  if (missingVars.length > 0) {
    console.error(
      '[Error] Cannot start server. Missing required environment variables:\n' +
      missingVars.map((v) => `  - ${v}`).join('\n') +
      '\n\nPlease configure environment variables and restart.'
    );
    process.exit(1);
  }

  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  // CORS: Build allowed origins from env var + hardcoded defaults
  const envOrigins = cleanEnv(process.env.CORS_ALLOWED_ORIGINS)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = [
    'https://d-fabulous-luxury-yoruba-event-brand.vercel.app', // Corrected Vercel URL
    'https://d-fabulous-luxury-yoruba-event-brand-295u9mu9y-jim-tech-ai.vercel.app',
    'https://dfabulous.co.uk',
    'https://www.dfabulous.co.uk',
    ...envOrigins,
  ]
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => Boolean(origin) && (
      process.env.NODE_ENV !== 'production' || !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)
    ));

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
  app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: 'Request Too Large', details: 'Please reduce the request size and try again.' });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ success: false, error: 'Invalid Request', details: 'The request body could not be read.' });
      return;
    }
    next(error);
  });
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
    const connectSources = [`'self'`, `ws:`, `wss:`, supabaseUrl, publicApiBaseUrl].filter(Boolean).join(' ');
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
      timestamp: new Date().toISOString(),
    });
  });

  // Diagnostics endpoint
  app.get('/api/diagnostics', (req, res) => {
    res.json({
      success: true,
      status: 'ok',
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
  website_hp,
} = req.body || {};

      if (website_hp) {
        res.status(400).json({ success: false, error: 'Invalid submission' });
        return;
      }

      const safeName = readText(full_name, 120);
      const safeEmail = isValidEmail(email) ? email.trim() : null;
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
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: 'Please provide valid name, email, event date, and event location details.',
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
  status: 'pending',
};

      const result = await serverDatabase.from('bookings').insert([bookingInsertPayload]);

      const { data, error, status } = result;

      if (error) {
        console.error('[Server API] Booking insert/availability error:', error);
        const dateUnavailable = error.message?.toLowerCase().includes('available')
          || error.code === '23P01'
          || (error.code === '23505' && error.message?.includes('bookings_active_event_date_unique'));
        res.status(status >= 400 ? status : 500).json({
          success: false,
          error: dateUnavailable ? 'Date Unavailable' : 'Database Operation Error',
          details: dateUnavailable ? 'This date is no longer available. Please select another date.' : 'Unable to record your booking at this time.',
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
          details: 'Unable to record your booking at this time.',
      });
    }
  });

  // Update booking status and send only transition-specific customer notifications.
  app.patch('/api/bookings/:id/status', adminStatusRateLimit, async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({ success: false, error: 'Database Configuration Error' });
      return;
    }

    const bookingId = readText(req.params.id, 120);
    const requestedStatus = readText(req.body?.status, 40)?.toLowerCase();
    const allowedStatuses = ['pending', 'confirmed', 'deposit paid', 'fully paid', 'completed', 'cancelled'];

    if (!bookingId || !requestedStatus || !allowedStatuses.includes(requestedStatus)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID and status are required.' });
      return;
    }

    try {
      const accessCheck = await requireAdminAccess(req, ['bookings.manage']);
      if (accessCheck.response) {
        res.status(accessCheck.response.status).json(accessCheck.response.json);
        return;
      }
      const adminUser = accessCheck.adminUser!;
      const accessToken = req.headers.authorization!.slice(7).trim();

      const requestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const { data: existing, error: readError } = await requestSupabase
        .from('bookings')
        .select('id, booking_reference, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at')
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
        (previousStatus === 'pending' && requestedStatus === 'cancelled') ||
        (previousStatus === 'confirmed' && requestedStatus === 'cancelled')
      );

      const { data: updated, error: updateError } = await requestSupabase
        .from('bookings')
        .update({ status: requestedStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', previousStatus)
        .select('id, booking_reference, full_name, email, phone, event_date, event_location, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at')
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
      if (shouldNotify && requestedStatus === 'cancelled') {
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

    const bookingId = readText(req.params.id, 120);
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' });
      return;
    }

    try {
      const accessCheck = await requireAdminAccess(req, ['bookings.manage']);
      if (accessCheck.response) {
        res.status(accessCheck.response.status).json(accessCheck.response.json);
        return;
      }
      const accessToken = req.headers.authorization!.slice(7).trim();

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

      const bookingSelect = 'id, booking_reference, full_name, email, phone, event_date, event_location, booking_amount, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at';
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
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to update the booking details.' });
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

    const bookingId = readText(req.params.id, 120);
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' });
      return;
    }

    try {
      const accessCheck = await requireAdminAccess(req, ['bookings.manage']);
      if (accessCheck.response) {
        res.status(accessCheck.response.status).json(accessCheck.response.json);
        return;
      }
      const adminUser = accessCheck.adminUser!;
      const accessToken = req.headers.authorization!.slice(7).trim();

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
          });
          return;
        }
        // 42501: the authenticated role has no DELETE privilege on the table.
        if (error.code === '42501') {
          res.status(403).json({
            success: false,
            error: 'Database Privilege Missing',
            details: 'This booking cannot be deleted with the current account permissions.',
          });
          return;
        }
        res.status(500).json({ success: false, error: 'Database Operation Error', details: 'Unable to delete this booking.' });
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

    const bookingId = readText(req.params.id, 120);
    const payload = req.body || {};

    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid booking ID is required.' });
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
      const accessCheck = await requireAdminAccess(req, ['payments.manage']);
      if (accessCheck.response) {
        res.status(accessCheck.response.status).json(accessCheck.response.json);
        return;
      }
      const adminUser = accessCheck.adminUser!;
      const accessToken = req.headers.authorization!.slice(7).trim();

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
          details: 'Unable to deliver your message at this time.',
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
        details: 'Unable to deliver your message at this time.',
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
        console.error('[Server API] Services query error:', error);
        res.json({ success: false, error: 'Unable to load services at this time.', data: [] });
        return;
      }

      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error('[Server API] Unexpected services query error:', err);
      res.json({ success: false, error: 'Unable to load services at this time.', data: [] });
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
          warning: 'Gallery content is temporarily being served from the local catalogue.',
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
        warning: 'Gallery content is temporarily being served from the local catalogue.',
      });
    }
  });

  // Get Videos Endpoint
  app.get('/api/videos', async (req, res) => {
    try {
      const localVideos = await getLocalVideoItems();
      res.json({ success: true, data: localVideos });
    } catch (err: any) {
      console.error('[Server API] Unexpected videos query error:', err);
      res.json({ success: false, error: 'Unable to load videos at this time.', data: [] });
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
        console.error('[Server API] Testimonials query error:', error);
        res.json({ success: false, error: 'Unable to load testimonials at this time.', data: [] });
        return;
      }

      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error('[Server API] Unexpected testimonials query error:', err);
      res.json({ success: false, error: 'Unable to load testimonials at this time.', data: [] });
    }
  });

  app.get('/api/admin/data/:resource', async (req, res) => {
    const resource = readText(req.params.resource, 40);
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
      res.status(404).json({ success: false, error: 'Not Found' });
      return;
    }
    const resourceName = resource as string;

    const accessCheck = await requireAdminAccess(req, [requiredPermission]);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }

    const selections: Record<string, string> = {
      bookings: 'id, booking_reference, full_name, email, phone, event_date, event_location, booking_amount, currency, services_requested, estimated_guest_count, celebration_details, status, created_at, updated_at',
      payments: 'id, booking_id, user_id, amount, currency, payment_type, provider, status, gateway_reference, gateway_transaction_id, payment_method, customer_email, metadata, paid_at, created_at, updated_at',
      messages: 'id, full_name, email, phone, subject, message, status, created_at, updated_at',
      services: 'id, slug, title, yoruba_name, short_description, full_description, category, icon_name, is_active, display_order',
      settings: 'key, value',
      blocked_dates: '*',
    };

    try {
      let query = serverDatabase.from(resourceName).select(selections[resourceName]);
      if (resourceName === 'settings') query = query.order('key', { ascending: true });
      else if (resourceName === 'blocked_dates') query = query.order('event_date', { ascending: true });
      else if (resourceName === 'services') query = query.order('display_order', { ascending: true });
      else query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        console.error(`[Server API] Admin ${resourceName} read error:`, error);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to load administrative data.' });
        return;
      }

      if (resourceName === 'payments') {
        const paymentRows = data || [];
        const bookingIds = Array.from(new Set(paymentRows.map((payment: any) => payment.booking_id).filter(Boolean)));
        if (bookingIds.length) {
          const { data: bookings } = await serverDatabase.from('bookings').select('id, full_name, email').in('id', bookingIds);
          const customers = new Map((bookings || []).map((booking: any) => [booking.id, booking]));
          res.json({ success: true, data: paymentRows.map((payment: any) => ({
            ...payment,
            customer_name: customers.get(payment.booking_id)?.full_name || null,
            customer_email: payment.customer_email || customers.get(payment.booking_id)?.email || null,
          })) });
          return;
        }
      }

      res.json({ success: true, data: data || [] });
    } catch (error) {
      console.error(`[Server API] Unexpected admin ${resourceName} read error:`, error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to load administrative data.' });
    }
  });

  app.get('/api/admin/session', async (req, res) => {
    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!accessToken) {
      res.status(401).json(getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.'));
      return;
    }

    try {
      const adminUser = await getAuthenticatedAdminUser(accessToken);
      if (!adminUser) {
        res.status(401).json(getAuthorizationError('Authentication Error', 'Your admin session is invalid or expired.'));
        return;
      }
      if (!adminUser.isActive) {
        console.info('[AUTH DEBUG]', { authenticated: true, user_id: adminUser.userId, profile_found: true, role: adminUser.role, is_active: false, permissions_count: adminUser.permissions.size, authorized: false, reason: 'inactive_profile' });
        res.status(403).json(getAuthorizationError('Authorization Error', 'This administrator account is inactive.'));
        return;
      }
      if (!isRoleOption(adminUser.role)) {
        console.info('[AUTH DEBUG]', { authenticated: true, user_id: adminUser.userId, profile_found: true, role: adminUser.role, is_active: true, permissions_count: adminUser.permissions.size, authorized: false, reason: 'unsupported_role' });
        res.status(403).json(getAuthorizationError('Authorization Error', 'You are not authorized to access this administrative area.'));
        return;
      }
      console.info('[AUTH DEBUG]', { authenticated: true, user_id: adminUser.userId, profile_found: true, role: adminUser.role, is_active: true, permissions_count: adminUser.permissions.size, authorized: true, reason: 'authorized' });
      res.json({
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
      console.error('[Server API] Admin session lookup error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to verify the administrative session.' });
    }
  });

  app.patch('/api/admin/messages/:id', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['messages.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }
    const messageId = readText(req.params.id, 120);
    const status = readText(req.body?.status, 40);
    if (!messageId || !status) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid message ID and status are required.' });
      return;
    }
    try {
      const { data, error } = await serverDatabase.from('messages').update({ status, updated_at: new Date().toISOString() }).eq('id', messageId).select('id, full_name, email, phone, subject, message, status, created_at, updated_at').maybeSingle();
      if (error) {
        console.error('[Server API] Admin message update error:', error);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update the message.' });
        return;
      }
      if (!data) {
        res.status(404).json({ success: false, error: 'Message Not Found' });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      console.error('[Server API] Unexpected admin message update error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update the message.' });
    }
  });

  app.post('/api/admin/blocked-dates', adminStatusRateLimit, async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['bookings.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }
    const eventDate = req.body?.event_date;
    const note = req.body?.note === undefined ? null : readText(req.body.note, 240);
    if (!isValidDate(eventDate)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid event date is required.' });
      return;
    }
    try {
      const { data, error } = await serverDatabase.from('blocked_dates').insert({ event_date: eventDate, note, created_by: accessCheck.adminUser!.userId }).select('*').single();
      if (error) {
        console.error('[Server API] Admin blocked date creation error:', error);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to block this date.' });
        return;
      }
      res.status(201).json({ success: true, data });
    } catch (error) {
      console.error('[Server API] Unexpected blocked date creation error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to block this date.' });
    }
  });

  app.delete('/api/admin/blocked-dates/:eventDate', adminStatusRateLimit, async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['bookings.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }
    const eventDate = req.params.eventDate;
    if (!isValidDate(eventDate)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid event date is required.' });
      return;
    }
    try {
      const { error } = await serverDatabase.from('blocked_dates').delete().eq('event_date', eventDate);
      if (error) {
        console.error('[Server API] Admin blocked date deletion error:', error);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to unblock this date.' });
        return;
      }
      res.json({ success: true, data: { event_date: eventDate } });
    } catch (error) {
      console.error('[Server API] Unexpected blocked date deletion error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to unblock this date.' });
    }
  });

  app.put('/api/admin/settings', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['settings.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }
    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'Settings values are required.' });
      return;
    }
    const entries = Object.entries(values).filter(([key, value]) => readText(key, 120) && (typeof value === 'string' || typeof value === 'boolean'));
    if (entries.length !== Object.keys(values).length || entries.length > 50) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'Settings values are invalid.' });
      return;
    }
    try {
      for (const [key, value] of entries) {
        const { data: existing, error: readError } = await serverDatabase.from('site_settings').select('key').eq('key', key).maybeSingle();
        if (readError) throw readError;
        const result = existing
          ? await serverDatabase.from('site_settings').update({ value }).eq('key', key)
          : await serverDatabase.from('site_settings').insert({ key, value });
        if (result.error) throw result.error;
      }
      await appendAuditLog({ actor_user_id: accessCheck.adminUser!.userId, action: 'settings.updated', metadata: { keys: entries.map(([key]) => key) } });
      res.json({ success: true });
    } catch (error) {
      console.error('[Server API] Admin settings update error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to save settings.' });
    }
  });

  app.get('/api/admin/users', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['users.view']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }

    try {
      const { data, error } = await serverDatabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Server API] Admin user list error:', error);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to load users.' });
        return;
      }

      const users = (data || []).map((record) => sanitizeUserRecord(record));
      res.json({ success: true, data: users });
    } catch (error) {
      console.error('[Server API] Unexpected admin user list error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to load users.' });
    }
  });

  app.post('/api/admin/users', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['users.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }

    const requester = accessCheck.adminUser!;
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role;
    const permissions = normalizePermissions(body.permissions);
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

    if (!isValidEmail(email) || !isRoleOption(role) || !fullName) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'Email, name, and role are required.' });
      return;
    }

    if (role === 'owner' && !requester.isOwner) {
      res.status(403).json({ success: false, error: 'Authorization Error', details: 'Only the owner can create an owner-level administrator.' });
      return;
    }

    if (!requester.isOwner && permissions.some((permission) => permission.startsWith('users.'))) {
      res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot grant user-management permissions beyond your own authority.' });
      return;
    }

    const targetPermissions = requester.isOwner ? permissions : permissions.filter((permission) => requester.permissions.has(permission));
    if (targetPermissions.length !== permissions.length) {
      res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot assign permissions you do not hold.' });
      return;
    }

    try {
      const serviceAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: createdUser, error: createUserError } = await serviceAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { role },
      });

      if (createUserError || !createdUser?.user) {
        console.error('[Server API] Admin user creation failed:', createUserError);
        res.status(500).json({ success: false, error: 'Server Error', details: 'The user could not be created.' });
        return;
      }

      const targetUserId = createdUser.user.id;
      const { data: profile } = await serverDatabase
        .from('profiles')
        .upsert([
          {
            id: targetUserId,
            email,
            full_name: fullName,
            role,
            is_active: isActive,
          },
        ], { onConflict: 'id' })
        .select('id, email, full_name, role, is_active')
        .single();

      if (!profile) {
        res.status(500).json({ success: false, error: 'Server Error', details: 'The user profile could not be created.' });
        return;
      }

      if (targetPermissions.length > 0) {
        const permissionRows = targetPermissions.map((permissionKey) => ({
          user_id: targetUserId,
          permission_key: permissionKey,
          created_at: new Date().toISOString(),
        }));
        await serverDatabase.from('user_permissions').upsert(permissionRows, { onConflict: 'user_id,permission_key' });
      }

      await appendAuditLog({
        actor_user_id: requester.userId,
        action: 'user.created',
        target_user_id: targetUserId,
        metadata: {
          role,
          permissions: targetPermissions,
          email,
          is_active: isActive,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: targetUserId,
          email,
          full_name: fullName,
          role,
          is_active: isActive,
          permissions: targetPermissions,
        },
      });
    } catch (error) {
      console.error('[Server API] Unexpected admin user creation error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to create the user.' });
    }
  });

  app.patch('/api/admin/users/:id', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['users.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }
    const requester = accessCheck.adminUser!;
    const targetId = readText(req.params.id, 120);
    const payload = req.body || {};

    if (!targetId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid user ID is required.' });
      return;
    }

    try {
      const { data: targetProfile, error: targetProfileError } = await serverDatabase
        .from('profiles')
        .select('id, email, full_name, role, is_active')
        .eq('id', targetId)
        .maybeSingle();

      if (targetProfileError || !targetProfile) {
        res.status(404).json({ success: false, error: 'User Not Found' });
        return;
      }

      if (targetProfile.role === 'owner' && !requester.isOwner) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'Only the owner can modify owner-level users.' });
        return;
      }

      if (requester.userId === targetId) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot change your own user role or permissions.' });
        return;
      }

      const nextRole = payload.role !== undefined ? (isRoleOption(payload.role) ? payload.role : null) : targetProfile.role;
      const nextPermissions = payload.permissions !== undefined ? normalizePermissions(payload.permissions) : null;
      const nextActive = payload.is_active !== undefined ? Boolean(payload.is_active) : targetProfile.is_active;

      if (nextRole === null) {
        res.status(400).json({ success: false, error: 'Validation Error', details: 'The role is invalid.' });
        return;
      }

      if (nextRole === 'owner' && !requester.isOwner) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot assign owner-level access.' });
        return;
      }

      if (nextPermissions && !requester.isOwner) {
        const disallowed = nextPermissions.filter((permission) => !requester.permissions.has(permission));
        if (disallowed.length > 0) {
          res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot grant permissions you do not hold.' });
          return;
        }
      }

      const updates: Record<string, unknown> = {};
      if (nextRole !== undefined && nextRole !== targetProfile.role) { updates.role = nextRole; }
      if (nextActive !== undefined && nextActive !== targetProfile.is_active) { updates.is_active = nextActive; }

      if (Object.keys(updates).length > 0) {
        const { error: profileUpdateError } = await serverDatabase
          .from('profiles')
          .update(updates)
          .eq('id', targetId);

        if (profileUpdateError) {
          console.error('[Server API] User update error:', profileUpdateError);
          res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update the user.' });
          return;
        }
      }

      if (nextPermissions) {
        const targetPermissionSet = requester.isOwner ? nextPermissions : nextPermissions.filter((permission) => requester.permissions.has(permission));
        const { error: permissionDeleteError } = await serverDatabase
          .from('user_permissions')
          .delete()
          .eq('user_id', targetId);

        if (permissionDeleteError) {
          console.error('[Server API] Permission reset error:', permissionDeleteError);
          res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update permissions.' });
          return;
        }

        if (targetPermissionSet.length > 0) {
          const rows = targetPermissionSet.map((permissionKey) => ({
            user_id: targetId,
            permission_key: permissionKey,
            created_at: new Date().toISOString(),
          }));
          const { error: permissionInsertError } = await serverDatabase.from('user_permissions').upsert(rows, { onConflict: 'user_id,permission_key' });
          if (permissionInsertError) {
            console.error('[Server API] Permission insert error:', permissionInsertError);
            res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update permissions.' });
            return;
          }
        }
      }

      if (nextRole !== undefined && nextRole !== targetProfile.role) {
        await appendAuditLog({
          actor_user_id: requester.userId,
          action: 'user.role_changed',
          target_user_id: targetId,
          metadata: { from: targetProfile.role, to: nextRole },
        });
      }
      if (nextPermissions) {
        await appendAuditLog({
          actor_user_id: requester.userId,
          action: 'user.permissions_changed',
          target_user_id: targetId,
          metadata: { permissions: nextPermissions },
        });
      }
      if (nextActive !== undefined && nextActive !== targetProfile.is_active) {
        await appendAuditLog({
          actor_user_id: requester.userId,
          action: nextActive ? 'user.activated' : 'user.deactivated',
          target_user_id: targetId,
          metadata: { is_active: nextActive },
        });
      }

      const finalProfile = await serverDatabase
        .from('profiles')
        .select('id, email, full_name, role, is_active')
        .eq('id', targetId)
        .maybeSingle();

      const { data: finalPermissions } = await serverDatabase
        .from('user_permissions')
        .select('permission_key')
        .eq('user_id', targetId);

      res.json({
        success: true,
        data: {
          ...sanitizeUserRecord(finalProfile?.data || finalProfile || targetProfile),
          permissions: (finalPermissions || []).map((row) => row.permission_key),
        },
      });
    } catch (error) {
      console.error('[Server API] Unexpected admin user update error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to update the user.' });
    }
  });

  app.delete('/api/admin/users/:id', async (req, res) => {
    const accessCheck = await requireAdminAccess(req, ['users.manage']);
    if (accessCheck.response) {
      res.status(accessCheck.response.status).json(accessCheck.response.json);
      return;
    }

    const requester = accessCheck.adminUser!;
    const targetId = readText(req.params.id, 120);
    if (!targetId) {
      res.status(400).json({ success: false, error: 'Validation Error', details: 'A valid user ID is required.' });
      return;
    }

    try {
      const { data: targetProfile, error: targetProfileError } = await serverDatabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', targetId)
        .maybeSingle();

      if (targetProfileError || !targetProfile) {
        res.status(404).json({ success: false, error: 'User Not Found' });
        return;
      }

      if (requester.userId === targetId) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'You cannot remove your own account.' });
        return;
      }

      if (targetProfile.role === 'owner' && !requester.isOwner) {
        res.status(403).json({ success: false, error: 'Authorization Error', details: 'Only the owner can remove owner-level users.' });
        return;
      }

      const { error: permissionDeleteError } = await serverDatabase
        .from('user_permissions')
        .delete()
        .eq('user_id', targetId);

      if (permissionDeleteError) {
        console.error('[Server API] User permission cleanup error:', permissionDeleteError);
      }

      const { error: deleteProfileError } = await serverDatabase
        .from('profiles')
        .delete()
        .eq('id', targetId);

      if (deleteProfileError) {
        console.error('[Server API] User delete error:', deleteProfileError);
        res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to remove this user.' });
        return;
      }

      await appendAuditLog({
        actor_user_id: requester.userId,
        action: 'user.deleted',
        target_user_id: targetId,
        metadata: { role: targetProfile.role },
      });

      res.json({ success: true, data: { id: targetId, deleted: true } });
    } catch (error) {
      console.error('[Server API] Unexpected user delete error:', error);
      res.status(500).json({ success: false, error: 'Server Error', details: 'Unable to remove this user.' });
    }
  });

  app.all('/api/settings', (req, res) => {
    res.status(404).json({ success: false, error: 'Not Found' });
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
