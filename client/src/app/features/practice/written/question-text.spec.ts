import { blankText, formatDuration, isEmptyOption, splitBlank, splitTarget } from './question-text';

describe('question text helpers', () => {
  it('splits around the blank', () => {
    expect(splitBlank('She is ___ honest person.')).toEqual({
      before: 'She is ',
      after: ' honest person.',
    });
    expect(splitBlank('Although it rained, ___')).toEqual({
      before: 'Although it rained, ',
      after: '',
    });
  });

  it('finds the highlighted target word', () => {
    expect(splitTarget('The supply was **abundant** this year.')).toEqual({
      before: 'The supply was ',
      word: 'abundant',
      after: ' this year.',
    });
  });

  it('treats bracketed options as an empty blank', () => {
    expect(isEmptyOption('(no article)')).toBe(true);
    expect(isEmptyOption('the')).toBe(false);
    expect(blankText('(no word needed)')).toBe('—');
    expect(blankText('an')).toBe('an');
  });

  it('formats durations', () => {
    expect(formatDuration(42_400)).toBe('42s');
    expect(formatDuration(125_000)).toBe('2m 05s');
  });
});
