import dayjs from 'dayjs';

// Philippines Holidays 2026
export const PHILIPPINES_HOLIDAYS_2026 = [
  // Regular Holidays (Full Pay)
  { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
  { date: '2026-04-02', name: "Maundy Thursday", type: 'regular' },
  { date: '2026-04-03', name: "Good Friday", type: 'regular' },
  { date: '2026-04-09', name: "Araw ng Kagitingan", type: 'regular' },
  { date: '2026-05-01', name: "Labor Day", type: 'regular' },
  { date: '2026-06-12', name: "Independence Day", type: 'regular' },
  { date: '2026-08-31', name: "National Heroes Day", type: 'regular' }, // Last Monday of August
  { date: '2026-11-30', name: "Bonifacio Day", type: 'regular' },
  { date: '2026-12-25', name: "Christmas Day", type: 'regular' },
  { date: '2026-12-30', name: "Rizal Day", type: 'regular' },
  
  // Special (Non-Working) Holidays
  { date: '2026-02-17', name: "Chinese New Year", type: 'special-non-working' },
  { date: '2026-04-04', name: "Black Saturday", type: 'special-non-working' },
  { date: '2026-08-21', name: "Ninoy Aquino Day", type: 'special-non-working' },
  { date: '2026-11-01', name: "All Saints' Day", type: 'special-non-working' },
  { date: '2026-12-08', name: "Feast of Immaculate Conception", type: 'special-non-working' },
  { date: '2026-12-31', name: "Last Day of the Year", type: 'special-non-working' },
  
  // Islamic Holidays (Dates may vary - using estimated dates)
  { date: '2026-03-31', name: "Eid al-Fitr", type: 'islamic' }, // Estimated
  { date: '2026-06-09', name: "Eid al-Adha", type: 'islamic' }, // Estimated
];

// Helper function to check if a date is a Philippines holiday
export const isPhilippinesHoliday = (date: dayjs.Dayjs) => {
  const dateStr = date.format('YYYY-MM-DD');
  return PHILIPPINES_HOLIDAYS_2026.some(holiday => holiday.date === dateStr);
};
