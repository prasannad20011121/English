import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { PracticeService } from '../../../core/api/practice.service';
import { setMicChecked } from '../../../core/voice/mic-check.store';
import {
  MIC_MESSAGES,
  MicError,
  RecorderService,
  type RecordingHandle,
} from '../../../core/voice/recorder.service';
import { SpeechRecognizerService } from '../../../core/voice/speech-recognizer.service';
import { TtsService } from '../../../core/voice/tts.service';
import { UiIcon } from '../../../ui/icon/icon';
import { UiLevelMeter } from '../../../ui/level-meter/level-meter';

const ACCENTS = { 'en-IN': 'Indian', 'en-US': 'American', 'en-GB': 'British' } as const;
const SAMPLE =
  'Hello! This is how the questions will sound. Listen carefully, and answer after the beep.';

/** Microphone and speaker check before practising. */
@Component({
  selector: 'app-mic-check',
  imports: [RouterLink, UiIcon, UiLevelMeter],
  templateUrl: './mic-check.html',
  styleUrl: './mic-check.scss',
})
export class MicCheckPage {
  protected readonly recorder = inject(RecorderService);
  protected readonly tts = inject(TtsService);
  private readonly recognizer = inject(SpeechRecognizerService);
  private readonly router = inject(Router);
  private readonly practice = inject(PracticeService);

  /** Where to go afterwards (`?returnUrl=`). */
  readonly returnUrl = input<string>();

  protected readonly error = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly testing = signal(false);
  protected readonly testUrl = signal<string | null>(null);
  protected readonly heard = signal(false);
  protected readonly accentName = computed(() => ACCENTS[this.tts.accent()]);

  protected readonly config = toSignal(this.practice.config().pipe(catchError(() => of(null))), {
    initialValue: null,
  });
  protected readonly sttProblem = computed(
    () => this.config()?.stt === 'browser' && !this.recognizer.supported(),
  );

  private handle: RecordingHandle | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.handle?.cancel();
      this.tts.cancel();
      this.recorder.close();
      this.revoke();
    });
  }

  protected async allow(): Promise<void> {
    this.error.set(null);
    this.opening.set(true);
    try {
      await this.recorder.open();
    } catch (err) {
      this.error.set(
        err instanceof MicError ? MIC_MESSAGES[err.problem] : MIC_MESSAGES.unsupported,
      );
    } finally {
      this.opening.set(false);
    }
  }

  protected async testRecording(): Promise<void> {
    if (this.testing()) return;
    this.revoke();
    this.testing.set(true);
    await this.tts.tone('start');
    this.handle = this.recorder.record({ maxMs: 5000 });
    try {
      const rec = await this.handle.done;
      this.heard.set(rec.heardVoice);
      this.testUrl.set(URL.createObjectURL(rec.blob));
    } catch {
      /* cancelled */
    } finally {
      this.handle = null;
      this.testing.set(false);
    }
  }

  protected sample(): void {
    void this.tts.say(SAMPLE);
  }

  protected finish(): void {
    setMicChecked();
    const target = this.returnUrl();
    void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/practice');
  }

  private revoke(): void {
    const url = this.testUrl();
    if (url) URL.revokeObjectURL(url);
    this.testUrl.set(null);
  }
}
