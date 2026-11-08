import { Component, Directive, computed, inject, input } from '@angular/core';
import { UiIcon } from '../icon/icon';

let nextId = 0;

/**
 * A labelled form field. Project one control marked with `uiInput`, and optionally an
 * element marked `uiSuffix` (e.g. a show-password button).
 *
 *   <ui-field label="Email" [error]="fieldError(form.controls.email)">
 *     <input uiInput type="email" formControlName="email" />
 *   </ui-field>
 */
@Component({
  selector: 'ui-field',
  imports: [UiIcon],
  host: { class: 'field' },
  template: `
    <label class="field__label" [attr.for]="controlId">
      {{ label() }}
      @if (optional()) {
        <span class="field__optional">optional</span>
      }
    </label>
    <div class="field__control">
      <ng-content />
      <div class="field__suffix"><ng-content select="[uiSuffix]" /></div>
    </div>
    @if (error(); as message) {
      <p class="field__error" [id]="errorId">
        <ui-icon name="lucideCircleAlert" size="16px" />
        {{ message }}
      </p>
    } @else if (hint()) {
      <p class="field__hint" [id]="hintId">{{ hint() }}</p>
    }
  `,
  styleUrl: './field.scss',
})
export class UiField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>(null);
  readonly optional = input(false);

  private readonly uid = `field-${nextId++}`;
  readonly controlId = `${this.uid}-control`;
  readonly errorId = `${this.uid}-error`;
  readonly hintId = `${this.uid}-hint`;

  /** The id the control should point to with aria-describedby. */
  readonly describedBy = computed(() =>
    this.error() ? this.errorId : this.hint() ? this.hintId : null,
  );
}

/** Marks the control inside a `ui-field` and connects it to the label, hint and error. */
@Directive({
  selector: 'input[uiInput], select[uiInput], textarea[uiInput]',
  host: {
    class: 'ui-input',
    '[id]': 'field?.controlId ?? null',
    '[attr.aria-describedby]': 'field?.describedBy() ?? null',
    '[attr.aria-invalid]': 'field?.error() ? "true" : null',
  },
})
export class UiInput {
  protected readonly field = inject(UiField, { optional: true });
}

/** Content for the right-hand side of a `ui-field` control. */
@Directive({ selector: '[uiSuffix]' })
export class UiSuffix {}
