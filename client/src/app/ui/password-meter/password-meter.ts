import { Component, computed, input } from '@angular/core';
import { passwordScore } from '../../core/forms/form-utils';

const LABELS = ['', 'Weak', 'Okay', 'Strong'] as const;

/** Three-segment password strength bar shown under new-password fields. */
@Component({
  selector: 'ui-password-meter',
  template: `
    @if (score() > 0) {
      <div class="meter" [attr.data-score]="score()"><span></span><span></span><span></span></div>
      <p class="meter__label">
        Strength: <strong>{{ label() }}</strong>
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: -8px;
    }

    :host:empty {
      display: none;
    }

    .meter {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;

      span {
        height: 6px;
        border-radius: 999px;
        background: var(--line);
        transition: background-color var(--dur) var(--ease);
      }

      &[data-score='1'] span:nth-child(-n + 1) {
        background: #f07a8f;
      }

      &[data-score='2'] span:nth-child(-n + 2) {
        background: #f2b630;
      }

      &[data-score='3'] span {
        background: #3fb57a;
      }
    }

    .meter__label {
      margin-top: 6px;
      font-size: 13px;
      color: var(--ink-2);
    }
  `,
})
export class UiPasswordMeter {
  readonly value = input<string | null | undefined>('');
  protected readonly score = computed(() => passwordScore(this.value() ?? ''));
  protected readonly label = computed(() => LABELS[this.score()]);
}
