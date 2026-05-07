/**
 * Sends both emails (host notification + booker confirmation) using realistic data
 * so you can preview the rendered output. Both go to pcruz@jaxmediateam.com.
 *
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
  const email = await import('../lib/email');
  const meetings = await import('../lib/meetings');
  const discovery = meetings.getMeeting('discovery')!;
  const recap = meetings.getMeeting('monthly-recap')!;

  const startISO = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const endISOdiscovery = new Date(Date.now() + 24 * 3600 * 1000 + 15 * 60 * 1000).toISOString();
  const endISOrecap = new Date(Date.now() + 24 * 3600 * 1000 + 45 * 60 * 1000).toISOString();

  // 1) Host notification — Discovery
  await email.sendHostNotification({
    meeting: { ...discovery, notificationRecipients: ['pcruz@jaxmediateam.com'] },
    attendeeName: 'Jane Sample',
    attendeeEmail: 'jane@samplebusiness.com',
    startISO,
    endISO: endISOdiscovery,
    responses: {
      name: 'Jane Sample',
      email: 'jane@samplebusiness.com',
      phone: '904-555-0100',
      company: 'Sample Business',
      business_url: 'https://samplebusiness.com',
      services: 'SEO, PPC',
      budget: 'Yes',
      timeline: 'Within a week',
      notes: 'We just launched a new product line and want to ramp lead flow this quarter — em dash test —, mid-dot ·.',
    },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    eventLink: 'https://calendar.google.com/calendar/event?eid=test',
    guestTimezone: 'America/New_York',
  });

  // 2) Host notification — Monthly Recap (goes to both pcruz + michael in production; here only pcruz for testing)
  await email.sendHostNotification({
    meeting: { ...recap, notificationRecipients: ['pcruz@jaxmediateam.com'] },
    attendeeName: 'John Existing-Client',
    attendeeEmail: 'john@existingco.com',
    startISO,
    endISO: endISOrecap,
    responses: {
      name: 'John Existing-Client',
      email: 'john@existingco.com',
      company: 'Existing Co',
      notes: 'Want to talk about the new landing page test results.',
    },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    eventLink: 'https://calendar.google.com/calendar/event?eid=test',
    guestTimezone: 'America/New_York',
  });

  // 3) Booker confirmation — Discovery
  await email.sendBookerConfirmation({
    meeting: discovery,
    attendeeName: 'Jane Sample',
    attendeeEmail: 'pcruz@jaxmediateam.com',
    startISO,
    endISO: endISOdiscovery,
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    guestTimezone: 'America/New_York',
  });

  // 4) Booker confirmation — Monthly Recap
  await email.sendBookerConfirmation({
    meeting: recap,
    attendeeName: 'John Existing-Client',
    attendeeEmail: 'pcruz@jaxmediateam.com',
    startISO,
    endISO: endISOrecap,
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    guestTimezone: 'America/New_York',
  });

  console.log('Sent 4 test emails to pcruz@jaxmediateam.com:');
  console.log('  1) Host notification — Discovery');
  console.log('  2) Host notification — Monthly Recap');
  console.log('  3) Booker confirmation — Discovery');
  console.log('  4) Booker confirmation — Monthly Recap');
}

main().catch((e) => {
  console.error('Email test failed:', e?.message ?? e);
  process.exit(1);
});
