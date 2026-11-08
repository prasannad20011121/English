import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { SpeakPart } from '../models/voice';
import type { TtsAccent } from '../models/user';

export type SpeakerRole = 'narrator' | 'A' | 'B';

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
}

/** Tone kinds: `start` marks "speak now"; `blank` stands in for a missing word (softer, lower). */
export type ToneKind = 'start' | 'blank';

const QUALITY_HINTS = /natural|neural|online|google|premium|enhanced|siri/i;

const normLang = (lang: string) => lang.replace('_', '-').toLowerCase();

/** Voices for the student's accent, best first; falls back to any English voice. */
export function rankVoices(
  voices: SpeechSynthesisVoice[],
  accent: TtsAccent,
): SpeechSynthesisVoice[] {
  const want = accent.toLowerCase();
  const score = (v: SpeechSynthesisVoice) =>
    (normLang(v.lang) === want ? 100 : normLang(v.lang).startsWith('en') ? 10 : -1000) +
    (QUALITY_HINTS.test(v.name) ? 5 : 0) +
    (v.default ? 1 : 0);
  return voices
    .filter((v) => normLang(v.lang).startsWith('en'))
    .sort((a, b) => score(b) - score(a));
}

/**
 * Narrator, speaker A and speaker B. A and B get different voices when there are at least two,
 * otherwise the same voice at a different pitch, so a conversation is easy to follow.
 */
export function chooseVoices(
  voices: SpeechSynthesisVoice[],
  accent: TtsAccent,
): Record<SpeakerRole, VoiceChoice> {
  const ranked = rankVoices(voices, accent);
  const first = ranked[0] ?? null;
  const sameAccent = ranked.filter((v) => normLang(v.lang) === normLang(first?.lang ?? ''));
  const other = sameAccent.find((v) => v !== first) ?? ranked.find((v) => v !== first) ?? null;
  return {
    narrator: { voice: first, pitch: 1, rate: 0.95 },
    A: { voice: first, pitch: 1, rate: 0.97 },
    B: other ? { voice: other, pitch: 1, rate: 0.97 } : { voice: first, pitch: 1.35, rate: 1 },
  };
}

/** Splits text into sentences of at most ~180 characters (Chrome cuts long utterances short). */
export function splitForSpeech(text: string, max = 180): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      chunks.push(sentence);
      continue;
    }
    let current = '';
    for (const word of sentence.split(' ')) {
      if (current && (current + ' ' + word).length > max) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Speaks question prompts with the browser's built-in voices (`speechSynthesis`) in the student's
 * accent, and plays the tones used by the test. Only one prompt plays at a time.
 */
@Injectable({ providedIn: 'root' })
export class TtsService {
  private readonly auth = inject(AuthService);
  private run = 0;
  private audio?: AudioContext;
  private voices: SpeechSynthesisVoice[] = [];

  /** True while a prompt is playing. */
  readonly speaking = signal(false);
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.supported) return;
    const load = () => (this.voices = window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  accent(): TtsAccent {
    return this.auth.user()?.settings.ttsAccent ?? 'en-IN';
  }

  /** Name of the voice used for the narrator (for the mic-check page). */
  voiceName(): string | null {
    return chooseVoices(this.voices, this.accent()).narrator.voice?.name ?? null;
  }

  /** Plays the parts in order. Resolves when done, or early when cancelled. */
  async play(parts: SpeakPart[]): Promise<void> {
    this.cancel();
    const run = ++this.run;
    this.speaking.set(true);
    const voices = chooseVoices(this.voices, this.accent());
    try {
      for (const part of parts) {
        if (run !== this.run) return;
        if ('beep' in part) {
          await this.tone('blank');
        } else if ('pauseMs' in part) {
          await wait(part.pauseMs);
        } else {
          for (const chunk of splitForSpeech(part.text)) {
            if (run !== this.run) return;
            await this.utter(chunk, voices[part.voice ?? 'narrator']);
          }
        }
      }
    } finally {
      if (run === this.run) this.speaking.set(false);
    }
  }

  /** Speaks one piece of text with the narrator voice. */
  say(text: string): Promise<void> {
    return this.play([{ text }]);
  }

  cancel(): void {
    this.run++;
    if (this.supported) window.speechSynthesis.cancel();
    this.speaking.set(false);
  }

  /** A short tone made with the Web Audio API. */
  async tone(kind: ToneKind): Promise<void> {
    const ctx = this.context();
    if (!ctx) return wait(kind === 'start' ? 250 : 650);
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const spec =
      kind === 'start'
        ? { freq: 880, type: 'sine' as OscillatorType, ms: 220, gain: 0.25 }
        : { freq: 392, type: 'triangle' as OscillatorType, ms: 600, gain: 0.18 };
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.value = spec.freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(spec.gain, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + spec.ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + spec.ms / 1000 + 0.02);
    await wait(spec.ms + 80);
  }

  private context(): AudioContext | null {
    if (this.audio) return this.audio;
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!Ctor) return null;
    this.audio = new Ctor();
    return this.audio;
  }

  private utter(text: string, choice: VoiceChoice): Promise<void> {
    if (!this.supported) return wait(Math.min(4000, text.split(' ').length * 350));
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = choice.voice?.lang ?? this.accent();
      if (choice.voice) u.voice = choice.voice;
      u.pitch = choice.pitch;
      u.rate = choice.rate;
      // Some browsers never fire `end`; never let a prompt hang.
      const guard = setTimeout(done, 3000 + text.split(' ').length * 700);
      function done() {
        clearTimeout(guard);
        resolve();
      }
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    });
  }
}
