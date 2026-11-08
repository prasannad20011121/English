import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import { PracticeService } from '../../../core/api/practice.service';
import type { StartSessionRequest, VoiceCatalog, VoiceTask } from '../../../core/models/voice';
import { micChecked } from '../../../core/voice/mic-check.store';
import { UiIcon } from '../../../ui/icon/icon';
import { ToastService } from '../../../ui/toast/toast.service';
import { TASK_INFO, TASK_ORDER } from '../voice-tasks';

type Entry = VoiceCatalog['tasks'][number];

@Component({
  selector: 'app-voice-home',
  imports: [RouterLink, UiIcon],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class VoiceHomePage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly taskInfo = TASK_INFO;
  protected readonly micChecked = micChecked();
  protected readonly counts = [5, 10] as const;
  protected readonly difficulties = [
    [0, 'Any'],
    [1, 'Easy'],
    [2, 'Medium'],
    [3, 'Hard'],
  ] as const;

  protected readonly count = signal<5 | 10>(5);
  protected readonly difficulty = signal<0 | 1 | 2 | 3>(0);
  protected readonly starting = signal<VoiceTask | 'review' | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly catalog = toSignal(
    this.practice.catalog().pipe(
      catchError((err: unknown) => {
        this.loadError.set(apiErrorMessage(err));
        return of(null);
      }),
    ),
    { initialValue: null },
  );

  private readonly byTask = computed(() => {
    const map = new Map<VoiceTask, Entry>();
    for (const t of this.catalog()?.tasks ?? []) map.set(t.task, t);
    return map;
  });
  protected readonly groups = computed(() =>
    (['speaking', 'listening'] as const).map((group) => ({
      group,
      title: group === 'speaking' ? 'Speaking' : 'Listening',
      lead:
        group === 'speaking'
          ? 'Read, retell and talk. Scored on pronunciation, fluency and vocabulary.'
          : 'Hear a question once, then answer out loud. Scored on listening and grammar.',
      tasks: TASK_ORDER.filter((t) => TASK_INFO[t].group === group).map((task) => ({
        task,
        info: TASK_INFO[task],
        entry: this.byTask().get(task) ?? null,
      })),
    })),
  );

  protected start(task: VoiceTask): void {
    const difficulty = this.difficulty();
    this.begin(task, {
      task,
      count: this.count(),
      ...(difficulty ? { difficulty } : {}),
    });
  }

  protected review(): void {
    this.begin('review', { mode: 'review' });
  }

  private begin(key: VoiceTask | 'review', request: StartSessionRequest): void {
    if (this.starting()) return;
    this.starting.set(key);
    this.practice.start(request).subscribe({
      next: (view) => void this.router.navigate(['/practice/session', view.session.id]),
      error: (err: unknown) => {
        this.starting.set(null);
        this.toast.show(apiErrorMessage(err), 'error');
      },
    });
  }
}
