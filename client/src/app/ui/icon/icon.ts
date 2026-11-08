import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { AppIcon } from '../../core/icons';

/** A decorative Lucide icon (always hidden from screen readers; label the parent instead). */
@Component({
  selector: 'ui-icon',
  imports: [NgIcon],
  template: `<ng-icon
    [name]="name()"
    [size]="size()"
    [strokeWidth]="stroke()"
    aria-hidden="true"
  />`,
  host: { class: 'ui-icon', 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class UiIcon {
  readonly name = input.required<AppIcon>();
  readonly size = input('20px');
  readonly stroke = input<number | string>(2);
}
