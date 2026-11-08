import { Component, inject } from '@angular/core';
import { UiIcon } from '../icon/icon';
import { ToastService } from './toast.service';

@Component({
  selector: 'ui-toaster',
  imports: [UiIcon],
  template: `
    <div class="toaster" role="status" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div class="toast toast--{{ toast.tone }}">
          <ui-icon
            [name]="
              toast.tone === 'error'
                ? 'lucideCircleAlert'
                : toast.tone === 'info'
                  ? 'lucideInfo'
                  : 'lucideCircleCheck'
            "
          />
          <span class="toast__text">{{ toast.message }}</span>
          <button
            type="button"
            class="toast__close"
            aria-label="Dismiss notification"
            (click)="dismiss(toast.id)"
          >
            <ui-icon name="lucideX" size="16px" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toaster {
      position: fixed;
      left: 50%;
      bottom: calc(24px + env(safe-area-inset-bottom));
      z-index: 900;
      display: grid;
      gap: 8px;
      width: min(440px, calc(100vw - 32px));
      transform: translateX(-50%);
      pointer-events: none;
    }

    /* Keep clear of the phone tab bar. */
    @media (max-width: 959.98px) {
      .toaster {
        bottom: calc(104px + env(safe-area-inset-bottom));
      }
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 10px 12px 16px;
      border-radius: 18px;
      font-weight: 600;
      box-shadow: var(--shadow-lg);
      pointer-events: auto;
      animation: pop 320ms var(--ease) both;
    }

    .toast--success {
      background: var(--mint);
      color: var(--mint-ink);
    }

    .toast--info {
      background: var(--lavender);
      color: var(--lavender-ink);
    }

    .toast--error {
      background: var(--danger-soft);
      color: var(--danger-ink);
    }

    .toast__text {
      flex: 1;
    }

    .toast__close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
    }

    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
      }
    }
  `,
})
export class UiToaster {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
