const DAY_MS = 24 * 60 * 60 * 1000;

/** A valid IANA time zone, or UTC. */
export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** `YYYY-MM-DD` for `date` in time zone `tz`. */
export function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDay(day: string, deltaDays: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Consecutive practice days ending today. If the student has not practised yet today, a streak
 * that ended yesterday is still alive.
 */
export function computeStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Monday → Sunday of the current week: did the student practise that day? */
export function weekActivity(days: Set<string>, today: string): boolean[] {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = shiftDay(today, -weekday);
  return Array.from({ length: 7 }, (_, i) => days.has(shiftDay(monday, i)));
}
