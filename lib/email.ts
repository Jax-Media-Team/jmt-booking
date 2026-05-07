import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import type { MeetingType } from './types';

let cachedAuth: OAuth2Client | null = null;

function getAuth(): OAuth2Client {
  if (cachedAuth) return cachedAuth;
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  cachedAuth = oauth2;
  return oauth2;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** RFC 2047 encoded-word for non-ASCII header values. ASCII passes through unchanged. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

/** Wrap a base64 string at 76 chars per RFC 2045. */
function wrapBase64(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n');
}

function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): string {
  // RFC 2822 message. Headers must be ASCII; non-ASCII goes through encoded-word.
  // Body is base64-encoded so any UTF-8 (em dashes, mid-dots, accents, emoji) round-trips cleanly.
  const lines = [
    `From: ${encodeHeader(opts.from)}`,
    `To: ${encodeHeader(opts.to)}`,
  ];
  if (opts.replyTo) lines.push(`Reply-To: ${encodeHeader(opts.replyTo)}`);
  lines.push(
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(opts.html, 'utf8').toString('base64'))
  );
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: getAuth() });
  const from =
    process.env.HOST_FROM_EMAIL ?? 'Jax Media Team <pcruz@jaxmediateam.com>';
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: buildRawMessage({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        replyTo: opts.replyTo,
      }),
    },
  });
}

function formatRange(startISO: string, endISO: string, tz: string): string {
  const s = DateTime.fromISO(startISO).setZone(tz);
  const e = DateTime.fromISO(endISO).setZone(tz);
  return `${s.toFormat('cccc, LLLL d, yyyy')} · ${s.toFormat('h:mm a')} – ${e.toFormat('h:mm a ZZZZ')}`;
}

export async function sendHostNotification(params: {
  meeting: MeetingType;
  attendeeName: string;
  attendeeEmail: string;
  startISO: string;
  endISO: string;
  responses: Record<string, string>;
  hangoutLink: string | null;
  eventLink: string | null;
  guestTimezone?: string;
}): Promise<void> {
  const recipients = (params.meeting.notificationRecipients ?? [])
    .map((r) => r.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    console.warn(
      `[host-notification] no recipients configured for meeting ${params.meeting.slug}; skipping.`
    );
    return;
  }

  const tz = params.meeting.timezone;
  const when = formatRange(params.startISO, params.endISO, tz);

  // Render every filled-in form response with its label.
  const responseRows: string[] = [];
  for (const field of params.meeting.formFields) {
    if (field.name === 'name' || field.name === 'email') continue;
    const value = params.responses[field.name];
    if (!value) continue;
    if (field.type === 'textarea') {
      responseRows.push(
        `<tr>
           <td style="padding:8px 12px;background:#f5f7fa;border-bottom:1px solid #e5e9ee;font-weight:600;color:#32373c;width:200px;vertical-align:top;">${escapeHtml(field.label)}</td>
           <td style="padding:8px 12px;border-bottom:1px solid #e5e9ee;color:#1a1a1a;white-space:pre-wrap;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
         </tr>`
      );
    } else {
      responseRows.push(
        `<tr>
           <td style="padding:8px 12px;background:#f5f7fa;border-bottom:1px solid #e5e9ee;font-weight:600;color:#32373c;width:200px;vertical-align:top;">${escapeHtml(field.label)}</td>
           <td style="padding:8px 12px;border-bottom:1px solid #e5e9ee;color:#1a1a1a;">${escapeHtml(value)}</td>
         </tr>`
      );
    }
  }
  if (params.guestTimezone) {
    responseRows.push(
      `<tr>
         <td style="padding:8px 12px;background:#f5f7fa;border-bottom:1px solid #e5e9ee;font-weight:600;color:#32373c;width:200px;vertical-align:top;">Guest timezone</td>
         <td style="padding:8px 12px;border-bottom:1px solid #e5e9ee;color:#1a1a1a;">${escapeHtml(params.guestTimezone)}</td>
       </tr>`
    );
  }

  const meetLine = params.hangoutLink
    ? `<p style="margin:0 0 12px;"><strong>Google Meet:</strong> <a href="${escapeHtml(params.hangoutLink)}" style="color:#ed1b24;">${escapeHtml(params.hangoutLink)}</a></p>`
    : '';
  const eventLine = params.eventLink
    ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(params.eventLink)}" style="color:#ed1b24;font-weight:600;">View calendar event →</a></p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fa;font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:620px;margin:0 auto;padding:32px 24px;">
    <div style="background:#ffffff;border:1px solid #e5e9ee;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06);">
      <div style="border-left:4px solid #ed1b24;padding:6px 0 6px 14px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#5fa8b0;text-transform:uppercase;">New Booking</div>
        <h2 style="margin:6px 0 0;font-size:22px;color:#1a1a1a;letter-spacing:-0.01em;">${escapeHtml(params.meeting.name)}</h2>
      </div>

      <p style="margin:0 0 6px;"><strong>When:</strong> ${escapeHtml(when)}</p>
      <p style="margin:0 0 6px;"><strong>Guest:</strong> ${escapeHtml(params.attendeeName)} &lt;<a href="mailto:${escapeHtml(params.attendeeEmail)}" style="color:#ed1b24;">${escapeHtml(params.attendeeEmail)}</a>&gt;</p>
      ${meetLine}

      <table role="presentation" style="border-collapse:collapse;width:100%;margin-top:18px;border:1px solid #e5e9ee;border-radius:8px;overflow:hidden;font-size:14px;">
        <tbody>
          ${responseRows.join('\n')}
        </tbody>
      </table>

      ${eventLine}

      <p style="margin:24px 0 0;color:#5b6470;font-size:12px;">Booked via <a href="https://book.jaxmediateam.com" style="color:#5b6470;">book.jaxmediateam.com</a></p>
    </div>
  </div>
</body></html>`;

  const subjectDate = DateTime.fromISO(params.startISO).setZone(tz).toFormat('LLL d');
  const company = params.responses.company ? ` — ${params.responses.company}` : '';
  const subject = `New booking · ${params.meeting.name}${company} · ${subjectDate}`;

  // Send to each recipient individually so a single failure doesn't drop the rest.
  await Promise.all(
    recipients.map((to) =>
      sendGmail({
        to,
        subject,
        html,
        replyTo: params.attendeeEmail,
      }).catch((err) => {
        console.error(`[host-notification] failed for ${to}:`, err);
      })
    )
  );
}
