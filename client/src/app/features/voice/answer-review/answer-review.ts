import { Component, computed, input } from '@angular/core';
import type { AnswerResult, Reveal } from '../../../core/models/voice';
import { UiIcon } from '../../../ui/icon/icon';
import { TranscriptDiff } from '../transcript-diff/transcript-diff';

/** The text a "Hear the model answer" button reads out, if the task has one. */
export function modelAnswer(reveal: Reveal): string | null {
  return (
    reveal.reference ??
    reveal.sentence ??
    reveal.correction ??
    reveal.acceptedAnswers?.[0] ??
    reveal.sampleAnswer ??
    reveal.passage ??
    null
  );
}

export function scoreTone(score: number): 'mint' | 'butter' | 'peach' {
  return score >= 80 ? 'mint' : score >= 60 ? 'butter' : 'peach';
}

export function scoreWord(score: number): string {
  return score >= 90
    ? 'Excellent'
    : score >= 80
      ? 'Great'
      : score >= 60
        ? 'Good'
        : score >= 40
          ? 'Getting there'
          : 'Keep practising';
}

/** What was heard, how it compares with a good answer, speaking metrics and tips. */
@Component({
  selector: 'app-answer-review',
  imports: [UiIcon, TranscriptDiff],
  templateUrl: './answer-review.html',
  styleUrl: './answer-review.scss',
})
export class AnswerReview {
  readonly result = input.required<AnswerResult>();
  /** Whether Whisper is available (clarity needs it). */
  readonly whisper = input(false);
  readonly compact = input(false);

  protected readonly r = computed(() => this.result().reveal);
  protected readonly hasDiff = computed(() => !!this.result().alignment?.length);
  protected readonly metrics = computed(() => {
    const m = this.result().metrics;
    const chips: { label: string; value: string; hint: string }[] = [];
    if (m.wpm) {
      chips.push({
        label: 'Pace',
        value: `${m.wpm} wpm`,
        hint: 'Words per minute. 110–160 sounds natural.',
      });
    }
    if (m.longPauses !== undefined && this.result().transcript) {
      chips.push({
        label: 'Long pauses',
        value: String(m.longPauses),
        hint: 'Silences longer than 1.5 seconds.',
      });
    }
    if (m.fillers) {
      chips.push({
        label: 'Fillers',
        value: String(m.fillers),
        hint: 'Sounds like "um" and "uh".',
      });
    }
    if (m.latencyMs !== undefined && m.latencyMs !== null) {
      chips.push({
        label: 'Started after',
        value: `${(m.latencyMs / 1000).toFixed(1)} s`,
        hint: 'Time from the beep to your first word.',
      });
    }
    if (m.clarity !== undefined && m.clarity !== null) {
      chips.push({
        label: 'Clarity',
        value: `${m.clarity}/100`,
        hint: 'How confidently the speech recogniser understood you.',
      });
    } else if (!this.whisper() && this.result().transcript) {
      chips.push({
        label: 'Clarity',
        value: 'needs Whisper',
        hint: 'Clarity is measured when the server speech-to-text (Whisper) is set up.',
      });
    }
    return chips;
  });
}
