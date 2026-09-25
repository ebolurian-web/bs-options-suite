/**
 * Trade ideas — turn a directional view into a short list of concrete,
 * market-priced option trades. Pure functions.
 *
 * - Candidates are built per view (up / down / flat / big move) from the
 *   strikes actually listed for the chosen expiry.
 * - Every leg is priced at the live bid/ask mid with its own IV, so skew is
 *   respected instead of assuming one flat σ.
 * - Max gain/loss and break-evens are exact (expiry P&L is piecewise linear
 *   in S, so extremes sit at a strike, at 0, or run off to infinity).
 * - Probability of profit integrates the risk-neutral log-normal at ATM IV —
 *   deterministic, so numbers don't flicker between renders.
 */

import { normPdf, priceBS, solveIV } from "./bs";
import type { HistoricalBar, OptionChain, OptionContract } from "./types";
import { hvRank, rollingRealizedVol } from "./vol-cone";

export type View = "up" | "down" | "flat" | "big";

export const VIEWS: Array<{ id: View; label: string; short: string }> = [
  { id: "up", label: "Go up", short: "Up" },
  { id: "down", label: "Go down", short: "Down" },
  { id: "flat", label: "Stay flat", short: "Flat" },
  { id: "big", label: "Move big", short: "Big" },
];

export type IdeaLeg = {
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  qty: number;
  /** Per-share market price (bid/ask mid, else last). */
  premium: number;
  /** Per-share Black-Scholes price at the expiry's ATM IV (flat-σ model). */
  modelPrice: number | null;
  /** This contract's own implied volatility, decimal. */
  iv: number;
};

export type TradeIdea = {
  id: string;
  name: string;
  blurb: string;
  legs: IdeaLeg[];
  /** Net cash at entry in dollars: positive = you pay (debit), negative = you collect (credit). */
  cost: number;
  /** Worst case at expiry, as a positive dollar amount. Infinity if uncapped. */
  maxLoss: number;
  /** Best case at expiry in dollars. Infinity if uncapped. */
  maxGain: number;
  breakEvens: number[];
  /** Probability the trade finishes with a profit at expiry, 0–1. */
  pop: number;
  /** P&L at expiry if the user's view plays out exactly. */
  pnlIfRight: number;
  overBudget: boolean;
  best: boolean;
};

export type IdeasResult = {
  ideas: TradeIdea[];
  spot: number;
  /** ATM implied vol for the chosen expiry, decimal. */
  atmIv: number;
  /** Years to expiry. */
  T: number;
  daysToExpiry: number;
  /** One-standard-deviation expected move to expiry, dollars. */
  expectedMove: number;
};

const MULT = 100;

// ── Dates ────────────────────────────────────────────────────────────

/** Days until 4pm ET (≈20:00 UTC) on the expiration date. */
export function daysToExpiration(iso: string, nowMs = Date.now()): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.max(0, (Date.UTC(y, m - 1, d, 20) - nowMs) / 86400_000);
}

/** Pick the listed expiry closest to ~45 days out, skipping the very front. */
export function defaultExpiration(expirations: string[], nowMs = Date.now()): string | null {
  if (!expirations.length) return null;
  const usable = expirations.filter((e) => daysToExpiration(e, nowMs) >= 7);
  const pool = usable.length ? usable : expirations;
  let best = pool[0];
  let bestDiff = Infinity;
  for (const e of pool) {
    const diff = Math.abs(daysToExpiration(e, nowMs) - 45);
    if (diff < bestDiff) {
      best = e;
      bestDiff = diff;
    }
  }
  return best;
}

// ── P&L math ─────────────────────────────────────────────────────────

const dirOf = (l: IdeaLeg) => (l.action === "buy" ? 1 : -1);

export function netCost(legs: IdeaLeg[]): number {
  return legs.reduce((s, l) => s + dirOf(l) * l.premium * l.qty * MULT, 0);
}

export function expiryPnl(legs: IdeaLeg[], S: number): number {
  let pnl = 0;
  for (const l of legs) {
    const intrinsic = l.type === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    pnl += dirOf(l) * (intrinsic - l.premium) * l.qty * MULT;
  }
  return pnl;
}

/**
 * Mark-to-model P&L at an earlier date: each leg re-priced with Black-Scholes
 * at its own IV (shifted by `ivShift`, in decimal points) with `tYears` left.
 */
export function scenarioPnl(
  legs: IdeaLeg[],
  S: number,
  tYears: number,
  ivShift: number,
  r: number,
  q = 0,
): number {
  if (tYears <= 1e-6) return expiryPnl(legs, S);
  let pnl = 0;
  for (const l of legs) {
    const res = priceBS({ S, K: l.strike, T: tYears, r, q, sigma: Math.max(0.01, l.iv + ivShift) });
    if (!res) continue;
    const value = l.type === "call" ? res.call : res.put;
    pnl += dirOf(l) * (value - l.premium) * l.qty * MULT;
  }
  return pnl;
}

/** Exact extremes and break-evens of the piecewise-linear expiry payoff. */
export function payoffProfile(legs: IdeaLeg[]): {
  maxLoss: number;
  maxGain: number;
  breakEvens: number[];
} {
  const strikes = Array.from(new Set(legs.map((l) => l.strike))).sort((a, b) => a - b);
  const top = (strikes[strikes.length - 1] ?? 1) * 4;
  const xs = [0, ...strikes, top];
  const ys = xs.map((x) => expiryPnl(legs, x));
  // Slope beyond the highest strike: only calls contribute.
  const tailSlope = legs.reduce(
    (s, l) => s + (l.type === "call" ? dirOf(l) * l.qty * MULT : 0),
    0,
  );
  const finiteMax = Math.max(...ys);
  const finiteMin = Math.min(...ys);
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
  return {
    maxGain: tailSlope > 0 ? Infinity : finiteMax,
    maxLoss: tailSlope < 0 ? Infinity : Math.max(0, -finiteMin),
    breakEvens,
  };
}

/**
 * P(expiry P&L > 0) under the risk-neutral log-normal with volatility `sigma`.
 * Numerical integration over ±6σ — smooth and deterministic.
 */
export function probabilityOfProfit(
  legs: IdeaLeg[],
  spot: number,
  sigma: number,
  T: number,
  r: number,
  q = 0,
): number {
  if (!(T > 0) || !(sigma > 0)) return expiryPnl(legs, spot) > 0 ? 1 : 0;
  const sd = sigma * Math.sqrt(T);
  const mu = Math.log(spot) + (r - q - 0.5 * sigma * sigma) * T;
  const N = 1200;
  const lo = -6;
  const dz = 12 / N;
  let p = 0;
  for (let i = 0; i < N; i++) {
    const z = lo + (i + 0.5) * dz;
    if (expiryPnl(legs, Math.exp(mu + sd * z)) > 0) p += normPdf(z) * dz;
  }
  return Math.min(1, Math.max(0, p));
}

// ── Chain helpers ────────────────────────────────────────────────────

const priceOf = (c: OptionContract): number | null => {
  const px = c.mid ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : null) ?? c.last;
  return px != null && px > 0 ? px : null;
};

type Book = {
  get: (type: "call" | "put", strike: number) => OptionContract | undefined;
  strikes: (type: "call" | "put") => number[];
};

function makeBook(chain: OptionChain, expiry: string): Book {
  const map = new Map<string, OptionContract>();
  const byType = { call: new Set<number>(), put: new Set<number>() };
  for (const c of chain.contracts) {
    if (c.expiration !== expiry || priceOf(c) == null) continue;
    map.set(`${c.type}:${c.strike}`, c);
    byType[c.type].add(c.strike);
  }
  const sorted = {
    call: Array.from(byType.call).sort((a, b) => a - b),
    put: Array.from(byType.put).sort((a, b) => a - b),
  };
  return {
    get: (type, strike) => map.get(`${type}:${strike}`),
    strikes: (type) => sorted[type],
  };
}

/** Nearest listed strike to `x`, optionally restricted by a predicate. */
function nearest(strikes: number[], x: number, ok: (k: number) => boolean = () => true): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const k of strikes) {
    if (!ok(k)) continue;
    const d = Math.abs(k - x);
    if (d < bestDiff) {
      best = k;
      bestDiff = d;
    }
  }
  return best;
}

/** ATM implied vol for an expiry: average of call/put IV at the nearest strike. */
export function atmImpliedVol(chain: OptionChain, expiry: string, r: number, q = 0): number | null {
  const book = makeBook(chain, expiry);
  const spot = chain.quote.price;
  const T = daysToExpiration(expiry) / 365.25;
  const all = Array.from(new Set([...book.strikes("call"), ...book.strikes("put")])).sort((a, b) => a - b);
  const K = nearest(all, spot);
  if (K == null) return chain.quote.iv30;
  const ivs: number[] = [];
  for (const type of ["call", "put"] as const) {
    const c = book.get(type, K);
    if (!c) continue;
    const iv = contractIv(c, spot, T, r, q);
    if (iv != null) ivs.push(iv);
  }
  if (ivs.length) return ivs.reduce((a, b) => a + b, 0) / ivs.length;
  return chain.quote.iv30;
}

function contractIv(c: OptionContract, spot: number, T: number, r: number, q: number): number | null {
  if (c.iv != null && c.iv > 0.005 && c.iv < 5) return c.iv;
  const px = priceOf(c);
  if (px == null || T <= 0) return null;
  const solved = solveIV({ S: spot, K: c.strike, T, r, q }, px, c.type);
  return solved.ok ? solved.sigma : null;
}

// ── Idea construction ────────────────────────────────────────────────

type Spec = {
  id: string;
  name: string;
  blurb: string;
  legs: Array<{ action: "buy" | "sell"; type: "call" | "put"; strike: number | null; qty?: number }>;
};

function specsFor(view: View, book: Book, spot: number, target: number, em: number): Spec[] {
  const C = book.strikes("call");
  const P = book.strikes("put");
  const above = (ks: number[], k: number | null) => (k == null ? null : ks.find((x) => x > k) ?? null);
  const below = (ks: number[], k: number | null) =>
    k == null ? null : [...ks].reverse().find((x) => x < k) ?? null;

  switch (view) {
    case "up": {
      const kCall = nearest(C, spot, (k) => k >= spot);
      const k1 = nearest(C, spot);
      const k2 = nearest(C, target, (k) => k1 != null && k > k1) ?? above(C, k1);
      const width = k1 != null && k2 != null ? k2 - k1 : em * 0.5;
      const kShort = nearest(P, spot - 0.25 * em, (k) => k < spot);
      const kLong = nearest(P, (kShort ?? spot) - width, (k) => kShort != null && k < kShort) ?? below(P, kShort);
      return [
        {
          id: "bull-call",
          name: "Bull call spread",
          blurb: "Cheaper than a call. Profit is capped at the short strike.",
          legs: [
            { action: "buy", type: "call", strike: k1 },
            { action: "sell", type: "call", strike: k2 },
          ],
        },
        {
          id: "long-call",
          name: "Long call",
          blurb: "Unlimited upside, but you need a big move to beat the premium.",
          legs: [{ action: "buy", type: "call", strike: kCall }],
        },
        {
          id: "bull-put",
          name: "Bull put spread",
          blurb: "Collect a credit. Wins if the stock just stays above the short put.",
          legs: [
            { action: "sell", type: "put", strike: kShort },
            { action: "buy", type: "put", strike: kLong },
          ],
        },
      ];
    }
    case "down": {
      const kPut = nearest(P, spot, (k) => k <= spot);
      const k1 = nearest(P, spot);
      const k2 = nearest(P, target, (k) => k1 != null && k < k1) ?? below(P, k1);
      const width = k1 != null && k2 != null ? k1 - k2 : em * 0.5;
      const kShort = nearest(C, spot + 0.25 * em, (k) => k > spot);
      const kLong = nearest(C, (kShort ?? spot) + width, (k) => kShort != null && k > kShort) ?? above(C, kShort);
      return [
        {
          id: "bear-put",
          name: "Bear put spread",
          blurb: "Cheaper than a put. Profit is capped at the short strike.",
          legs: [
            { action: "buy", type: "put", strike: k1 },
            { action: "sell", type: "put", strike: k2 },
          ],
        },
        {
          id: "long-put",
          name: "Long put",
          blurb: "Large downside payoff, but the premium decays every day.",
          legs: [{ action: "buy", type: "put", strike: kPut }],
        },
        {
          id: "bear-call",
          name: "Bear call spread",
          blurb: "Collect a credit. Wins if the stock just stays below the short call.",
          legs: [
            { action: "sell", type: "call", strike: kShort },
            { action: "buy", type: "call", strike: kLong },
          ],
        },
      ];
    }
    case "flat": {
      const c = target;
      const sp = nearest(P, c - 0.5 * em, (k) => k < c);
      const lp = nearest(P, c - em, (k) => sp != null && k < sp) ?? below(P, sp);
      const sc = nearest(C, c + 0.5 * em, (k) => k > c);
      const lc = nearest(C, c + em, (k) => sc != null && k > sc) ?? above(C, sc);
      const mid = nearest(C, c, (k) => P.includes(k));
      const wingP = nearest(P, c - em, (k) => mid != null && k < mid);
      const wingC = nearest(C, c + em, (k) => mid != null && k > mid);
      const bLo = nearest(C, c - 0.5 * em, (k) => mid != null && k < mid);
      const bHi = nearest(C, c + 0.5 * em, (k) => mid != null && k > mid);
      return [
        {
          id: "iron-condor",
          name: "Iron condor",
          blurb: "Collect a credit. Wins if the stock stays inside the short strikes.",
          legs: [
            { action: "buy", type: "put", strike: lp },
            { action: "sell", type: "put", strike: sp },
            { action: "sell", type: "call", strike: sc },
            { action: "buy", type: "call", strike: lc },
          ],
        },
        {
          id: "iron-butterfly",
          name: "Iron butterfly",
          blurb: "Bigger credit, narrower target. Best if it pins your price.",
          legs: [
            { action: "buy", type: "put", strike: wingP },
            { action: "sell", type: "put", strike: mid },
            { action: "sell", type: "call", strike: mid },
            { action: "buy", type: "call", strike: wingC },
          ],
        },
        {
          id: "call-butterfly",
          name: "Long call butterfly",
          blurb: "Small debit, big payoff if it finishes right at your price.",
          legs: [
            { action: "buy", type: "call", strike: bLo },
            { action: "sell", type: "call", strike: mid, qty: 2 },
            { action: "buy", type: "call", strike: bHi },
          ],
        },
      ];
    }
    case "big": {
      const k = nearest(C, spot, (x) => P.includes(x));
      const kc = nearest(C, spot + 0.5 * em, (x) => x > spot);
      const kp = nearest(P, spot - 0.5 * em, (x) => x < spot);
      return [
        {
          id: "long-straddle",
          name: "Long straddle",
          blurb: "Profits from a big move either way. Expensive to hold.",
          legs: [
            { action: "buy", type: "call", strike: k },
            { action: "buy", type: "put", strike: k },
          ],
        },
        {
          id: "long-strangle",
          name: "Long strangle",
          blurb: "Cheaper than a straddle, but needs an even bigger move.",
          legs: [
            { action: "buy", type: "call", strike: kc },
            { action: "buy", type: "put", strike: kp },
          ],
        },
      ];
    }
  }
}

export function buildIdeas({
  chain,
  expiry,
  view,
  target,
  maxRisk,
  r,
  q = 0,
}: {
  chain: OptionChain;
  expiry: string;
  view: View;
  target: number;
  /** Max acceptable loss in dollars; null = no limit. */
  maxRisk: number | null;
  r: number;
  q?: number;
}): IdeasResult | null {
  const spot = chain.quote.price;
  const days = daysToExpiration(expiry);
  const T = Math.max(1 / 365.25, days / 365.25);
  const atmIv = atmImpliedVol(chain, expiry, r, q) ?? 0.25;
  const em = spot * atmIv * Math.sqrt(T);
  const book = makeBook(chain, expiry);
  if (!book.strikes("call").length && !book.strikes("put").length) return null;

  const ideas: TradeIdea[] = [];
  for (const spec of specsFor(view, book, spot, target, em)) {
    if (spec.legs.some((l) => l.strike == null)) continue;
    const keys = spec.legs.map((l) => `${l.type}:${l.strike}`);
    // Degenerate if a strike was reused where two distinct contracts are needed.
    if (new Set(keys).size !== keys.length) continue;
    const legs: IdeaLeg[] = [];
    let ok = true;
    for (const l of spec.legs) {
      const c = book.get(l.type, l.strike as number);
      const px = c ? priceOf(c) : null;
      if (!c || px == null) {
        ok = false;
        break;
      }
      const iv = contractIv(c, spot, T, r, q) ?? atmIv;
      const model = priceBS({ S: spot, K: c.strike, T, r, q, sigma: atmIv });
      legs.push({
        action: l.action,
        type: l.type,
        strike: c.strike,
        qty: l.qty ?? 1,
        premium: px,
        modelPrice: model ? (l.type === "call" ? model.call : model.put) : null,
        iv,
      });
    }
    if (!ok) continue;
    const profile = payoffProfile(legs);
    const pnlIfRight =
      view === "big"
        ? Math.min(
            expiryPnl(legs, spot + Math.abs(target - spot)),
            expiryPnl(legs, spot - Math.abs(target - spot)),
          )
        : expiryPnl(legs, target);
    ideas.push({
      id: spec.id,
      name: spec.name,
      blurb: spec.blurb,
      legs,
      cost: netCost(legs),
      ...profile,
      pop: probabilityOfProfit(legs, spot, atmIv, T, r, q),
      pnlIfRight,
      overBudget: maxRisk != null && profile.maxLoss > maxRisk,
      best: false,
    });
  }

  // Rank: reward-if-right per dollar at risk, plus odds of any profit.
  const score = (i: TradeIdea) =>
    (Number.isFinite(i.maxLoss) && i.maxLoss > 0 ? i.pnlIfRight / i.maxLoss : -1) + i.pop;
  ideas.sort((a, b) => score(b) - score(a));
  // Best fit must pay off if the view is right and respect the budget.
  const pick = ideas.find((i) => !i.overBudget && i.pnlIfRight > 0);
  if (pick) pick.best = true;

  return { ideas, spot, atmIv, T, daysToExpiry: days, expectedMove: em };
}

/** A sensible starting target for a view, from the expected move. */
export function defaultTarget(view: View, spot: number, expectedMove: number): number {
  const raw =
    view === "up"
      ? spot + 0.6 * expectedMove
      : view === "down"
        ? spot - 0.6 * expectedMove
        : view === "flat"
          ? spot
          : spot + expectedMove;
  const step = spot >= 50 ? 1 : 0.5;
  return Math.max(step, Math.round(raw / step) * step);
}

// ── Position Greeks, in dollars ──────────────────────────────────────

export type DollarGreeks = {
  /** $ change for a +$1 move in the stock. */
  perDollar: number;
  /** $ change per calendar day, all else equal. */
  perDay: number;
  /** $ change per +1 point of implied vol. */
  perVolPoint: number;
};

export function dollarGreeks(legs: IdeaLeg[], spot: number, T: number, r: number, q = 0): DollarGreeks {
  let d = 0,
    th = 0,
    v = 0;
  for (const l of legs) {
    const res = priceBS({ S: spot, K: l.strike, T, r, q, sigma: l.iv });
    if (!res) continue;
    const m = dirOf(l) * l.qty * MULT;
    d += m * (l.type === "call" ? res.greeks.deltaCall : res.greeks.deltaPut);
    th += m * (l.type === "call" ? res.greeks.thetaCallPerDay : res.greeks.thetaPutPerDay);
    v += m * res.greeks.vegaPer1Pct;
  }
  return { perDollar: d, perDay: th, perVolPoint: v };
}

// ── "Is it cheap?" verdict ───────────────────────────────────────────

export type VolVerdict = {
  tone: "cheap" | "fair" | "pricey";
  label: string;
  headline: string;
  advice: string;
  impliedVol: number;
  realizedVol20: number | null;
  /** Where ATM IV sits within the past year's 20-day realized-vol range, 0–100. */
  ivRank: number | null;
};

export function volVerdict(atmIv: number, bars: HistoricalBar[] | null, view: View): VolVerdict {
  const series = bars && bars.length > 30 ? rollingRealizedVol(bars, 20) : [];
  const rv = series.length ? series[series.length - 1] : null;
  const rank = series.length ? hvRank(series, atmIv) : null;
  const ratio = rv != null && rv > 0 ? atmIv / rv : null;
  const tone: VolVerdict["tone"] =
    ratio == null ? "fair" : ratio >= 1.15 ? "pricey" : ratio <= 0.9 ? "cheap" : "fair";

  const buyingVol = view === "big";
  const sellingVol = view === "flat";
  const advice =
    tone === "pricey"
      ? buyingVol
        ? "You're paying up for movement. The move needs to be bigger than the market already expects."
        : sellingVol
          ? "Good backdrop for collecting premium — you're selling expensive volatility."
          : "Spreads soften this: you sell some of that expensive volatility back."
      : tone === "cheap"
        ? sellingVol
          ? "Premium is thin. Credit trades collect less for the same risk."
          : "Buying options is relatively inexpensive right now."
        : "Implied and realized volatility are roughly in line.";

  return {
    tone,
    label: tone === "pricey" ? "Options look pricey" : tone === "cheap" ? "Options look cheap" : "Fairly priced",
    headline:
      ratio == null
        ? "Price history unavailable — showing implied volatility only."
        : tone === "pricey"
          ? "The market expects more movement than the stock has shown lately."
          : tone === "cheap"
            ? "The market expects less movement than the stock has shown lately."
            : "The market's expected movement matches recent behaviour.",
    advice,
    impliedVol: atmIv,
    realizedVol20: rv,
    ivRank: rank,
  };
}
