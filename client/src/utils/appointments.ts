import dayjs, { Dayjs } from 'dayjs';

/**
 * Return the next `count` available weekdays (Dayjs objects), excluding Saturdays and Sundays.
 * Starts from today but only returns dates strictly in the future (so the earliest returned
 * date will be tomorrow if it's a weekday). Weekends are skipped. The function returns
 * Dayjs objects (not formatted strings) so callers can format or manipulate as needed.
 */
export function getAvailableAppointmentDates(count = 30): Dayjs[] {
  const out: Dayjs[] = [];
  // Start at start of today, then advance to tomorrow to ensure strictly-future dates
  let cursor = dayjs().startOf('day');
  // advance one day to ensure strictly future
  cursor = cursor.add(1, 'day');

  while (out.length < count) {
    const dow = cursor.day(); // 0 Sunday .. 6 Saturday
    if (dow !== 0 && dow !== 6) {
      out.push(cursor);
    }
    cursor = cursor.add(1, 'day');
  }

  return out;
}
