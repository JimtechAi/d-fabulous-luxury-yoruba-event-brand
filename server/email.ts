import { Resend } from 'resend';

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
}

/**
 * Sends an email notification for a new booking inquiry.
 * Safe & resilient: errors are logged for server debugging without throwing.
 */
export async function sendBookingNotification(data: {
  full_name: string;
  email: string;
  phone?: string | null;
  event_date?: string | null;
  event_location?: string | null;
  services_requested?: string[];
  estimated_guest_count?: number | null;
  celebration_details?: string | null;
}): Promise<void> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.log('[Resend Email] RESEND_API_KEY is not configured. Notification email skipped.');
    return;
  }

  const resend = new Resend(apiKey);
  const recipient = cleanEnv(process.env.RESEND_NOTIFICATION_EMAIL) || 'fabulousevents@hotmail.com';
  const fromAddress = cleanEnv(process.env.RESEND_FROM_EMAIL) || 'D\'Fabulous Events <onboarding@resend.dev>';

  const formattedServices =
    Array.isArray(data.services_requested) && data.services_requested.length > 0
      ? data.services_requested.join(', ')
      : 'None selected';

  const timestamp = new Date().toLocaleString('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>New D’Fabulous Event Booking Inquiry</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f8f6; color: #1c1917; margin: 0; padding: 24px; line-height: 1.5; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background-color: #800020; color: #ffffff; padding: 24px 32px; text-align: left; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
        .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.85; }
        .content { padding: 32px; }
        .row { margin-bottom: 20px; }
        .label { font-size: 11px; text-transform: uppercase; tracking: 1px; color: #78716c; font-weight: 700; margin-bottom: 4px; }
        .value { font-size: 15px; color: #1c1917; font-weight: 500; }
        .value-box { background-color: #fafaf9; border: 1px solid #f5f5f4; border-radius: 8px; padding: 12px 16px; margin-top: 4px; white-space: pre-wrap; font-size: 14px; }
        .footer { background-color: #fafaf9; border-top: 1px solid #f5f5f4; padding: 16px 32px; font-size: 12px; color: #a8a29e; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>New Event Booking Inquiry</h1>
          <p>D’Fabulous Luxury Yoruba Events</p>
        </div>
        <div class="content">
          <div class="row">
            <div class="label">Customer Name</div>
            <div class="value">${data.full_name}</div>
          </div>
          <div class="row">
            <div class="label">Email Address</div>
            <div class="value"><a href="mailto:${data.email}" style="color: #800020; text-decoration: none;">${data.email}</a></div>
          </div>
          <div class="row">
            <div class="label">Phone Number</div>
            <div class="value">${data.phone || 'Not provided'}</div>
          </div>
          <div class="row">
            <div class="label">Services Requested</div>
            <div class="value">${formattedServices}</div>
          </div>
          <div class="row">
            <div class="label">Event Date</div>
            <div class="value">${data.event_date || 'Flexible / TBD'}</div>
          </div>
          <div class="row">
            <div class="label">Event Location</div>
            <div class="value">${data.event_location || 'Not provided'}</div>
          </div>
          <div class="row">
            <div class="label">Estimated Guest Count</div>
            <div class="value">${data.estimated_guest_count ? data.estimated_guest_count.toLocaleString() : 'Not provided'}</div>
          </div>
          <div class="row">
            <div class="label">Celebration Details & Requirements</div>
            <div class="value-box">${data.celebration_details || 'No additional details specified.'}</div>
          </div>
          <div class="row">
            <div class="label">Submission Timestamp</div>
            <div class="value">${timestamp} UTC</div>
          </div>
        </div>
        <div class="footer">
          D’Fabulous Luxury Yoruba Events — Automated Notification Engine
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data: resData, error } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: "New D’Fabulous Event Booking Inquiry",
      html: htmlBody,
      replyTo: data.email,
    });

    if (error) {
      console.error('[Resend Email] Booking notification error:', error);
    } else {
      console.log('[Resend Email] Booking notification sent successfully. ID:', resData?.id);
    }
  } catch (err) {
    console.error('[Resend Email] Unexpected error sending booking notification:', err);
  }
}

/**
 * Sends an email notification for a new contact / consultation message.
 * Safe & resilient: errors are logged for server debugging without throwing.
 */
export async function sendContactNotification(data: {
  full_name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
}): Promise<void> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.log('[Resend Email] RESEND_API_KEY is not configured. Notification email skipped.');
    return;
  }

  const resend = new Resend(apiKey);
  const recipient = cleanEnv(process.env.RESEND_NOTIFICATION_EMAIL) || 'fabulousevents@hotmail.com';
  const fromAddress = cleanEnv(process.env.RESEND_FROM_EMAIL) || 'D\'Fabulous Events <onboarding@resend.dev>';

  const timestamp = new Date().toLocaleString('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>New D’Fabulous Consultation Request</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f8f6; color: #1c1917; margin: 0; padding: 24px; line-height: 1.5; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background-color: #800020; color: #ffffff; padding: 24px 32px; text-align: left; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
        .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.85; }
        .content { padding: 32px; }
        .row { margin-bottom: 20px; }
        .label { font-size: 11px; text-transform: uppercase; tracking: 1px; color: #78716c; font-weight: 700; margin-bottom: 4px; }
        .value { font-size: 15px; color: #1c1917; font-weight: 500; }
        .value-box { background-color: #fafaf9; border: 1px solid #f5f5f4; border-radius: 8px; padding: 12px 16px; margin-top: 4px; white-space: pre-wrap; font-size: 14px; }
        .footer { background-color: #fafaf9; border-top: 1px solid #f5f5f4; padding: 16px 32px; font-size: 12px; color: #a8a29e; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>New Consultation Request</h1>
          <p>D’Fabulous Luxury Yoruba Events</p>
        </div>
        <div class="content">
          <div class="row">
            <div class="label">Customer Name</div>
            <div class="value">${data.full_name}</div>
          </div>
          <div class="row">
            <div class="label">Email Address</div>
            <div class="value"><a href="mailto:${data.email}" style="color: #800020; text-decoration: none;">${data.email}</a></div>
          </div>
          <div class="row">
            <div class="label">Phone Number</div>
            <div class="value">${data.phone || 'Not provided'}</div>
          </div>
          <div class="row">
            <div class="label">Subject</div>
            <div class="value">${data.subject || 'General Consultation'}</div>
          </div>
          <div class="row">
            <div class="label">Message</div>
            <div class="value-box">${data.message}</div>
          </div>
          <div class="row">
            <div class="label">Submission Timestamp</div>
            <div class="value">${timestamp} UTC</div>
          </div>
        </div>
        <div class="footer">
          D’Fabulous Luxury Yoruba Events — Automated Notification Engine
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data: resData, error } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: `New D’Fabulous Consultation Request${data.subject ? `: ${data.subject}` : ''}`,
      html: htmlBody,
      replyTo: data.email,
    });

    if (error) {
      console.error('[Resend Email] Contact notification error:', error);
    } else {
      console.log('[Resend Email] Contact notification sent successfully. ID:', resData?.id);
    }
  } catch (err) {
    console.error('[Resend Email] Unexpected error sending contact notification:', err);
  }
}
