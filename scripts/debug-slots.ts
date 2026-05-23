/**
 * Debug: simulate slot generation for monthly-recap on a given date using
 * actual freebusy data from Google. Prints which slots survive and why.
 * Run: npx ts-node scripts/debug-slots.ts 2026-05-26
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DateTime, Interval } from 'luxon';
import { getMeeting } from '../lib/meetings';
import { getCalendarsForMeeting, getBusyIntervals } from '../lib/calendar';
import { generateAvailableSlots } from '../lib/slots';

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const dateArg = process.argv[2];
  if (!dateArg) { console.error('Usage: ts-node scripts/debug-slots.ts YYYY-MM-DD'); process.exit(1); }
  const slug = process.argv[3] || 'monthly-recap';
  const m = getMeeting(slug)!;
  if (!m) { console.error(`unknown meeting slug: ${slug}`); process.exit(1); }
  const tz = m.timezone;
  const day = DateTime.fromISO(dateArg, { zone: tz }).startOf('day');
  const dayStart = day.set({ hour: m.workingHourStart, minute: m.workingMinuteStart ?? 0, second: 0, millisecond: 0 });
  const dayEnd = day.set({ hour: m.workingHourEnd, minute: m.workingMinuteEnd ?? 0, second: 0, millisecond: 0 });

  const cals = getCalendarsForMeeting(m);
  console.log('Calendars:', cals);
  // Mimic api/availability.ts: pull busy for the full horizon, then generate slots
  const now = DateTime.utc();
  const horizonEnd = now.setZone(tz).plus({ days: m.maxHorizonDays }).endOf('day');
  const busy = await getBusyIntervals(now.toISO()!, horizonEnd.toUTC().toISO()!, cals);
  const allDays = generateAvailableSlots(m, busy, now);
  const dayResult = allDays.find(d => d.date === dateArg);
  console.log(`\nslots returned by generateAvailableSlots for ${dateArg}:`);
  if (!dayResult) {
    console.log('  (date not in result — no slots)');
  } else {
    for (const iso of dayResult.slots) {
      console.log('  ' + DateTime.fromISO(iso).setZone(tz).toFormat('HH:mm'));
    }
  }
  console.log('\nfull busy list inside the day:');
  console.log('Busy intervals:');
  for (const b of busy) {
    const s = DateTime.fromISO(b.start).setZone(tz);
    const e = DateTime.fromISO(b.end).setZone(tz);
    console.log(`  ${s.toFormat('HH:mm')} - ${e.toFormat('HH:mm')}  (raw start: ${b.start})`);
  }

  const busyIntervals = busy
    .map(b => Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end)))
    .filter(i => i.isValid);

  console.log(`\nSlot scan ${dayStart.toFormat('HH:mm')} - ${dayEnd.toFormat('HH:mm')}, duration ${m.durationMinutes}, buffer ${m.bufferAfterMinutes}, increment ${m.slotIncrementMinutes}`);
  const totalBlock = m.durationMinutes + m.bufferAfterMinutes;
  let cursor = dayStart;
  while (cursor.plus({ minutes: m.durationMinutes }) <= dayEnd) {
    const slotEnd = cursor.plus({ minutes: m.durationMinutes });
    const blockEnd = cursor.plus({ minutes: totalBlock });
    const candidate = Interval.fromDateTimes(cursor, blockEnd > dayEnd ? slotEnd : blockEnd);
    const conflict = busyIntervals.find(b => b.overlaps(candidate));
    const label = cursor.toFormat('HH:mm') + ' -> candidate [' + candidate.start!.setZone(tz).toFormat('HH:mm') + ', ' + candidate.end!.setZone(tz).toFormat('HH:mm') + ')';
    if (conflict) {
      const cs = conflict.start!.setZone(tz).toFormat('HH:mm');
      const ce = conflict.end!.setZone(tz).toFormat('HH:mm');
      console.log(`  BLOCKED  ${label}  busy [${cs}, ${ce})`);
    } else {
      console.log(`  free     ${label}`);
    }
    cursor = cursor.plus({ minutes: m.slotIncrementMinutes });
    if (cursor.hour >= 11) break;
  }
}
main().catch(e => { console.error(e); process.exit(1); });
