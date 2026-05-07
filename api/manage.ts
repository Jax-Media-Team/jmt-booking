import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getManageableEvent } from '../lib/calendar';
import { verifyManageToken } from '../lib/manage';
import { getMeeting } from '../lib/meetings';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const eid = String(req.query.eid ?? '').trim();
  const token = String(req.query.t ?? '').trim();
  if (!eid || !token) return res.status(400).json({ error: 'Missing eid or token' });

  try {
    const event = await getManageableEvent(eid);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status === 'cancelled') {
      return res.status(410).json({ error: 'This meeting has already been cancelled.' });
    }
    if (!event.bookerEmail) {
      return res.status(404).json({ error: 'Event metadata missing — cannot manage from here' });
    }
    if (!verifyManageToken(eid, event.bookerEmail, token)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const meeting = getMeeting(event.meetingSlug);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      eventId: event.id,
      summary: event.summary,
      startISO: event.startISO,
      endISO: event.endISO,
      hangoutLink: event.hangoutLink,
      bookerName: event.bookerName,
      bookerEmail: event.bookerEmail,
      responses: event.responses,
      meeting: meeting
        ? {
            slug: meeting.slug,
            name: meeting.name,
            durationMinutes: meeting.durationMinutes,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load event';
    console.error('[manage] error', err);
    return res.status(500).json({ error: message });
  }
}
