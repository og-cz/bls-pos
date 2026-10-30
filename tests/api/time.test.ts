import { describe, expect, it } from 'vitest';

import {
  addDays,
  dayStartMs,
  daysBetween,
  isValidTimeZone,
  localDay,
  zoneOffsetMinutes,
} from '../../src/shared/time';

describe('shop timezone days', () => {
  it('Manila is UTC+8 all year', () => {
    expect(zoneOffsetMinutes('Asia/Manila', Date.parse('2026-01-15T00:00:00Z'))).toBe(480);
    expect(zoneOffsetMinutes('Asia/Manila', Date.parse('2026-07-15T00:00:00Z'))).toBe(480);
  });

  it('a sale at 11:30 pm UTC is already the next day in Manila', () => {
    const t = Date.parse('2026-10-29T23:30:00Z');
    expect(localDay(t, 'Asia/Manila')).toBe('2026-10-30');
    expect(localDay(t, 'UTC')).toBe('2026-10-29');
  });

  it('a Manila day starts at 4 pm UTC the day before', () => {
    expect(new Date(dayStartMs('2026-10-30', 'Asia/Manila')).toISOString()).toBe(
      '2026-10-29T16:00:00.000Z',
    );
  });

  it('handles daylight saving zones', () => {
    // New York: midnight on 2026-03-08 is still EST (UTC-5).
    expect(new Date(dayStartMs('2026-03-08', 'America/New_York')).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    // The day after the switch starts at UTC-4.
    expect(new Date(dayStartMs('2026-03-09', 'America/New_York')).toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('walks days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-02-27', '2026-03-01')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
    expect(isValidTimeZone('Asia/Manila')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
