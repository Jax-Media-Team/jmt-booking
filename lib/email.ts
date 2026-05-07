import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import type { MeetingType, FormField } from './types';

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
  return `${s.toFormat('cccc, LLLL d, yyyy')} · ${s.toFormat('h:mm a')}–${e.toFormat('h:mm a ZZZZ')}`;
}

function summaryLabelFor(field: FormField): string {
  if (field.summaryLabel) return field.summaryLabel;
  return field.label.replace(/\s*\(optional\)\s*$/i, '').trim();
}

/* ---------- Shared email skeleton ---------- */

function emailShell(inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Jax Media Team</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        ${inner}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function brandHeader(): string {
  return `<tr><td align="center" style="padding:0 0 20px;">
    <a href="https://jaxmediateam.com" style="text-decoration:none;display:inline-block;">
      <img src="https://jaxmediateam.com/wp-content/uploads/2019/03/logo.jpg"
           alt="Jax Media Team" width="160" height="auto"
           style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:160px;border-radius:6px;">
    </a>
  </td></tr>`;
}

function footerBlock(): string {
  return `<tr><td align="center" style="padding:18px 8px 0;color:#6b7280;font-size:12px;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">
    Jax Media Team ·
    <a href="https://jaxmediateam.com" style="color:#6b7280;text-decoration:underline;">jaxmediateam.com</a> ·
    <a href="mailto:pcruz@jaxmediateam.com" style="color:#6b7280;text-decoration:underline;">pcruz@jaxmediateam.com</a>
  </td></tr>`;
}

function summaryTable(rows: { label: string; value: string; multiline?: boolean }[]): string {
  if (rows.length === 0) return '';
  const trs = rows
    .map((r) => {
      const value = r.multiline
        ? escapeHtml(r.value).replace(/\n/g, '<br>')
        : escapeHtml(r.value);
      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eef0f3;color:#5b6470;font-size:13px;font-weight:600;width:38%;vertical-align:top;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(r.label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eef0f3;color:#1a1a1a;font-size:14px;vertical-align:top;font-family:Helvetica,Arial,sans-serif;">${value}</td>
      </tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="border-collapse:collapse;background:#ffffff;border:1px solid #eef0f3;border-radius:8px;overflow:hidden;">
    <tbody>${trs}</tbody>
  </table>`;
}

function buildResponseRows(
  meeting: MeetingType,
  responses: Record<string, string>,
  guestEmail: string,
  guestTimezone?: string
): { label: string; value: string; multiline?: boolean }[] {
  const rows: { label: string; value: string; multiline?: boolean }[] = [];
  // Email isn't in the form-fields summary table by default; surface it here so the host can reply directly.
  rows.push({ label: 'Email', value: guestEmail });
  for (const field of meeting.formFields) {
    if (field.name === 'name' || field.name === 'email') continue;
    const value = responses[field.name];
    if (!value) continue;
    rows.push({
      label: summaryLabelFor(field),
      value,
      multiline: field.type === 'textarea',
    });
  }
  if (guestTimezone) rows.push({ label: 'Guest timezone', value: guestTimezone });
  return rows;
}

/* ---------- Host notification (to pcruz / michael) ---------- */

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
      `[host-notification] no recipients for ${params.meeting.slug}; skipping.`
    );
    return;
  }

  const tz = params.meeting.timezone;
  const when = formatRange(params.startISO, params.endISO, tz);
  const rows = buildResponseRows(
    params.meeting,
    params.responses,
    params.attendeeEmail,
    params.guestTimezone
  );

  const ctaButton = params.eventLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr>
         <td bgcolor="#ed1b24" style="border-radius:6px;">
           <a href="${escapeHtml(params.eventLink)}"
              style="display:inline-block;padding:11px 20px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;">
             View calendar event
           </a>
         </td>
       </tr></table>`
    : '';

  const meetLine = params.hangoutLink
    ? `<p style="margin:0 0 4px;color:#5b6470;font-size:13px;font-family:Helvetica,Arial,sans-serif;">
         Google Meet: <a href="${escapeHtml(params.hangoutLink)}" style="color:#ed1b24;">${escapeHtml(params.hangoutLink)}</a>
       </p>`
    : '';

  const inner = `
    ${brandHeader()}
    <tr><td style="background:#ffffff;border:1px solid #eef0f3;border-radius:10px;padding:28px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#5fa8b0;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">New Booking</p>
      <h1 style="margin:0 0 6px;font-size:20px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;font-weight:700;">${escapeHtml(params.meeting.name)}</h1>
      <p style="margin:0 0 4px;font-size:15px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;"><strong>${escapeHtml(params.attendeeName)}</strong></p>
      <p style="margin:0 0 4px;color:#5b6470;font-size:14px;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(when)}</p>
      ${meetLine}

      <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
      ${summaryTable(rows)}
      ${ctaButton}
    </td></tr>
    ${footerBlock()}
  `;

  const html = emailShell(inner);
  const subjectDate = DateTime.fromISO(params.startISO).setZone(tz).toFormat('LLL d');
  const company = params.responses.company ? ` — ${params.responses.company}` : '';
  const subject = `New booking · ${params.meeting.name}${company} · ${subjectDate}`;

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

/* ---------- Booker confirmation (to the person who booked) ---------- */

export async function sendBookerConfirmation(params: {
  meeting: MeetingType;
  attendeeName: string;
  attendeeEmail: string;
  startISO: string;
  endISO: string;
  hangoutLink: string | null;
  guestTimezone?: string;
}): Promise<void> {
  const tz = params.guestTimezone || params.meeting.timezone;
  const when = formatRange(params.startISO, params.endISO, tz);
  const firstName =
    (params.attendeeName.split(/\s+/)[0] || params.attendeeName).trim() || 'there';

  const meetCta = params.hangoutLink
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr>
         <td bgcolor="#ed1b24" style="border-radius:6px;">
           <a href="${escapeHtml(params.hangoutLink)}"
              style="display:inline-block;padding:11px 22px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;border-radius:6px;">
             Join Google Meet
           </a>
         </td>
       </tr></table>`
    : '';

  const agendaItems = (params.meeting.agenda ?? [])
    .map(
      (a) =>
        `<li style="margin-bottom:6px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;">${escapeHtml(a)}</li>`
    )
    .join('');
  const agendaBlock = agendaItems
    ? `<div style="margin:22px 0 0;">
         <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#5fa8b0;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">What we'll cover</p>
         <ul style="margin:0;padding-left:20px;">${agendaItems}</ul>
       </div>`
    : '';

  const prepBlock = params.meeting.prepNote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;background:#eaf5f7;border-left:3px solid #5fa8b0;border-radius:0 6px 6px 0;">
         <tr><td style="padding:13px 16px;color:#32373c;font-size:13px;line-height:1.55;font-family:Helvetica,Arial,sans-serif;">
           ${escapeHtml(params.meeting.prepNote)}
         </td></tr>
       </table>`
    : '';

  const inner = `
    ${brandHeader()}
    <tr><td style="background:#ffffff;border:1px solid #eef0f3;border-radius:10px;padding:28px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#5fa8b0;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">Confirmed</p>
      <h1 style="margin:0 0 14px;font-size:22px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;font-weight:700;">${escapeHtml(params.meeting.name)}</h1>

      <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;line-height:1.55;">Hi ${escapeHtml(firstName)}, you're booked.</p>
      <p style="margin:0 0 6px;font-size:15px;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif;"><strong>${escapeHtml(when)}</strong></p>
      <p style="margin:0;color:#5b6470;font-size:13px;font-family:Helvetica,Arial,sans-serif;">A calendar invite is heading to your inbox separately.</p>
      ${meetCta}
      ${agendaBlock}
      ${prepBlock}

      <p style="margin:24px 0 0;font-size:13px;color:#5b6470;font-family:Helvetica,Arial,sans-serif;line-height:1.55;">
        Need to reschedule or have a question? Just reply to this email.
      </p>
    </td></tr>
    ${footerBlock()}
  `;

  const html = emailShell(inner);
  const subjectDate = DateTime.fromISO(params.startISO).setZone(tz).toFormat('LLL d');
  const subject = `Confirmed · ${params.meeting.name} · ${subjectDate}`;

  await sendGmail({
    to: params.attendeeEmail,
    subject,
    html,
    replyTo: 'pcruz@jaxmediateam.com',
  });
}
