/**
 * Debug: dump the ACL rules on a calendar so we can see who has what access.
 * Run: npx ts-node scripts/debug-acl.ts <calendar-id>
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
  if (!calId) { console.error('Usage: ts-node scripts/debug-acl.ts <calendar-id>'); process.exit(1); }
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  try {
    const list = await calendar.calendarList.get({ calendarId: calId });
    console.log(`calendarList entry for ${calId}:`);
    console.log(`  accessRole: ${list.data.accessRole}`);
    console.log(`  summary: ${list.data.summary}`);
    console.log(`  summaryOverride: ${list.data.summaryOverride ?? '(none)'}`);
  } catch (err: any) {
    console.log(`calendarList.get error: ${err?.message ?? err}`);
  }

  try {
    const acl = await calendar.acl.list({ calendarId: calId });
    console.log(`\nACL rules on ${calId} (${(acl.data.items ?? []).length}):`);
    for (const r of acl.data.items ?? []) {
      console.log(`  - ${r.scope?.type}:${r.scope?.value ?? ''} -> ${r.role}`);
    }
  } catch (err: any) {
    console.log(`acl.list error (expected 403 if not owner): ${err?.message ?? err}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
