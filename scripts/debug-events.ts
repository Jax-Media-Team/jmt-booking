/**
 * Debug: list every event on a given calendar for a given day.
 * Requires "See all event details" (or higher) sharing on that calendar.
 * Run: npx ts-node scripts/debug-events.ts <calendar-id> YYYY-MM-DD
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DateTime } from 'luxon';

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const calId = process.argv[2];
  const dateArg = process.argv[3];
  if (!calId || !dateArg) {
    console.error('Usage: ts-node scripts/debug-events.ts <calendar-id> YYYY-MM-DD');
    process.exit(1);
  }
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const tz = 'America/New_York';
  const dayStart = DateTime.fromISO(dateArg, { zone: tz }).startOf('day');
  const dayEnd = dayStart.endOf('day');

  try {
    const res = await calendar.events.list({
      calendarId: calId,
      timeMin: dayStart.toUTC().toISO()!,
      timeMax: dayEnd.toUTC().toISO()!,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 100,
    });
    const items = res.data.items ?? [];
    console.log(`\n${calId}  ${dateArg}  (${items.length} events)`);
    if (items.length === 0) {
      console.log('  (no events returned by events.list)');
      return;
    }
    for (const ev of items) {
      const s = ev.start?.dateTime || ev.start?.date || '(no start)';
      const e = ev.end?.dateTime || ev.end?.date || '(no end)';
      const title = ev.summary ?? '(no title)';
      const status = ev.status ?? '';
      const transp = ev.transparency ?? 'opaque'; // "transparent" = show as free
      const vis = ev.visibility ?? 'default';
      const attendee = (ev.attendees ?? []).find(a => a.self);
      const respStatus = attendee?.responseStatus ?? '';
      const src = ev.organizer?.email ?? '';
      console.log(`  - "${title}"`);
      console.log(`      ${s}  ->  ${e}   status:${status}  showAs:${transp}  vis:${vis}${respStatus?`  self:${respStatus}`:''}`);
      console.log(`      eventId: ${ev.id}`);
      console.log(`      iCalUID: ${ev.iCalUID}`);
      if (src) console.log(`      organizer: ${src} (self:${ev.organizer?.self ?? false})`);
      if (ev.creator?.email) console.log(`      creator:   ${ev.creator.email}`);
      if (ev.recurringEventId) console.log(`      recurring: ${ev.recurringEventId}`);
      if (ev.attendees && ev.attendees.length) {
        console.log(`      attendees: ${ev.attendees.map(a => (a.email||'?')+':'+(a.responseStatus||'?')+(a.self?' (self)':'')).join(', ')}`);
      }
      if (ev.source) console.log(`      source: ${ev.source.title} / ${ev.source.url}`);
      const htmlLink = ev.htmlLink;
      if (htmlLink) console.log(`      open:      ${htmlLink}`);
    }
  } catch (err: any) {
    console.log(`  ERROR listing events on ${calId}: ${err?.message ?? err}`);
    console.log(`  (If "insufficient permissions" — that calendar is shared as freebusy-only; use Google Calendar UI to see events.)`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
