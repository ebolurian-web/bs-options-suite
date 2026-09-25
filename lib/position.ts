/**
 * Position math shared by Trade ideas, the Option explorer and the Strategy
 * builder. Pure functions.
 *
 * A position is a list of legs: options (×100 shares per contract) and/or
 * stock. Legs may expire on different dates: `tExtra` is how much longer a
 * leg lives past the position's reference expiry (the earliest one), so a
 * calendar spread's back month is still marked to model at the front expiry.
 */

import { normPdf, priceBS } from "./bs";

export type PositionLeg = {
  action: "buy" | "sell";
  type: "call" | "put" | "stock";
  /** Option strike. For stock: the entry price (same as `premium`). */
  strike: number;
  /** Contracts for options, shares for stock. */
  qty: number;
  /** Entry price per share (option premium, or stock entry price). */
  premium: number;
  /** Implied volatility used to mark this leg, decimal. Ignored for stock. */
  iv: number;
  /** Years this leg lives beyond the reference expiry. 0/undefined = same expiry. */
  tExtra?: number;
  /** Optional flat-σ Black-Scholes reference price, for display. */
  modelPrice?: number | null;
};

const MULT = 100;
const dirOf = (l: PositionLeg) => (l.action === "buy" ? 1 : -1);
const sizeOf = (l: PositionLeg) => (l.type === "stock" ? l.qty : l.qty * MULT);

/** Days until 4pm ET (≈20:00 UTC) on the expiration date. */
export function daysToExpiration(iso: string, nowMs = Date.now()): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.max(0, (Date.UTC(y, m - 1, d, 20) - nowMs) / 86400_000);
}

/** Net cash at entry: positive = you pay (debit), negative = you collect (credit). */
export function netCost(legs: PositionLeg[]): number {
  return legs.reduce((s, l) => s + dirOf(l) * l.premium * sizeOf(l), 0);
}

/** Option legs' net premium only (stock excluded): positive = debit. */
export function netOptionPremium(legs: PositionLeg[]): number {
  return netCost(legs.filter((l) => l.type !== "stock"));
}

/** P&L at the reference expiry treating every leg at intrinsic value. */
export function expiryPnl(legs: PositionLeg[], S: number): number {
  let pnl = 0;
  for (const l of legs) {
    const value =
      l.type === "stock" ? S : l.type === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    pnl += dirOf(l) * (value - l.premium) * sizeOf(l);
  }
  return pnl;
}

/**
 * Mark-to-model P&L with `tYears` left to the reference expiry: each option
 * re-priced with Black-Scholes at its own IV (+ `ivShift`, decimal points).
 * Legs whose own time has run out are valued at intrinsic.
 */
export function scenarioPnl(
  legs: PositionLeg[],
  S: number,
  tYears: number,
  ivShift: number,
  r: number,
  q = 0,
): number {
  let pnl = 0;
  for (const l of legs) {
    let value: number;
    if (l.type === "stock") {
      value = S;
    } else {
      const t = Math.max(0, tYears) + (l.tExtra ?? 0);
      if (t <= 1e-6) {
        value = l.type === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
      } else {
        // priceBS rejects S = 0; a hair above it gives the correct limit.
        const res = priceBS({ S: Math.max(S, 1e-6), K: l.strike, T: t, r, q, sigma: Math.max(0.01, l.iv + ivShift) });
        if (!res) continue;
        value = l.type === "call" ? res.call : res.put;
      }
    }
    pnl += dirOf(l) * (value - l.premium) * sizeOf(l);
  }
  return pnl;
}

const singleExpiry = (legs: PositionLeg[]) => legs.every((l) => l.type === "stock" || !(l.tExtra ?? 0));

export type PayoffProfile = {
  maxLoss: number;
  maxGain: number;
  breakEvens: number[];
  /** False when legs expire on different dates: figures come from a price grid. */
  exact: boolean;
};

/**
 * Max gain/loss and break-evens at the reference expiry.
 * Single-expiry positions are piecewise linear, so extremes sit at a strike,
 * at 0, or run off to infinity — computed exactly. Multi-expiry positions
 * are sampled on a price grid instead.
 */
export function payoffProfile(legs: PositionLeg[], r = 0, q = 0): PayoffProfile {
  if (!legs.length) return { maxLoss: 0, maxGain: 0, breakEvens: [], exact: true };
  const strikes = Array.from(new Set(legs.map((l) => l.strike))).sort((a, b) => a - b);
  const top = (strikes[strikes.length - 1] ?? 1) * 4;
  // Slope beyond the highest strike: calls and stock contribute.
  const tailSlope = legs.reduce(
    (s, l) => s + (l.type === "put" ? 0 : dirOf(l) * sizeOf(l)),
    0,
  );

  let xs: number[];
  let ys: number[];
  let exact = true;
  if (singleExpiry(legs)) {
    xs = [0, ...strikes, top];
    ys = xs.map((x) => expiryPnl(legs, x));
  } else {
    exact = false;
    xs = [];
    const N = 600;
    for (let i = 0; i <= N; i++) xs.push((top * i) / N);
    ys = xs.map((x) => scenarioPnl(legs, x, 0, 0, r, q));
  }

  const breakEvens: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const t = a / (a - b);
      const be = xs[i - 1] + t * (xs[i] - xs[i - 1]);
      if (!breakEvens.some((x) => Math.abs(x - be) < 1e-6)) breakEvens.push(be);
    }
  }
  const finiteMax = Math.max(...ys);
  const finiteMin = Math.min(...ys);
  return {
    maxGain: tailSlope > 0 ? Infinity : finiteMax,
    maxLoss: tailSlope < 0 ? Infinity : Math.max(0, -finiteMin),
    breakEvens,
    exact,
  };
}

/**
 * P(P&L at reference expiry > 0) under the risk-neutral log-normal with
 * volatility `sigma`. Numerical integration over ±6σ — deterministic.
 */
export function probabilityOfProfit(
  legs: PositionLeg[],
  spot: number,
  sigma: number,
  T: number,
  r: number,
  q = 0,
): number {
  const pnlAt = singleExpiry(legs)
    ? (S: number) => expiryPnl(legs, S)
    : (S: number) => scenarioPnl(legs, S, 0, 0, r, q);
  if (!(T > 0) || !(sigma > 0)) return pnlAt(spot) > 0 ? 1 : 0;
  const sd = sigma * Math.sqrt(T);
  const mu = Math.log(spot) + (r - q - 0.5 * sigma * sigma) * T;
  const N = singleExpiry(legs) ? 1200 : 400;
  const dz = 12 / N;
  let p = 0;
  for (let i = 0; i < N; i++) {
    const z = -6 + (i + 0.5) * dz;
    if (pnlAt(Math.exp(mu + sd * z)) > 0) p += normPdf(z) * dz;
  }
  return Math.min(1, Math.max(0, p));
}

/** Risk-neutral log-normal density of the stock price at T, for charts. */
export function priceDensity(S: number, spot: number, sigma: number, T: number, r: number, q = 0): number {
  if (!(S > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const sd = sigma * Math.sqrt(T);
  const mu = Math.log(spot) + (r - q - 0.5 * sigma * sigma) * T;
  const z = (Math.log(S) - mu) / sd;
  return normPdf(z) / (S * sd);
}

// ── Position Greeks, in dollars ──────────────────────────────────────

export type DollarGreeks = {
  /** $ change for a +$1 move in the stock. */
  perDollar: number;
  /** $ change in position delta for a +$1 move (gamma, in shares). */
  gammaShares: number;
  /** $ change per calendar day, all else equal. */
  perDay: number;
  /** $ change per +1 point of implied vol. */
  perVolPoint: number;
};

/** Position Greeks today. `T` is years to the reference expiry. */
export function dollarGreeks(legs: PositionLeg[], spot: number, T: number, r: number, q = 0): DollarGreeks {
  let d = 0,
    g = 0,
    th = 0,
    v = 0;
  for (const l of legs) {
    const m = dirOf(l) * sizeOf(l);
    if (l.type === "stock") {
      d += m;
      continue;
    }
    const res = priceBS({ S: spot, K: l.strike, T: Math.max(1e-4, T + (l.tExtra ?? 0)), r, q, sigma: l.iv });
    if (!res) continue;
    d += m * (l.type === "call" ? res.greeks.deltaCall : res.greeks.deltaPut);
    g += m * res.greeks.gamma;
    th += m * (l.type === "call" ? res.greeks.thetaCallPerDay : res.greeks.thetaPutPerDay);
    v += m * res.greeks.vegaPer1Pct;
  }
  return { perDollar: d, gammaShares: g, perDay: th, perVolPoint: v };
}
