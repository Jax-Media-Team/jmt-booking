/**
 * Verifies env vars + Google OAuth + free/busy access on every configured calendar.
 * Run: npx ts-node scripts/smoke-test.ts
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
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const baselineIds = (process.env.GOOGLE_FREEBUSY_CALENDARS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  // Also include Mike's calendar (Monthly Recap co-host) in the check
  const ids = Array.from(new Set([...baselineIds, 'michael@jaxmediateam.com']));
  console.log('Checking calendars:', ids.join(', '));

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items: ids.map(id => ({ id })),
    },
  });

  let allOk = true;
  for (const id of ids) {
    const entry = res.data.calendars?.[id];
    if (!entry) {
      console.log(`  [MISS] ${id} — not in response`);
      allOk = false;
      continue;
    }
    if (entry.errors?.length) {
      console.log(`  [FAIL] ${id} — ${entry.errors.map(e => e.reason).join(', ')}`);
      allOk = false;
      continue;
    }
    console.log(`  [OK]   ${id} — ${entry.busy?.length ?? 0} busy blocks in the next 7 days`);
  }

  if (!allOk) {
    console.log('\nFix: share the failing calendar(s) with pcruz@jaxmediateam.com (See only free/busy is enough).');
    process.exit(1);
  }
  console.log('\nAll calendars accessible. Ready to deploy.');
}

main().catch(e => { console.error('Smoke test failed:', e.message ?? e); process.exit(1); });
