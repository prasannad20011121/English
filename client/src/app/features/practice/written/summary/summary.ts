import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { PracticeService } from '../../../../core/api/practice.service';
import { CelebrateService } from '../../../../core/celebrate.service';
import type { SessionSummary } from '../../../../core/models/practice';
import { UiIcon } from '../../../../ui/icon/icon';
import { ToastService } from '../../../../ui/toast/toast.service';
import { blankText, formatDuration, splitBlank, splitTarget } from '../question-text';
import { LETTERS, TAG_LABELS, TYPE_INFO } from '../written-types';

const RING_RADIUS = 54;

/** Headline and colour for a score. */
export function verdict(accuracy: number): { title: string; tone: 'mint' | 'butter' | 'peach' } {
  if (accuracy >= 80) return { title: 'Excellent work!', tone: 'mint' };
  if (accuracy >= 50) return { title: 'Good effort!', tone: 'butter' };
  return { title: 'Keep practising!', tone: 'peach' };
}

@Component({
  selector: 'app-written-summary',
  imports: [RouterLink, NgTemplateOutlet, UiIcon],
  templateUrl: './summary.html',
  styleUrl: './summary.scss',
})
export class SummaryPage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly celebrate = inject(CelebrateService);

  readonly id = input.required<string>();

  protected readonly letters = LETTERS;
  protected readonly typeInfo = TYPE_INFO;
  protected readonly tagLabels = TAG_LABELS;
  protected readonly splitBlank = splitBlank;
  protected readonly splitTarget = splitTarget;
  protected readonly blankText = blankText;
  protected readonly ringRadius = RING_RADIUS;
  protected readonly ringCircumference = 2 * Math.PI * RING_RADIUS;

  protected readonly summary = signal<SessionSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly startingReview = signal(false);

  protected readonly verdict = computed(() => verdict(this.summary()?.accuracy ?? 0));
  protected readonly ringOffset = computed(() => {
    const s = this.summary();
    const share = s && s.answered ? s.correct / s.answered : 0;
    return this.ringCircumference * (1 - share);
  });
  protected readonly duration = computed(() => formatDuration(this.summary()?.timeMs ?? 0));
  protected readonly title = computed(() => {
    const s = this.summary();
    if (!s) return '';
    return s.mode === 'review'
      ? 'Mistake review'
      : s.type
        ? this.typeInfo[s.type].title
        : 'Practice';
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.practice.finish(id).subscribe({
        next: (summary) => {
          this.summary.set(summary);
          if (summary.answered && summary.accuracy >= 80) this.celebrate.burst();
        },
        error: (err: unknown) => this.error.set(apiErrorMessage(err)),
      });
    });
  }

  protected practiseAgain(): void {
    const s = this.summary();
    void this.router.navigate(['/practice/written'], {
      queryParams: s?.type ? { type: s.type } : {},
    });
  }

  protected reviewMistakes(): void {
    this.startingReview.set(true);
    this.practice.start({ mode: 'review', count: 10 }).subscribe({
      next: (view) => void this.router.navigate(['/practice/written/session', view.session.id]),
      error: (err: unknown) => {
        this.startingReview.set(false);
        this.toast.show(apiErrorMessage(err), 'info');
      },
    });
  }
}
