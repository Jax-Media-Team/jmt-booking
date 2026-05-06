import { Resend } from 'resend';
import { DateTime } from 'luxon';
import type { MeetingType } from './types';

let cachedResend: Resend | null = null;

function getResend(): Resend | null {
  if (cachedResend) return cachedResend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedResend = new Resend(key);
  return cachedResend;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRange(startISO: string, endISO: string, tz: string): string {
  const s = DateTime.fromISO(startISO).setZone(tz);
  const e = DateTime.fromISO(endISO).setZone(tz);
  return `${s.toFormat('cccc, LLLL d, yyyy')} · ${s.toFormat('h:mm a')} – ${e.toFormat('h:mm a ZZZZ')}`;
}

export async function sendBookingConfirmation(params: {
  meeting: MeetingType;
  attendeeName: string;
  attendeeEmail: string;
  startISO: string;
  endISO: string;
  notes?: string;
  hangoutLink: string | null;
  guestTimezone?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('RESEND_API_KEY not set; skipping confirmation email.');
    return;
  }
  const from = process.env.RESEND_FROM ?? 'bookings@jaxmediateam.com';
  const tz = params.guestTimezone || params.meeting.timezone;
  const when = formatRange(params.startISO, params.endISO, tz);

  const meetLine = params.hangoutLink
    ? `<p style="margin:0 0 12px 0">Join link: <a href="${escapeHtml(params.hangoutLink)}">${escapeHtml(params.hangoutLink)}</a></p>`
    : '';

  const notesLine = params.notes
    ? `<p style="margin:0 0 12px 0"><strong>What you shared:</strong><br>${escapeHtml(params.notes).replace(/\n/g, '<br>')}</p>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#0f172a; max-width:560px; margin:0 auto; padding:24px;">
  <h2 style="margin:0 0 16px 0;">You're booked: ${escapeHtml(params.meeting.name)}</h2>
  <p style="margin:0 0 12px 0">Hi ${escapeHtml(params.attendeeName)}, this is confirmed.</p>
  <p style="margin:0 0 12px 0"><strong>When:</strong> ${escapeHtml(when)}</p>
  <p style="margin:0 0 12px 0"><strong>With:</strong> Patrick Cruz, Jax Media Team</p>
  ${meetLine}
  ${notesLine}
  <p style="margin:24px 0 0 0; color:#64748b; font-size:13px;">A calendar invite was sent separately. Reply to this email if you need to reschedule.</p>
</body></html>`;

  await resend.emails.send({
    from,
    to: params.attendeeEmail,
    subject: `Confirmed: ${params.meeting.name} on ${DateTime.fromISO(params.startISO).setZone(tz).toFormat('LLL d')}`,
    html,
  });
}
