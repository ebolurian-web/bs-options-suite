/**
 * Historical volatility cone analytics — pure functions.
 *
 * - Rolling realized volatility over sliding windows (annualized).
 * - Percentile decomposition (p10/p25/p50/p75/p90) for the cone bands.
 * - HV rank (current vs 1yr min/max) and HV percentile (% of days ≤ current).
 */

import type { HistoricalBar } from "./types";

export const DEFAULT_WINDOWS = [20, 60, 120] as const;
export const PERCENTILES = [10, 25, 50, 75, 90] as const;

/**
 * Annualized rolling realized volatility: for each index i ≥ window,
 * take the last `window` log returns and compute sqrt(var * 252).
 * Returns one number per rolling position (length = bars.length - window).
 */
export function rollingRealizedVol(bars: HistoricalBar[], window: number): number[] {
  if (bars.length <= window + 1) return [];
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
    else rets.push(0);
  }
  const out: number[] = [];
  for (let end = window; end <= rets.length; end++) {
    const slice = rets.slice(end - window, end);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    out.push(Math.sqrt(varr * 252));
  }
  return out;
}

/** Quantile by linear interpolation on the sorted sample. */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export type ConeWindow = {
  window: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Most recent value of this rolling window (the "current realized"). */
  latest: number | null;
};

/** Build the cone data structure for a set of windows. */
export function buildConeWindows(
  bars: HistoricalBar[],
  windows: readonly number[] = DEFAULT_WINDOWS,
): ConeWindow[] {
  const out: ConeWindow[] = [];
  for (const w of windows) {
    const values = rollingRealizedVol(bars, w);
    if (values.length < 5) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const last = values[values.length - 1];
    out.push({
      window: w,
      p10: quantile(sorted, 10),
      p25: quantile(sorted, 25),
      p50: quantile(sorted, 50),
      p75: quantile(sorted, 75),
      p90: quantile(sorted, 90),
      latest: typeof last === "number" && Number.isFinite(last) ? last : null,
    });
  }
  return out;
}

/**
 * HV rank: where the current value sits in the 1yr min-max range (0-100).
 */
export function hvRank(values: number[], current: number): number | null {
  if (!values.length || !Number.isFinite(current)) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  if (mx <= mn) return null;
  return Math.max(0, Math.min(100, ((current - mn) / (mx - mn)) * 100));
}

/**
 * HV percentile: fraction of sample ≤ current (0-100).
 */
export function hvPercentile(values: number[], current: number): number | null {
  if (!values.length || !Number.isFinite(current)) return null;
  let below = 0;
  for (const v of values) if (v <= current) below++;
  return (below / values.length) * 100;
}
