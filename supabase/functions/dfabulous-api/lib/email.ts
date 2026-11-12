// Resend email integration for the Deno runtime.
// Direct port of server/email.ts with the Node SDK replaced by server-side HTTPS
// requests to https://api.resend.com/emails. All behavior is preserved:
//   * Bookings are saved before any notification attempt (enforced by callers).
//   * Rejected emails are never reported as delivered.
//   * Testing-mode recipient restrictions remain until a sender domain is verified.
import { resendConfigSource } from './env.ts';

export interface BookingEmailData {
  id?: string | null;
  full_name: string;
  email: string | null;
  phone?: string | null;
  event_date?: string | null;
  event_location?: string | null;
  services_requested?: string[] | null;
  estimated_guest_count?: number | null;
  celebration_details?: string | null;
  booking_reference?: string | null;
}

export interface EmailSendResult {
  success: boolean;
  status: 'accepted' | 'failed' | 'unknown';
  deliveryStatus: 'unknown' | 'delivered' | 'bounced' | 'failed';
  messageId?: string;
  recipient?: string;
  error?: string;
}

interface EmailConfig {
  apiKey: string;
  from: string;
  admin: string;
  testingMode: boolean;
  testingRecipient: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getEmailConfig(): EmailConfig | null {
  const apiKey = resendConfigSource.apiKey;
  const from = resendConfigSource.from;
  const admin = resendConfigSource.admin;
  const testingMode = resendConfigSource.testingModeFlag.toLowerCase() === 'true' || /onboarding@resend\.dev/i.test(from);
  const testingRecipient = resendConfigSource.testingRecipient;
  const missing = [!apiKey && 'RESEND_API_KEY', !from && 'RESEND_FROM_EMAIL', !admin && 'RESEND_NOTIFICATION_EMAIL'].filter(Boolean);

  if (missing.length > 0) {
    console.error(`[Resend Email] Missing configuration: ${missing.join(', ')}`);
    return null;
  }
  return { apiKey, from, admin, testingMode, testingRecipient };
}

function bookingFields(data: BookingEmailData): string {
  const services = data.services_requested?.length ? data.services_requested.join(', ') : 'None specified';
  return `
    <div class="row"><div class="label">Customer</div><div class="value">${escapeHtml(data.full_name)}</div></div>
    <div class="row"><div class="label">Email</div><div class="value">${escapeHtml(data.email || 'Not provided')}</div></div>
    <div class="row"><div class="label">Event date</div><div class="value">${escapeHtml(data.event_date || 'Flexible / TBD')}</div></div>
    <div class="row"><div class="label">Event location</div><div class="value">${escapeHtml(data.event_location || 'Not provided')}</div></div>
    <div class="row"><div class="label">Services requested</div><div class="value">${escapeHtml(services)}</div></div>
    <div class="row"><div class="label">Estimated guests</div><div class="value">${escapeHtml(data.estimated_guest_count?.toLocaleString() || 'Not provided')}</div></div>
    ${data.phone ? `<div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(data.phone)}</div></div>` : ''}
    ${data.id ? `<div class="row"><div class="label">Booking reference</div><div class="value">${escapeHtml(data.id)}</div></div>` : ''}
    ${data.celebration_details ? `<div class="row"><div class="label">Additional details</div><div class="value-box">${escapeHtml(data.celebration_details)}</div></div>` : ''}
  `;
}

function bookingHtml(data: BookingEmailData, heading: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(heading)}</title>
  <style>body{font-family:Georgia,serif;background:#f8f5ef;color:#29231f;margin:0;padding:24px;line-height:1.5}.card{max-width:600px;margin:auto;background:#fff;border:1px solid #e5d7b8}.header{background:#641c2b;color:#fff;padding:28px 32px}.header h1{margin:0;font-size:22px;font-weight:500}.header p{margin:6px 0 0;font:12px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#e5c875}.content{padding:30px 32px}.intro{font-size:16px;margin:0 0 24px}.row{margin:0 0 16px}.label{font:10px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#92733b;font-weight:700;margin-bottom:3px}.value{font:15px Arial,sans-serif;color:#29231f}.value-box{font:14px Arial,sans-serif;background:#faf8f3;border-left:3px solid #c6a15b;padding:10px 12px;white-space:pre-wrap}.footer{border-top:1px solid #eee5d4;padding:18px 32px;font:12px Arial,sans-serif;color:#756b62}@media(max-width:480px){body{padding:8px}.content,.header,.footer{padding:22px 18px}}</style></head>
  <body><div class="card"><div class="header"><h1>${escapeHtml(heading)}</h1><p>D\u2019Fabulous Luxury Yoruba Events</p></div><div class="content"><p class="intro">${escapeHtml(message)}</p>${bookingFields(data)}</div><div class="footer">With elegance and intention, D\u2019Fabulous Events</div></div></body></html>`;
}

async function resendRequest(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<{ data: { id?: string } | null; error: { message?: string } | null }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: body && typeof body === 'object' ? body : { message: `Resend returned HTTP ${response.status}.` } };
  }
  return { data: body && typeof body === 'object' ? body : null, error: null };
}

async function submitEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  logLabel = 'Booking email'
): Promise<EmailSendResult> {
  if (!isValidEmail(to)) {
    const errorMessage = 'The recipient email address is missing or invalid.';
    console.error(`[Resend Email] ${logLabel}`, { recipient: to || '[missing]', messageId: 'NOT_RETURNED', error: errorMessage });
    return { success: false, status: 'failed', deliveryStatus: 'failed', recipient: to, error: errorMessage };
  }

  if (config.testingMode && (!config.testingRecipient || to.toLowerCase() !== config.testingRecipient.toLowerCase())) {
    const permittedRecipient = config.testingRecipient || 'the Resend account email';
    const errorMessage = `Skipped in Resend testing mode. Only ${permittedRecipient} is permitted until the sending domain is verified.`;
    console.warn(`[Resend Email] ${logLabel}`, { recipient: to, messageId: 'NOT_SENT', error: errorMessage });
    return { success: false, status: 'failed', deliveryStatus: 'failed', recipient: to, error: errorMessage };
  }

  try {
    const { data, error } = await resendRequest(config.apiKey, {
      from: config.from,
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    });
    const errorMessage = error
      ? (typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : JSON.stringify(error))
      : undefined;
    const logPrefix = logLabel === 'Customer booking email'
      ? '[Resend Email] Customer booking notification submitted'
      : `[Resend Email] ${logLabel} submitted`;

    if (error) {
      console.error(logPrefix, { recipient: to, messageId: 'NOT_RETURNED', error: errorMessage });
      return { success: false, status: 'failed', deliveryStatus: 'failed', recipient: to, error: errorMessage || 'Resend rejected the email submission.' };
    }

    if (data?.id) {
      console.log(logPrefix, { recipient: to, messageId: data.id, error: 'NONE' });
      return { success: true, status: 'accepted', deliveryStatus: 'unknown', recipient: to, messageId: data.id };
    }

    const unknownMessage = 'Resend returned neither a message ID nor an error.';
    console.error(logPrefix, { recipient: to, messageId: 'NOT_RETURNED', error: unknownMessage });
    return { success: false, status: 'unknown', deliveryStatus: 'unknown', recipient: to, error: unknownMessage };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Resend Email] ${logLabel} request error`, { recipient: to, messageId: 'NOT_RETURNED', error: errorMessage });
    return { success: false, status: 'failed', deliveryStatus: 'failed', recipient: to, error: errorMessage };
  }
}

export async function sendBookingNotification(data: BookingEmailData): Promise<{ customer: EmailSendResult; admin: EmailSendResult }> {
  const config = getEmailConfig();
  if (!config) {
    const result: EmailSendResult = { success: false, status: 'failed', deliveryStatus: 'failed', error: 'Email configuration is incomplete.' };
    return { customer: result, admin: result };
  }
  const customer = await submitEmail(
    config,
    data.email?.trim() || '',
    'We have received your D\u2019Fabulous event enquiry',
    bookingHtml(data, 'Enquiry received', `Dear ${data.full_name}, thank you for trusting D\u2019Fabulous with your celebration. We have received your booking enquiry and will review the details shortly.`),
    undefined,
    'Customer booking email'
  );
  const admin = await submitEmail(
    config,
    config.admin,
    'New D\u2019Fabulous event booking enquiry',
    bookingHtml(data, 'New event booking enquiry', 'A new booking enquiry has been submitted and is ready for review.'),
    data.email || undefined,
    'Admin booking notification'
  );
  return { customer, admin };
}

export async function sendBookingStatusNotification(data: BookingEmailData, status: 'confirmed' | 'cancelled'): Promise<EmailSendResult> {
  const config = getEmailConfig();
  if (!config) return { success: false, status: 'failed', deliveryStatus: 'failed', error: 'Email configuration is incomplete.' };
  const heading = status === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled';
  const message = status === 'confirmed'
    ? `Dear ${data.full_name}, your D\u2019Fabulous booking has been confirmed. We look forward to helping you create an unforgettable celebration.`
    : `Dear ${data.full_name}, your D\u2019Fabulous booking has been cancelled. Please contact us if you need further assistance.`;
  return submitEmail(config, data.email?.trim() || '', `${heading} | D\u2019Fabulous Luxury Yoruba Events`, bookingHtml(data, heading, message), undefined, `Customer ${status} email`);
}

export async function sendContactNotification(data: { full_name: string; email: string; phone?: string | null; subject?: string | null; message: string }): Promise<EmailSendResult> {
  const config = getEmailConfig();
  if (!config) return { success: false, status: 'failed', deliveryStatus: 'failed', error: 'Email configuration is incomplete.' };
  const html = bookingHtml({ full_name: data.full_name, email: data.email, phone: data.phone, celebration_details: data.message }, 'New consultation request', `Subject: ${data.subject || 'General enquiry'}`);
  return submitEmail(config, config.admin, `New D\u2019Fabulous consultation request${data.subject ? `: ${data.subject}` : ''}`, html, data.email, 'Contact notification');
}
