import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const COLORS = ['#6d5dd3', '#ff8a65', '#4cc38a', '#ffcf3f', '#5aa9ff', '#ff6fa3'];

/** A short burst of pastel confetti (skipped when the user prefers reduced motion). */
@Injectable({ providedIn: 'root' })
export class CelebrateService {
  private readonly document = inject(DOCUMENT);

  burst(pieces = 36): void {
    const win = this.document.defaultView;
    if (!win || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const layer = this.document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < pieces; i++) {
      const piece = this.document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = COLORS[i % COLORS.length]!;
      piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
      piece.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 0.25}s`);
      piece.style.setProperty('--dur-fall', `${1.1 + Math.random() * 0.7}s`);
      layer.appendChild(piece);
    }
    this.document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 2200);
  }
}
