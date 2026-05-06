import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { BusyInterval } from './types';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

let cachedClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (cachedClient) return cachedClient;
  const oauth2 = new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET')
  );
  oauth2.setCredentials({ refresh_token: requireEnv('GOOGLE_REFRESH_TOKEN') });
  cachedClient = oauth2;
  return oauth2;
}

function getCalendar(): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth: getOAuthClient() });
}

export function getFreeBusyCalendarIds(): string[] {
  return requireEnv('GOOGLE_FREEBUSY_CALENDARS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getTargetCalendarId(): string {
  return requireEnv('GOOGLE_TARGET_CALENDAR_ID');
}

export async function getBusyIntervals(
  startISO: string,
  endISO: string
): Promise<BusyInterval[]> {
  const calendar = getCalendar();
  const ids = getFreeBusyCalendarIds();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startISO,
      timeMax: endISO,
      items: ids.map((id) => ({ id })),
    },
  });

  const calendars = res.data.calendars ?? {};
  const merged: BusyInterval[] = [];
  for (const id of ids) {
    const entry = calendars[id];
    if (entry?.errors?.length) {
      throw new Error(
        `Free/busy lookup failed for ${id}: ${entry.errors.map((e) => e.reason).join(', ')}`
      );
    }
    for (const b of entry?.busy ?? []) {
      if (b.start && b.end) merged.push({ start: b.start, end: b.end });
    }
  }
  return merged;
}

export interface CreatedEvent {
  id: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  start: string;
  end: string;
}

export async function createBookingEvent(params: {
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  attendeeName: string;
  attendeeEmail: string;
}): Promise<CreatedEvent> {
  const calendar = getCalendar();
  const res = await calendar.events.insert({
    calendarId: getTargetCalendarId(),
    sendUpdates: 'all',
    conferenceDataVersion: 1,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startISO },
      end: { dateTime: params.endISO },
      attendees: [
        { email: params.attendeeEmail, displayName: params.attendeeName },
      ],
      conferenceData: {
        createRequest: {
          requestId: `jmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  });

  return {
    id: res.data.id ?? '',
    htmlLink: res.data.htmlLink ?? null,
    hangoutLink: res.data.hangoutLink ?? null,
    start: res.data.start?.dateTime ?? params.startISO,
    end: res.data.end?.dateTime ?? params.endISO,
  };
}
