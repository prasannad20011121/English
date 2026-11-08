import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { APP_ICONS } from '../../../core/icons';
import type { AnswerResult, SessionView, VoicePrompt } from '../../../core/models/voice';
import { MicError, RecorderService, type Recording } from '../../../core/voice/recorder.service';
import { SpeechRecognizerService } from '../../../core/voice/speech-recognizer.service';
import { TtsService } from '../../../core/voice/tts.service';
import { VoicePlayerPage } from './player';

const prompt = (id: string, extra: Partial<VoicePrompt> = {}): VoicePrompt => ({
  id,
  task: 'repeat',
  difficulty: 1,
  tags: ['listening'],
  speak: [{ text: `Sentence ${id}.` }],
  prepSeconds: 0,
  answerSeconds: 10,
  autoStop: true,
  replayable: true,
  ...extra,
});

const view = (mode: 'practice' | 'test', prompts: VoicePrompt[]): SessionView => ({
  session: {
    id: 's1',
    mode,
    task: mode === 'test' ? null : 'repeat',
    status: 'active',
    total: prompts.length,
    answered: 0,
  },
  ...(mode === 'test'
    ? {
        sections: [
          { title: 'Listen and repeat', task: 'repeat' as const, count: 1 },
          { title: 'Short answers', task: 'short_answer' as const, count: 1 },
        ],
      }
    : {}),
  prompts,
  answers: [],
  answeredIds: [],
});

const result = (questionId: string, score: number): AnswerResult => ({
  questionId,
  task: 'repeat',
  score,
  correct: score >= 60,
  skills: { listening: score },
  transcript: 'she walks to school',
  alignment: [{ type: 'ok', ref: 'she', heard: 'she' }],
  metrics: { wpm: 120, longPauses: 0, fillers: 0 },
  feedback: [],
  reveal: { reference: 'She walks to school.' },
  audioId: 'a1',
  sttSource: 'browser',
});

const recording = (heardVoice = true): Recording => ({
  blob: new Blob(['x'], { type: 'audio/webm' }),
  durationMs: 2400,
  heardVoice,
  metrics: { firstSoundMs: 300, speechMs: 1800, pauses: 0, longPauses: 0 },
});

class FakeRecorder {
  level = signal(0);
  ready = signal(false);
  recording = signal(false);
  elapsedMs = signal(0);
  next = recording();
  open = vi.fn(async () => this.ready.set(true));
  close = vi.fn();
  record = vi.fn(() => {
    let resolve!: (r: Recording) => void;
    let reject!: (e: unknown) => void;
    const done = new Promise<Recording>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {
      done,
      stop: () => resolve(this.next),
      cancel: () => reject(new DOMException('cancelled', 'AbortError')),
    };
  });
}

describe('VoicePlayerPage', () => {
  let fixture: ComponentFixture<VoicePlayerPage>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let recorder: FakeRecorder;
  let heard: string;
  const tts = {
    supported: true,
    speaking: signal(false),
    play: vi.fn(async () => undefined),
    say: vi.fn(async () => undefined),
    tone: vi.fn(async () => undefined),
    cancel: vi.fn(),
    accent: () => 'en-IN',
  };

  const tick = async (ms = 0) => {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent!.includes(label),
    );
  const text = () => el.textContent!.replace(/\s+/g, ' ');

  async function open(v: SessionView, stt: 'browser' | 'whisper' = 'browser') {
    fixture.componentRef.setInput('id', 's1');
    fixture.detectChanges();
    http.expectOne('/api/practice/sessions/s1').flush(v);
    http.expectOne('/api/practice/voice/config').flush({ stt, maxAudioBytes: 1 });
    await tick();
  }

  /** Start → question plays → recording begins. */
  async function startQuestion() {
    await tick(450);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(RecorderService, 'supported').mockReturnValue(true);
    recorder = new FakeRecorder();
    heard = 'she walks to school';
    tts.play.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        provideIcons(APP_ICONS),
        { provide: RecorderService, useValue: recorder },
        { provide: TtsService, useValue: tts },
        {
          provide: SpeechRecognizerService,
          useValue: {
            supported: () => true,
            listen: () => ({ stop: async () => heard, cancel: () => undefined }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(VoicePlayerPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('plays the question, records after the beep and shows feedback', async () => {
    await open(view('practice', [prompt('q1'), prompt('q2')]));
    expect(text()).toContain('Listen & repeat');

    button('Start')!.click();
    await tick();
    expect(text()).toContain('Listen carefully');
    await startQuestion();
    expect(tts.play).toHaveBeenCalledWith([{ text: 'Sentence q1.' }]);
    expect(tts.tone).toHaveBeenCalledWith('start');
    expect(recorder.record).toHaveBeenCalledWith({ maxMs: 10_000, autoStop: true });
    expect(text()).toContain('Recording');

    button('Done')!.click();
    await tick();
    const req = http.expectOne('/api/practice/sessions/s1/answers');
    const body = req.request.body as FormData;
    expect(body.get('questionId')).toBe('q1');
    expect(body.get('clientTranscript')).toBe('she walks to school');
    expect(JSON.parse(body.get('clientMetrics') as string)).toMatchObject({ speechMs: 1800 });
    expect(body.get('audio')).toBeInstanceOf(Blob);
    req.flush({ result: result('q1', 85), received: true, progress: { answered: 1, total: 2 } });
    await tick();

    expect(el.querySelector('.feedback .score')!.textContent).toContain('85');
    expect(text()).toContain('Great');
    expect(text()).toContain('She walks to school.');
    expect(text()).toContain('needs Whisper');

    button('Next question')!.click();
    await startQuestion();
    expect(tts.play).toHaveBeenLastCalledWith([{ text: 'Sentence q2.' }]);
  });

  it('lets a practice answer be replayed once, and offers a retry when nothing was heard', async () => {
    await open(view('practice', [prompt('q1')]));
    button('Start')!.click();
    await startQuestion();

    button('Hear again')!.click();
    await startQuestion();
    expect(tts.play).toHaveBeenCalledTimes(2);
    expect(button('Hear again')).toBeUndefined();

    recorder.next = recording(false);
    heard = '';
    button('Done')!.click();
    await tick();
    expect(text()).toContain("We didn't hear anything");
    expect(button('Record again')).toBeDefined();
    http.expectNone('/api/practice/sessions/s1/answers');

    recorder.next = recording(true);
    heard = 'she walks';
    button('Record again')!.click();
    await tick();
    button('Done')!.click();
    await tick();
    http
      .expectOne('/api/practice/sessions/s1/answers')
      .flush({ result: result('q1', 40), received: true, progress: { answered: 1, total: 1 } });
    await tick();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    button('See results')!.click();
    await tick();
    http.expectOne('/api/practice/sessions/s1/finish').flush({});
    await tick();
    expect(navigate).toHaveBeenCalledWith(['/practice/session', 's1', 'summary']);
  });

  it('runs a mock test without feedback, one part at a time', async () => {
    await open(
      view('test', [
        prompt('q1', { section: 0, replayable: false }),
        prompt('q2', { section: 1, task: 'short_answer', replayable: false }),
      ]),
      'whisper',
    );
    expect(text()).toContain('Part A of 2');
    expect(text()).toContain('Each question plays once');

    button('Begin part A')!.click();
    await startQuestion();
    expect(button('Hear again')).toBeUndefined();
    expect(button('Skip')).toBeUndefined();

    button('Done')!.click();
    await tick();
    const first = http.expectOne('/api/practice/sessions/s1/answers');
    expect((first.request.body as FormData).get('clientTranscript')).toBeNull();
    first.flush({ result: null, received: true, progress: { answered: 1, total: 2 } });
    await tick(1000);

    expect(el.querySelector('.feedback')).toBeNull();
    expect(text()).toContain('Part B of 2');
    expect(text()).toContain('Short answers');

    button('Begin part B')!.click();
    await startQuestion();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    button('Done')!.click();
    await tick();
    http
      .expectOne('/api/practice/sessions/s1/answers')
      .flush({ result: null, received: true, progress: { answered: 2, total: 2 } });
    await tick(1000);
    expect(text()).toContain('Saving your answers');
    http.expectOne('/api/practice/sessions/s1/finish').flush({});
    await tick();
    expect(navigate).toHaveBeenCalledWith(['/practice/session', 's1', 'summary']);
  });

  it('ignores a second click on Start while the microphone opens', async () => {
    await open(view('practice', [prompt('q1')]));
    const start = button('Start')!;
    start.click();
    start.click();
    await startQuestion();
    expect(recorder.open).toHaveBeenCalledTimes(1);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  it('explains when the microphone is blocked', async () => {
    recorder.open.mockRejectedValueOnce(new MicError('denied'));
    await open(view('practice', [prompt('q1')]));
    button('Start')!.click();
    await tick();
    expect(text()).toContain('Microphone access is blocked');
  });
});
