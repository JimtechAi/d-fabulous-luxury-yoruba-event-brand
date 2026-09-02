import { supabase, isSupabaseConfigured, getSupabaseDiagnostics } from './supabase';
import { SERVICES_LIST } from '../data/brand';
import { ServiceDefinition } from '../types';

const productionApiBaseUrl = 'https://d-fabulous-luxury-yoruba-event-brand-1.onrender.com';
const isLocalDevelopmentHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD && !isLocalDevelopmentHost ? productionApiBaseUrl : ''))
  .trim()
  .replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export interface BookingSubmission {
  full_name: string;
  email: string;
  phone?: string;
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

export interface EventAvailabilityRecord {
  event_date: string;
  available: boolean;
  reason: 'booked' | 'owner_blocked' | string;
}

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getEventAvailability(): Promise<EventAvailabilityRecord[]> {
  const start = getLocalDateString();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 2);
  const response = await fetch(apiUrl(`/api/availability?start=${start}&end=${getLocalDateString(endDate)}`));
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.details || result?.error || 'Unable to load event availability.');
  }
  return (result.data || []) as EventAvailabilityRecord[];
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

export interface DbVideoItem {
  id: string;
  title: string;
  video_url: string;
  poster_url?: string;
  alt_text: string;
  category: string;
  caption?: string;
  display_order: number;
}

export function normalizeGalleryImageUrl(imageUrl: string): string {
  const trimmedUrl = imageUrl.trim();
  if (!trimmedUrl) return '';

  const galleryAssetMatch = trimmedUrl.match(
    /\/(?:assets\/gallery|(?:public\/)?images\/gallery)\/(?:[^/?#]+\/)*([^/?#]+)([?#].*)?$/i
  );
  if (galleryAssetMatch) {
    return `/images/gallery/${galleryAssetMatch[1]}${galleryAssetMatch[2] || ''}`;
  }

  const filenameOnlyMatch = trimmedUrl.match(/^([^/?#]+\.(?:avif|gif|jpe?g|png|webp))(?:([?#].*))?$/i);
  if (filenameOnlyMatch) {
    return `/images/gallery/${filenameOnlyMatch[1]}${filenameOnlyMatch[2] || ''}`;
  }

  return trimmedUrl;
}

const LOCAL_GALLERY_ITEMS: DbGalleryItem[] = Array.from({ length: 76 }, (_, index) => {
  const filename = `image${index + 1}.webp`;
  return {
    id: `local-gallery-${index + 1}`,
    title: `Image ${index + 1}`,
    image_url: `/images/gallery/${filename}`,
    alt_text: `D’Fabulous Yoruba celebration image ${index + 1}`,
    category: 'Gallery',
    caption: 'D’Fabulous Yoruba celebration',
    aspect_ratio: '4/3',
    is_featured: index < 6,
    display_order: index + 1,
  };
});

const LOCAL_VIDEO_ITEMS: DbVideoItem[] = Array.from({ length: 33 }, (_, index) => {
  const filename = `video${index + 1}.mp4`;
  return {
    id: `local-video-${index + 1}`,
    title: `Video ${index + 1}`,
    video_url: `/videos/${filename}`,
    poster_url: `/images/video-thumbnails/${filename.replace(/\.mp4$/i, '.jpg')}`,
    alt_text: `D’Fabulous Yoruba celebration video ${index + 1}`,
    category: 'Videos',
    caption: 'D’Fabulous cinematic event highlight',
    display_order: index + 1,
  };
});

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
    const apiRes = await fetch(apiUrl('/api/diagnostics'));
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
 * Submits a booking through the server so the database write and Resend notifications
 * always use the same server-side workflow.
 */
export async function submitBooking(data: BookingSubmission): Promise<{ success: boolean; error?: string; rawError?: any }> {
  try {
    const response = await fetch(apiUrl('/api/bookings'), {
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

    return {
      success: false,
      error: `Booking service returned HTTP ${response.status}. Please try again shortly.`,
    };
  } catch (error: unknown) {
    console.error('Booking server request error:', error);
    return {
      success: false,
      error: 'Booking service is temporarily unavailable. Please try again shortly.',
      rawError: error,
    };
  }

  return {
    success: false,
    error: 'Booking service is temporarily unavailable. Please try again shortly.',
  };
}

/** Submits a new enquiry through the server-controlled workflow. */
export async function submitMessage(data: MessageSubmission): Promise<{ success: boolean; error?: string; rawError?: any }> {
  try {
    const response = await fetch(apiUrl('/api/messages'), {
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
  } catch (error: unknown) {
    console.error('Message server request error:', error);
    return {
      success: false,
      error: 'Message service is temporarily unavailable. Please try again shortly.',
      rawError: error,
    };
  }

  return {
    success: false,
    error: 'Message service is temporarily unavailable. Please try again shortly.',
  };
}

/**
 * Fetches active services ordered by display_order.
 */
export async function getServices(): Promise<ServiceDefinition[]> {
  try {
    const response = await fetch(apiUrl('/api/services'));
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
    const response = await fetch(apiUrl('/api/gallery'));
    const result = await response.json();
    if (result?.success && Array.isArray(result.data)) {
      return result.data as DbGalleryItem[];
    }
  } catch {
    return LOCAL_GALLERY_ITEMS;
  }

  return LOCAL_GALLERY_ITEMS;
}

/** Fetches videos from the single public/videos directory through the server API. */
export async function getVideoItems(): Promise<DbVideoItem[]> {
  try {
    const response = await fetch(apiUrl('/api/videos'));
    const result = await response.json();
    if (result?.success && Array.isArray(result.data)) {
      return result.data as DbVideoItem[];
    }
  } catch {
    return LOCAL_VIDEO_ITEMS;
  }

  return LOCAL_VIDEO_ITEMS;
}

/**
 * Fetches featured testimonials ordered by display_order.
 */
export async function getTestimonials(): Promise<DbTestimonial[]> {
  try {
    const response = await fetch(apiUrl('/api/testimonials'));
    const result = await response.json();
    if (result?.success && Array.isArray(result.data)) {
      return result.data as DbTestimonial[];
    }
  } catch {
    return [];
  }

  return [];
}

