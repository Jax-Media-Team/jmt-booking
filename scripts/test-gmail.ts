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
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const raw = Buffer.from(
    [
      'From: Jax Media Team <pcruz@jaxmediateam.com>',
      'To: pcruz@jaxmediateam.com',
      'Subject: jmt-booking smoke test (delete me)',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      '<p>This is a one-off test from the jmt-booking app to verify the Gmail send scope is working. You can delete this email.</p>',
    ].join('\r\n')
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  console.log('OK — Gmail send returned id:', res.data.id);
  console.log('Check your inbox at pcruz@jaxmediateam.com.');
}

main().catch((e) => {
  console.error('Gmail test failed:', e?.message ?? e);
  process.exit(1);
});
