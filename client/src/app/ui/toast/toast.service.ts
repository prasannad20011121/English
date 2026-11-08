import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** Small notifications shown by `ui-toaster` (mounted once in the root component). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  show(message: string, tone: ToastTone = 'success', durationMs = 4000): number {
    const id = this.nextId++;
    this.items.update((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => this.dismiss(id), durationMs);
    return id;
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}
