import { Component, input } from '@angular/core';

export type IllustrationName = 'speak' | 'study' | 'lost' | 'goal';

/** Original decorative illustrations, drawn with the theme's accent colours. */
@Component({
  selector: 'ui-illustration',
  host: { 'aria-hidden': 'true', class: 'illustration' },
  template: `
    @switch (name()) {
      @case ('speak') {
        <svg viewBox="0 0 260 220" fill="none">
          <path
            class="blob"
            d="M44 72c14-38 64-58 108-50 46 8 88 36 92 80 4 46-30 88-78 100-50 12-112-4-132-46-12-26 0-58 10-84Z"
          />
          <path
            class="bubble"
            d="M38 52h146a26 26 0 0 1 26 26v50a26 26 0 0 1-26 26H86l-30 24 4-24H38a26 26 0 0 1-26-26V78a26 26 0 0 1 26-26Z"
          />
          <g class="bars">
            <rect x="48" y="90" width="10" height="26" rx="5" />
            <rect x="68" y="78" width="10" height="50" rx="5" />
            <rect x="88" y="70" width="10" height="66" rx="5" />
            <rect x="108" y="82" width="10" height="42" rx="5" />
            <rect x="128" y="74" width="10" height="58" rx="5" />
            <rect x="148" y="86" width="10" height="34" rx="5" />
            <rect x="168" y="94" width="10" height="18" rx="5" />
          </g>
          <rect class="mic" x="196" y="112" width="38" height="62" rx="19" />
          <path class="mic-line" d="M184 150c0 20 16 34 31 34s31-14 31-34M215 184v18M198 204h34" />
          <path
            class="spark spark--a"
            d="M222 30c2 10 6 14 16 16-10 2-14 6-16 16-2-10-6-14-16-16 10-2 14-6 16-16Z"
          />
          <path
            class="spark spark--b"
            d="M18 160c1.5 7 4.5 10 11 11.5-6.5 1.5-9.5 4.5-11 11.5-1.5-7-4.5-10-11-11.5 6.5-1.5 9.5-4.5 11-11.5Z"
          />
          <circle class="dot dot--a" cx="248" cy="92" r="5" />
          <circle class="dot dot--b" cx="30" cy="30" r="4" />
        </svg>
      }
      @case ('study') {
        <svg viewBox="0 0 240 200" fill="none">
          <path
            class="blob"
            d="M30 90c6-44 52-72 98-70 48 2 92 30 98 74 6 46-28 84-76 92-50 8-106-8-118-50-4-16-4-30-2-46Z"
          />
          <path class="page" d="M120 58c-22-14-52-18-80-12v104c28-6 58-2 80 12Z" />
          <path class="page page--r" d="M120 58c22-14 52-18 80-12v104c-28-6-58-2-80 12Z" />
          <path
            class="ink-line"
            d="M58 72c16-2 32 0 46 6M58 92c16-2 32 0 46 6M58 112c16-2 32 0 46 6M136 78c14-6 30-8 46-6M136 98c14-6 30-8 46-6"
          />
          <rect
            class="pencil"
            x="150"
            y="104"
            width="16"
            height="74"
            rx="4"
            transform="rotate(38 158 141)"
          />
          <path class="pencil-tip" d="M198 158l9 18-19-6Z" />
          <circle class="badge" cx="56" cy="160" r="22" />
          <path class="badge-check" d="M45 160l8 8 15-16" />
          <path
            class="spark spark--a"
            d="M206 24c2 9 5 12 14 14-9 2-12 5-14 14-2-9-5-12-14-14 9-2 12-5 14-14Z"
          />
        </svg>
      }
      @case ('goal') {
        <svg viewBox="0 0 200 180" fill="none">
          <path
            class="blob"
            d="M26 84c4-40 44-66 84-62 42 4 74 32 72 72-2 42-38 72-80 70-46-2-80-34-76-80Z"
          />
          <circle class="ring ring--1" cx="100" cy="92" r="56" />
          <circle class="ring ring--2" cx="100" cy="92" r="36" />
          <circle class="ring ring--3" cx="100" cy="92" r="16" />
          <path class="arrow" d="M100 92l58-58M146 28l14 4 4 14" />
          <path
            class="spark spark--b"
            d="M36 30c1.5 7 4.5 10 11 11.5-6.5 1.5-9.5 4.5-11 11.5-1.5-7-4.5-10-11-11.5 6.5-1.5 9.5-4.5 11-11.5Z"
          />
        </svg>
      }
      @case ('lost') {
        <svg viewBox="0 0 260 220" fill="none">
          <path
            class="blob"
            d="M40 96c8-48 58-78 108-74 52 4 96 38 98 86 2 50-40 90-94 94-56 4-112-28-114-78 0-10 0-20 2-28Z"
          />
          <path class="trail" d="M24 196c30-6 40-30 70-34s46 18 78 6" />
          <circle class="face" cx="140" cy="104" r="62" />
          <circle class="rim" cx="140" cy="104" r="62" />
          <path class="needle-n" d="M140 104l-14-8 40-34Z" />
          <path class="needle-s" d="M140 104l14 8-40 34Z" />
          <circle class="hub" cx="140" cy="104" r="7" />
          <path
            class="spark spark--a"
            d="M226 26c2 10 6 14 16 16-10 2-14 6-16 16-2-10-6-14-16-16 10-2 14-6 16-16Z"
          />
          <circle class="dot dot--a" cx="44" cy="58" r="6" />
        </svg>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      color: var(--tile-ink, var(--ink));
    }

    svg {
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .blob {
      fill: var(--surface);
      opacity: 0.55;
    }

    .bubble,
    .page,
    .face {
      fill: var(--surface);
    }

    .page--r {
      fill: color-mix(in srgb, var(--surface) 85%, var(--lavender));
    }

    .bars rect {
      fill: #6d5dd3;
      transform-box: fill-box;
      transform-origin: center;
      animation: talk 1.6s ease-in-out infinite;
    }

    .bars rect:nth-child(2) {
      animation-delay: 0.15s;
    }

    .bars rect:nth-child(3) {
      animation-delay: 0.3s;
    }

    .bars rect:nth-child(4) {
      animation-delay: 0.45s;
    }

    .bars rect:nth-child(5) {
      animation-delay: 0.6s;
    }

    .bars rect:nth-child(6) {
      animation-delay: 0.75s;
    }

    .bars rect:nth-child(7) {
      animation-delay: 0.9s;
    }

    .mic,
    .pencil {
      fill: #ff8a65;
    }

    .pencil-tip,
    .needle-s {
      fill: #ffcf3f;
    }

    .mic-line,
    .ink-line,
    .arrow,
    .rim,
    .trail {
      stroke: currentColor;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ink-line {
      stroke-width: 4;
      opacity: 0.35;
    }

    .trail {
      stroke-dasharray: 2 12;
      opacity: 0.5;
    }

    .rim {
      fill: none;
    }

    .needle-n {
      fill: #6d5dd3;
    }

    .hub {
      fill: currentColor;
    }

    .badge {
      fill: #4cc38a;
    }

    .badge-check {
      stroke: #fff;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ring {
      stroke-width: 12;
    }

    .ring--1 {
      stroke: #ff8a65;
    }

    .ring--2 {
      stroke: #ffcf3f;
    }

    .ring--3 {
      fill: #6d5dd3;
      stroke: none;
    }

    .spark--a {
      fill: #ffcf3f;
    }

    .spark--b {
      fill: #ff8a65;
    }

    .dot--a {
      fill: #5aa9ff;
    }

    .dot--b {
      fill: #4cc38a;
    }

    .spark {
      transform-box: fill-box;
      transform-origin: center;
      animation: twinkle 2.8s ease-in-out infinite;
    }

    @keyframes talk {
      50% {
        transform: scaleY(0.55);
      }
    }

    @keyframes twinkle {
      50% {
        transform: scale(0.7) rotate(20deg);
        opacity: 0.7;
      }
    }
  `,
})
export class UiIllustration {
  readonly name = input.required<IllustrationName>();
}
