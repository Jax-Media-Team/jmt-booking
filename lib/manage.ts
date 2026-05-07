import { createHmac, timingSafeEqual } from 'node:crypto';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

/**
 * Returns a 22-char base64url HMAC of `${eventId}:${email.toLowerCase()}` using
 * MANAGE_TOKEN_SECRET. Short enough to keep manage URLs compact while preserving
 * security (16 bytes of HMAC-SHA256, ~128 bits — same strength as a session token).
 */
export function buildManageToken(eventId: string, bookerEmail: string): string {
  const payload = `${eventId}:${bookerEmail.toLowerCase()}`;
  return createHmac('sha256', requireEnv('MANAGE_TOKEN_SECRET'))
    .update(payload)
    .digest('base64url')
    .slice(0, 22);
}

/** Constant-time comparison so token validity isn't leakable via timing. */
export function verifyManageToken(
  eventId: string,
  bookerEmail: string,
  token: string
): boolean {
  const expected = buildManageToken(eventId, bookerEmail);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function buildManageUrl(eventId: string, bookerEmail: string): string {
  const base = process.env.SITE_URL?.trim() || 'https://book.jaxmediateam.com';
  const token = buildManageToken(eventId, bookerEmail);
  const params = new URLSearchParams({ eid: eventId, t: token });
  return `${base.replace(/\/+$/, '')}/manage?${params.toString()}`;
}
