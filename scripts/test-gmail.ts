/**
 * One-off: verify the new OAuth refresh token has gmail.send scope by sending
 * a tiny test email to pcruz@jaxmediateam.com.
 * Run: npx ts-node scripts/test-gmail.ts
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
  // Use the production sendHostNotification helper so we test the same code path.
  const email = await import('../lib/email');
  const meetings = await import('../lib/meetings');
  const meeting = meetings.getMeeting('discovery')!;

  await email.sendHostNotification({
    meeting: { ...meeting, notificationRecipients: ['pcruz@jaxmediateam.com'] },
    attendeeName: 'Test test',
    attendeeEmail: 'test@example.com',
    startISO: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    endISO: new Date(Date.now() + 24 * 3600 * 1000 + 15 * 60 * 1000).toISOString(),
    responses: {
      name: 'Test test',
      email: 'test@example.com',
      phone: '904-555-0100',
      company: 'Test test',
      budget: 'Yes',
      timeline: 'Within a week',
      notes: 'em dash — and middle dot · and accents éàü',
    },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    eventLink: null,
    guestTimezone: 'America/New_York',
  });
  console.log('OK — host notification sent. Check the subject + body for proper UTF-8.');
}

main().catch((e) => {
  console.error('Gmail test failed:', e?.message ?? e);
  process.exit(1);
});
