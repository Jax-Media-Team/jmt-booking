import type { MeetingType } from './types';

const DEFAULTS = {
  bufferAfterMinutes: 15,
  slotIncrementMinutes: 15,
  minNoticeHours: 12,
  maxHorizonDays: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHourStart: 9,
  workingHourEnd: 17,
  timezone: 'America/New_York',
  location: 'Google Meet (link added to the calendar invite)',
};

export const MEETINGS: Record<string, MeetingType> = {
  'monthly-recap': {
    ...DEFAULTS,
    slug: 'monthly-recap',
    name: 'Monthly Recap Call',
    description:
      "Your monthly check-in to walk through campaign performance, what's working, what we're changing, and what's next.",
    durationMinutes: 30,
  },
  'discovery': {
    ...DEFAULTS,
    slug: 'discovery',
    name: 'Discovery Call',
    description:
      'A quick intro call to learn about your business, your goals, and whether Jax Media Team is the right fit.',
    durationMinutes: 15,
  },
};

export function getMeeting(slug: string): MeetingType | null {
  return MEETINGS[slug] ?? null;
}

export function listMeetings(): MeetingType[] {
  return Object.values(MEETINGS);
}
