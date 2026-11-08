import { TestBed } from '@angular/core/testing';
import { TranscriptDiff } from './transcript-diff';

describe('TranscriptDiff', () => {
  it('colours each word by what was heard and explains it for screen readers', async () => {
    const fixture = TestBed.createComponent(TranscriptDiff);
    fixture.componentRef.setInput('alignment', [
      { type: 'ok', ref: 'she', heard: 'she' },
      { type: 'close', ref: 'walks', heard: 'walk' },
      { type: 'sub', ref: 'to', heard: 'at' },
      { type: 'missing', ref: 'the' },
      { type: 'extra', heard: 'um' },
    ]);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const words = [...el.querySelectorAll('.words > .w')].map((w) => w.className.split('--')[1]);
    expect(words).toEqual(['ok', 'close', 'sub', 'missing', 'extra']);
    const text = el.querySelector('.words')!.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('walks (nearly: you said walk)');
    expect(text).toContain('to (you said at instead)');
    expect(text).toContain('the (missed)');
    expect(text).toContain('+um (extra)');
    expect(el.querySelector('.legend')).not.toBeNull();
  });
});
