export interface MeetingType {
  slug: string;
  name: string;
  description: string;
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
