/**
 * One-time CLI to obtain a Google OAuth refresh token.
 *
 * Usage:
 *   1. In Google Cloud Console, create an OAuth 2.0 Client ID of type "Web application"
 *      and add http://localhost:8765/callback to "Authorized redirect URIs".
 *   2. Put the client id + secret in .env.local (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
 *   3. Run: npm run auth
 *   4. Your browser opens; sign in with the Google account that owns your work calendar
 *      and grant calendar access. The script captures the code automatically.
 *   5. Copy the printed refresh token into .env.local as GOOGLE_REFRESH_TOKEN
 *      and into your Vercel project env vars.
 */
import { google } from 'googleapis';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

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

function openBrowser(url: string): void {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
              process.platform === 'darwin' ? `open "${url}"` :
              `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main(): Promise<void> {
  loadEnv();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.');
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const c = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err || !c) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Auth failed: ${err ?? 'no code'}</h2>`);
        server.close();
        reject(new Error(err ?? 'No code returned'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>You can close this tab.</h2>');
      server.close();
      resolve(c);
    });
    server.listen(PORT, () => {
      console.log(`\nOpening browser to authorize...\nIf nothing opens, visit:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error('\nNo refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions and retry.');
    process.exit(1);
  }
  console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
  console.log('\nCopy that line into .env.local and into your Vercel project env vars.');
}

main().catch((e) => { console.error(e); process.exit(1); });
