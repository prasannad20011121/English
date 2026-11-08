/** Timing measured in the browser while recording (used when Whisper word timings are missing). */
export interface ClientMetrics {
  /** Time from the start of recording to the first sound. */
  firstSoundMs?: number;
  /** Total time with voice activity. */
  speechMs?: number;
  /** Silences longer than 0.6 s between speech. */
  pauses?: number;
  /** Silences longer than 1.5 s between speech. */
  longPauses?: number;
}

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface FluencyResult {
  score: number;
  wpm: number | null;
  longPauses: number;
  fillers: number;
  latencyMs: number | null;
  speakingSec: number;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/** 100 inside the comfortable 110–160 wpm band, falling off on either side. */
export function rateScore(wpm: number): number {
  if (wpm >= 110 && wpm <= 160) return 100;
  if (wpm < 110) return clamp(100 - ((110 - wpm) / 70) * 70, 20);
  return clamp(100 - ((wpm - 160) / 80) * 60, 30);
}

/**
 * Fluency from speaking rate, long pauses, filler words and how quickly the speaker started.
 * Whisper word timings are used when present, otherwise the browser's own measurements.
 */
export function fluency(input: {
  wordCount: number;
  fillers: number;
  durationMs: number;
  words?: TimedWord[];
  metrics?: ClientMetrics;
}): FluencyResult {
  const { wordCount, fillers, durationMs, words, metrics } = input;
  let speakingSec: number;
  let longPauses: number;
  let latencyMs: number | null;

  if (words && words.length >= 2) {
    speakingSec = Math.max(0.5, words[words.length - 1]!.end - words[0]!.start);
    longPauses = 0;
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.start - words[i - 1]!.end > 1.5) longPauses++;
    }
    latencyMs = Math.round(words[0]!.start * 1000);
  } else {
    const fromMetrics = metrics?.speechMs && metrics.speechMs > 0 ? metrics.speechMs : null;
    speakingSec = Math.max(0.5, (fromMetrics ?? durationMs - (metrics?.firstSoundMs ?? 0)) / 1000);
    longPauses = metrics?.longPauses ?? 0;
    latencyMs = metrics?.firstSoundMs ?? null;
  }

  if (wordCount === 0) {
    return { score: 0, wpm: null, longPauses, fillers, latencyMs, speakingSec };
  }

  const wpm = Math.round((wordCount / speakingSec) * 60);
  const minutes = Math.max(speakingSec / 60, 0.25);
  const pausePenalty = Math.min(40, (longPauses / minutes) * 8);
  const fillerPenalty = Math.min(25, (fillers / minutes) * 4);
  const latencyPenalty = latencyMs !== null && latencyMs > 3000 ? 10 : 0;
  const score = Math.round(clamp(rateScore(wpm) - pausePenalty - fillerPenalty - latencyPenalty));
  return {
    score,
    wpm,
    longPauses,
    fillers,
    latencyMs,
    speakingSec: Math.round(speakingSec * 10) / 10,
  };
}

/**
 * Clarity (a pronunciation proxy) from Whisper's segment confidence: average log-probability
 * near 0 means the words were recognised confidently. Null when not available.
 */
export function clarity(segments?: { avgLogprob?: number }[]): number | null {
  const values = (segments ?? [])
    .map((s) => s.avgLogprob)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) return null;
  const confidence = values.reduce((sum, v) => sum + Math.exp(v), 0) / values.length;
  return Math.round(clamp(((confidence - 0.4) / 0.5) * 100));
}
