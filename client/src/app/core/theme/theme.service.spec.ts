import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.removeAttribute('data-theme');
  });

  it('starts by following the system and cycles light → dark → system', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(theme.preference()).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);

    theme.cycle();
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(theme.icon()).toBe('lucideSun');

    theme.cycle();
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('shl.theme')).toBe('dark');

    theme.cycle();
    TestBed.tick();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('restores the saved choice', () => {
    localStorage.setItem('shl.theme', 'dark');
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(theme.preference()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
