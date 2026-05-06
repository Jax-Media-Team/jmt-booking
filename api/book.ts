import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DateTime } from 'luxon';
import { getMeeting } from '../lib/meetings';
import { getBusyIntervals, getCalendarsForMeeting, createBookingEvent } from '../lib/calendar';
import { isStillAvailable } from '../lib/slots';
import { sendBookingConfirmation } from '../lib/email';
import type { BookingRequest, MeetingType, FormField } from '../lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().\-]{6,}$/;

function badRequest(res: VercelResponse, msg: string) {
  return res.status(400).json({ error: msg });
}

function validateResponses(
  meeting: MeetingType,
  responses: Record<string, string>
): { ok: true; clean: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {};
  for (const field of meeting.formFields) {
    const raw = responses[field.name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      if (field.required) return { ok: false, error: `${field.label} is required` };
      clean[field.name] = '';
      continue;
    }

    const max = field.maxLength ?? 2000;
    if (value.length > max) return { ok: false, error: `${field.label} is too long` };

    if (field.type === 'email' && !EMAIL_RE.test(value)) {
      return { ok: false, error: `${field.label} must be a valid email` };
    }
    if (field.type === 'tel' && !PHONE_RE.test(value)) {
      return { ok: false, error: `${field.label} must be a valid phone number` };
    }
    if (field.type === 'radio') {
      const opts = field.options ?? [];
      if (!opts.includes(value)) {
        return { ok: false, error: `${field.label}: pick one of the options` };
      }
    }
    clean[field.name] = value;
  }
  return { ok: true, clean };
}

function buildDescription(
  meeting: MeetingType,
  clean: Record<string, string>,
  guestTimezone?: string
): string {
  const lines: string[] = ['Booked via book.jaxmediateam.com', ''];
  for (const field of meeting.formFields) {
    if (field.name === 'name' || field.name === 'email') continue;
    const v = clean[field.name];
    if (!v) continue;
    if (field.type === 'textarea') {
      lines.push(`${field.label}:`);
      lines.push(v);
      lines.push('');
    } else {
      lines.push(`${field.label}: ${v}`);
    }
  }
  if (clean.email) lines.unshift(`Guest: ${clean.name} <${clean.email}>`);
  if (guestTimezone) {
    lines.push('');
    lines.push(`Guest timezone: ${guestTimezone}`);
  }
  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as Partial<BookingRequest> | undefined;
  if (!body) return badRequest(res, 'Missing body');

  const meetingSlug = String(body.meetingSlug ?? '').trim();
  const startISO = String(body.startISO ?? '').trim();
  const responses = (body.responses ?? {}) as Record<string, string>;
  const guestTimezone = body.guestTimezone ? String(body.guestTimezone).slice(0, 64) : undefined;

  if (!meetingSlug) return badRequest(res, 'Missing meetingSlug');
  if (!startISO) return badRequest(res, 'Missing startISO');

  const meeting = getMeeting(meetingSlug);
  if (!meeting) return res.status(404).json({ error: 'Unknown meeting type' });

  const validation = validateResponses(meeting, responses);
  if (!validation.ok) return badRequest(res, validation.error);
  const { clean } = validation;

  const name = clean.name;
  const email = clean.email.toLowerCase();
  if (!name || !email) return badRequest(res, 'Name and email are required');

  const start = DateTime.fromISO(startISO, { setZone: true });
  if (!start.isValid) return badRequest(res, 'Invalid startISO');
  const end = start.plus({ minutes: meeting.durationMinutes });

  try {
    const calendars = getCalendarsForMeeting(meeting);
    const padStart = start.minus({ hours: 1 }).toUTC().toISO()!;
    const padEnd = end.plus({ hours: 1 }).toUTC().toISO()!;
    const busy = await getBusyIntervals(padStart, padEnd, calendars);

    const check = isStillAvailable(meeting, start.toUTC().toISO()!, busy);
    if (!check.ok) return res.status(409).json({ error: check.reason });

    const summary = meeting.eventTitle.replace(/\{name\}/g, name);
    const description = buildDescription(meeting, clean, guestTimezone);

    const event = await createBookingEvent({
      summary,
      description,
      startISO: start.toUTC().toISO()!,
      endISO: end.toUTC().toISO()!,
      attendeeName: name,
      attendeeEmail: email,
      additionalAttendees: meeting.additionalAttendees,
    });

    try {
      await sendBookingConfirmation({
        meeting,
        attendeeName: name,
        attendeeEmail: email,
        startISO: event.start,
        endISO: event.end,
        notes: clean.notes,
        hangoutLink: event.hangoutLink,
        guestTimezone,
      });
    } catch (mailErr) {
      console.error('confirmation email failed', mailErr);
    }

    return res.status(200).json({
      ok: true,
      eventLink: event.htmlLink,
      hangoutLink: event.hangoutLink,
      start: event.start,
      end: event.end,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create booking';
    console.error('booking error', err);
    return res.status(500).json({ error: message });
  }
}
