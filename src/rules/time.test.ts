import { describe, it, expect } from 'vitest';
import { isWithinWindow, activeFreeze, parseWindow } from './time';

// IST = UTC+5:30. Reference calendar (2026):
//   Oct 3 = Sat, Oct 5 = Mon.
const WINDOW = 'Mon-Thu 10:00-17:00 IST';

describe('isWithinWindow', () => {
  it('is true for Mon 12:00 IST (06:30 UTC)', () => {
    expect(isWithinWindow(new Date('2026-10-05T06:30:00Z'), WINDOW)).toBe(true);
  });

  it('is false for Mon 18:00 IST (12:30 UTC) — past the end', () => {
    expect(isWithinWindow(new Date('2026-10-05T12:30:00Z'), WINDOW)).toBe(false);
  });

  it('is false for Mon 09:00 IST (03:30 UTC) — before the start', () => {
    expect(isWithinWindow(new Date('2026-10-05T03:30:00Z'), WINDOW)).toBe(false);
  });

  it('is false on Saturday regardless of time', () => {
    expect(isWithinWindow(new Date('2026-10-03T06:30:00Z'), WINDOW)).toBe(false);
  });

  it('treats the end as exclusive (17:00 IST is out)', () => {
    // 17:00 IST = 11:30 UTC
    expect(isWithinWindow(new Date('2026-10-05T11:30:00Z'), WINDOW)).toBe(false);
  });

  it('supports multiple windows separated by ;', () => {
    const spec = 'Mon 10:00-11:00 IST; Fri 14:00-15:00 IST';
    // Fri 2026-10-09 14:30 IST = 09:00 UTC
    expect(isWithinWindow(new Date('2026-10-09T09:00:00Z'), spec)).toBe(true);
  });

  it('parseWindow expands day ranges inclusively', () => {
    const w = parseWindow(WINDOW);
    expect([...w.days].sort()).toEqual([1, 2, 3, 4]); // Mon..Thu
    expect(w.start).toBe(600); // 10:00
    expect(w.end).toBe(1020); // 17:00
    expect(w.tz).toBe('Asia/Kolkata');
  });
});

describe('activeFreeze', () => {
  const freezes = ['2026-10-20..2026-10-23'];

  it('returns the range when inside it', () => {
    // Oct 21 10:00 IST = 04:30 UTC
    expect(activeFreeze(new Date('2026-10-21T04:30:00Z'), freezes)).toBe('2026-10-20..2026-10-23');
  });

  it('includes the final day through end-of-day IST', () => {
    // Oct 23 23:00 IST = 17:30 UTC — still frozen
    expect(activeFreeze(new Date('2026-10-23T17:30:00Z'), freezes)).toBe('2026-10-20..2026-10-23');
  });

  it('is clear once the range ends (Oct 24 00:00 IST = Oct 23 18:30 UTC)', () => {
    expect(activeFreeze(new Date('2026-10-23T18:30:00Z'), freezes)).toBeNull();
  });

  it('is clear before the range starts', () => {
    expect(activeFreeze(new Date('2026-10-19T12:00:00Z'), freezes)).toBeNull();
  });

  it('supports a single-day freeze', () => {
    expect(activeFreeze(new Date('2026-10-20T06:00:00Z'), ['2026-10-20'])).toBe('2026-10-20');
  });

  it('returns null when no freezes are configured', () => {
    expect(activeFreeze(new Date(), undefined)).toBeNull();
    expect(activeFreeze(new Date(), [])).toBeNull();
  });
});
