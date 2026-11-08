import { Injectable } from '@angular/core';

/** The parts of the Web Speech API recogniser that we use (it has no TypeScript types). */
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export interface ListenHandle {
  /** Stops listening and resolves with everything heard. */
  stop(): Promise<string>;
  cancel(): void;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The browser's own speech recognition (Chrome, Edge, Safari). Used only when the server has no
 * Whisper speech-to-text: the transcript is sent with the recording.
 */
@Injectable({ providedIn: 'root' })
export class SpeechRecognizerService {
  supported(): boolean {
    return recognitionCtor() !== null;
  }

  listen(lang: string): ListenHandle {
    const Ctor = recognitionCtor();
    if (!Ctor) return { stop: () => Promise.resolve(''), cancel: () => undefined };

    const finals: string[] = [];
    let interim = '';
    let active = true;
    let ended: (() => void) | null = null;
    let current: Recognition | null = null;

    const begin = () => {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]!;
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) finals.push(text);
          else interim = `${interim} ${text}`.trim();
        }
      };
      r.onerror = (e) => {
        // "no-speech" and "aborted" are normal; anything else ends this listener.
        if (e.error !== 'no-speech' && e.error !== 'aborted') active = false;
      };
      r.onend = () => {
        // Chrome stops by itself after a silence; keep listening until we are told to stop.
        if (active) {
          try {
            begin();
            return;
          } catch {
            active = false;
          }
        }
        ended?.();
      };
      current = r;
      r.start();
    };

    try {
      begin();
    } catch {
      active = false;
    }

    const text = () => [...finals, interim].join(' ').replace(/\s+/g, ' ').trim();
    return {
      stop: () =>
        new Promise<string>((resolve) => {
          const wasActive = active;
          active = false;
          if (!wasActive || !current) {
            resolve(text());
            return;
          }
          // The last words arrive just before `end`; wait for it, but not for ever.
          const guard = setTimeout(() => resolve(text()), 1500);
          ended = () => {
            clearTimeout(guard);
            resolve(text());
          };
          current.stop();
        }),
      cancel: () => {
        active = false;
        current?.abort();
      },
    };
  }
}
