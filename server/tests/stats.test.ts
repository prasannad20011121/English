import { describe, expect, it } from 'vitest';
import {
  computeStreak,
  dayKey,
  safeTimeZone,
  weekActivity,
} from '../src/modules/practice/stats.js';

describe('practice stats helpers', () => {
  it('counts a streak ending today or yesterday', () => {
    const days = new Set(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(computeStreak(days, '2026-11-07')).toBe(3);
    // Not practised yet today: yesterday's streak is still alive.
    expect(computeStreak(days, '2026-11-08')).toBe(3);
    // Missed a whole day: streak is broken.
    expect(computeStreak(days, '2026-11-09')).toBe(0);
    expect(computeStreak(new Set(), '2026-11-09')).toBe(0);
  });

  it('crosses month boundaries', () => {
    expect(computeStreak(new Set(['2026-10-31', '2026-11-01']), '2026-11-01')).toBe(2);
  });

  it('marks practice days in the current Monday–Sunday week', () => {
    // 2026-11-08 is a Sunday.
    const days = new Set(['2026-11-02', '2026-11-04', '2026-11-08', '2026-11-01']);
    expect(weekActivity(days, '2026-11-08')).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it('uses the student time zone for the day boundary', () => {
    const lateEveningUtc = new Date('2026-11-08T20:00:00Z');
    expect(dayKey(lateEveningUtc, 'UTC')).toBe('2026-11-08');
    expect(dayKey(lateEveningUtc, 'Asia/Kolkata')).toBe('2026-11-09');
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });
});
