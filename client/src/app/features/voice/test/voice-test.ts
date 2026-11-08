import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import { PracticeService } from '../../../core/api/practice.service';
import { micChecked } from '../../../core/voice/mic-check.store';
import { UiIcon } from '../../../ui/icon/icon';
import { ToastService } from '../../../ui/toast/toast.service';
import { scoreTone } from '../answer-review/answer-review';
import { PART_LETTERS, TASK_INFO, TEST_PARTS } from '../voice-tasks';

/** The mock voice test: what to expect, a start button and past results. */
@Component({
  selector: 'app-voice-test',
  imports: [RouterLink, DatePipe, UiIcon],
  templateUrl: './voice-test.html',
  styleUrl: './voice-test.scss',
})
export class VoiceTestPage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly parts = TEST_PARTS;
  protected readonly letters = PART_LETTERS;
  protected readonly taskInfo = TASK_INFO;
  protected readonly scoreTone = scoreTone;
  protected readonly micChecked = micChecked();
  protected readonly totalQuestions = TEST_PARTS.reduce((n, p) => n + p.count, 0);
  protected readonly starting = signal(false);

  protected readonly history = toSignal(
    this.practice.tests().pipe(
      map((res) => res.items),
      catchError(() => of(null)),
    ),
  );
  protected readonly unfinished = computed(() =>
    (this.history() ?? []).find((t) => t.status === 'active'),
  );
  protected readonly finished = computed(() =>
    (this.history() ?? []).filter((t) => t.status === 'finished'),
  );

  protected start(): void {
    this.starting.set(true);
    this.practice.start({ mode: 'test' }).subscribe({
      next: (view) => void this.router.navigate(['/practice/session', view.session.id]),
      error: (err: unknown) => {
        this.starting.set(false);
        this.toast.show(apiErrorMessage(err), 'error');
      },
    });
  }
}
