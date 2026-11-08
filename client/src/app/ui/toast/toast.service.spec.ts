import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows toasts and removes them after their duration', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.show('Saved', 'success', 1000);
    toasts.show('Heads up', 'info', 3000);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Saved', 'Heads up']);
    vi.advanceTimersByTime(1000);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Heads up']);
  });

  it('keeps at most three on screen and can dismiss one', () => {
    const toasts = TestBed.inject(ToastService);
    const ids = ['a', 'b', 'c', 'd'].map((m) => toasts.show(m));
    expect(toasts.toasts().map((t) => t.message)).toEqual(['b', 'c', 'd']);
    toasts.dismiss(ids[2]!);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['b', 'd']);
  });
});
