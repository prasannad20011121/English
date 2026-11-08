import { Component, computed, input } from '@angular/core';

const TONES = ['lavender', 'mint', 'peach', 'butter', 'sky', 'rose'] as const;

/** Initials on a pastel circle; the colour is stable for a given name. */
@Component({
  selector: 'ui-avatar',
  template: `{{ initials() }}`,
  host: {
    class: 'avatar',
    'aria-hidden': 'true',
    '[style.--avatar-size]': 'size()',
    '[style.background]': '"var(--" + tone() + ")"',
    '[style.color]': '"var(--" + tone() + "-ink)"',
  },
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      font-weight: 700;
      font-size: calc(var(--avatar-size) * 0.38);
      letter-spacing: -0.02em;
    }
  `,
})
export class UiAvatar {
  readonly name = input<string | null | undefined>('');
  readonly size = input('40px');

  protected readonly initials = computed(() =>
    (this.name() ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected readonly tone = computed(() => {
    let hash = 0;
    for (const ch of this.name() ?? '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return TONES[hash % TONES.length];
  });
}
