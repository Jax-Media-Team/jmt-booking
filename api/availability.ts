import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DateTime } from 'luxon';
import { getMeeting } from '../lib/meetings';
import { getBusyIntervals } from '../lib/calendar';
import { generateAvailableSlots } from '../lib/slots';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = String(req.query.meeting ?? '');
  const meeting = getMeeting(slug);
  if (!meeting) return res.status(404).json({ error: 'Unknown meeting type' });

  try {
    const now = DateTime.utc();
    const horizonEnd = now.setZone(meeting.timezone).plus({ days: meeting.maxHorizonDays }).endOf('day');
    const busy = await getBusyIntervals(now.toISO()!, horizonEnd.toUTC().toISO()!);
    const days = generateAvailableSlots(meeting, busy, now);

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      meeting: {
        slug: meeting.slug,
        name: meeting.name,
        description: meeting.description,
        longDescription: meeting.longDescription ?? null,
        agenda: meeting.agenda ?? [],
        prepNote: meeting.prepNote ?? null,
        durationMinutes: meeting.durationMinutes,
        timezone: meeting.timezone,
        location: meeting.location,
      },
      days,
    });
  } catch (err) {
    console.error('availability error', err);
    return res.status(500).json({ error: 'Failed to load availability' });
  }
}
