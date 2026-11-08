import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { fromIsoDate } from '../../core/forms/form-utils';

interface Module {
  title: string;
  icon: string;
  description: string;
  tasks: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly user = inject(AuthService).user;

  protected readonly firstName = computed(() => this.user()?.name.split(/\s+/)[0] ?? '');
  protected readonly examDate = computed(() => fromIsoDate(this.user()?.targetExamDate));
  /** Whole calendar days from today to the exam (0 = today, negative = passed). */
  protected readonly daysLeft = computed(() => {
    const exam = this.examDate();
    if (!exam) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((exam.getTime() - today.getTime()) / DAY_MS);
  });

  protected readonly modules: Module[] = [
    {
      title: 'Speaking practice',
      icon: 'record_voice_over',
      description: 'Record your answers and get feedback on pronunciation, fluency and grammar.',
      tasks: [
        'Read aloud',
        'Listen & repeat',
        'Short answers',
        'Sentence builds',
        'Story retelling',
        'Topic talk (1–2 min)',
      ],
    },
    {
      title: 'Written practice',
      icon: 'edit_note',
      description: 'Grammar and vocabulary questions with instant answers and explanations.',
      tasks: ['Fill in the blanks', 'Spot the error', 'Sentence completion', 'Dictation'],
    },
    {
      title: 'Mock tests',
      icon: 'timer',
      description: 'Full timed tests in SHL style, with a skill-wise score report at the end.',
      tasks: ['Audio plays once', 'Auto-start recording', 'No going back', 'Score report'],
    },
  ];

  protected readonly tips = [
    'Use earphones with a mic and sit in a quiet room.',
    'Speak at a natural pace — clear beats fast.',
    'Start speaking right after the beep; long silences cost marks.',
    'In “repeat” tasks, say exactly the words you hear, in the same order.',
    'For a topic talk: one opening line, two or three points with examples, one closing line.',
    'If you make a mistake, correct yourself and keep going.',
  ];
}
