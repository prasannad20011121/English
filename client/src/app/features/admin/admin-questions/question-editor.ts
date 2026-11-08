import { Component, type OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage, apiFieldErrors } from '../../../core/api/api-error';
import {
  AdminQuestionsService,
  type AdminQuestion,
  type QuestionContent,
} from '../../../core/api/admin-questions.service';
import type { QuestionType, Tag } from '../../../core/models/practice';
import { UiIcon } from '../../../ui/icon/icon';
import { LETTERS, TAG_LABELS, TYPE_INFO } from '../../practice/written/written-types';

interface Draft {
  type: QuestionType;
  difficulty: number;
  tags: Tag[];
  prompt: string;
  segments: string[];
  options: string[];
  answer: number;
  correction: string;
  explanation: string;
}

/** Inline editor for one question; the server applies the same rules as the seed bank. */
@Component({
  selector: 'app-question-editor',
  imports: [FormsModule, UiIcon],
  templateUrl: './question-editor.html',
  styleUrl: './question-editor.scss',
})
export class QuestionEditor implements OnInit {
  private readonly api = inject(AdminQuestionsService);

  readonly question = input.required<AdminQuestion>();
  readonly saved = output<AdminQuestion>();
  readonly cancelled = output<void>();

  protected readonly letters = LETTERS;
  protected readonly types = Object.entries(TYPE_INFO).map(([value, info]) => ({
    value: value as QuestionType,
    label: info.title,
  }));
  protected readonly tagList = Object.entries(TAG_LABELS) as [Tag, string][];
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected draft!: Draft;

  ngOnInit(): void {
    const q = this.question();
    this.draft = {
      type: q.type,
      difficulty: q.difficulty,
      tags: [...q.tags],
      prompt: q.prompt,
      segments: q.segments ? [...q.segments] : ['', '', '', ''],
      options: q.options ? [...q.options] : ['', '', '', ''],
      answer: q.answer,
      correction: q.correction ?? '',
      explanation: q.explanation,
    };
  }

  protected toggleTag(tag: Tag): void {
    const tags = this.draft.tags;
    this.draft.tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
  }

  protected err(path: string): string | null {
    const errors = this.fieldErrors();
    return (
      errors[path] ?? Object.entries(errors).find(([k]) => k.startsWith(`${path}.`))?.[1] ?? null
    );
  }

  protected save(): void {
    const d = this.draft;
    const common = {
      difficulty: Number(d.difficulty),
      tags: d.tags,
      explanation: d.explanation.trim(),
      answer: Number(d.answer),
    };
    const content: QuestionContent =
      d.type === 'spot_error'
        ? {
            ...common,
            type: 'spot_error',
            segments: d.segments.map((s) => s.trim()),
            ...(Number(d.answer) !== 4 && d.correction.trim()
              ? { correction: d.correction.trim() }
              : {}),
          }
        : {
            ...common,
            type: d.type,
            prompt: d.prompt.trim(),
            options: d.options.map((o) => o.trim()),
          };

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.api.update(this.question().id, content).subscribe({
      next: (q) => {
        this.saving.set(false);
        this.saved.emit(q);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.fieldErrors.set(apiFieldErrors(e));
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
