import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import { PracticeService, type VoiceConfig } from '../../../core/api/practice.service';
import type { ReportReason } from '../../../core/models/practice';
import type { AnswerResult, SessionView, VoicePrompt } from '../../../core/models/voice';
import { micChecked } from '../../../core/voice/mic-check.store';
import {
  MIC_MESSAGES,
  MicError,
  RecorderService,
  type Recording,
  type RecordingHandle,
} from '../../../core/voice/recorder.service';
import {
  SpeechRecognizerService,
  type ListenHandle,
} from '../../../core/voice/speech-recognizer.service';
import { TtsService } from '../../../core/voice/tts.service';
import { UiIcon } from '../../../ui/icon/icon';
import { UiLevelMeter } from '../../../ui/level-meter/level-meter';
import { ToastService } from '../../../ui/toast/toast.service';
import { AnswerReview, modelAnswer, scoreTone, scoreWord } from '../answer-review/answer-review';
import { PART_LETTERS, TASK_INFO } from '../voice-tasks';

/**
 * intro → playing (question audio) → prep (countdown) → recording → checking → feedback → next.
 * A mock test skips feedback and uploads in the background so the next question is not held up.
 */
export type Phase =
  | 'loading'
  | 'intro'
  | 'playing'
  | 'prep'
  | 'recording'
  | 'silent'
  | 'checking'
  | 'feedback'
  | 'saving'
  | 'error';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isAbort = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError';

@Component({
  selector: 'app-voice-player',
  imports: [RouterLink, UiIcon, UiLevelMeter, AnswerReview],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class VoicePlayerPage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly tts = inject(TtsService);
  protected readonly recorder = inject(RecorderService);
  private readonly recognizer = inject(SpeechRecognizerService);

  /** Session id from the route. */
  readonly id = input.required<string>();

  protected readonly taskInfo = TASK_INFO;
  protected readonly letters = PART_LETTERS;
  protected readonly scoreTone = scoreTone;
  protected readonly scoreWord = scoreWord;

  protected readonly view = signal<SessionView | null>(null);
  protected readonly config = signal<VoiceConfig | null>(null);
  protected readonly phase = signal<Phase>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly index = signal(0);
  protected readonly results = signal<Record<string, AnswerResult>>({});
  protected readonly done = signal<ReadonlySet<string>>(new Set());
  protected readonly countdown = signal(0);
  protected readonly replaysLeft = signal(0);
  protected readonly announcement = signal('');
  protected readonly failedUploads = signal(0);
  /** True while the microphone is being opened after Start. */
  protected readonly opening = signal(false);
  /** Why the answer is waiting in the "silent" phase. */
  protected readonly holdReason = signal<'silence' | 'failed'>('silence');
  protected readonly micWasChecked = micChecked();

  protected readonly reportReasons: [ReportReason, string][] = [
    ['unclear', 'Audio unclear'],
    ['wrong_answer', 'Wrong answer'],
    ['typo', 'Typo'],
    ['other', 'Something else'],
  ];
  protected readonly reportOpen = signal(false);
  protected readonly reportReason = signal<ReportReason>('unclear');
  protected readonly reported = signal<ReadonlySet<string>>(new Set());

  /** Bumped to abandon whatever the current question is doing (leaving, replaying). */
  private run = 0;
  private handle: RecordingHandle | null = null;
  private listener: ListenHandle | null = null;
  private skipPrep: (() => void) | null = null;
  /** A recording held back because it was silent or failed to upload. */
  private held: { recording: Recording; transcript?: string } | null = null;
  private startedAt = 0;
  private uploads: Promise<void>[] = [];
  private recordings = new Map<string, Blob>();
  private playback: HTMLAudioElement | null = null;
  private playbackUrl: string | null = null;

  protected readonly isTest = computed(() => this.view()?.session.mode === 'test');
  protected readonly total = computed(() => this.view()?.prompts.length ?? 0);
  protected readonly prompt = computed<VoicePrompt | null>(
    () => this.view()?.prompts[this.index()] ?? null,
  );
  protected readonly info = computed(() => {
    const p = this.prompt();
    return p ? TASK_INFO[p.task] : null;
  });
  protected readonly result = computed(() => {
    const p = this.prompt();
    return p ? (this.results()[p.id] ?? null) : null;
  });
  protected readonly section = computed(() => {
    const p = this.prompt();
    const v = this.view();
    return p?.section !== undefined && v?.sections ? v.sections[p.section] : null;
  });
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly progress = computed(() => {
    const total = this.total();
    return total ? (this.done().size / total) * 100 : 0;
  });
  protected readonly secondsLeft = computed(() => {
    const p = this.prompt();
    return p
      ? Math.max(0, Math.ceil((p.answerSeconds * 1000 - this.recorder.elapsedMs()) / 1000))
      : 0;
  });
  protected readonly timePercent = computed(() => {
    const p = this.prompt();
    return p ? Math.min(100, (this.recorder.elapsedMs() / (p.answerSeconds * 1000)) * 100) : 0;
  });
  protected readonly title = computed(() => {
    const v = this.view();
    if (!v) return 'Practice';
    if (v.session.mode === 'test') return 'Voice test';
    if (v.session.mode === 'review') return 'Review my mistakes';
    return this.info()?.title ?? 'Practice';
  });
  /** Problems that stop this browser from taking the test. */
  protected readonly blocker = computed(() => {
    if (!RecorderService.supported()) return MIC_MESSAGES.unsupported;
    if (this.config()?.stt === 'browser' && !this.recognizer.supported()) {
      return 'This browser cannot turn speech into text. Please use Chrome or Edge, or ask your admin to set up Whisper speech-to-text.';
    }
    return null;
  });
  protected readonly modelText = computed(() => {
    const r = this.result();
    return r ? modelAnswer(r.reveal) : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  private load(id: string): void {
    this.teardown();
    this.phase.set('loading');
    forkJoin({ view: this.practice.session(id), config: this.practice.config() }).subscribe({
      next: ({ view, config }) => {
        if (view.session.status === 'finished') {
          void this.router.navigate(['/practice/session', id, 'summary'], { replaceUrl: true });
          return;
        }
        const answered = new Set(view.answeredIds);
        const results: Record<string, AnswerResult> = {};
        for (const a of view.answers) results[a.questionId] = a;
        const firstOpen = view.prompts.findIndex((p) => !answered.has(p.id));
        this.config.set(config);
        this.results.set(results);
        this.done.set(answered);
        this.view.set(view);
        if (firstOpen < 0) {
          void this.finish();
          return;
        }
        this.index.set(firstOpen);
        this.phase.set('intro');
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.phase.set('error');
      },
    });
  }

  /** Start button (a user gesture, which browsers need before playing audio). */
  protected async begin(): Promise<void> {
    // Ignore double clicks: two runs at once would record over each other.
    if (this.blocker() || this.opening() || this.phase() !== 'intro') return;
    this.opening.set(true);
    try {
      await this.recorder.open();
    } catch (err) {
      this.error.set(
        err instanceof MicError ? MIC_MESSAGES[err.problem] : MIC_MESSAGES.unsupported,
      );
      this.phase.set('error');
      return;
    } finally {
      this.opening.set(false);
    }
    void this.runQuestion();
  }

  protected retryAfterError(): void {
    this.error.set(null);
    if (this.view()) this.phase.set('intro');
    else this.load(this.id());
  }

  private async runQuestion(): Promise<void> {
    const p = this.prompt();
    if (!p) return;
    const run = ++this.run;
    this.reportOpen.set(false);
    this.startedAt = performance.now();
    this.replaysLeft.set(p.replayable ? 1 : 0);

    await this.playPrompt(p, run);
    if (run !== this.run) return;

    if (p.prepSeconds > 0) {
      await this.prep(p.prepSeconds, run);
      if (run !== this.run) return;
    }
    await this.record(p, run);
  }

  private async playPrompt(p: VoicePrompt, run: number): Promise<void> {
    if (!p.speak.length) return;
    this.phase.set('playing');
    this.announce('Listen.');
    await wait(400);
    if (run !== this.run) return;
    await this.tts.play(p.speak);
  }

  private prep(seconds: number, run: number): Promise<void> {
    this.phase.set('prep');
    this.countdown.set(seconds);
    this.announce(`Get ready. ${seconds} seconds to prepare.`);
    return new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (run !== this.run) return finish();
        this.countdown.update((n) => n - 1);
        if (this.countdown() <= 0) finish();
      }, 1000);
      const finish = () => {
        clearInterval(timer);
        this.skipPrep = null;
        resolve();
      };
      this.skipPrep = finish;
    });
  }

  protected startNow(): void {
    this.skipPrep?.();
  }

  private async record(p: VoicePrompt, run: number): Promise<void> {
    await this.tts.tone('start');
    if (run !== this.run) return;
    this.phase.set('recording');
    this.announce('Recording. Speak now.');
    // On small screens make sure the Done button is visible, not under the tab bar.
    setTimeout(() =>
      document
        .querySelector('.stage .actions')
        ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }),
    );
    const handle = this.recorder.record({ maxMs: p.answerSeconds * 1000, autoStop: p.autoStop });
    const listener =
      this.config()?.stt === 'browser' ? this.recognizer.listen(this.tts.accent()) : null;
    this.handle = handle;
    this.listener = listener;

    let recording: Recording;
    try {
      recording = await handle.done;
    } catch (err) {
      listener?.cancel();
      if (!isAbort(err) && run === this.run) {
        this.toast.show('Recording failed. Please try again.', 'error');
        this.hold({ recording: null }, 'failed');
      }
      return;
    } finally {
      if (this.handle === handle) this.handle = null;
    }
    const transcript = (await listener?.stop()) || undefined;
    if (this.listener === listener) this.listener = null;
    if (run !== this.run) return;

    if (!this.isTest() && !recording.heardVoice && !transcript) {
      this.hold({ recording, transcript }, 'silence');
      this.announce("We didn't hear anything.");
      return;
    }
    await this.submit(p, recording, transcript, run);
  }

  private hold(
    held: { recording: Recording | null; transcript?: string },
    reason: 'silence' | 'failed',
  ): void {
    this.held = held.recording ? { recording: held.recording, transcript: held.transcript } : null;
    this.holdReason.set(reason);
    this.phase.set('silent');
  }

  /** Done button: stop recording now. */
  protected stopNow(): void {
    this.handle?.stop();
  }

  /** Practice only: hear the question once more, then answer again. */
  protected async replay(): Promise<void> {
    const p = this.prompt();
    if (!p || this.replaysLeft() < 1 || this.isTest()) return;
    this.replaysLeft.update((n) => n - 1);
    const run = ++this.run;
    this.handle?.cancel();
    this.listener?.cancel();
    this.listener = null;
    await this.playPrompt(p, run);
    if (run !== this.run) return;
    await this.record(p, run);
  }

  /** Record the answer again. */
  protected tryAgain(): void {
    const p = this.prompt();
    if (!p) return;
    this.held = null;
    void this.record(p, ++this.run);
  }

  /** Send the held recording as it is. */
  protected sendHeld(): void {
    const p = this.prompt();
    const held = this.held;
    if (!p || !held) return;
    this.held = null;
    void this.submit(p, held.recording, held.transcript, this.run);
  }

  protected readonly canSendHeld = () => this.held !== null;

  private async submit(
    p: VoicePrompt,
    recording: Recording,
    transcript: string | undefined,
    run: number,
  ): Promise<void> {
    const v = this.view()!;
    this.recordings.set(p.id, recording.blob);
    const answer = {
      audio: recording.blob,
      durationMs: recording.durationMs,
      timeMs: performance.now() - this.startedAt,
      clientTranscript: transcript,
      clientMetrics: recording.metrics,
    };

    if (this.isTest()) {
      this.markDone(p.id);
      this.uploads.push(this.uploadInBackground(v.session.id, p.id, answer));
      this.announce('Answer saved.');
      this.phase.set('checking');
      await wait(900);
      if (run === this.run) this.next();
      return;
    }

    this.phase.set('checking');
    this.announce('Checking your answer.');
    try {
      const res = await firstValueFrom(this.practice.answer(v.session.id, p.id, answer));
      if (run !== this.run) return;
      this.markDone(p.id);
      if (res.result) {
        const result = res.result;
        this.results.update((r) => ({ ...r, [p.id]: result }));
        this.announce(`Score ${result.score} out of 100. ${scoreWord(result.score)}.`);
      }
      this.phase.set('feedback');
      setTimeout(() =>
        document
          .querySelector('.feedback')
          ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
      );
    } catch (err) {
      if (run !== this.run) return;
      this.toast.show(apiErrorMessage(err), 'error');
      this.hold({ recording, transcript }, 'failed');
    }
  }

  private async uploadInBackground(
    sessionId: string,
    questionId: string,
    answer: Parameters<PracticeService['answer']>[2],
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await firstValueFrom(this.practice.answer(sessionId, questionId, answer));
        return;
      } catch {
        await wait(1500 * (attempt + 1));
      }
    }
    this.failedUploads.update((n) => n + 1);
  }

  private markDone(id: string): void {
    this.done.update((set) => new Set([...set, id]));
  }

  /** Next question (or results after the last one). */
  protected next(): void {
    this.stopPlayback();
    this.tts.cancel();
    if (this.isLast()) {
      void this.finish();
      return;
    }
    const before = this.prompt()?.section;
    this.index.update((i) => i + 1);
    // Each part of the mock test starts with its instructions.
    if (this.isTest() && this.prompt()?.section !== before) {
      this.run++;
      this.phase.set('intro');
      return;
    }
    void this.runQuestion();
  }

  /** Practice only: move on without answering. */
  protected skip(): void {
    this.run++;
    this.handle?.cancel();
    this.listener?.cancel();
    this.listener = null;
    this.tts.cancel();
    this.next();
  }

  protected async finish(): Promise<void> {
    this.run++;
    this.phase.set('saving');
    this.announce('Saving your answers.');
    await Promise.all(this.uploads);
    const id = this.view()?.session.id ?? this.id();
    this.practice.finish(id).subscribe({
      next: () => {
        if (this.failedUploads()) {
          this.toast.show(
            `${this.failedUploads()} answer(s) could not be saved and count as unanswered.`,
            'error',
            8000,
          );
        }
        void this.router.navigate(['/practice/session', id, 'summary']);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.phase.set('error');
      },
    });
  }

  protected hearMyself(): void {
    const p = this.prompt();
    const blob = p ? this.recordings.get(p.id) : undefined;
    if (!blob) return;
    this.tts.cancel();
    this.stopPlayback();
    this.playbackUrl = URL.createObjectURL(blob);
    this.playback = new Audio(this.playbackUrl);
    void this.playback
      .play()
      .catch(() => this.toast.show('Could not play the recording.', 'error'));
  }

  protected hearModel(): void {
    const text = this.modelText();
    if (!text) return;
    this.stopPlayback();
    void this.tts.say(text);
  }

  protected hearQuestion(): void {
    const p = this.prompt();
    if (!p?.speak.length) return;
    this.stopPlayback();
    void this.tts.play(p.speak);
  }

  protected report(): void {
    const p = this.prompt();
    if (!p) return;
    this.practice.report(p.id, this.reportReason()).subscribe({
      next: (res) => {
        this.reported.update((set) => new Set([...set, p.id]));
        this.reportOpen.set(false);
        this.toast.show(res.message, 'success');
      },
      error: (err: unknown) => this.toast.show(apiErrorMessage(err), 'error'),
    });
  }

  private stopPlayback(): void {
    this.playback?.pause();
    this.playback = null;
    if (this.playbackUrl) URL.revokeObjectURL(this.playbackUrl);
    this.playbackUrl = null;
  }

  private announce(text: string): void {
    this.announcement.set(text);
  }

  private teardown(): void {
    this.run++;
    this.skipPrep?.();
    this.handle?.cancel();
    this.handle = null;
    this.listener?.cancel();
    this.listener = null;
    this.tts.cancel();
    this.stopPlayback();
    this.recorder.close();
  }
}
