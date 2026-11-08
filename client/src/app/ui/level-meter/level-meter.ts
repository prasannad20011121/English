import { Component, computed, input } from '@angular/core';

const SHAPE = [0.35, 0.55, 0.8, 1, 0.75, 0.9, 0.6, 0.85, 1, 0.7, 0.5, 0.3];

/** Live microphone level as a row of bars (decorative; describe the state in text nearby). */
@Component({
  selector: 'ui-level-meter',
  host: { 'aria-hidden': 'true', class: 'level-meter', '[class.is-active]': 'active()' },
  template: `
    @for (h of heights(); track $index) {
      <span [style.transform]="'scaleY(' + h + ')'"></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 56px;
    }

    span {
      width: 7px;
      height: 100%;
      border-radius: 99px;
      background: currentColor;
      opacity: 0.35;
      transform-origin: center;
      transition: transform 90ms linear;
    }

    :host(.is-active) span {
      opacity: 1;
    }
  `,
})
export class UiLevelMeter {
  /** 0–1. */
  readonly level = input(0);
  readonly active = input(true);

  protected readonly heights = computed(() => {
    const level = Math.max(0, Math.min(1, this.level()));
    return SHAPE.map((s) => Math.max(0.12, Math.min(1, level * s * 1.3 + 0.08)));
  });
}
