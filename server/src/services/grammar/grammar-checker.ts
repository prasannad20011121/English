import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/** Returns grammar problems found in a sentence (empty when it looks fine). */
export type GrammarChecker = (sentence: string) => Promise<string[]>;

interface LanguageToolMatch {
  message: string;
  rule?: { issueType?: string; category?: { id?: string } };
}

/** Uses a LanguageTool server (open source; `docker compose --profile ai up -d languagetool`). */
export function languageToolChecker(baseUrl: string): GrammarChecker {
  return async (sentence) => {
    const res = await fetch(`${baseUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: sentence, language: 'en-GB' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`LanguageTool HTTP ${res.status}`);
    const data = (await res.json()) as { matches?: LanguageToolMatch[] };
    return (data.matches ?? [])
      .filter((m) => m.rule?.issueType === 'grammar' || m.rule?.category?.id === 'GRAMMAR')
      .map((m) => m.message);
  };
}

let checker: GrammarChecker | null | undefined;

export function getGrammarChecker(): GrammarChecker | null {
  if (checker === undefined) {
    checker = env.LANGUAGETOOL_URL ? languageToolChecker(env.LANGUAGETOOL_URL) : null;
    if (checker) logger.info({ url: env.LANGUAGETOOL_URL }, 'LanguageTool checks enabled');
  }
  return checker;
}

/** Replace the checker (tests). Pass undefined to go back to the environment settings. */
export function setGrammarChecker(next: GrammarChecker | null | undefined): void {
  checker = next;
}
