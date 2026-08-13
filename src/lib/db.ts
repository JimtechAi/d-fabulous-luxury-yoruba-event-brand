import { supabase, isSupabaseConfigured, getSupabaseDiagnostics } from './supabase';
import { SERVICES_LIST } from '../data/brand';
import { ServiceDefinition } from '../types';

export interface BookingSubmission {
  full_name: string;
  email: string;
  phone: string;
  event_date: string;
  event_location: string;
  services_requested: string[];
  estimated_guest_count?: number | null;
  celebration_details?: string;
}

export interface MessageSubmission {
  full_name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

export interface DbService {
  id: string;
  slug: string;
  title: string;
  yoruba_name?: string;
  short_description: string;
  full_description?: string;
  category: 'core' | 'specialist' | 'brand';
  icon_name?: string;
  is_active: boolean;
  display_order: number;
}

export interface DbGalleryItem {
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

export interface DbTestimonial {
  id: string;
  quote: string;
  client_names: string;
  event_type: string;
  location?: string;
  event_date?: string;
  rating: number;
  is_featured: boolean;
  is_placeholder: boolean;
  display_order: number;
}

/**
 * Formats Supabase or network errors with full details (message, code, details, hint, status).
 */
export function formatSupabaseError(error: any): string {
  if (!error) return 'Unknown error occurred.';
  if (typeof error === 'string') return error;

  const msg = error.message || error.error || 'No error message provided';
  const details = error.details ? ` (Details: ${error.details})` : '';
  const code = error.code ? ` [Code: ${error.code}]` : '';
  const status = error.status ? ` [HTTP Status: ${error.status}]` : '';
  const hint = error.hint ? ` (Hint: ${error.hint})` : '';

  if (msg.includes('Failed to fetch') || msg.includes('TypeError')) {
    const diag = getSupabaseDiagnostics();
    if (!diag.isConfigured) {
      return `Database Configuration Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing or set to placeholders.`;
    }
    return `Network Connection Failure: Unable to establish a browser connection directly to Supabase ("${diag.url}"). Please check internet connectivity or backend server status.`;
  }

  return `${msg}${code}${status}${details}${hint}`;
}

/**
 * Diagnostic helper to test table read/write access safely.
 */
export async function testSupabaseConnection() {
  const diag = getSupabaseDiagnostics();

  // Test Server API First
  try {
    const apiRes = await fetch('/api/diagnostics');
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      return {
        success: true,
        mode: 'Full-Stack Server API',
        serverDiagnostics: apiData,
        clientDiagnostics: diag,
      };
    }
  } catch {
    // Fall back to client diagnosis
  }

  if (!diag.isConfigured) {
    return {
      success: false,
      diagnostics: diag,
      error: 'Supabase configuration is missing or using placeholders.',
    };
  }

  try {
    const { data: services, error: servicesError, status: servicesStatus } = await supabase
      .from('services')
      .select('id, title')
      .limit(1);

    if (servicesError) {
      return {
        success: false,
        diagnostics: diag,
        step: 'SELECT public.services',
        error: formatSupabaseError({ ...servicesError, status: servicesStatus }),
      };
    }

    return {
      success: true,
      diagnostics: diag,
      servicesSelect: 'OK',
      servicesCount: services ? services.length : 0,
    };
  } catch (err: any) {
    return {
      success: false,
      diagnostics: diag,
      error: formatSupabaseError(err),
    };
  }
}

/**
 * Submits a new date availability booking request to public.bookings
 * Tries server API first (/api/bookings) for iframe isolation safety, falling back to direct Supabase client.
 */
export async function submitBooking(data: BookingSubmission): Promise<{ success: boolean; error?: string; rawError?: any }> {
  // 1. Try Full-Stack Express Server API
  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json().catch(() => null);

    if (response.ok && result?.success) {
      return { success: true };
    }

    if (result && !result.success) {
      return {
        success: false,
        error: `${result.error || 'Submission Error'}: ${result.details || 'Unable to record booking.'}`,
      };
    }
  } catch {
    // If server API route is not mounted (e.g. static preview), fallback to direct Supabase client call below
  }

  // 2. Direct Supabase Client Fallback
  if (!isSupabaseConfigured) {
    const diag = getSupabaseDiagnostics();
    return {
      success: false,
      error: `Database Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.`,
    };
  }

  try {
    const { error, status } = await supabase.from('bookings').insert([
      {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        event_date: data.event_date,
        event_location: data.event_location,
        services_requested: data.services_requested,
        estimated_guest_count: data.estimated_guest_count || null,
        celebration_details: data.celebration_details || '',
        status: 'pending',
      },
    ]);

    if (error) {
      console.error('Supabase booking insert error:', error);
      const formatted = formatSupabaseError({ ...error, status });
      return { success: false, error: formatted, rawError: error };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Unexpected booking submission error:', err);
    const formatted = formatSupabaseError(err);
    return { success: false, error: formatted, rawError: err };
  }
}

/**
 * Submits a new enquiry message to public.messages
 * Tries server API first (/api/messages) for iframe isolation safety, falling back to direct Supabase client.
 */
export async function submitMessage(data: MessageSubmission): Promise<{ success: boolean; error?: string; rawError?: any }> {
  // 1. Try Full-Stack Express Server API
  try {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json().catch(() => null);

    if (response.ok && result?.success) {
      return { success: true };
    }

    if (result && !result.success) {
      return {
        success: false,
        error: `${result.error || 'Submission Error'}: ${result.details || 'Unable to record message.'}`,
      };
    }
  } catch {
    // Fallback to client call
  }

  // 2. Direct Supabase Client Fallback
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: `Database Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing or unconfigured.`,
    };
  }

  try {
    const { error, status } = await supabase.from('messages').insert([
      {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || null,
        subject: data.subject || 'General Enquiry',
        message: data.message,
        status: 'unread',
      },
    ]);

    if (error) {
      console.error('Supabase message insert error:', error);
      const formatted = formatSupabaseError({ ...error, status });
      return { success: false, error: formatted, rawError: error };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Unexpected message submission error:', err);
    const formatted = formatSupabaseError(err);
    return { success: false, error: formatted, rawError: err };
  }
}

/**
 * Fetches active services ordered by display_order.
 */
export async function getServices(): Promise<ServiceDefinition[]> {
  try {
    const response = await fetch('/api/services');
    const result = await response.json();
    if (result?.success && Array.isArray(result.data) && result.data.length > 0) {
      return result.data.map((item: DbService) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        yorubaName: item.yoruba_name,
        shortDescription: item.short_description,
        category: item.category || 'core',
        iconName: item.icon_name,
      }));
    }
  } catch {
    // API failed, fallback to client or static brand list
  }

  if (!isSupabaseConfigured) return SERVICES_LIST;

  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) return SERVICES_LIST;

    return data.map((item: DbService) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      yorubaName: item.yoruba_name,
      shortDescription: item.short_description,
      category: item.category || 'core',
      iconName: item.icon_name,
    }));
  } catch {
    return SERVICES_LIST;
  }
}

/**
 * Fetches gallery items ordered by display_order.
 */
export async function getGalleryItems(): Promise<DbGalleryItem[]> {
  try {
    const response = await fetch('/api/gallery');
    const result = await response.json();
    if (result?.success && Array.isArray(result.data)) {
      return result.data as DbGalleryItem[];
    }
  } catch {
    // Fallback
  }

  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from('gallery')
      .select('*')
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data as DbGalleryItem[];
  } catch {
    return [];
  }
}

/**
 * Fetches featured testimonials ordered by display_order.
 */
export async function getTestimonials(): Promise<DbTestimonial[]> {
  try {
    const response = await fetch('/api/testimonials');
    const result = await response.json();
    if (result?.success && Array.isArray(result.data)) {
      return result.data as DbTestimonial[];
    }
  } catch {
    // Fallback
  }

  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .eq('is_featured', true)
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data as DbTestimonial[];
  } catch {
    return [];
  }
}

/**
 * Fetches site settings key-value entries.
 */
export async function getSiteSettings(): Promise<Record<string, unknown>> {
  try {
    const response = await fetch('/api/settings');
    const result = await response.json();
    if (result?.success && result.data) {
      return result.data as Record<string, unknown>;
    }
  } catch {
    // Fallback to client call
  }

  if (!isSupabaseConfigured) return {};

  try {
    const { data, error } = await supabase.from('site_settings').select('key, value');
    if (error || !data) return {};

    const settingsMap: Record<string, unknown> = {};
    data.forEach((row: { key: string; value: unknown }) => {
      settingsMap[row.key] = row.value;
    });

    return settingsMap;
  } catch {
    return {};
  }
}
