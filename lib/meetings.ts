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
  location: 'Web conferencing details provided upon confirmation.',
};

export const MEETINGS: Record<string, MeetingType> = {
  'monthly-recap': {
    ...DEFAULTS,
    slug: 'monthly-recap',
    name: 'JMT Monthly Recap',
    description:
      'Your monthly check-in to review performance and align on what is next.',
    longDescription:
      'This monthly session is designed to review your campaign performance, walk through key results from the previous month, and align on priorities for the month ahead.',
    agenda: [
      "What worked (and what didn't)",
      'Upcoming promotions, offers, or launches',
      'New strategies or testing opportunities',
    ],
    prepNote:
      'Please come prepared with any updates from your side (e.g. business goals, seasonal changes, promotions, or product/service news), so we can make the most of our time together.',
    durationMinutes: 45,
  },
  'discovery': {
    ...DEFAULTS,
    slug: 'discovery',
    name: 'JMT Discovery Call',
    description:
      'A quick intro to learn about your business, your goals, and whether we are the right fit.',
    longDescription:
      'A short, no-pressure intro call to learn about your business, your marketing goals, and the challenges you are running into. If we are a fit, we will outline a few next steps.',
    agenda: [
      'A quick walk through what you are working on',
      'Your goals and the obstacles in the way',
      'Where Jax Media Team can help — and where we cannot',
    ],
    durationMinutes: 45,
  },
};

export function getMeeting(slug: string): MeetingType | null {
  return MEETINGS[slug] ?? null;
}

export function listMeetings(): MeetingType[] {
  return Object.values(MEETINGS);
}
