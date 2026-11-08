import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { APP_ICONS } from '../../../../core/icons';
import type { SessionView } from '../../../../core/models/practice';
import { PlayerPage } from './player';

const view: SessionView = {
  session: {
    id: 's1',
    mode: 'practice',
    type: 'fill_blank',
    status: 'active',
    total: 2,
    answered: 0,
    score: 0,
  },
  questions: [
    {
      id: 'q1',
      type: 'fill_blank',
      prompt: 'She is ___ honest person.',
      options: ['a', 'an', 'the', '(no article)'],
      tags: ['articles'],
      difficulty: 1,
    },
    {
      id: 'q2',
      type: 'spot_error',
      prompt: 'Each of the students have submitted the work on time.',
      segments: ['Each of the students', 'have submitted', 'the work', 'on time.'],
      tags: ['subject_verb_agreement'],
      difficulty: 1,
    },
  ],
  answers: [],
};

describe('PlayerPage', () => {
  let fixture: ComponentFixture<PlayerPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const flush = () => fixture.whenStable();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        provideIcons(APP_ICONS),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PlayerPage);
    fixture.componentRef.setInput('id', 's1');
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    await flush();
    http.expectOne('/api/practice/sessions/s1').flush(view);
    await flush();
  });

  afterEach(() => http.verify());

  it('shows the first question with its blank and options', () => {
    expect(el.textContent).toContain('Question 1 of 2');
    expect(el.querySelector('.blank')).toBeTruthy();
    expect(el.querySelectorAll('.options .option')).toHaveLength(4);
  });

  it('answers with a click and shows the feedback', async () => {
    el.querySelectorAll<HTMLButtonElement>('.options .option')[0]!.click();
    const req = http.expectOne('/api/practice/sessions/s1/answers');
    expect(req.request.body).toMatchObject({ questionId: 'q1', chosen: 0 });
    req.flush({
      correct: false,
      answer: 1,
      correction: null,
      explanation: "'Honest' starts with a vowel sound.",
      progress: { answered: 1, score: 0, total: 2 },
    });
    await flush();
    expect(el.textContent).toContain('Not quite');
    expect(el.textContent).toContain('vowel sound');
    expect(el.querySelector('.blank')!.textContent).toBe('an');
    const options = el.querySelectorAll('.options .option');
    expect(options[1]!.classList).toContain('option--right');
    expect(options[0]!.classList).toContain('option--wrong');
    // A second click does nothing.
    (options[2] as HTMLButtonElement).click();
    http.expectNone('/api/practice/sessions/s1/answers');
  });

  it('supports keyboard shortcuts, then finishes on the last question', async () => {
    key('2');
    http.expectOne('/api/practice/sessions/s1/answers').flush({
      correct: true,
      answer: 1,
      correction: null,
      explanation: 'Vowel sound.',
      progress: { answered: 1, score: 1, total: 2 },
    });
    await flush();
    expect(el.textContent).toContain('Correct!');

    key('Enter');
    await flush();
    expect(el.textContent).toContain('Question 2 of 2');
    expect(el.querySelectorAll('.part')).toHaveLength(4);

    key('e'); // "No error"
    const req = http.expectOne('/api/practice/sessions/s1/answers');
    expect(req.request.body.chosen).toBe(4);
    req.flush({
      correct: false,
      answer: 1,
      correction: 'Each of the students has submitted the work on time.',
      explanation: "'Each' takes a singular verb.",
      progress: { answered: 2, score: 1, total: 2 },
    });
    await flush();
    expect(el.textContent).toContain('has submitted');
    expect(el.textContent).toContain('See my results');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    key('Enter');
    http.expectOne('/api/practice/sessions/s1/finish').flush({});
    await flush();
    expect(navigate).toHaveBeenCalledWith(['/practice/written/session', 's1', 'summary']);
  });
});
