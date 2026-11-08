const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `today` to `exam` (0 = today, negative = passed). */
export function daysUntil(exam: Date, today: Date): number {
  return Math.round((startOfDay(exam).getTime() - startOfDay(today).getTime()) / DAY_MS);
}

/** How far through the preparation window (sign-up → exam) today is, from 0 to 1. */
export function prepProgress(start: Date, exam: Date, today: Date): number {
  const total = startOfDay(exam).getTime() - startOfDay(start).getTime();
  if (total <= 0) return 1;
  const done = startOfDay(today).getTime() - startOfDay(start).getTime();
  return Math.min(1, Math.max(0, done / total));
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
