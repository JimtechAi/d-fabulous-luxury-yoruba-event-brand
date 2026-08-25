import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { sendBookingNotification, sendContactNotification } from './server/email';

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

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3001;
  const candidatePorts = Array.from(
    new Set([port, port + 1, port + 2, port + 3, port + 4])
  );
  const host = '0.0.0.0';

  const listenOnPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = app.listen(port, host, () => {
        console.log(`Server running on ${host}:${port}`);
        resolve(port);
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        const currentIndex = candidatePorts.indexOf(port);
        const nextPort = currentIndex >= 0 ? candidatePorts[currentIndex + 1] : undefined;

        if (error.code === 'EADDRINUSE' && nextPort) {
          console.warn(`Port ${port} is busy; retrying on ${nextPort}`);
          listenOnPort(nextPort).then(resolve).catch(reject);
          return;
        }

        reject(error);
      });
    });

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      supabaseConfigured: isSupabaseConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  // Diagnostics endpoint
  app.get('/api/diagnostics', (req, res) => {
    res.json({
      configured: isSupabaseConfigured,
      urlHost: supabaseUrl ? new URL(supabaseUrl).hostname : 'Not configured',
      hasAnonKey: Boolean(supabaseAnonKey),
      keyLength: supabaseAnonKey.length,
    });
  });

  // Submit Booking Endpoint
  app.post('/api/bookings', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({
        success: false,
        error: 'Database Configuration Error',
        details:
          'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are not set in the server environment.',
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
      } = req.body || {};

      if (!full_name || !email) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: 'Full name and email address are required fields.',
        });
        return;
      }

      let parsedGuestCount: number | null = null;
      if (typeof estimated_guest_count === 'number') {
        parsedGuestCount = estimated_guest_count;
      } else if (typeof estimated_guest_count === 'string') {
        const num = parseInt(estimated_guest_count, 10);
        if (!isNaN(num)) parsedGuestCount = num;
      }

      const { data, error, status } = await supabase
        .from('bookings')
        .insert([
          {
            full_name,
            email,
            phone: phone || null,
            event_date: event_date || null,
            event_location: event_location || null,
            services_requested: Array.isArray(services_requested) ? services_requested : [],
            estimated_guest_count: parsedGuestCount,
            celebration_details: celebration_details || null,
            status: 'pending',
          },
        ]);

      if (error) {
        console.error('[Server API] Booking insert error:', error);
        res.status(status >= 400 ? status : 500).json({
          success: false,
          error: 'Database Operation Error',
          details: formatError(error),
          code: error.code,
        });
        return;
      }

      // Trigger server-side notification email (errors handled internally so user submission is preserved)
      sendBookingNotification({
        full_name,
        email,
        phone,
        event_date,
        event_location,
        services_requested: Array.isArray(services_requested) ? services_requested : [],
        estimated_guest_count: parsedGuestCount,
        celebration_details,
      }).catch((emailErr) => {
        console.error('[Server API] Uncaught booking notification error:', emailErr);
      });

      res.json({
        success: true,
        message: 'Booking request successfully received.',
        data,
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

  // Submit Message Endpoint
  app.post('/api/messages', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.status(503).json({
        success: false,
        error: 'Database Configuration Error',
        details:
          'Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are not set in the server environment.',
      });
      return;
    }

    try {
      const { full_name, email, phone, subject, message } = req.body || {};

      if (!full_name || !email || !message) {
        res.status(400).json({
          success: false,
          error: 'Validation Error',
          details: 'Full name, email address, and message content are required.',
        });
        return;
      }

      const { data, error, status } = await supabase
        .from('messages')
        .insert([
          {
            full_name,
            email,
            phone: phone || null,
            subject: subject || 'General Inquiry',
            message,
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
        full_name,
        email,
        phone,
        subject,
        message,
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
      res.json({ success: false, data: [] });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
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

  // Get Testimonials Endpoint
  app.get('/api/testimonials', async (req, res) => {
    if (!isSupabaseConfigured) {
      res.json({ success: false, data: [] });
      return;
    }

    try {
      const { data, error } = await supabase
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
      const { data, error } = await supabase.from('site_settings').select('key, value');

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
      server: { middlewareMode: true },
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
