import { Injectable, signal } from '@angular/core';
import type { ClientMetrics } from '../models/voice';

export interface FrameAnalysis extends ClientMetrics {
  /** Enough voice has been heard to count as an answer. */
  speechStarted: boolean;
  /** Silence since the last voiced frame (the whole length when nothing was heard). */
  trailingSilenceMs: number;
}

export interface AnalyseOptions {
  /** RMS level (0–1) that counts as voice. */
  threshold?: number;
  /** Voiced time needed before speech counts as started (ignores clicks and taps). */
  minSpeechMs?: number;
}

/**
 * Speech timing from a list of microphone levels taken every `frameMs`:
 * time to the first sound, speaking time (first to last sound), pauses (≥ 0.6 s) and long
 * pauses (≥ 1.5 s) in between.
 */
export function analyseFrames(
  levels: readonly number[],
  frameMs: number,
  { threshold = 0.02, minSpeechMs = 200 }: AnalyseOptions = {},
): FrameAnalysis {
  let first = -1;
  let last = -1;
  let voiced = 0;
  let pauses = 0;
  let longPauses = 0;
  let gap = 0;
  levels.forEach((level, i) => {
    if (level >= threshold) {
      if (first < 0) first = i;
      else if (gap) {
        const ms = gap * frameMs;
        if (ms >= 600) pauses++;
        if (ms >= 1500) longPauses++;
      }
      gap = 0;
      last = i;
      voiced++;
    } else if (first >= 0) {
      gap++;
    }
  });
  const speechStarted = voiced * frameMs >= minSpeechMs;
  if (first < 0) {
    return {
      speechStarted: false,
      trailingSilenceMs: levels.length * frameMs,
      pauses: 0,
      longPauses: 0,
    };
  }
  return {
    firstSoundMs: first * frameMs,
    speechMs: (last - first + 1) * frameMs,
    pauses,
    longPauses,
    speechStarted,
    trailingSilenceMs: (levels.length - 1 - last) * frameMs,
  };
}

export interface Recording {
  blob: Blob;
  durationMs: number;
  metrics: ClientMetrics;
  /** Whether any voice was detected at all. */
  heardVoice: boolean;
}

export interface RecordOptions {
  maxMs: number;
  /** Stop after `silenceMs` of quiet once speech has started. */
  autoStop?: boolean;
  silenceMs?: number;
}

export interface RecordingHandle {
  /** Resolves with the recording when it stops (time limit, silence or `stop()`). */
  readonly done: Promise<Recording>;
  stop(): void;
  /** Stops and throws the recording away (`done` rejects with an AbortError). */
  cancel(): void;
}

export type MicProblem = 'unsupported' | 'denied' | 'not_found' | 'busy';

export class MicError extends Error {
  constructor(readonly problem: MicProblem) {
    super(problem);
  }
}

export const MIC_MESSAGES: Record<MicProblem, string> = {
  unsupported:
    'This browser cannot record audio. Please use a recent version of Chrome, Edge or Safari.',
  denied:
    'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  not_found: 'No microphone was found. Plug in earphones with a mic, then try again.',
  busy: 'Your microphone is being used by another app. Close it, then try again.',
};

const FRAME_MS = 50;
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** Records answers from the microphone and measures the input level and speech timing. */
@Injectable({ providedIn: 'root' })
export class RecorderService {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private buffer?: Float32Array<ArrayBuffer>;
  private meter?: ReturnType<typeof setInterval>;

  /** Current input level, 0–1 (for the level meter). */
  readonly level = signal(0);
  readonly ready = signal(false);
  readonly recording = signal(false);
  /** Milliseconds recorded so far in the current answer. */
  readonly elapsedMs = signal(0);

  static supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  /** Asks for the microphone (once) and starts the level meter. */
  async open(): Promise<void> {
    if (!RecorderService.supported()) throw new MicError('unsupported');
    if (!this.stream || !this.stream.active) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        const name = (err as { name?: string }).name;
        throw new MicError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'not_found'
              : name === 'NotReadableError'
                ? 'busy'
                : 'unsupported',
        );
      }
      this.connectMeter(this.stream);
    }
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => undefined);
    this.ready.set(true);
  }

  /** Releases the microphone. */
  close(): void {
    clearInterval(this.meter);
    this.meter = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
    this.analyser = undefined;
    this.level.set(0);
    this.ready.set(false);
  }

  record(options: RecordOptions): RecordingHandle {
    const stream = this.stream;
    if (!stream) throw new MicError('unsupported');
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const levels: number[] = [];
    const startedAt = performance.now();
    const silenceMs = options.silenceMs ?? 2500;
    let cancelled = false;

    this.recording.set(true);
    this.elapsedMs.set(0);

    const done = new Promise<Recording>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        clearInterval(tick);
        this.recording.set(false);
        if (cancelled) {
          reject(new DOMException('Recording cancelled', 'AbortError'));
          return;
        }
        const analysis = analyseFrames(levels, FRAME_MS);
        resolve({
          blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }),
          durationMs: Math.round(performance.now() - startedAt),
          heardVoice: analysis.speechStarted,
          metrics: {
            ...(analysis.firstSoundMs !== undefined ? { firstSoundMs: analysis.firstSoundMs } : {}),
            ...(analysis.speechMs !== undefined ? { speechMs: analysis.speechMs } : {}),
            pauses: analysis.pauses ?? 0,
            longPauses: analysis.longPauses ?? 0,
          },
        });
      };
    });

    const stop = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const tick = setInterval(() => {
      levels.push(this.sample());
      const elapsed = performance.now() - startedAt;
      this.elapsedMs.set(Math.min(elapsed, options.maxMs));
      if (elapsed >= options.maxMs) {
        stop();
        return;
      }
      if (options.autoStop && levels.length % 5 === 0) {
        const a = analyseFrames(levels, FRAME_MS);
        if (a.speechStarted && a.trailingSilenceMs >= silenceMs) stop();
      }
    }, FRAME_MS);

    recorder.start(1000);
    return {
      done,
      stop,
      cancel: () => {
        cancelled = true;
        stop();
      },
    };
  }

  private connectMeter(stream: MediaStream): void {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    this.ctx ??= new Ctor();
    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    // A silent sink keeps the graph running in every browser.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    source.connect(this.analyser).connect(sink).connect(this.ctx.destination);
    clearInterval(this.meter);
    this.meter = setInterval(() => {
      // Smooth falls so the meter does not flicker.
      const now = Math.min(1, this.sample() * 4);
      this.level.update((prev) => (now > prev ? now : prev * 0.8 + now * 0.2));
    }, FRAME_MS);
  }

  /** RMS of the latest audio frame, 0–1. */
  private sample(): number {
    if (!this.analyser || !this.buffer) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const v of this.buffer) sum += v * v;
    return Math.sqrt(sum / this.buffer.length);
  }
}
