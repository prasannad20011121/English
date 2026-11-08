import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { PracticeService } from '../../core/api/practice.service';
import { AuthService } from '../../core/auth/auth.service';
import { fromIsoDate } from '../../core/forms/form-utils';
import type { AppIcon } from '../../core/icons';
import { UiIcon } from '../../ui/icon/icon';
import { UiIllustration } from '../../ui/illustration/illustration';
import { daysUntil, greeting, prepProgress } from './dashboard-math';

interface Module {
  title: string;
  icon: AppIcon;
  tone: 'lavender' | 'mint' | 'sky';
  description: string;
  tasks: string[];
  /** Set once the module is available. */
  link?: string;
}

const RING_RADIUS = 52;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, NgTemplateOutlet, UiIcon, UiIllustration],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly user = inject(AuthService).user;
  private readonly now = new Date();

  /** Streak and daily goal; null while loading or if the request fails. */
  protected readonly stats = toSignal(
    inject(PracticeService)
      .stats()
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly goalPercent = computed(() => {
    const s = this.stats();
    return s ? Math.min(100, Math.round((s.answeredToday / s.dailyGoal) * 100)) : 0;
  });
  protected readonly goalLeft = computed(() => {
    const s = this.stats();
    return s ? Math.max(0, s.dailyGoal - s.answeredToday) : 0;
  });

  protected readonly greeting = greeting(this.now);
  protected readonly firstName = computed(() => this.user()?.name.split(/\s+/)[0] ?? '');
  protected readonly examDate = computed(() => fromIsoDate(this.user()?.targetExamDate));
  protected readonly daysLeft = computed(() => {
    const exam = this.examDate();
    return exam ? daysUntil(exam, this.now) : null;
  });

  protected readonly ringCircumference = 2 * Math.PI * RING_RADIUS;
  protected readonly ringRadius = RING_RADIUS;
  /** The ring shows the prep time left: full at sign-up, emptying as test day gets closer. */
  protected readonly ringOffset = computed(() => {
    const exam = this.examDate();
    const created = this.user()?.createdAt ? new Date(this.user()!.createdAt!) : this.now;
    const left = exam ? 1 - prepProgress(created, exam, this.now) : 0;
    return this.ringCircumference * (1 - Math.max(left, 0.03));
  });

  protected readonly weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  protected readonly todayIndex = (this.now.getDay() + 6) % 7;

  protected readonly modules: Module[] = [
    {
      title: 'Speaking',
      icon: 'lucideMic',
      tone: 'lavender',
      description: 'Record answers and get feedback on pronunciation, fluency and grammar.',
      tasks: ['Read aloud', 'Listen & repeat', 'Sentence builds', 'Story retelling', 'Topic talk'],
    },
    {
      title: 'Written',
      icon: 'lucidePenLine',
      tone: 'mint',
      description: 'Quick grammar and vocabulary rounds with instant answers and explanations.',
      tasks: ['Fill in the blanks', 'Spot the error', 'Sentence completion', 'Synonyms & antonyms'],
      link: '/practice/written',
    },
    {
      title: 'Mock tests',
      icon: 'lucideTimer',
      tone: 'sky',
      description: 'Full timed tests in SHL style, with a skill-by-skill score report.',
      tasks: ['Audio plays once', 'Auto-record', 'No going back', 'Score report'],
    },
  ];

  protected readonly tips: { icon: AppIcon; text: string }[] = [
    { icon: 'lucideHeadphones', text: 'Use earphones with a mic and sit somewhere quiet.' },
    { icon: 'lucideAudioLines', text: 'Speak at a natural pace — clear beats fast.' },
    { icon: 'lucideClock', text: 'Start right after the beep; long silences cost marks.' },
    { icon: 'lucideCheck', text: 'In repeat tasks, say exactly what you hear, in order.' },
    {
      icon: 'lucideSparkles',
      text: 'Topic talk: an opening line, two or three points with examples, a closing line.',
    },
    { icon: 'lucideTarget', text: 'Made a mistake? Correct yourself and keep going.' },
  ];
}
