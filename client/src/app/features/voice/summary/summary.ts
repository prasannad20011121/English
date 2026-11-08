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
import { apiErrorMessage } from '../../../core/api/api-error';
import { PracticeService, type VoiceConfig } from '../../../core/api/practice.service';
import type { SessionSummary, Skill } from '../../../core/models/voice';
import { UiIcon } from '../../../ui/icon/icon';
import { ToastService } from '../../../ui/toast/toast.service';
import { AnswerReview, scoreTone, scoreWord } from '../answer-review/answer-review';
import { PART_LETTERS, SKILL_LABELS, SKILL_ORDER, TASK_INFO } from '../voice-tasks';

type Item = SessionSummary['items'][number];

const RING_RADIUS = 56;

/** A short line that identifies a question in the list of answers. */
export function itemLabel(item: Item): string {
  const r = item.reveal;
  return (
    item.prompt.display ??
    item.prompt.title ??
    r.question ??
    r.reference ??
    r.sentence ??
    r.original ??
    TASK_INFO[item.task].title
  );
}

@Component({
  selector: 'app-voice-summary',
  imports: [RouterLink, UiIcon, AnswerReview],
  templateUrl: './summary.html',
  styleUrl: './summary.scss',
})
export class VoiceSummaryPage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly taskInfo = TASK_INFO;
  protected readonly skillLabels = SKILL_LABELS;
  protected readonly letters = PART_LETTERS;
  protected readonly scoreTone = scoreTone;
  protected readonly scoreWord = scoreWord;
  protected readonly itemLabel = itemLabel;
  protected readonly ringRadius = RING_RADIUS;
  protected readonly ringCircumference = 2 * Math.PI * RING_RADIUS;

  protected readonly summary = signal<SessionSummary | null>(null);
  protected readonly config = signal<VoiceConfig | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly playing = signal<string | null>(null);

  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;

  protected readonly isTest = computed(() => this.summary()?.mode === 'test');
  protected readonly ringOffset = computed(
    () => this.ringCircumference * (1 - Math.max(0.02, (this.summary()?.overall ?? 0) / 100)),
  );
  protected readonly skills = computed(() => {
    const s = this.summary();
    return s
      ? SKILL_ORDER.filter((k) => s.skills[k] !== undefined).map((k) => ({
          skill: k as Skill,
          score: s.skills[k]!,
        }))
      : [];
  });
  protected readonly mistakes = computed(
    () => this.summary()?.items.filter((i) => i.answered && !i.correct).length ?? 0,
  );
  protected readonly heading = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (s.mode === 'test') return 'Voice test report';
    if (s.mode === 'review') return 'Review round';
    return s.task ? TASK_INFO[s.task].title : 'Practice round';
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    this.practice.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private load(id: string): void {
    this.summary.set(null);
    this.error.set(null);
    this.practice.finish(id).subscribe({
      next: (s) => this.summary.set(s),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }

  protected play(item: Item): void {
    if (!item.audioId) return;
    if (this.playing() === item.questionId) {
      this.stop();
      return;
    }
    this.stop();
    this.playing.set(item.questionId);
    this.practice.recording(item.audioId).subscribe({
      next: (blob) => {
        if (this.playing() !== item.questionId) return;
        this.audioUrl = URL.createObjectURL(blob);
        this.audio = new Audio(this.audioUrl);
        this.audio.onended = () => this.stop();
        void this.audio.play().catch(() => this.stop());
      },
      error: () => {
        this.stop();
        this.toast.show('That recording is no longer available.', 'error');
      },
    });
  }

  protected again(): void {
    const s = this.summary();
    if (!s) return;
    if (s.mode === 'test') {
      void this.router.navigate(['/voice-test']);
      return;
    }
    this.start(
      s.mode === 'review' || !s.task
        ? { mode: 'review' }
        : { task: s.task, count: s.total >= 10 ? 10 : 5 },
    );
  }

  protected review(): void {
    this.start({ mode: 'review' });
  }

  private start(request: Parameters<PracticeService['start']>[0]): void {
    this.starting.set(true);
    this.practice.start(request).subscribe({
      next: (view) => void this.router.navigate(['/practice/session', view.session.id]),
      error: (err: unknown) => {
        this.starting.set(false);
        this.toast.show(apiErrorMessage(err), 'error');
      },
    });
  }

  private stop(): void {
    this.audio?.pause();
    this.audio = null;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = null;
    this.playing.set(null);
  }
}
