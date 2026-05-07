import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DateTime } from 'luxon';
import { getMeeting } from '../lib/meetings';
import { getBusyIntervals, getCalendarsForMeeting, createBookingEvent } from '../lib/calendar';
import { isStillAvailable } from '../lib/slots';
import { sendHostNotification, sendBookerConfirmation } from '../lib/email';
import type { BookingRequest, MeetingType, FormField } from '../lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().\-]{6,}$/;

function badRequest(res: VercelResponse, msg: string) {
  return res.status(400).json({ error: msg });
}

function isShowIfSatisfied(
  meeting: MeetingType,
  field: FormField,
  responses: Record<string, string>
): boolean {
  if (!field.showIf) return true;
  const parentRaw = (responses[field.showIf.field] ?? '').trim();
  if (!parentRaw) return false;
  const parentValues = parentRaw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const v of parentValues) {
    if (field.showIf.valueIncludes.includes(v)) return true;
  }
  return false;
}

function validateResponses(
  meeting: MeetingType,
  responses: Record<string, string>
): { ok: true; clean: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {};
  for (const field of meeting.formFields) {
    const raw = responses[field.name];
    const value = typeof raw === 'string' ? raw.trim() : '';
    // Skip required-check for fields whose showIf condition isn't satisfied.
    if (field.showIf && !isShowIfSatisfied(meeting, field, responses)) {
      clean[field.name] = '';
      continue;
    }
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
    if (field.type === 'checkbox') {
      const opts = field.options ?? [];
      const picked = value.split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of picked) {
        if (!opts.includes(p)) {
          return { ok: false, error: `${field.label}: invalid option "${p}"` };
        }
      }
    }
    if (field.type === 'url') {
      try {
        const u = new URL(value.startsWith('http') ? value : `https://${value}`);
        if (!['http:', 'https:'].includes(u.protocol)) {
          return { ok: false, error: `${field.label} must be a valid URL` };
        }
      } catch {
        return { ok: false, error: `${field.label} must be a valid URL` };
      }
    }
    if (field.disqualifyValues && field.disqualifyValues.includes(value)) {
      return {
        ok: false,
        error:
          field.disqualifyMessage ??
          'Based on your answer, this may not be the right fit at this time.',
      };
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

  // Honeypot: bots tend to fill every input. Real humans never see this field.
  // Return a fake-success so bots don't retry.
  if (typeof body.hp_website === 'string' && body.hp_website.trim().length > 0) {
    console.warn('Honeypot tripped — rejecting booking silently.');
    return res.status(200).json({ ok: true });
  }

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

  // Fold conditional "Other" follow-up answers into the parent value:
  //   source='Other' + source_other='Podcast'  →  source='Other (Podcast)'
  //   services='SEO,Other' + services_other='Email'  →  services='SEO, Other (Email)'
  for (const field of meeting.formFields) {
    if (!field.showIf) continue;
    const followUpValue = clean[field.name];
    if (!followUpValue) continue;
    const parentName = field.showIf.field;
    const parentValue = clean[parentName];
    if (!parentValue) continue;
    const triggers = field.showIf.valueIncludes;
    const merged = parentValue
      .split(',')
      .map((v) => v.trim())
      .map((v) => (triggers.includes(v) ? `${v} (${followUpValue})` : v))
      .join(', ');
    clean[parentName] = merged;
    delete clean[field.name];
  }

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

    // Generic {key} substitution against form responses; falls back to the booker's
    // name if the template references a field that wasn't provided.
    const summary = meeting.eventTitle.replace(/\{(\w+)\}/g, (_match, key) => {
      const v = clean[key];
      return (v && v.length > 0) ? v : name;
    });
    const description = buildDescription(meeting, clean, guestTimezone);

    const event = await createBookingEvent({
      summary,
      description,
      startISO: start.toUTC().toISO()!,
      endISO: end.toUTC().toISO()!,
      attendeeName: name,
      attendeeEmail: email,
      meetingSlug: meeting.slug,
      additionalAttendees: meeting.additionalAttendees,
    });

    // Fire-and-forget both emails. Failures log but do not break the booking flow.
    await Promise.all([
      sendHostNotification({
        meeting,
        attendeeName: name,
        attendeeEmail: email,
        startISO: event.start,
        endISO: event.end,
        responses: clean,
        hangoutLink: event.hangoutLink,
        eventLink: event.htmlLink,
        guestTimezone,
      }).catch((err) => console.error('host notification failed', err)),
      sendBookerConfirmation({
        meeting,
        attendeeName: name,
        attendeeEmail: email,
        startISO: event.start,
        endISO: event.end,
        hangoutLink: event.hangoutLink,
        guestTimezone,
        eventId: event.id,
      }).catch((err) => console.error('booker confirmation failed', err)),
    ]);

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
