import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AppIcon } from '../icons';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'shl.theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const ICONS: Record<ThemePreference, AppIcon> = {
  system: 'lucideSunMoon',
  light: 'lucideSun',
  dark: 'lucideMoon',
};

/** Light / dark / follow-the-system theme, applied as `html[data-theme]` and remembered. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;

  readonly preference = signal<ThemePreference>(readPreference());
  readonly icon = computed(() => ICONS[this.preference()]);
  readonly label = computed(() => {
    const next = ORDER[(ORDER.indexOf(this.preference()) + 1) % ORDER.length];
    return `Theme: ${this.preference()}. Switch to ${next}`;
  });

  constructor() {
    effect(() => {
      const pref = this.preference();
      if (pref === 'system') this.root.removeAttribute('data-theme');
      else this.root.setAttribute('data-theme', pref);
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* storage unavailable */
      }
    });
  }

  cycle(): void {
    this.preference.update((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]!);
  }
}

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}
