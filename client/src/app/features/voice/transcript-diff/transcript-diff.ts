import { Component, computed, input } from '@angular/core';
import type { AlignOp } from '../../../core/models/voice';

/**
 * The expected sentence word by word, coloured by what was heard: right, nearly right,
 * a different word, missed, or an extra word.
 */
@Component({
  selector: 'app-transcript-diff',
  template: `
    <p class="words">
      @for (op of ops(); track $index) {
        @switch (op.type) {
          @case ('ok') {
            <span class="w w--ok">{{ op.ref }}</span>
          }
          @case ('close') {
            <span class="w w--close" [title]="'You said: ' + op.heard"
              >{{ op.ref }}<span class="sr-only"> (nearly: you said {{ op.heard }})</span></span
            >
          }
          @case ('sub') {
            <span class="w w--sub"
              ><s>{{ op.heard }}</s> {{ op.ref
              }}<span class="sr-only"> (you said {{ op.heard }} instead)</span></span
            >
          }
          @case ('missing') {
            <span class="w w--missing">{{ op.ref }}<span class="sr-only"> (missed)</span></span>
          }
          @case ('extra') {
            <span class="w w--extra">+{{ op.heard }}<span class="sr-only"> (extra)</span></span>
          }
        }
      }
    </p>
    @if (showLegend()) {
      <ul class="legend" aria-label="Colour key">
        <li><span class="w w--ok">right</span></li>
        <li><span class="w w--close">nearly</span></li>
        <li><span class="w w--sub">different word</span></li>
        <li><span class="w w--missing">missed</span></li>
        <li><span class="w w--extra">extra</span></li>
      </ul>
    }
  `,
  styles: `
    .words {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 4px;
      margin: 0;
      font-size: 18px;
      line-height: 1.5;
    }

    .w {
      padding: 1px 7px;
      border-radius: 8px;
      font-weight: 600;
    }

    .w--ok {
      background: var(--mint);
      color: var(--mint-ink);
    }

    .w--close {
      background: var(--butter);
      color: var(--butter-ink);
      text-decoration: underline dotted;
      text-underline-offset: 4px;
    }

    .w--sub {
      background: var(--peach);
      color: var(--peach-ink);

      s {
        opacity: 0.75;
        font-weight: 500;
      }
    }

    .w--missing {
      background: transparent;
      color: var(--danger-ink);
      box-shadow: inset 0 0 0 1.5px var(--danger);
      border-style: dashed;
    }

    .w--extra {
      background: var(--surface-2);
      color: var(--ink-2);
      font-weight: 500;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      font-size: 13px;
    }
  `,
})
export class TranscriptDiff {
  readonly alignment = input.required<AlignOp[]>();
  readonly showLegend = input(true);

  protected readonly ops = computed(() => this.alignment());
}
