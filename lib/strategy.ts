/**
 * Multi-leg option strategy math — pure functions.
 *
 * - Leg P&L at expiry (options × 100 sh/contract, stock × qty shares)
 * - Combined strategy aggregation + break-even detection
 * - Unlimited profit/loss detection via edge-slope check
 * - Log-normal Monte Carlo probability of profit
 * - Net position Greeks (via lib/bs.ts per-leg pricing)
 */

import { priceBS } from "./bs";

export type LegAction = "buy" | "sell";
export type LegType = "call" | "put" | "stock";

export type StrategyLeg = {
  id: number;
  action: LegAction;
  type: LegType;
  qty: number;
  strike: number;
  /** Per-share premium for options. Ignored for stock. */
  premium: number;
  /** ISO YYYY-MM-DD. For stock legs this is ignored but we still require
   *  it in the type for uniform update paths. */
  expiry: string;
};

export type Preset =
  | "long-call"
  | "long-put"
  | "covered-call"
  | "cash-put"
  | "bull-call"
  | "bear-put"
  | "long-straddle"
  | "long-strangle"
  | "iron-condor"
  | "iron-butterfly"
  | "butterfly"
  | "custom";

export const PRESETS: Array<{ id: Preset; name: string; summary: string }> = [
  { id: "long-call", name: "Long Call", summary: "Directional up. Capped downside." },
  { id: "long-put", name: "Long Put", summary: "Directional down. Capped downside." },
  { id: "covered-call", name: "Covered Call", summary: "Own 100 shares + short call." },
  { id: "cash-put", name: "Cash-Secured Put", summary: "Short put; income or get assigned." },
  { id: "bull-call", name: "Bull Call Spread", summary: "Long ITM call, short OTM call." },
  { id: "bear-put", name: "Bear Put Spread", summary: "Long ITM put, short OTM put." },
  { id: "long-straddle", name: "Long Straddle", summary: "Long call + long put, same strike." },
  { id: "long-strangle", name: "Long Strangle", summary: "Long OTM call + long OTM put." },
  { id: "iron-condor", name: "Iron Condor", summary: "Sell put spread + sell call spread." },
  { id: "iron-butterfly", name: "Iron Butterfly", summary: "Sell ATM straddle, long wings." },
  { id: "butterfly", name: "Long Butterfly", summary: "1–2–1 same-side ratio spread." },
  { id: "custom", name: "Custom", summary: "Start from empty." },
];

/** Build a preset with strikes offset from the given spot. */
export function buildPreset(id: Preset, spot: number, expiry: string): StrategyLeg[] {
  const K = Math.round(spot / 5) * 5; // nearest $5
  const premEst = (pct: number) => +(spot * pct).toFixed(2);
  let nextId = 0;
  const L = (
    action: LegAction,
    type: LegType,
    strike: number,
    premium: number,
    qty = 1,
  ): StrategyLeg => ({
    id: nextId++,
    action,
    type,
    qty,
    strike: +strike.toFixed(2),
    premium,
    expiry,
  });

  switch (id) {
    case "long-call":
      return [L("buy", "call", K, premEst(0.04))];
    case "long-put":
      return [L("buy", "put", K, premEst(0.04))];
    case "covered-call":
      return [L("buy", "stock", spot, spot, 100), L("sell", "call", K * 1.05, premEst(0.02))];
    case "cash-put":
      return [L("sell", "put", K * 0.95, premEst(0.02))];
    case "bull-call":
      return [L("buy", "call", K, premEst(0.04)), L("sell", "call", K * 1.05, premEst(0.02))];
    case "bear-put":
      return [L("buy", "put", K, premEst(0.04)), L("sell", "put", K * 0.95, premEst(0.02))];
    case "long-straddle":
      return [L("buy", "call", K, premEst(0.04)), L("buy", "put", K, premEst(0.04))];
    case "long-strangle":
      return [
        L("buy", "call", K * 1.05, premEst(0.025)),
        L("buy", "put", K * 0.95, premEst(0.025)),
      ];
    case "iron-condor":
      return [
        L("sell", "put", K * 0.95, premEst(0.02)),
        L("buy", "put", K * 0.9, premEst(0.008)),
        L("sell", "call", K * 1.05, premEst(0.02)),
        L("buy", "call", K * 1.1, premEst(0.008)),
      ];
    case "iron-butterfly":
      return [
        L("buy", "put", K * 0.9, premEst(0.01)),
        L("sell", "put", K, premEst(0.04)),
        L("sell", "call", K, premEst(0.04)),
        L("buy", "call", K * 1.1, premEst(0.01)),
      ];
    case "butterfly":
      return [
        L("buy", "call", K * 0.95, premEst(0.055), 1),
        L("sell", "call", K, premEst(0.04), 2),
        L("buy", "call", K * 1.05, premEst(0.025), 1),
      ];
    case "custom":
      return [];
  }
}

/** Single-leg P&L at a stock price at expiry. */
export function legPnlAtExpiry(leg: StrategyLeg, S: number): number {
  const dir = leg.action === "buy" ? 1 : -1;
  if (leg.type === "stock") {
    return dir * (S - leg.strike) * leg.qty;
  }
  const intrinsic =
    leg.type === "call" ? Math.max(0, S - leg.strike) : Math.max(0, leg.strike - S);
  return dir * (intrinsic - leg.premium) * leg.qty * 100;
}

export function combinedPnl(legs: StrategyLeg[], prices: number[]): number[] {
  return prices.map((S) => legs.reduce((sum, l) => sum + legPnlAtExpiry(l, S), 0));
}

export function findBreakEvens(prices: number[], pnls: number[]): number[] {
  const bes: number[] = [];
  for (let i = 1; i < pnls.length; i++) {
    const a = pnls[i - 1];
    const b = pnls[i];
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) {
      const t = -a / (b - a);
      bes.push(prices[i - 1] + t * (prices[i] - prices[i - 1]));
    }
  }
  return bes;
}

/** Sum of signed option premiums (credit = positive, debit = negative). */
export function netPremium(legs: StrategyLeg[]): number {
  return legs.reduce((s, l) => {
    if (l.type === "stock") return s;
    const dir = l.action === "buy" ? -1 : 1;
    return s + dir * l.premium * l.qty * 100;
  }, 0);
}

/** Years to expiry for the earliest-expiring option leg. Stock legs ignored. */
export function nearestTYears(legs: StrategyLeg[]): number {
  const nowMs = Date.now();
  let best = Infinity;
  for (const l of legs) {
    if (l.type === "stock") continue;
    const [y, m, d] = l.expiry.split("-").map(Number);
    const ts = Date.UTC(y, m - 1, d, 20);
    const years = Math.max(0.001, (ts - nowMs) / (365.25 * 86400_000));
    if (years < best) best = years;
  }
  return Number.isFinite(best) ? best : 30 / 365.25;
}

export type StrategyStats = {
  maxProfit: number;
  maxLoss: number;
  netPremium: number;
  /** Tight P&L at current spot. */
  pnlAtSpot: number;
  breakEvens: number[];
  popPercent: number;
  capitalAtRisk: number;
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
};

export function computeStats({
  legs,
  spot,
  volatility,
  priceRange,
  nSims = 2000,
}: {
  legs: StrategyLeg[];
  spot: number;
  /** Annualized volatility as decimal. */
  volatility: number;
  priceRange: { lo: number; hi: number; steps: number };
  nSims?: number;
}): StrategyStats {
  if (!legs.length) {
    return {
      maxProfit: 0,
      maxLoss: 0,
      netPremium: 0,
      pnlAtSpot: 0,
      breakEvens: [],
      popPercent: 0,
      capitalAtRisk: 0,
      unlimitedProfit: false,
      unlimitedLoss: false,
    };
  }
  const { lo, hi, steps } = priceRange;
  const step = (hi - lo) / steps;
  const prices: number[] = [];
  for (let i = 0; i <= steps; i++) prices.push(lo + i * step);
  const pnls = combinedPnl(legs, prices);
  const maxPnl = Math.max(...pnls);
  const minPnl = Math.min(...pnls);
  const pnlAtSpot = legs.reduce((s, l) => s + legPnlAtExpiry(l, spot), 0);

  // Slope at range edges to detect unlimited upside/downside
  const n = pnls.length;
  const unlimitedProfit = pnls[n - 1] - pnls[n - 11] > Math.max(1, Math.abs(maxPnl) * 0.05);
  const unlimitedLoss = pnls[10] - pnls[0] < -Math.max(1, Math.abs(minPnl) * 0.05);

  const breakEvens = findBreakEvens(prices, pnls);

  // Log-normal Monte Carlo P(profit) over the earliest expiry
  const T = nearestTYears(legs);
  const mu = -0.5 * volatility * volatility * T;
  const sigT = volatility * Math.sqrt(T);
  let hit = 0;
  for (let i = 0; i < nSims; i++) {
    const u1 = Math.random() || 1e-12;
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sT = spot * Math.exp(mu + sigT * z);
    const pnl = legs.reduce((s, l) => s + legPnlAtExpiry(l, sT), 0);
    if (pnl > 0) hit++;
  }
  const popPercent = (hit / nSims) * 100;

  return {
    maxProfit: maxPnl,
    maxLoss: minPnl,
    netPremium: netPremium(legs),
    pnlAtSpot,
    breakEvens,
    popPercent,
    capitalAtRisk: Math.abs(minPnl),
    unlimitedProfit,
    unlimitedLoss,
  };
}

export type NetGreeks = {
  delta: number;
  gamma: number;
  thetaPerDay: number;
  vegaPer1Pct: number;
};

/** Aggregate Greeks across all option legs at the given market params. */
export function computeNetGreeks({
  legs,
  spot,
  volatility,
  riskFreeRate,
  dividendYield = 0,
}: {
  legs: StrategyLeg[];
  spot: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield?: number;
}): NetGreeks {
  let delta = 0,
    gamma = 0,
    theta = 0,
    vega = 0;
  const nowMs = Date.now();
  for (const l of legs) {
    const dir = l.action === "buy" ? 1 : -1;
    if (l.type === "stock") {
      // Stock contributes Δ = ±1 per share
      delta += dir * l.qty;
      continue;
    }
    const [y, m, d] = l.expiry.split("-").map(Number);
    const ts = Date.UTC(y, m - 1, d, 20);
    const T = Math.max(0.001, (ts - nowMs) / (365.25 * 86400_000));
    const res = priceBS({ S: spot, K: l.strike, T, r: riskFreeRate, sigma: volatility, q: dividendYield });
    if (!res) continue;
    const multiplier = dir * l.qty * 100;
    delta += multiplier * (l.type === "call" ? res.greeks.deltaCall : res.greeks.deltaPut);
    gamma += multiplier * res.greeks.gamma;
    theta += multiplier * (l.type === "call" ? res.greeks.thetaCallPerDay : res.greeks.thetaPutPerDay);
    vega += multiplier * res.greeks.vegaPer1Pct;
  }
  return { delta, gamma, thetaPerDay: theta, vegaPer1Pct: vega };
}
