/**
 * CBOE public delayed-quotes client.
 *
 * Endpoint: https://cdn.cboe.com/api/global/delayed_quotes/options/{TICKER}.json
 * - No auth, no key, CDN-cached at CBOE.
 * - Returns the underlying quote + EVERY option contract across all expiries
 *   in a single payload. Contracts include bid/ask/IV/OI/volume and Greeks.
 * - Delayed ~15 min during market hours.
 *
 * The option symbol format is OCC-style: `ROOT YYMMDD C|P STRIKE*1000` (13 chars
 * of suffix for the expiry/type/strike; root is variable length).
 */

import type { OptionChain, OptionContract, StockQuote } from "./types";
import { cached } from "./cache";

type CboeRawContract = {
  option: string;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  open_interest: number | null;
  volume: number | null;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
  rho: number | null;
  last_trade_price: number | null;
};

type CboeRawPayload = {
  timestamp: string;
  symbol: string;
  data: {
    symbol: string;
    current_price: number;
    prev_day_close: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    iv30: number | null;
    options: CboeRawContract[];
  };
};

const CBOE_URL = "https://cdn.cboe.com/api/global/delayed_quotes/options";
const CACHE_TTL_MS = 60_000; // 60s — data is already 15 min delayed at source

/** Parse OCC option symbol suffix to { expiration, type, strike }. */
export function parseOccSymbol(symbol: string): {
  root: string;
  expiration: string; // YYYY-MM-DD
  type: "call" | "put";
  strike: number;
} | null {
  // Last 15 chars are: YYMMDD (6) + C/P (1) + STRIKE (8)
  if (symbol.length < 15) return null;
  const suffix = symbol.slice(-15);
  const root = symbol.slice(0, symbol.length - 15);
  const yy = suffix.slice(0, 2);
  const mm = suffix.slice(2, 4);
  const dd = suffix.slice(4, 6);
  const t = suffix[6];
  const strikeRaw = suffix.slice(7);
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike) || (t !== "C" && t !== "P")) return null;
  const expiration = `20${yy}-${mm}-${dd}`;
  return { root, expiration, type: t === "C" ? "call" : "put", strike };
}

function normalize(raw: CboeRawPayload): OptionChain {
  const quoteTs = Date.parse(raw.timestamp.replace(" ", "T") + "Z");
  const ageMs = Math.max(0, Date.now() - quoteTs);

  const quote: StockQuote = {
    ticker: raw.data.symbol,
    price: raw.data.current_price,
    previousClose: raw.data.prev_day_close,
    open: raw.data.open,
    high: raw.data.high,
    low: raw.data.low,
    volume: raw.data.volume,
    iv30: raw.data.iv30 ?? null,
  };

  const nowSec = Date.now() / 1000;
  const contracts: OptionContract[] = [];
  const expirationsSet = new Set<string>();

  for (const c of raw.data.options) {
    const parsed = parseOccSymbol(c.option);
    if (!parsed) continue;
    expirationsSet.add(parsed.expiration);
    // 16:00 ET close-of-business as expiration second (rough; good enough for DTE)
    const expirationTs = Math.floor(Date.parse(`${parsed.expiration}T20:00:00Z`) / 1000);
    const bid = isNumber(c.bid) && c.bid > 0 ? c.bid : null;
    const ask = isNumber(c.ask) && c.ask > 0 ? c.ask : null;
    const last = isNumber(c.last_trade_price) && c.last_trade_price > 0 ? c.last_trade_price : null;
    const mid = bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : null;
    contracts.push({
      symbol: c.option,
      type: parsed.type,
      strike: parsed.strike,
      expiration: parsed.expiration,
      expirationTs,
      dte: Math.max(0, (expirationTs - nowSec) / 86400),
      bid,
      ask,
      last,
      mid,
      volume: nullIfZero(c.volume),
      openInterest: nullIfZero(c.open_interest),
      iv: isNumber(c.iv) && c.iv > 0 ? c.iv : null,
      delta: nullIfZero(c.delta),
      gamma: nullIfZero(c.gamma),
      theta: nullIfZero(c.theta),
      vega: nullIfZero(c.vega),
      rho: nullIfZero(c.rho),
    });
  }

  const expirations = [...expirationsSet].sort();

  return {
    ticker: raw.data.symbol,
    timestamp: raw.timestamp,
    ageMs,
    quote,
    contracts,
    expirations,
    source: "cboe",
  };
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function nullIfZero(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v === 0 ? null : v;
}

export async function fetchCboeChain(ticker: string): Promise<OptionChain> {
  const t = ticker.toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(t)) {
    throw new Error(`Invalid ticker: ${ticker}`);
  }
  return cached(`cboe:${t}`, CACHE_TTL_MS, async () => {
    const res = await fetch(`${CBOE_URL}/${t}.json`, {
      cache: "no-store",
      headers: { "User-Agent": "bs-options-suite/0.1" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) throw new Error(`Ticker not found: ${t}`);
    if (!res.ok) throw new Error(`CBOE returned ${res.status}`);
    const raw = (await res.json()) as CboeRawPayload;
    if (!raw?.data?.options?.length) {
      throw new Error(`No options data for ${t}`);
    }
    return normalize(raw);
  });
}
