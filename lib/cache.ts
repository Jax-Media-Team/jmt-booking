import { Redis } from '@upstash/redis';

/**
 * Optional Vercel KV / Upstash Redis cache. Reads env vars from either the
 * new "Marketplace Upstash Redis" prefix (UPSTASH_REDIS_REST_*) or the legacy
 * "Vercel KV" prefix (KV_REST_API_*). If neither is configured, cache
 * operations become no-ops and callers fall through to the origin fetch.
 * This keeps local dev and preview deploys working without KV.
 */
let cached: Redis | null | undefined;

function getClient(): Redis | null {
  if (cached !== undefined) return cached;
  const creds = resolveRestCreds();
  if (!creds) {
    cached = null;
    return null;
  }
  cached = new Redis(creds);
  return cached;
}

/** Vercel's Upstash Marketplace integration sometimes injects only the TCP
 *  connection string as `REDIS_URL` (rediss://default:TOKEN@HOST:6379). The
 *  REST API endpoint is at https://HOST and the token is the password from
 *  that URL, so we derive it when the explicit REST vars aren't present. */
function resolveRestCreds(): { url: string; token: string } | null {
  const explicitUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const explicitToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (explicitUrl && explicitToken) return { url: explicitUrl, token: explicitToken };

  const tcp = process.env.REDIS_URL || process.env.KV_URL;
  if (!tcp) return null;
  try {
    const parsed = new URL(tcp);
    const token = decodeURIComponent(parsed.password || '');
    if (!token || !parsed.hostname) return null;
    return { url: `https://${parsed.hostname}`, token };
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getClient();
  if (!r) return null;
  try {
    return (await r.get<T>(key)) ?? null;
  } catch (err) {
    console.error('cache get failed', key, err);
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error('cache set failed', key, err);
  }
}
