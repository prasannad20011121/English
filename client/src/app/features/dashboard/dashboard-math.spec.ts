import { daysUntil, greeting, prepProgress } from './dashboard-math';

describe('dashboard math', () => {
  const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);

  it('counts calendar days to the exam', () => {
    expect(daysUntil(d(2026, 11, 29), d(2026, 11, 8, 23))).toBe(21);
    expect(daysUntil(d(2026, 11, 8, 1), d(2026, 11, 8, 23))).toBe(0);
    expect(daysUntil(d(2026, 11, 1), d(2026, 11, 8))).toBe(-7);
  });

  it('measures progress through the prep window', () => {
    const start = d(2026, 11, 1);
    const exam = d(2026, 11, 21);
    expect(prepProgress(start, exam, d(2026, 11, 1))).toBe(0);
    expect(prepProgress(start, exam, d(2026, 11, 11))).toBe(0.5);
    expect(prepProgress(start, exam, d(2026, 12, 1))).toBe(1);
    expect(prepProgress(exam, start, d(2026, 11, 5))).toBe(1);
  });

  it('greets by time of day', () => {
    expect(greeting(d(2026, 1, 1, 9))).toBe('Good morning');
    expect(greeting(d(2026, 1, 1, 14))).toBe('Good afternoon');
    expect(greeting(d(2026, 1, 1, 20))).toBe('Good evening');
    expect(greeting(d(2026, 1, 1, 2))).toBe('Up late');
  });
});
