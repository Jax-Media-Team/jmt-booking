# JMT Booking

A self-hosted Calendly replacement for Jax Media Team. Two meeting types out of the box (Monthly Recap Call, Discovery Call), conflict-checking across multiple Google Calendars, Google Meet links, and email confirmations — without paying per "calendar connection."

## Stack

- Static HTML/CSS/vanilla JS frontend (no build step)
- TypeScript Vercel serverless functions in `/api`
- Google Calendar API (free/busy + event creation with Meet link)
- Resend for confirmation emails
- Luxon for timezone math

## Project layout

```
jmt-booking/
  api/               # Serverless endpoints
    availability.ts  # GET /api/availability?meeting=<slug>
    book.ts          # POST /api/book
  lib/
    calendar.ts      # Google Calendar client
    meetings.ts      # Meeting type configs (edit this)
    slots.ts         # Slot generation + server-side validation
    email.ts         # Resend confirmation email
    types.ts
  public/            # Static frontend
    index.html       # Landing
    book.html        # Booking page (?type=monthly-recap or ?type=discovery)
    success.html
    css/styles.css
    js/booking.js
  scripts/
    get-refresh-token.ts  # One-time OAuth helper
```

URLs in production:

- `/` — landing page with both meeting types
- `/monthly-recap` — Monthly Recap Call booking
- `/discovery` — Discovery Call booking

## One-time setup

### 1. Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create or select a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → choose **External**, fill in the basics (app name, support email). Add `pcruz@jaxmediateam.com` as a test user. You can leave it in Testing mode — the refresh token doesn't expire as long as you keep using it.
4. **APIs & Services → Credentials** → **Create credentials → OAuth client ID** → **Web application**.
   - Authorized redirect URIs: `http://localhost:8765/callback`
5. Copy the client ID and secret.

### 2. Share calendars

Sign in to the Google account that owns each non-primary calendar (personal Gmail, teammates) and share each one with `pcruz@jaxmediateam.com` with at least **See only free/busy** permission. Bookings get written to your work calendar; everything else is just used for conflict checking.

### 3. Local env

Copy `.env.local.example` to `.env.local` and fill in:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_TARGET_CALENDAR_ID=pcruz@jaxmediateam.com
GOOGLE_FREEBUSY_CALENDARS=pcruz@jaxmediateam.com,your-personal@gmail.com
RESEND_API_KEY=...
RESEND_FROM="Patrick Cruz <bookings@jaxmediateam.com>"
SITE_URL=https://book.jaxmediateam.com
```

Install dependencies:

```bash
npm install
```

### 4. Get a refresh token

```bash
npm run auth
```

This opens a browser window. Sign in with `pcruz@jaxmediateam.com`, grant calendar access, and copy the printed `GOOGLE_REFRESH_TOKEN` into `.env.local`.

### 5. Resend (email)

1. Create a Resend account, verify the `jaxmediateam.com` domain (or use Resend's onboarding sandbox until then).
2. Create an API key, paste into `RESEND_API_KEY`.

### 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000` and try booking a slot in the future.

## Deploy to Vercel

1. Push this repo to the Jax-Media-Team GitHub org.
2. Import into Vercel.
3. Add every env var from `.env.local` to the Vercel project settings.
4. (Optional) Add a custom domain like `book.jaxmediateam.com` and update `SITE_URL`.

## Editing meeting types

All meeting config lives in `lib/meetings.ts`. To change duration, working hours, buffer, etc., edit that file and redeploy.

```ts
'discovery': {
  ...DEFAULTS,
  slug: 'discovery',
  name: 'Discovery Call',
  description: '...',
  durationMinutes: 15,
}
```

To add a new meeting type:

1. Add an entry to `MEETINGS` in `lib/meetings.ts`.
2. Add a card to `public/index.html`.
3. Add a rewrite in `vercel.json` so `/your-slug` → `/book.html?type=your-slug`.

## Notes

- The backend re-validates the chosen slot against live free/busy right before creating the event, so the only race window is a few hundred ms.
- All Google Calendar events include a Google Meet link automatically.
- Times are stored in UTC; everything is rendered in the guest's local timezone (with the meeting's source timezone shown for transparency).
- Confirmation emails are best-effort — if Resend fails, the calendar invite still goes out (Google sends its own invite to the attendee).
