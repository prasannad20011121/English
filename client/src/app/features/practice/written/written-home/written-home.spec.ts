import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { APP_ICONS } from '../../../../core/icons';
import type { WrittenCatalog } from '../../../../core/models/practice';
import { WrittenHomePage } from './written-home';

const catalog: WrittenCatalog = {
  types: [
    { type: 'fill_blank', available: 55, done: 4, accuracy: 75 },
    { type: 'spot_error', available: 51, done: 0, accuracy: null },
    { type: 'sentence_completion', available: 25, done: 0, accuracy: null },
    { type: 'synonym', available: 13, done: 0, accuracy: null },
    { type: 'antonym', available: 12, done: 0, accuracy: null },
  ],
  tags: [
    { tag: 'articles', available: 10 },
    { tag: 'tenses', available: 20 },
  ],
  mistakes: 2,
};

describe('WrittenHomePage', () => {
  it('builds the start request from the chosen options', async () => {
    await TestBed.configureTestingModule({
      imports: [WrittenHomePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        provideIcons(APP_ICONS),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(WrittenHomePage);
    const http = TestBed.inject(HttpTestingController);
    const el: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne('/api/practice/written/catalog').flush(catalog);
    await fixture.whenStable();

    expect(el.textContent!.replace(/\s+/g, ' ')).toContain('55 questions · 4 done · 75% right');
    expect(el.textContent).toContain('Review my mistakes');

    const radio = (name: string, label: string) =>
      [...el.querySelectorAll<HTMLLabelElement>('label')]
        .find((l) => l.querySelector(`input[name=${name}]`) && l.textContent!.includes(label))!
        .querySelector('input')!;
    radio('type', 'Spot the error').click();
    radio('count', '5').click();
    radio('difficulty', 'Hard').click();
    [...el.querySelectorAll<HTMLButtonElement>('.chip')]
      .find((c) => c.textContent!.includes('Tenses'))!
      .click();
    await fixture.whenStable();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.start-btn')!.click();
    const req = http.expectOne('/api/practice/sessions');
    expect(req.request.body).toEqual({
      type: 'spot_error',
      count: 5,
      difficulty: 3,
      tags: ['tenses'],
    });
    req.flush({ session: { id: 'abc' }, questions: [], answers: [] });
    expect(navigate).toHaveBeenCalledWith(['/practice/written/session', 'abc']);
    http.verify();
  });
});
