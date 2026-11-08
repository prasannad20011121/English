const KEY = 'shl.micChecked';

/** Remembers (per browser) that the student has tested their microphone. */
export function micChecked(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMicChecked(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode: ask again next time */
  }
}
