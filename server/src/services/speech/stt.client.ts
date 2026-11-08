import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';

export interface Transcription {
  text: string;
  /** Word timings in seconds (when the service provides them). */
  words?: { word: string; start: number; end: number }[];
  /** Segment confidence, used for the clarity score. */
  segments?: { avgLogprob?: number }[];
  durationSec?: number;
}

export interface SttClient {
  readonly model: string;
  transcribe(audio: Buffer, mimeType: string, filename: string): Promise<Transcription>;
}

interface VerboseJson {
  text?: string;
  duration?: number;
  words?: { word?: string; start?: number; end?: number }[];
  segments?: { avg_logprob?: number }[];
}

/** Whisper through any OpenAI-compatible `/audio/transcriptions` endpoint (Groq, OpenAI, faster-whisper). */
export class OpenAiCompatibleStt implements SttClient {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async transcribe(audio: Buffer, mimeType: string, filename: string): Promise<Transcription> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
    form.append('model', this.model);
    form.append('language', 'en');
    form.append('temperature', '0');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new AppError(
        502,
        'STT_UNREACHABLE',
        timedOut
          ? 'Speech recognition took too long. Please try again.'
          : 'Could not reach the speech recognition service.',
      );
    }
    if (res.status === 429) {
      throw new AppError(
        429,
        'STT_RATE_LIMITED',
        'The free speech-recognition quota is used up for now. Wait a minute and try again.',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError(
        502,
        'STT_AUTH',
        'The speech recognition service rejected the API key (STT_API_KEY).',
      );
    }
    if (!res.ok) {
      throw new AppError(502, 'STT_ERROR', `Speech recognition failed (HTTP ${res.status}).`);
    }

    const data = (await res.json().catch(() => null)) as VerboseJson | null;
    if (!data || typeof data.text !== 'string') {
      throw new AppError(502, 'STT_BAD_REPLY', 'Speech recognition sent an unexpected reply.');
    }
    const words = (data.words ?? [])
      .filter(
        (w) =>
          typeof w.word === 'string' && typeof w.start === 'number' && typeof w.end === 'number',
      )
      .map((w) => ({ word: w.word!.trim(), start: w.start!, end: w.end! }));
    const segments = (data.segments ?? [])
      .filter((s) => typeof s.avg_logprob === 'number')
      .map((s) => ({ avgLogprob: s.avg_logprob }));
    return {
      text: data.text.trim(),
      ...(words.length ? { words } : {}),
      ...(segments.length ? { segments } : {}),
      ...(typeof data.duration === 'number' ? { durationSec: data.duration } : {}),
    };
  }
}

let client: SttClient | null | undefined;

/** The configured Whisper client, or null when STT_BASE_URL / STT_MODEL are not set. */
export function getStt(): SttClient | null {
  if (client === undefined) {
    client =
      env.STT_BASE_URL && env.STT_MODEL
        ? new OpenAiCompatibleStt(env.STT_BASE_URL, env.STT_MODEL, env.STT_API_KEY)
        : null;
  }
  return client;
}

/** Replace the client (tests). Pass undefined to go back to the environment settings. */
export function setSttClient(next: SttClient | null | undefined): void {
  client = next;
}
