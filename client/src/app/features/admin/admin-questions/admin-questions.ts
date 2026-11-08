import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import {
  AdminQuestionsService,
  type AdminQuestion,
  type AdminQuestionPage,
  type GenerateReport,
  type QuestionStatus,
} from '../../../core/api/admin-questions.service';
import type { QuestionType, Tag } from '../../../core/models/practice';
import { UiIcon } from '../../../ui/icon/icon';
import { ToastService } from '../../../ui/toast/toast.service';
import { blankText, splitBlank, splitTarget } from '../../practice/written/question-text';
import {
  DIFFICULTY_LABELS,
  LETTERS,
  TAG_LABELS,
  TYPE_INFO,
} from '../../practice/written/written-types';
import { QuestionEditor } from './question-editor';

const STATUS_TABS: { value: QuestionStatus; label: string }[] = [
  { value: 'draft', label: 'Drafts' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'published', label: 'Published' },
  { value: 'retired', label: 'Retired' },
];

@Component({
  selector: 'app-admin-questions',
  imports: [FormsModule, DecimalPipe, UiIcon, QuestionEditor],
  templateUrl: './admin-questions.html',
  styleUrl: './admin-questions.scss',
})
export class AdminQuestionsPage {
  private readonly api = inject(AdminQuestionsService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = STATUS_TABS;
  protected readonly typeInfo = TYPE_INFO;
  protected readonly types = Object.entries(TYPE_INFO).map(([value, info]) => ({
    value: value as QuestionType,
    label: info.title,
  }));
  protected readonly tagList = Object.entries(TAG_LABELS) as [Tag, string][];
  protected readonly tagLabels = TAG_LABELS;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly letters = LETTERS;
  protected readonly splitBlank = splitBlank;
  protected readonly splitTarget = splitTarget;
  protected readonly blankText = blankText;

  // ---- AI writer ------------------------------------------------------------------------------
  protected readonly ai = toSignal(this.api.aiStatus().pipe(catchError(() => of(null))), {
    initialValue: null,
  });
  protected genType: QuestionType = 'fill_blank';
  protected genTag: Tag = 'prepositions';
  protected genDifficulty: 1 | 2 | 3 = 2;
  protected genCount = 10;
  protected readonly generating = signal(false);
  protected readonly report = signal<GenerateReport | null>(null);

  // ---- List -----------------------------------------------------------------------------------
  protected readonly status = signal<QuestionStatus>('draft');
  protected readonly type = signal<QuestionType | ''>('');
  protected readonly tag = signal<Tag | ''>('');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly data = signal<AdminQuestionPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly editing = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  private readonly query = computed(() => ({
    status: this.status(),
    type: this.type(),
    tag: this.tag(),
    q: this.search().trim(),
    page: this.page(),
  }));
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly pages = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.limit)) : 1;
  });

  constructor() {
    effect(() => this.load(this.query()));
  }

  private load(query = this.query()): void {
    this.loading.set(true);
    this.api.list(query).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.listError.set(null);
        this.selected.set(new Set());
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.listError.set(apiErrorMessage(e));
      },
    });
  }

  protected reload(): void {
    this.load();
  }

  protected setStatusTab(status: QuestionStatus): void {
    this.status.set(status);
    this.page.set(1);
    this.editing.set(null);
  }

  protected onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search.set(value);
      this.page.set(1);
    }, 300);
  }

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    const items = this.data()?.items ?? [];
    this.selected.update((s) =>
      s.size === items.length ? new Set() : new Set(items.map((q) => q.id)),
    );
  }

  protected setStatus(q: AdminQuestion, status: Exclude<QuestionStatus, 'flagged'>): void {
    this.busy.set(q.id);
    this.api.setStatus(q.id, status).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.show(
          status === 'published'
            ? 'Published: students can now see it.'
            : status === 'retired'
              ? 'Retired.'
              : 'Moved to drafts.',
        );
        this.reload();
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.toast.show(apiErrorMessage(e), 'error');
      },
    });
  }

  protected bulk(status: Exclude<QuestionStatus, 'flagged'>): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.busy.set('bulk');
    this.api.bulkStatus(ids, status).subscribe({
      next: (r) => {
        this.busy.set(null);
        this.toast.show(
          `${r.updated} question${r.updated === 1 ? '' : 's'} ${status === 'published' ? 'published' : 'updated'}.`,
        );
        this.reload();
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.toast.show(apiErrorMessage(e), 'error');
      },
    });
  }

  protected onSaved(): void {
    this.editing.set(null);
    this.toast.show('Question saved.');
    this.reload();
  }

  protected generate(): void {
    this.generating.set(true);
    this.report.set(null);
    this.api
      .generate({
        type: this.genType,
        tag: this.genTag,
        difficulty: this.genDifficulty,
        count: Number(this.genCount),
      })
      .subscribe({
        next: (report) => {
          this.generating.set(false);
          this.report.set(report);
          this.setStatusTab('draft');
          this.reload();
        },
        error: (e: unknown) => {
          this.generating.set(false);
          this.toast.show(apiErrorMessage(e), 'error', 6000);
        },
      });
  }

  protected answerLabel(q: AdminQuestion): string {
    if (q.type === 'spot_error') return q.answer === 4 ? 'No error' : `Part ${LETTERS[q.answer]}`;
    return `${LETTERS[q.answer]} · ${q.options?.[q.answer]}`;
  }
}
