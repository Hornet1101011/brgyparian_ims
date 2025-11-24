import { toMinutes, rangesOverlap, slotOverlapsAny } from '../utils/scheduling';

describe('scheduling utils', () => {
  test('toMinutes converts HH:mm to minutes', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('12:30')).toBe(750);
    expect(Number.isNaN(toMinutes('foo'))).toBe(true);
  });

  test('rangesOverlap detects overlaps correctly', () => {
    // a: 09:00-10:00, b:09:30-10:30 -> overlap
    expect(rangesOverlap(9*60, 10*60, 9*60+30, 10*60+30)).toBe(true);
    // touching edges should NOT overlap (end === start)
    expect(rangesOverlap(8*60, 9*60, 9*60, 10*60)).toBe(false);
    // contained
    expect(rangesOverlap(9*60, 12*60, 10*60, 11*60)).toBe(true);
  });

  test('slotOverlapsAny identifies any conflict in existing ranges', () => {
    const existing = [{ start: '09:00', end: '10:00' }, { start: '11:00', end: '11:30' }];
    expect(slotOverlapsAny({ start: '09:30', end: '09:45' }, existing)).toBe(true);
    expect(slotOverlapsAny({ start: '10:00', end: '10:30' }, existing)).toBe(false);
  });
});
