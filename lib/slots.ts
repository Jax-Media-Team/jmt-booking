import { DateTime, Interval } from 'luxon';
import type { BusyInterval, MeetingType } from './types';

export interface DaySlots {
  date: string;
  slots: string[];
}

export function generateAvailableSlots(
  meeting: MeetingType,
  busy: BusyInterval[],
  now: DateTime = DateTime.utc()
): DaySlots[] {
  const tz = meeting.timezone;
  const earliest = now.plus({ hours: meeting.minNoticeHours });
  const horizon = now.setZone(tz).plus({ days: meeting.maxHorizonDays }).endOf('day');

  const busyIntervals = busy
    .map((b) => {
      const start = DateTime.fromISO(b.start);
      const end = DateTime.fromISO(b.end);
      if (!start.isValid || !end.isValid || end <= start) return null;
      return Interval.fromDateTimes(start, end);
    })
    .filter((i): i is Interval => i !== null);

  const days: DaySlots[] = [];
  let cursor = now.setZone(tz).startOf('day');

  while (cursor <= horizon) {
    const weekday = cursor.weekday % 7;
    if (meeting.workingDays.includes(weekday)) {
      const slots = slotsForDay(cursor, meeting, busyIntervals, earliest);
      if (slots.length > 0) {
        days.push({ date: cursor.toISODate()!, slots });
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return days;
}

function slotsForDay(
  day: DateTime,
  meeting: MeetingType,
  busyIntervals: Interval[],
  earliest: DateTime
): string[] {
  const dayStart = day.set({ hour: meeting.workingHourStart, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = day.set({ hour: meeting.workingHourEnd, minute: 0, second: 0, millisecond: 0 });

  const slots: string[] = [];
  let cursor = dayStart;
  const totalBlock = meeting.durationMinutes + meeting.bufferAfterMinutes;

  while (cursor.plus({ minutes: meeting.durationMinutes }) <= dayEnd) {
    const slotEnd = cursor.plus({ minutes: meeting.durationMinutes });
    const blockEnd = cursor.plus({ minutes: totalBlock });
    const candidate = Interval.fromDateTimes(cursor, blockEnd > dayEnd ? slotEnd : blockEnd);

    const tooSoon = cursor < earliest;
    const conflicts = busyIntervals.some((b) => b.overlaps(candidate));

    if (!tooSoon && !conflicts) {
      slots.push(cursor.toUTC().toISO({ suppressMilliseconds: true })!);
    }

    cursor = cursor.plus({ minutes: meeting.slotIncrementMinutes });
  }

  return slots;
}

export function isStillAvailable(
  meeting: MeetingType,
  startISO: string,
  busy: BusyInterval[],
  now: DateTime = DateTime.utc()
): { ok: true } | { ok: false; reason: string } {
  const start = DateTime.fromISO(startISO).setZone(meeting.timezone);
  if (!start.isValid) return { ok: false, reason: 'Invalid start time' };

  const earliest = now.plus({ hours: meeting.minNoticeHours });
  if (start < earliest) return { ok: false, reason: 'Slot is past the minimum notice window' };

  const horizon = now.setZone(meeting.timezone).plus({ days: meeting.maxHorizonDays }).endOf('day');
  if (start > horizon) return { ok: false, reason: 'Slot is past the booking horizon' };

  const weekday = start.weekday % 7;
  if (!meeting.workingDays.includes(weekday)) return { ok: false, reason: 'Day is outside working days' };

  const dayStart = start.set({ hour: meeting.workingHourStart, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = start.set({ hour: meeting.workingHourEnd, minute: 0, second: 0, millisecond: 0 });
  const slotEnd = start.plus({ minutes: meeting.durationMinutes });
  if (start < dayStart || slotEnd > dayEnd) return { ok: false, reason: 'Slot is outside working hours' };

  const minutesIntoDay = (start.hour - meeting.workingHourStart) * 60 + start.minute;
  if (minutesIntoDay % meeting.slotIncrementMinutes !== 0) return { ok: false, reason: 'Slot is not aligned to grid' };

  const candidate = Interval.fromDateTimes(start, slotEnd);
  for (const b of busy) {
    const bStart = DateTime.fromISO(b.start);
    const bEnd = DateTime.fromISO(b.end);
    if (!bStart.isValid || !bEnd.isValid) continue;
    const bi = Interval.fromDateTimes(bStart, bEnd);
    if (bi.overlaps(candidate)) return { ok: false, reason: 'Slot conflicts with another event' };
  }

  return { ok: true };
}
