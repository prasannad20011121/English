import { analyseFrames } from './recorder.service';

/** Builds a level list: [level, frames] runs, 50 ms per frame. */
const frames = (...runs: [number, number][]) => runs.flatMap(([level, n]) => Array(n).fill(level));

describe('analyseFrames', () => {
  it('reports nothing heard for silence', () => {
    const a = analyseFrames(frames([0.001, 40]), 50);
    expect(a.speechStarted).toBe(false);
    expect(a.firstSoundMs).toBeUndefined();
    expect(a.trailingSilenceMs).toBe(2000);
  });

  it('measures time to first sound and speaking time', () => {
    // 0.5 s silence, 2 s speech, 1 s silence
    const a = analyseFrames(frames([0, 10], [0.1, 40], [0, 20]), 50);
    expect(a.firstSoundMs).toBe(500);
    expect(a.speechMs).toBe(2000);
    expect(a.trailingSilenceMs).toBe(1000);
    expect(a.speechStarted).toBe(true);
    expect(a.pauses).toBe(0);
  });

  it('counts pauses (≥ 0.6 s) and long pauses (≥ 1.5 s) between speech only', () => {
    const a = analyseFrames(
      frames(
        [0, 30],
        [0.1, 10],
        [0, 4],
        [0.1, 10],
        [0, 14],
        [0.1, 10],
        [0, 32],
        [0.1, 10],
        [0, 40],
      ),
      50,
    );
    // gaps: 200 ms (none), 700 ms (pause), 1600 ms (pause + long); leading/trailing ignored
    expect(a.pauses).toBe(2);
    expect(a.longPauses).toBe(1);
    expect(a.speechMs).toBe((10 + 4 + 10 + 14 + 10 + 32 + 10) * 50);
  });

  it('ignores a short click when deciding that speech has started', () => {
    const a = analyseFrames(frames([0, 10], [0.3, 2], [0, 30]), 50);
    expect(a.speechStarted).toBe(false);
    expect(a.firstSoundMs).toBe(500);
  });

  it('uses the given threshold', () => {
    const quiet = frames([0.015, 20]);
    expect(analyseFrames(quiet, 50).speechStarted).toBe(false);
    expect(analyseFrames(quiet, 50, { threshold: 0.01 }).speechStarted).toBe(true);
  });
});
