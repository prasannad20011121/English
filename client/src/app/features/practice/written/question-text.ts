/** The text before and after the `___` blank. */
export function splitBlank(prompt: string): { before: string; after: string } {
  const at = prompt.indexOf('___');
  if (at < 0) return { before: prompt, after: '' };
  return { before: prompt.slice(0, at), after: prompt.slice(at + 3) };
}

/** The sentence around the **target** word of a synonym/antonym question. */
export function splitTarget(prompt: string): { before: string; word: string; after: string } {
  const match = prompt.match(/^(.*?)\*\*(.+?)\*\*(.*)$/s);
  if (!match) return { before: prompt, word: '', after: '' };
  return { before: match[1]!, word: match[2]!, after: match[3]! };
}

/** Options like "(no article)" mean "leave the blank empty". */
export function isEmptyOption(option: string): boolean {
  return /^\(.*\)$/.test(option.trim());
}

/** What to show in the blank for an option. */
export function blankText(option: string): string {
  return isEmptyOption(option) ? '—' : option;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
