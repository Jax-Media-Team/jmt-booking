import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cancelEvent, getManageableEvent } from '../lib/calendar';
import { verifyManageToken } from '../lib/manage';

interface CancelRequest {
  eid?: string;
  t?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as CancelRequest;
  const eid = String(body.eid ?? '').trim();
  const token = String(body.t ?? '').trim();
  if (!eid || !token) return res.status(400).json({ error: 'Missing eid or token' });

  try {
    const event = await getManageableEvent(eid);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status === 'cancelled') {
      return res.status(200).json({ ok: true, alreadyCancelled: true });
    }
    if (!event.bookerEmail || !verifyManageToken(eid, event.bookerEmail, token)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    await cancelEvent(eid);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel event';
    console.error('[cancel] error', err);
    return res.status(500).json({ error: message });
  }
}
