import * as crypto from 'node:crypto';
import { DateTime } from 'luxon';
import * as ical from 'node-ical';
import { cacheGet, cacheSet } from './cache';
import type { BusyInterval, MeetingType } from './types';

/** Fetched ICS text is cached in Vercel KV for this many seconds so booking-page
 *  loads don't pay the 1-2s network fetch on every request. Short enough that
 *  a canceled event on the source calendar frees the slot within minutes. */
const ICS_CACHE_TTL_SECONDS = 15 * 60;

/**
 * Resolve a meeting's iCal URL list at request time. Combines any static
 * URLs on the meeting with URLs read from the env vars named in
 * `additionalIcalUrlsEnv`. Reading env at request time (not module load)
 * keeps unit tests, ts-node scripts, and Vercel cold starts all consistent.
 */
export function getIcalUrlsForMeeting(meeting: MeetingType): string[] {
  const staticUrls = (meeting.additionalIcalUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  const envUrls: string[] = [];
  for (const varName of meeting.additionalIcalUrlsEnv ?? []) {
    const raw = process.env[varName];
    if (!raw) continue;
    for (const u of raw.split(',')) {
      const trimmed = u.trim();
      if (trimmed) envUrls.push(trimmed);
    }
  }
  return [...staticUrls, ...envUrls];
}

/**
 * Fetch one or more iCal (.ics) feeds and return busy intervals that overlap
 * the given [startISO, endISO) window. Used to include availability from
 * calendars that aren't shared with our OAuth account but that the owner
 * has handed us a private iCal URL for (Google Calendar's "Secret address
 * in iCal format").
 *
 * Handles single events, recurring events (RRULE) — including EXDATE
 * exclusions and RECURRENCE-ID overrides — and treats transparency /
 * cancelled status the same way Google's freebusy API does (skip
 * TRANSPARENT and CANCELLED).
 */
export async function getIcalBusyIntervals(
  urls: string[],
  startISO: string,
  endISO: string
): Promise<BusyInterval[]> {
  const start = DateTime.fromISO(startISO).toJSDate();
  const end = DateTime.fromISO(endISO).toJSDate();
  const out: BusyInterval[] = [];

  const fetches = urls
    .map((u) => (u ?? '').trim())
    .filter(Boolean)
    .map(async (url) => {
      try {
        const text = await fetchIcsCached(url);
        if (text) appendBusyFromIcs(text, start, end, out);
      } catch (err) {
        console.error(`ical fetch/parse error for ${redact(url)}:`, err);
      }
    });

  await Promise.all(fetches);
  return out;
}

async function fetchIcsCached(url: string): Promise<string | null> {
  const cacheKey = 'ical:' + crypto.createHash('sha256').update(url).digest('base64url').slice(0, 24);
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`ical fetch failed ${res.status} for ${redact(url)}`);
    return null;
  }
  const text = await res.text();
  // Fire-and-forget the cache write so a slow KV never blocks the request.
  cacheSet(cacheKey, text, ICS_CACHE_TTL_SECONDS).catch(() => { /* logged inside cacheSet */ });
  return text;
}

function appendBusyFromIcs(text: string, start: Date, end: Date, out: BusyInterval[]): void {
  const parsed = ical.sync.parseICS(text);
  for (const key of Object.keys(parsed)) {
    const ev = parsed[key] as any;
    if (!ev || ev.type !== 'VEVENT') continue;
    if (ev.status === 'CANCELLED') continue;
    if (ev.transparency === 'TRANSPARENT') continue;
    if (!ev.start || !ev.end) continue;

    const durMs = new Date(ev.end).getTime() - new Date(ev.start).getTime();
    const safeDur = durMs > 0 ? durMs : 30 * 60 * 1000;

    if (ev.rrule) {
      // Expand the recurrence within the window (inclusive of endpoints).
      let occurrences: Date[] = [];
      try { occurrences = ev.rrule.between(start, end, true); } catch { /* malformed rrule */ }
      const exdateKeys = ev.exdate ? new Set(Object.keys(ev.exdate)) : null;
      const overrides = ev.recurrences ?? null;
      for (const occStart of occurrences) {
        const dateKey = toDateKey(occStart);
        if (exdateKeys && matchesExdate(exdateKeys, occStart)) continue;
        const override = overrides ? overrides[dateKey] : null;
        if (override) {
          if (override.status === 'CANCELLED') continue;
          if (override.transparency === 'TRANSPARENT') continue;
          const oStart = new Date(override.start);
          const oEnd = new Date(override.end);
          if (oEnd > start && oStart < end) {
            out.push({ start: oStart.toISOString(), end: oEnd.toISOString() });
          }
          continue;
        }
        const occEnd = new Date(occStart.getTime() + safeDur);
        if (occEnd > start && occStart < end) {
          out.push({ start: occStart.toISOString(), end: occEnd.toISOString() });
        }
      }
    } else {
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      if (evEnd > start && evStart < end) {
        out.push({ start: evStart.toISOString(), end: evEnd.toISOString() });
      }
    }
  }
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function matchesExdate(exdateKeys: Set<string>, occ: Date): boolean {
  // node-ical stores EXDATE keys as ISO date strings. Match on the date part.
  const dk = toDateKey(occ);
  for (const k of exdateKeys) {
    if (k.startsWith(dk)) return true;
  }
  return false;
}

function redact(url: string): string {
  // Keep host + path shape, drop the secret token so it never lands in logs.
  return url.replace(/private-[a-f0-9]+/i, 'private-***');
}
