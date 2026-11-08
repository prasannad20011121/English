import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, map, of, startWith } from 'rxjs';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { PracticeService } from '../../../../core/api/practice.service';
import type {
  QuestionType,
  StartSessionRequest,
  Tag,
  WrittenCatalog,
} from '../../../../core/models/practice';
import { UiIcon } from '../../../../ui/icon/icon';
import { ToastService } from '../../../../ui/toast/toast.service';
import { DIFFICULTY_LABELS, TAG_LABELS, TYPE_INFO, type TypeInfo } from '../written-types';

type CatalogState =
  | { status: 'loading' }
  | { status: 'ok'; catalog: WrittenCatalog }
  | { status: 'error'; message: string };

const COUNTS = [5, 10, 20] as const;

@Component({
  selector: 'app-written-home',
  imports: [UiIcon],
  templateUrl: './written-home.html',
  styleUrl: './written-home.scss',
})
export class WrittenHomePage {
  private readonly practice = inject(PracticeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** `?type=` to preselect a task type (e.g. "Practise again" from a summary). */
  readonly type = input<string>();

  protected readonly info = TYPE_INFO;
  protected readonly typeList = Object.entries(TYPE_INFO) as [QuestionType, TypeInfo][];
  protected readonly tagLabels = TAG_LABELS;
  protected readonly counts = COUNTS;
  protected readonly difficulties: { value: 0 | 1 | 2 | 3; label: string }[] = [
    { value: 0, label: 'Any' },
    ...([1, 2, 3] as const).map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] })),
  ];

  protected readonly state = toSignal(
    this.practice.catalog().pipe(
      map((catalog): CatalogState => ({ status: 'ok', catalog })),
      catchError((err: unknown) =>
        of<CatalogState>({ status: 'error', message: apiErrorMessage(err) }),
      ),
      startWith<CatalogState>({ status: 'loading' }),
    ),
    { requireSync: true },
  );
  protected readonly catalog = computed(() => {
    const s = this.state();
    return s.status === 'ok' ? s.catalog : null;
  });

  private readonly picked = signal<QuestionType | null>(null);
  protected readonly selectedType = computed<QuestionType>(() => {
    const fromQuery = this.type() as QuestionType | undefined;
    return this.picked() ?? (fromQuery && fromQuery in TYPE_INFO ? fromQuery : 'fill_blank');
  });
  protected readonly count = signal<(typeof COUNTS)[number]>(10);
  protected readonly difficulty = signal<0 | 1 | 2 | 3>(0);
  protected readonly tags = signal<Tag[]>([]);
  protected readonly starting = signal<'practice' | 'review' | null>(null);

  protected readonly selectedInfo = computed(() => this.info[this.selectedType()]);
  protected readonly selectedStats = computed(() => this.statsFor(this.selectedType()));

  protected statsFor(type: QuestionType) {
    return this.catalog()?.types.find((t) => t.type === type);
  }

  protected selectType(type: QuestionType): void {
    this.picked.set(type);
  }

  protected toggleTag(tag: Tag): void {
    this.tags.update((list) =>
      list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag],
    );
  }

  protected start(): void {
    const request: StartSessionRequest = { type: this.selectedType(), count: this.count() };
    if (this.difficulty()) request.difficulty = this.difficulty() as 1 | 2 | 3;
    if (this.tags().length) request.tags = this.tags();
    this.launch(request, 'practice');
  }

  protected reviewMistakes(): void {
    this.launch({ mode: 'review', count: 10 }, 'review');
  }

  private launch(request: StartSessionRequest, kind: 'practice' | 'review'): void {
    this.starting.set(kind);
    this.practice.start(request).subscribe({
      next: (view) => void this.router.navigate(['/practice/written/session', view.session.id]),
      error: (err: unknown) => {
        this.toast.show(apiErrorMessage(err), 'info', 5000);
        this.starting.set(null);
      },
    });
  }
}
