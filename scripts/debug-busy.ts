/**
 * Debug: print every busy interval for every checked calendar on a given date.
 * Run: npx ts-node scripts/debug-busy.ts 2026-05-26
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
  const dateArg = process.argv[2];
  if (!dateArg) { console.error('Usage: ts-node scripts/debug-busy.ts YYYY-MM-DD'); process.exit(1); }
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const ids = (process.env.GOOGLE_FREEBUSY_CALENDARS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  ids.push('michael@jaxmediateam.com');
  const unique = Array.from(new Set(ids));

  const tz = 'America/New_York';
  const dayStart = DateTime.fromISO(dateArg, { zone: tz }).startOf('day');
  const dayEnd = dayStart.endOf('day');

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toUTC().toISO()!,
      timeMax: dayEnd.toUTC().toISO()!,
      items: unique.map(id => ({ id })),
    },
  });

  for (const id of unique) {
    const entry = res.data.calendars?.[id];
    console.log(`\n=== ${id} ===`);
    if (entry?.errors?.length) {
      console.log(`  ERROR: ${entry.errors.map(e => e.reason).join(', ')}`);
      continue;
    }
    const busy = entry?.busy ?? [];
    if (busy.length === 0) { console.log('  (no busy blocks)'); continue; }
    for (const b of busy) {
      const s = DateTime.fromISO(b.start!).setZone(tz);
      const e = DateTime.fromISO(b.end!).setZone(tz);
      console.log(`  ${s.toFormat('HH:mm')} - ${e.toFormat('HH:mm')}  (${s.toFormat('ccc LLL d')})`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
