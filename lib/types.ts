export interface MeetingType {
  slug: string;
  name: string;
  /** Short tagline shown on cards. */
  description: string;
  /** Optional longer description shown on the booking page. Plain text; \n becomes a paragraph break. */
  longDescription?: string;
  /** Optional agenda bullet list shown on the booking page. */
  agenda?: string[];
  /** Optional prep note shown after the agenda on the booking page. */
  prepNote?: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  slotIncrementMinutes: number;
  minNoticeHours: number;
  maxHorizonDays: number;
  workingDays: number[];
  workingHourStart: number;
  workingHourEnd: number;
  timezone: string;
  location: string;
}

export interface BusyInterval {
  start: string;
  end: string;
}

export interface BookingRequest {
  meetingSlug: string;
  startISO: string;
  name: string;
  email: string;
  notes?: string;
  guestTimezone?: string;
}
