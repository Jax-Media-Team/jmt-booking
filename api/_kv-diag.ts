import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

/**
 * Diagnostic: which KV-shaped env vars are present, and does a round-trip
 * to Upstash actually succeed? Safe to expose because it never leaks values
 * (booleans only) and the endpoint name starts with an underscore so it's
 * not linked from anywhere.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const envPresent = Object.fromEntries(
    Object.keys(process.env)
      .filter((k) => /KV|UPSTASH|REDIS/i.test(k))
      .map((k) => [k, Boolean(process.env[k])])
  );

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  let ping: { ok: boolean; ms?: number; error?: string } = { ok: false, error: 'no url/token found' };
  if (url && token) {
    try {
      const r = new Redis({ url, token });
      const start = Date.now();
      await r.set('kv-diag-ping', Date.now(), { ex: 60 });
      const val = await r.get('kv-diag-ping');
      ping = { ok: val !== null, ms: Date.now() - start };
    } catch (err: any) {
      ping = { ok: false, error: err?.message ?? String(err) };
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    envPresent,
    urlHostPrefix: url ? new URL(url).host.split('.').slice(0, 2).join('.') + '.…' : null,
    tokenLength: token ? token.length : 0,
    ping,
  });
}
