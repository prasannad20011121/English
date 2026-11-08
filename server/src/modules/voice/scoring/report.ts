import { SKILLS, type Skill } from '../tasks.js';

export interface Band {
  label: string;
  cefr: string;
}

/** A rough CEFR-style band for an overall score (a practice estimate, not an official level). */
export function bandFor(score: number): Band {
  if (score >= 90) return { label: 'Expert', cefr: 'C2' };
  if (score >= 75) return { label: 'Proficient', cefr: 'C1' };
  if (score >= 60) return { label: 'Competent', cefr: 'B2' };
  if (score >= 40) return { label: 'Developing', cefr: 'B1' };
  return { label: 'Beginner', cefr: 'A2' };
}

/** Average of each skill over the answers that measured it. */
export function skillAverages(
  items: { skills?: Partial<Record<Skill, number>> | null }[],
): Partial<Record<Skill, number>> {
  const out: Partial<Record<Skill, number>> = {};
  for (const skill of SKILLS) {
    const values = items
      .map((i) => i.skills?.[skill])
      .filter((v): v is number => typeof v === 'number');
    if (values.length) out[skill] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return out;
}
