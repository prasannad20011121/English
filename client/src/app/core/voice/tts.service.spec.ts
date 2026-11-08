import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import type { User } from '../models/user';
import { testUser } from '../testing/fixtures';
import { TtsService, chooseVoices, rankVoices, splitForSpeech } from './tts.service';

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, default: isDefault, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

const VOICES = [
  voice('Hindi', 'hi-IN'),
  voice('US English', 'en-US', true),
  voice('Google UK English Female', 'en-GB'),
  voice('UK English Male', 'en_GB'),
  voice('Rishi', 'en-IN'),
];

describe('voice choice', () => {
  it('prefers the accent, then better-quality voices, and drops non-English voices', () => {
    const ranked = rankVoices(VOICES, 'en-GB');
    expect(ranked.map((v) => v.name)).toEqual([
      'Google UK English Female',
      'UK English Male',
      'US English',
      'Rishi',
    ]);
    expect(rankVoices(VOICES, 'en-IN')[0]!.name).toBe('Rishi');
  });

  it('gives the two speakers of a conversation different voices when it can', () => {
    const gb = chooseVoices(VOICES, 'en-GB');
    expect(gb.A.voice!.name).toBe('Google UK English Female');
    expect(gb.B.voice!.name).toBe('UK English Male');

    const single = chooseVoices([voice('Rishi', 'en-IN')], 'en-IN');
    expect(single.B.voice).toBe(single.A.voice);
    expect(single.B.pitch).not.toBe(single.A.pitch);
  });

  it('splits long text into sentences and short chunks', () => {
    expect(splitForSpeech('One. Two!  Three?')).toEqual(['One.', 'Two!', 'Three?']);
    const long = Array(60).fill('word').join(' ');
    const chunks = splitForSpeech(long, 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
    expect(chunks.join(' ')).toBe(long);
  });
});

describe('TtsService', () => {
  let spoken: SpeechSynthesisUtterance[];
  let user: ReturnType<typeof signal<User | null>>;

  beforeEach(() => {
    spoken = [];
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => VOICES,
      addEventListener: () => undefined,
      cancel: vi.fn(),
      speak: (u: SpeechSynthesisUtterance) => {
        spoken.push(u);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent));
      },
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: SpeechSynthesisVoice | null = null;
        lang = '';
        pitch = 1;
        rate = 1;
        onend: ((e: Event) => void) | null = null;
        onerror: ((e: Event) => void) | null = null;
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('AudioContext', undefined);
    user = signal<User | null>({ ...testUser, settings: { ttsAccent: 'en-GB' } });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user } }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('speaks the parts in order with the right voices, pausing for the blank tone', async () => {
    const tts = TestBed.inject(TtsService);
    const play = tts.play([
      { text: 'Hello there.', voice: 'A' },
      { text: 'Hi!', voice: 'B' },
      { beep: true },
      { text: 'Which speaker said hi?', voice: 'narrator' },
    ]);
    expect(tts.speaking()).toBe(true);
    await play;
    expect(tts.speaking()).toBe(false);
    expect(spoken.map((u) => u.text)).toEqual(['Hello there.', 'Hi!', 'Which speaker said hi?']);
    expect(spoken[0]!.voice!.name).toBe('Google UK English Female');
    expect(spoken[1]!.voice!.name).toBe('UK English Male');
    expect(spoken[0]!.lang).toBe('en-GB');
  });

  it('stops when cancelled', async () => {
    const tts = TestBed.inject(TtsService);
    const play = tts.play([{ text: 'First.' }, { pauseMs: 50 }, { text: 'Second.' }]);
    await new Promise((r) => setTimeout(r, 5));
    tts.cancel();
    await play;
    expect(spoken.map((u) => u.text)).toEqual(['First.']);
    expect(tts.speaking()).toBe(false);
  });

  it("follows the student's accent setting", () => {
    const tts = TestBed.inject(TtsService);
    expect(tts.voiceName()).toBe('Google UK English Female');
    user.set({ ...testUser, settings: { ttsAccent: 'en-IN' } });
    expect(tts.voiceName()).toBe('Rishi');
  });
});
