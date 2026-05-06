import type { MeetingType, FormField } from './types';

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

const NAME_FIELD: FormField = {
  name: 'name',
  label: 'Full name',
  type: 'text',
  required: true,
  autocomplete: 'name',
  maxLength: 200,
};
const EMAIL_FIELD: FormField = {
  name: 'email',
  label: 'Email',
  type: 'email',
  required: true,
  autocomplete: 'email',
  maxLength: 320,
};
const COMPANY_FIELD: FormField = {
  name: 'company',
  label: 'Company name',
  type: 'text',
  required: true,
  autocomplete: 'organization',
  maxLength: 200,
};
const PHONE_FIELD: FormField = {
  name: 'phone',
  label: 'Phone',
  type: 'tel',
  required: true,
  autocomplete: 'tel',
  maxLength: 32,
  placeholder: '(555) 123-4567',
};
const NOTES_FIELD: FormField = {
  name: 'notes',
  label: "Anything you'd like me to know? (optional)",
  type: 'textarea',
  required: false,
  maxLength: 2000,
  placeholder: 'Updates, goals, questions, context — anything that helps me prep.',
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
    eventTitle: 'Monthly Recap Call w/ {company}',
    additionalFreebusyCalendars: ['michael@jaxmediateam.com'],
    additionalAttendees: ['michael@jaxmediateam.com'],
    formFields: [NAME_FIELD, EMAIL_FIELD, COMPANY_FIELD, NOTES_FIELD],
  },

  'discovery': {
    ...DEFAULTS,
    slug: 'discovery',
    name: 'JMT Discovery Call',
    description:
      'A quick intro to learn about your business, your goals, and whether we are the right fit.',
    longDescription:
      'A short, no-pressure intro to learn about your business, your marketing goals, and the challenges you are running into. If we are a fit, we will outline a few next steps.',
    agenda: [
      'A quick walk through what you are working on',
      'Your goals and the obstacles in the way',
      'Where Jax Media Team can help — and where we cannot',
    ],
    durationMinutes: 15,
    eventTitle: 'Discovery Call w/ {company}',
    formFields: [
      NAME_FIELD,
      EMAIL_FIELD,
      PHONE_FIELD,
      COMPANY_FIELD,
      {
        name: 'budget',
        label: 'If you see a clear ROI and believe in the system, would that level of investment be comfortable for you?',
        type: 'radio',
        required: true,
        options: ['Yes', 'No'],
        helperText:
          "Most of our clients invest at least $1,500/month to get meaningful results. The discovery call is free — it just helps us explore if there's a mutual fit.",
      },
      {
        name: 'timeline',
        label: "If you're confident our system will help you get more business, when will you be able to move forward?",
        type: 'radio',
        required: true,
        options: ['Immediately', 'Within a week', '2–3 weeks', '1 month+'],
      },
      NOTES_FIELD,
    ],
  },
};

export function getMeeting(slug: string): MeetingType | null {
  return MEETINGS[slug] ?? null;
}

export function listMeetings(): MeetingType[] {
  return Object.values(MEETINGS);
}
