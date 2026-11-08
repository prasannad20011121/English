import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { PracticeService } from '../../../../core/api/practice.service';
import type {
  AnsweredQuestion,
  PublicQuestion,
  ReportReason,
  SessionView,
} from '../../../../core/models/practice';
import { UiIcon } from '../../../../ui/icon/icon';
import { ToastService } from '../../../../ui/toast/toast.service';
import { blankText, splitBlank, splitTarget } from '../question-text';
import { DIFFICULTY_LABELS, LETTERS, TAG_LABELS, TYPE_INFO } from '../written-types';

const NO_ERROR = 4;

@Component({
  selector: 'app-written-player',
  imports: [RouterLink, FormsModule, UiIcon],
  templateUrl: './player.html',
  styleUrl: './player.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class PlayerPage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Session id from the route. */
  readonly id = input.required<string>();

  protected readonly letters = LETTERS;
  protected readonly typeInfo = TYPE_INFO;
  protected readonly tagLabels = TAG_LABELS;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly noError = NO_ERROR;
  protected readonly splitBlank = splitBlank;
  protected readonly splitTarget = splitTarget;

  protected readonly view = signal<SessionView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly index = signal(0);
  protected readonly results = signal<Record<string, AnsweredQuestion>>({});
  protected readonly pending = signal<number | null>(null);
  protected readonly finishing = signal(false);
  protected readonly announcement = signal('');

  protected readonly reportOpen = signal(false);
  protected readonly reportReason = signal<ReportReason>('wrong_answer');
  protected readonly reportNote = signal('');
  protected readonly reported = signal<Record<string, true>>({});

  private shownAt = performance.now();

  protected readonly total = computed(() => this.view()?.questions.length ?? 0);
  protected readonly question = computed<PublicQuestion | null>(
    () => this.view()?.questions[this.index()] ?? null,
  );
  protected readonly result = computed(() => {
    const q = this.question();
    return q ? (this.results()[q.id] ?? null) : null;
  });
  protected readonly answeredCount = computed(() => Object.keys(this.results()).length);
  protected readonly score = computed(
    () => Object.values(this.results()).filter((r) => r.correct).length,
  );
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly progress = computed(() =>
    this.total() ? ((this.index() + (this.result() ? 1 : 0)) / this.total()) * 100 : 0,
  );
  /** Text inside the blank: the right answer once answered, the pending choice, or empty. */
  protected readonly blankFill = computed(() => {
    const q = this.question();
    const r = this.result();
    const choice = r ? r.answer : this.pending();
    return q?.options && choice !== null && choice !== undefined
      ? blankText(q.options[choice] ?? '')
      : '\u00a0';
  });

  protected readonly title = computed(() => {
    const v = this.view();
    if (v?.session.mode === 'review') return 'Review my mistakes';
    const q = this.question();
    return q ? this.typeInfo[q.type].title : 'Practice';
  });

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    this.practice.session(id).subscribe({
      next: (view) => {
        const answered: Record<string, AnsweredQuestion> = {};
        for (const a of view.answers) answered[a.questionId] = a;
        if (view.session.status === 'finished') {
          void this.router.navigate(['/practice/written/session', id, 'summary']);
          return;
        }
        const firstOpen = view.questions.findIndex((q) => !answered[q.id]);
        this.results.set(answered);
        this.index.set(firstOpen < 0 ? view.questions.length - 1 : firstOpen);
        this.view.set(view);
        this.shownAt = performance.now();
      },
      error: (err: unknown) => this.loadError.set(apiErrorMessage(err)),
    });
  }

  /** Number of choices for the current question (spot-the-error has A–D + "No error"). */
  protected readonly choiceCount = computed(() => {
    const q = this.question();
    if (!q) return 0;
    return q.type === 'spot_error' ? 5 : (q.options?.length ?? 0);
  });

  protected choose(choice: number): void {
    const q = this.question();
    const v = this.view();
    if (!q || !v || this.result() || this.pending() !== null) return;
    this.pending.set(choice);
    const timeMs = performance.now() - this.shownAt;
    this.practice.answer(v.session.id, q.id, choice, timeMs).subscribe({
      next: (res) => {
        this.results.update((r) => ({ ...r, [q.id]: { ...res, chosen: choice } }));
        this.pending.set(null);
        // On small screens the feedback can be below the fold.
        setTimeout(() =>
          document
            .querySelector('.feedback')
            ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }),
        );
        this.announcement.set(
          res.correct
            ? 'Correct!'
            : `Not quite. The right answer is ${this.answerLabel(q, res.answer)}.`,
        );
      },
      error: (err: unknown) => {
        this.pending.set(null);
        this.toast.show(apiErrorMessage(err), 'error');
      },
    });
  }

  protected next(): void {
    if (!this.result()) return;
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.index.update((i) => i + 1);
    this.reportOpen.set(false);
    this.announcement.set('');
    this.shownAt = performance.now();
    queueMicrotask(() => document.getElementById('question-card')?.focus());
  }

  protected finish(): void {
    const v = this.view();
    if (!v || this.finishing()) return;
    this.finishing.set(true);
    this.practice.finish(v.session.id).subscribe({
      next: () => void this.router.navigate(['/practice/written/session', v.session.id, 'summary']),
      error: (err: unknown) => {
        this.finishing.set(false);
        this.toast.show(apiErrorMessage(err), 'error');
      },
    });
  }

  protected sendReport(): void {
    const q = this.question();
    if (!q) return;
    this.practice
      .report(q.id, this.reportReason(), this.reportNote().trim() || undefined)
      .subscribe({
        next: (res) => {
          this.reported.update((r) => ({ ...r, [q.id]: true }));
          this.reportOpen.set(false);
          this.reportNote.set('');
          this.toast.show(res.message, 'info');
        },
        error: (err: unknown) => this.toast.show(apiErrorMessage(err), 'error'),
      });
  }

  /** How a choice is described to screen readers and in feedback. */
  protected answerLabel(q: PublicQuestion, choice: number): string {
    if (q.type === 'spot_error') {
      return choice === NO_ERROR
        ? 'No error'
        : `part ${LETTERS[choice]}, "${q.segments?.[choice]}"`;
    }
    return `${LETTERS[choice]}, "${q.options?.[choice]}"`;
  }

  /** CSS state for an option button after answering. */
  protected optionState(choice: number): 'right' | 'wrong' | 'dim' | null {
    const r = this.result();
    if (!r) return null;
    if (choice === r.answer) return 'right';
    if (choice === r.chosen) return 'wrong';
    return 'dim';
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && this.result()) {
      event.preventDefault();
      this.next();
      return;
    }
    const key = event.key.toLowerCase();
    const byNumber = '12345'.indexOf(key);
    const byLetter = 'abcde'.indexOf(key);
    const choice = byNumber >= 0 ? byNumber : byLetter;
    if (choice >= 0 && choice < this.choiceCount() && !this.result()) {
      event.preventDefault();
      this.choose(choice);
    }
  }
}
