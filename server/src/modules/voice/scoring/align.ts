import { canonical } from './normalize.js';

export type AlignOpType = 'ok' | 'close' | 'sub' | 'missing' | 'extra';

export interface AlignOp {
  type: AlignOpType;
  /** Expected word (absent for "extra"). */
  ref?: string;
  /** Word that was heard (absent for "missing"). */
  heard?: string;
}

export interface Alignment {
  ops: AlignOp[];
  /** 0–100: share of expected words said correctly (close matches count half). */
  accuracy: number;
  counts: Record<AlignOpType, number>;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/** "close": probably the right word, mispronounced or misheard (e.g. "manager" / "managers"). */
function similarity(ref: string, heard: string): 'ok' | 'close' | 'sub' {
  const a = canonical(ref);
  const b = canonical(heard);
  if (a === b) return 'ok';
  if (
    Math.min(a.length, b.length) >= 4 &&
    editDistance(a, b) / Math.max(a.length, b.length) <= 0.34
  ) {
    return 'close';
  }
  return 'sub';
}

const COST = { ok: 0, close: 0.5, sub: 1, missing: 1, extra: 1 } as const;

/** Word-level alignment (Levenshtein with partial credit) between expected and heard words. */
export function align(expected: string[], heard: string[]): Alignment {
  const n = expected.length;
  const m = heard.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i]![0] = i;
  for (let j = 1; j <= m; j++) cost[0]![j] = j;
  const match: ('ok' | 'close' | 'sub')[][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const kind = similarity(expected[i - 1]!, heard[j - 1]!);
      match[i]![j] = kind;
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + COST[kind],
        cost[i - 1]![j]! + COST.missing,
        cost[i]![j - 1]! + COST.extra,
      );
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i]![j] === cost[i - 1]![j - 1]! + COST[match[i]![j]!]) {
      ops.push({ type: match[i]![j]!, ref: expected[i - 1], heard: heard[j - 1] });
      i--;
      j--;
    } else if (i > 0 && cost[i]![j] === cost[i - 1]![j]! + COST.missing) {
      ops.push({ type: 'missing', ref: expected[i - 1] });
      i--;
    } else {
      ops.push({ type: 'extra', heard: heard[j - 1] });
      j--;
    }
  }
  ops.reverse();

  const counts = { ok: 0, close: 0, sub: 0, missing: 0, extra: 0 };
  for (const op of ops) counts[op.type]++;
  const accuracy = n
    ? Math.max(0, Math.round(((counts.ok + 0.5 * counts.close - 0.25 * counts.extra) / n) * 100))
    : 0;
  return { ops, accuracy: Math.min(100, accuracy), counts };
}
