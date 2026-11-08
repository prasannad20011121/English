import { verdict } from './summary';

describe('summary verdict', () => {
  it('celebrates high scores and encourages low ones', () => {
    expect(verdict(90)).toEqual({ title: 'Excellent work!', tone: 'mint' });
    expect(verdict(80).tone).toBe('mint');
    expect(verdict(60).tone).toBe('butter');
    expect(verdict(20)).toEqual({ title: 'Keep practising!', tone: 'peach' });
  });
});
