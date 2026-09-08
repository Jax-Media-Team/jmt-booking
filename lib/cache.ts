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
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
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
