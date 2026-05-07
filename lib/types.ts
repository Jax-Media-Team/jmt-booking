export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'radio';

export interface FormField {
  /** Form key. Use 'name' for booker name (required) and 'email' for booker email (required). */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For radio fields. */
  options?: string[];
  /** Optional explanation shown above the field. */
  helperText?: string;
  placeholder?: string;
  autocomplete?: string;
  maxLength?: number;
}

export interface MeetingType {
  slug: string;
  name: string;
  /** Short tagline shown on cards. */
  description: string;
  /** Optional longer description shown on the booking page. */
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
  /** Description of the meeting location/conferencing for the booking page. */
  location: string;
  /** Form schema. Render in order. Must include 'name' and 'email'. */
  formFields: FormField[];
  /** Calendar event title template. Use {name} for the booker's name. */
  eventTitle: string;
  /** Extra calendar IDs to check for conflicts (in addition to GOOGLE_FREEBUSY_CALENDARS). */
  additionalFreebusyCalendars?: string[];
  /** Extra attendees added to the event invite (e.g. teammates). */
  additionalAttendees?: string[];
  /** Internal addresses that get a "new booking" notification email when this meeting is booked. */
  notificationRecipients?: string[];
}

export interface BusyInterval {
  start: string;
  end: string;
}

export interface BookingRequest {
  meetingSlug: string;
  startISO: string;
  responses: Record<string, string>;
  guestTimezone?: string;
  /** Honeypot field — must be empty for the booking to be processed. */
  hp_website?: string;
}
