import type { WindowKey } from "./windows";

/** Recency order, most recent first. */
const RECENCY_ORDER: readonly WindowKey[] = ["d30", "d3m", "d6m", "g6m", "all"];

const WEIGHTS: Record<WindowKey, number> = {
  d30: 1.0,
  d3m: 0.7,
  d6m: 0.55,
  g6m: 0.3,
  all: 0.15,
};

export function windowWeight(key: WindowKey): number {
  return WEIGHTS[key];
}

/** The most recent window in `keys`; caller guarantees a non-empty list. */
export function mostRecentWindow(keys: WindowKey[]): WindowKey {
  const present = new Set(keys);
  for (const key of RECENCY_ORDER) {
    if (present.has(key)) return key;
  }
  throw new Error("mostRecentWindow: empty window list");
}

/** Weighted sum of one company's contributions: Σ weight × frequency/100. */
export function rawScore(
  parts: { window: WindowKey; frequency: number }[]
): number {
  return parts.reduce(
    (sum, p) => sum + windowWeight(p.window) * (p.frequency / 100),
    0
  );
}

/**
 * Linear-interpolated percentile of a pre-sorted array.
 * The brief's floor-index variant contradicted its own expected test value
 * (see ledger ruling); interpolated p99 is what the test table pins.
 */
function percentile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = pos - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

/**
 * Scale raw scores so the 99th percentile maps to 100 (outliers clamp at
 * 100). Empty input or a zero p99 yields zeros.
 */
export function normalizeScores(raws: number[]): number[] {
  if (raws.length === 0) return [];
  const sorted = [...raws].sort((a, b) => a - b);
  const p99 = percentile(sorted, 0.99);
  if (p99 <= 0) return raws.map(() => 0);
  return raws.map((raw) =>
    Math.min(100, Math.max(0, Math.round((100 * raw) / p99)))
  );
}
