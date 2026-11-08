import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import type { AdminQuestion, AdminQuestionPage } from '../../../core/api/admin-questions.service';
import { APP_ICONS } from '../../../core/icons';
import { AdminQuestionsPage } from './admin-questions';

const draft: AdminQuestion = {
  id: 'q1',
  type: 'fill_blank',
  tags: ['prepositions'],
  difficulty: 1,
  prompt: 'Please wait for me ___ the main gate.',
  options: ['in', 'at', 'on', 'to'],
  answer: 1,
  correction: null,
  explanation: "Use 'at' for a point.",
  status: 'draft',
  source: 'ai',
  aiModel: 'llama-test',
  stats: { attempts: 0, correct: 0 },
  reports: [],
  createdAt: null,
  reviewedAt: null,
};

const page = (items: AdminQuestion[]): AdminQuestionPage => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
  counts: { draft: items.length, published: 156, flagged: 0, retired: 0 },
});

describe('AdminQuestionsPage', () => {
  let http: HttpTestingController;
  let el: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<AdminQuestionsPage>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminQuestionsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        provideIcons(APP_ICONS),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminQuestionsPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne('/api/admin/questions/ai-status').flush({
      enabled: true,
      model: 'llama-test',
      provider: 'api.example.com',
      grammarCheck: false,
    });
    http
      .expectOne((r) => r.url === '/api/admin/questions' && r.params.get('status') === 'draft')
      .flush(page([draft]));
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('previews drafts with the answer filled in', () => {
    expect(el.textContent).toContain('llama-test');
    expect(el.querySelector('.fill')!.textContent).toBe('at');
    expect(el.querySelector('.q__options .is-answer')!.textContent).toContain('at');
  });

  it('publishes a draft and reloads the list', async () => {
    [...el.querySelectorAll<HTMLButtonElement>('.q__actions button')]
      .find((b) => b.textContent!.includes('Publish'))!
      .click();
    const req = http.expectOne('/api/admin/questions/q1/status');
    expect(req.request.body).toEqual({ status: 'published' });
    req.flush({ ...draft, status: 'published' });
    http.expectOne((r) => r.url === '/api/admin/questions').flush(page([]));
    await fixture.whenStable();
    expect(el.textContent).toContain('No drafts waiting for review');
  });

  it('generates drafts and shows why some were rejected', async () => {
    el.querySelector<HTMLFormElement>('.ai__form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/admin/questions/generate');
    expect(req.request.body).toEqual({
      type: 'fill_blank',
      tag: 'prepositions',
      difficulty: 2,
      count: 10,
    });
    req.flush({
      model: 'llama-test',
      requested: 10,
      created: ['a', 'b'],
      rejected: [{ prompt: 'x ___ y', reason: 'Duplicate of a question already in the bank' }],
      grammarChecked: false,
    });
    http.expectOne((r) => r.url === '/api/admin/questions').flush(page([draft]));
    await fixture.whenStable();
    expect(el.querySelector('.report')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '2 of 10 saved as drafts',
    );
    expect(el.textContent).toContain('Duplicate of a question');
  });
});
