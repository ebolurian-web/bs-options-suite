/**
 * Vol surface analytics — pure transformations of an OptionChain into the
 * grid, smile, and skew structures the UI needs.
 *
 * Design:
 * - Recompute IV from bid-ask mid using our own Newton-Raphson solver for a
 *   cleaner surface than the provider's published IV (which is often stale
 *   or derived with a slightly different model).
 * - Use moneyness (K/S) not absolute strike on the x-axis so surfaces are
 *   comparable across tickers.
 * - Skip the liquidity wings (moneyness < 0.5 or > 2.0) — those strikes
 *   rarely have real pricing and just noise up the surface.
 */

import type { OptionChain, OptionContract } from "./types";
import { priceBS, solveIV } from "./bs";

export type SurfaceContract = {
  strike: number;
  moneyness: number;
  callIV: number | null;
  putIV: number | null;
  /** Call delta at the recomputed IV — used for 25Δ strike lookups. */
  deltaCall: number | null;
};

export type ExpirySlice = {
  expiration: string;
  dte: number;
  T: number;
  label: string;
  atmIV: number | null;
  contracts: SurfaceContract[];
};

export type VolSurface = {
  ticker: string;
  spot: number;
  expirations: ExpirySlice[];
  /** A stable human-readable summary for ARIA descriptions. */
  summary: string;
  builtAt: number;
};

type BuildParams = {
  chain: OptionChain;
  riskFreeRate: number; // decimal
  dividendYield?: number; // decimal
};

export function buildVolSurface({ chain, riskFreeRate, dividendYield = 0 }: BuildParams): VolSurface {
  const spot = chain.quote.price;
  const byExpiry = new Map<string, OptionContract[]>();
  for (const c of chain.contracts) {
    const list = byExpiry.get(c.expiration) ?? [];
    list.push(c);
    byExpiry.set(c.expiration, list);
  }

  const nowSec = Date.now() / 1000;
  const slices: ExpirySlice[] = [];

  for (const expiration of chain.expirations) {
    const rows = byExpiry.get(expiration) ?? [];
    if (!rows.length) continue;
    const dte = Math.max(0.5, (rows[0].expirationTs - nowSec) / 86400);
    const T = dte / 365.25;

    const callsByK = new Map<number, OptionContract>();
    const putsByK = new Map<number, OptionContract>();
    for (const c of rows) {
      if (c.type === "call") callsByK.set(c.strike, c);
      else putsByK.set(c.strike, c);
    }
    const strikes = Array.from(new Set([...callsByK.keys(), ...putsByK.keys()])).sort(
      (a, b) => a - b,
    );

    const contracts: SurfaceContract[] = [];
    for (const strike of strikes) {
      const moneyness = strike / spot;
      if (moneyness < 0.5 || moneyness > 2.0) continue;
      const call = callsByK.get(strike);
      const put = putsByK.get(strike);
      const callIV = recomputeIV(call, spot, strike, T, riskFreeRate, dividendYield, "call");
      const putIV = recomputeIV(put, spot, strike, T, riskFreeRate, dividendYield, "put");
      let deltaCall: number | null = null;
      const ivForDelta = callIV ?? putIV;
      if (ivForDelta != null) {
        const res = priceBS({ S: spot, K: strike, T, r: riskFreeRate, sigma: ivForDelta, q: dividendYield });
        if (res) deltaCall = res.greeks.deltaCall;
      }
      if (callIV != null || putIV != null) {
        contracts.push({ strike, moneyness, callIV, putIV, deltaCall });
      }
    }
    if (contracts.length < 2) continue;

    slices.push({
      expiration,
      dte,
      T,
      label: formatExpiryLabel(expiration, dte),
      atmIV: interpAt(
        contracts.map((c) => ({ x: c.moneyness, y: c.callIV ?? c.putIV })),
        1.0,
      ),
      contracts,
    });
  }

  const summary = buildSummary(chain.ticker, slices);

  return {
    ticker: chain.ticker,
    spot,
    expirations: slices,
    summary,
    builtAt: Date.now(),
  };
}

function recomputeIV(
  contract: OptionContract | undefined,
  spot: number,
  strike: number,
  T: number,
  r: number,
  q: number,
  type: "call" | "put",
): number | null {
  if (!contract) return null;
  // Prefer mid (bid+ask)/2; fall back to last trade if the book is one-sided
  const mid = contract.mid ?? contract.last;
  if (mid == null || mid <= 0) {
    // Fall back to provider's published IV
    return contract.iv && contract.iv > 0 ? contract.iv : null;
  }
  const result = solveIV({ S: spot, K: strike, T, r, q }, mid, type);
  if (!result.ok) {
    return contract.iv && contract.iv > 0 ? contract.iv : null;
  }
  return result.sigma;
}

/**
 * Piecewise-linear interpolation of a y-value at a given x, ignoring null/zero
 * y's. Used for ATM IV (moneyness = 1) and 25Δ strike lookups.
 */
export function interpAt(
  points: Array<{ x: number; y: number | null }>,
  x0: number,
): number | null {
  const filtered = points
    .filter((p): p is { x: number; y: number } => p.y != null && p.y > 0)
    .sort((a, b) => a.x - b.x);
  if (!filtered.length) return null;
  if (x0 <= filtered[0].x) return filtered[0].y;
  if (x0 >= filtered[filtered.length - 1].x) return filtered[filtered.length - 1].y;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i].x >= x0) {
      const a = filtered[i - 1];
      const b = filtered[i];
      const t = (x0 - a.x) / (b.x - a.x || 1);
      return a.y + t * (b.y - a.y);
    }
  }
  return null;
}

/** Least-squares polynomial fit. Used for smooth smile overlays. */
export function polyFit(xs: number[], ys: number[], degree: number): number[] {
  const n = degree + 1;
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const b = Array(n).fill(0);
  for (let i = 0; i < xs.length; i++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r][c] += Math.pow(xs[i], r + c);
      b[r] += ys[i] * Math.pow(xs[i], r);
    }
  }
  for (let i = 0; i < n; i++) {
    const pivot = A[i][i] || 1e-12;
    for (let j = 0; j < n; j++) A[i][j] /= pivot;
    b[i] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = A[k][i];
      for (let j = 0; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  return b;
}

export function evalPoly(coef: number[], x: number): number {
  let y = 0;
  for (let i = coef.length - 1; i >= 0; i--) y = y * x + coef[i];
  return y;
}

/** Find the contract whose call-delta is closest to a target (e.g., 0.25 for 25Δ call). */
export function findByDelta(
  slice: ExpirySlice,
  targetCallDelta: number,
): SurfaceContract | null {
  let best: SurfaceContract | null = null;
  let bestDiff = Infinity;
  for (const c of slice.contracts) {
    if (c.deltaCall == null) continue;
    const diff = Math.abs(c.deltaCall - targetCallDelta);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

export type SkewPoint = {
  dte: number;
  atmIV: number | null;
  rr25: number | null; // 25Δ risk reversal = IV(25Δ put) - IV(25Δ call)
  bf25: number | null; // 25Δ butterfly = (IV25P + IV25C)/2 - ATM
};

/** Per-expiry skew metrics. */
export function computeSkewSeries(surface: VolSurface): SkewPoint[] {
  return surface.expirations.map((slice) => {
    // 25Δ call: call delta ≈ 0.25
    const c25 = findByDelta(slice, 0.25);
    // 25Δ put: put delta ≈ -0.25; since deltaCall = deltaPut + 1 (approx), target 0.75
    const p25 = findByDelta(slice, 0.75);
    const iv25c = c25?.callIV ?? c25?.putIV ?? null;
    const iv25p = p25?.putIV ?? p25?.callIV ?? null;
    const rr25 = iv25c != null && iv25p != null ? iv25p - iv25c : null;
    const bf25 =
      iv25c != null && iv25p != null && slice.atmIV != null
        ? (iv25p + iv25c) / 2 - slice.atmIV
        : null;
    return { dte: slice.dte, atmIV: slice.atmIV, rr25, bf25 };
  });
}

export type TermStructureClass = "contango" | "backwardation" | "flat";
export function classifyTermStructure(surface: VolSurface): {
  klass: TermStructureClass;
  slope: number | null;
} {
  const xs = surface.expirations.filter((e) => e.atmIV != null);
  if (xs.length < 2) return { klass: "flat", slope: null };
  const front = xs[0].atmIV!;
  const back = xs[xs.length - 1].atmIV!;
  const slope = back - front;
  if (slope > 0.01) return { klass: "contango", slope };
  if (slope < -0.01) return { klass: "backwardation", slope };
  return { klass: "flat", slope };
}

function buildSummary(ticker: string, slices: ExpirySlice[]): string {
  if (!slices.length) return `No options-chain data available for ${ticker}.`;
  const front = slices[0];
  const back = slices[slices.length - 1];
  const frontAtm = front.atmIV != null ? `${(front.atmIV * 100).toFixed(1)}%` : null;
  const backAtm = back.atmIV != null ? `${(back.atmIV * 100).toFixed(1)}%` : null;
  const frontDays = Math.round(front.dte);
  const backDays = Math.round(back.dte);

  if (frontAtm == null || backAtm == null) {
    return `The market is pricing options on ${ticker} across ${slices.length} expiry dates, from ${frontDays} to ${backDays} days out.`;
  }

  const frontPct = front.atmIV!;
  const backPct = back.atmIV!;
  let trend: string;
  if (backPct > frontPct * 1.03) {
    trend = `rising to ${backAtm} for the ${backDays}-day expiry — the market expects more uncertainty further out (contango)`;
  } else if (backPct < frontPct * 0.97) {
    trend = `falling to ${backAtm} for the ${backDays}-day expiry — near-term uncertainty is priced higher than the long term (backwardation)`;
  } else {
    trend = `holding near ${backAtm} for the ${backDays}-day expiry — roughly flat across time`;
  }
  return `The market is pricing short-term ${ticker} options at ${frontAtm} expected annual volatility (${frontDays} days out), ${trend}. Built from ${slices.length} expiry dates in the live chain.`;
}

function formatExpiryLabel(iso: string, dte: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  return `${date.toLocaleDateString("en-US", opts)} (${Math.round(dte)}d)`;
}

/**
 * Build a strike × expiry × IV grid for the 3D surface, interpolating
 * to a common moneyness axis (0.7 → 1.3 in 25 steps).
 */
export function buildSurfaceGrid(surface: VolSurface): {
  xAxis: number[]; // moneyness
  yAxis: number[]; // DTE
  z: (number | null)[][]; // IV % with nulls for missing data
} {
  const N = 25;
  const xAxis: number[] = [];
  for (let i = 0; i <= N; i++) xAxis.push(0.7 + ((1.3 - 0.7) * i) / N);
  const yAxis = surface.expirations.map((e) => e.dte);
  const z: (number | null)[][] = surface.expirations.map((slice) => {
    // Prefer call IV on the upside (K/S ≥ 1), put IV on the downside
    const points = slice.contracts.map((c) => ({
      x: c.moneyness,
      y: c.moneyness >= 1 ? (c.callIV ?? c.putIV) : (c.putIV ?? c.callIV),
    }));
    return xAxis.map((x) => {
      const iv = interpAt(points, x);
      return iv != null ? +(iv * 100).toFixed(2) : null;
    });
  });
  return { xAxis, yAxis, z };
}
