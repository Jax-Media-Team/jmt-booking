/**
 * Debug: dump the FULL event record for a single event ID on a given calendar.
 * Run: npx ts-node scripts/debug-event-detail.ts <calendar-id> <event-id>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  const eventId = process.argv[3];
  if (!calId || !eventId) {
    console.error('Usage: ts-node scripts/debug-event-detail.ts <calendar-id> <event-id>');
    process.exit(1);
  }
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  try {
    const res = await calendar.events.get({ calendarId: calId, eventId });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.log('ERROR:', err?.message ?? err);
    if (err?.errors) console.log(JSON.stringify(err.errors, null, 2));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
