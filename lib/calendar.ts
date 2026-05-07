import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { BusyInterval, MeetingType } from './types';

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

function getBaselineCalendars(): string[] {
  return requireEnv('GOOGLE_FREEBUSY_CALENDARS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getCalendarsForMeeting(meeting: MeetingType): string[] {
  const baseline = getBaselineCalendars();
  const extra = (meeting.additionalFreebusyCalendars ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set([...baseline, ...extra]));
}

export function getTargetCalendarId(): string {
  return requireEnv('GOOGLE_TARGET_CALENDAR_ID');
}

export async function getBusyIntervals(
  startISO: string,
  endISO: string,
  calendarIds: string[]
): Promise<BusyInterval[]> {
  if (calendarIds.length === 0) return [];
  const calendar = getCalendar();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startISO,
      timeMax: endISO,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const calendars = res.data.calendars ?? {};
  const merged: BusyInterval[] = [];
  for (const id of calendarIds) {
    const entry = calendars[id];
    if (entry?.errors?.length) {
      throw new Error(
        `Free/busy lookup failed for ${id}: ${entry.errors.map((e) => e.reason).join(', ')}. ` +
          `Make sure that calendar is shared with the OAuth account ('See only free/busy' is enough).`
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
  meetingSlug: string;
  additionalAttendees?: string[];
  /** Form responses to persist on the event so reschedule can pre-fill them. */
  responses?: Record<string, string>;
}): Promise<CreatedEvent> {
  const calendar = getCalendar();
  const attendees: calendar_v3.Schema$EventAttendee[] = [
    { email: params.attendeeEmail, displayName: params.attendeeName },
  ];
  for (const email of params.additionalAttendees ?? []) {
    if (email && email !== params.attendeeEmail) {
      attendees.push({ email });
    }
  }

  const res = await calendar.events.insert({
    calendarId: getTargetCalendarId(),
    sendUpdates: 'all',
    conferenceDataVersion: 1,
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startISO },
      end: { dateTime: params.endISO },
      attendees,
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
      // Stored privately on the event so /manage, /api/cancel, and the reschedule
      // flow can read them back. Each value is truncated to 1000 chars to fit
      // Google's per-value limit; large `notes` are the only field that may hit it.
      extendedProperties: {
        private: buildExtendedProperties({
          bookerEmail: params.attendeeEmail.toLowerCase(),
          bookerName: params.attendeeName,
          meetingSlug: params.meetingSlug,
          bookingSource: 'jmt-booking',
          responses: params.responses ?? {},
        }),
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

/** Build the extendedProperties.private map, splitting `responses` into resp_<name> keys
 *  and truncating each value to a safe size. */
function buildExtendedProperties(input: {
  bookerEmail: string;
  bookerName: string;
  meetingSlug: string;
  bookingSource: string;
  responses: Record<string, string>;
}): Record<string, string> {
  const truncate = (s: string): string =>
    typeof s === 'string' && s.length > 1000 ? s.slice(0, 1000) : s;
  const out: Record<string, string> = {
    bookerEmail: truncate(input.bookerEmail),
    bookerName: truncate(input.bookerName),
    meetingSlug: truncate(input.meetingSlug),
    bookingSource: truncate(input.bookingSource),
  };
  for (const [key, value] of Object.entries(input.responses ?? {})) {
    if (!value) continue;
    if (key === 'name' || key === 'email') continue; // covered by bookerName/bookerEmail
    // Google extendedProperties keys must be 1-44 chars; resp_<name> stays well under.
    const safeKey = `resp_${key}`.slice(0, 44);
    out[safeKey] = truncate(value);
  }
  return out;
}

function parseResponses(priv: Record<string, string> | undefined | null): Record<string, string> {
  const responses: Record<string, string> = {};
  if (!priv) return responses;
  for (const [key, value] of Object.entries(priv)) {
    if (!key.startsWith('resp_')) continue;
    responses[key.slice(5)] = value;
  }
  return responses;
}

/** Lookup an event with the metadata required by the manage page. Returns null if missing. */
export interface ManageableEvent {
  id: string;
  summary: string;
  startISO: string;
  endISO: string;
  hangoutLink: string | null;
  bookerEmail: string;
  bookerName: string;
  meetingSlug: string;
  status: string;
  responses: Record<string, string>;
}

export async function getManageableEvent(
  eventId: string
): Promise<ManageableEvent | null> {
  const calendar = getCalendar();
  try {
    const res = await calendar.events.get({
      calendarId: getTargetCalendarId(),
      eventId,
    });
    const ev = res.data;
    if (!ev || !ev.id) return null;
    const priv = ev.extendedProperties?.private ?? {};
    return {
      id: ev.id,
      summary: ev.summary ?? '',
      startISO: ev.start?.dateTime ?? '',
      endISO: ev.end?.dateTime ?? '',
      hangoutLink: ev.hangoutLink ?? null,
      bookerEmail: (priv.bookerEmail ?? '').toLowerCase(),
      bookerName: priv.bookerName ?? '',
      meetingSlug: priv.meetingSlug ?? '',
      status: ev.status ?? '',
      responses: parseResponses(priv as Record<string, string>),
    };
  } catch (err: unknown) {
    const e = err as { code?: number; status?: number };
    if (e?.code === 404 || e?.status === 404) return null;
    throw err;
  }
}

/** Cancel the event. Pass `silent: true` to skip Google's cancellation emails — used
 *  when the cancel is part of a reschedule, so we don't send "cancelled" right before
 *  "rescheduled". */
export async function cancelEvent(eventId: string, opts?: { silent?: boolean }): Promise<void> {
  const calendar = getCalendar();
  await calendar.events.delete({
    calendarId: getTargetCalendarId(),
    eventId,
    sendUpdates: opts?.silent ? 'none' : 'all',
  });
}
