import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DateTime } from 'luxon';
import { getMeeting } from '../lib/meetings';
import { getBusyIntervals, createBookingEvent } from '../lib/calendar';
import { isStillAvailable } from '../lib/slots';
import { sendBookingConfirmation } from '../lib/email';
import type { BookingRequest } from '../lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(res: VercelResponse, msg: string) {
  return res.status(400).json({ error: msg });
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
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : '';
  const guestTimezone = body.guestTimezone ? String(body.guestTimezone).slice(0, 64) : undefined;

  if (!meetingSlug) return badRequest(res, 'Missing meetingSlug');
  if (!startISO) return badRequest(res, 'Missing startISO');
  if (!name || name.length > 200) return badRequest(res, 'Name is required');
  if (!email || !EMAIL_RE.test(email) || email.length > 320) return badRequest(res, 'Valid email is required');

  const meeting = getMeeting(meetingSlug);
  if (!meeting) return res.status(404).json({ error: 'Unknown meeting type' });

  const start = DateTime.fromISO(startISO, { setZone: true });
  if (!start.isValid) return badRequest(res, 'Invalid startISO');
  const end = start.plus({ minutes: meeting.durationMinutes });

  try {
    const padStart = start.minus({ hours: 1 }).toUTC().toISO()!;
    const padEnd = end.plus({ hours: 1 }).toUTC().toISO()!;
    const busy = await getBusyIntervals(padStart, padEnd);

    const check = isStillAvailable(meeting, start.toUTC().toISO()!, busy);
    if (!check.ok) return res.status(409).json({ error: check.reason });

    const description =
      `Booked via book.jaxmediateam.com\n\n` +
      `Guest: ${name} <${email}>\n` +
      (notes ? `Notes:\n${notes}\n` : '') +
      (guestTimezone ? `\nGuest timezone: ${guestTimezone}` : '');

    const event = await createBookingEvent({
      summary: `${meeting.name} — ${name}`,
      description,
      startISO: start.toUTC().toISO()!,
      endISO: end.toUTC().toISO()!,
      attendeeName: name,
      attendeeEmail: email,
    });

    try {
      await sendBookingConfirmation({
        meeting,
        attendeeName: name,
        attendeeEmail: email,
        startISO: event.start,
        endISO: event.end,
        notes,
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
    console.error('booking error', err);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
}
