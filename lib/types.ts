/**
 * Shared domain types for the data layer.
 * Keep these normalized across providers — UI should never parse provider-
 * specific shapes directly.
 */

export type OptionType = "call" | "put";

export type OptionContract = {
  /** OCC-style symbol, e.g. "AAPL260504C00320000". */
  symbol: string;
  type: OptionType;
  strike: number;
  /** Expiration date in ISO YYYY-MM-DD. */
  expiration: string;
  /** Expiration as Unix seconds (end of day). */
  expirationTs: number;
  /** Days to expiry as of the quote timestamp. */
  dte: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** Mid price when bid/ask are both present, else null. */
  mid: number | null;
  volume: number | null;
  openInterest: number | null;
  /** Implied volatility as a decimal (0.25 = 25%). Provider-computed. */
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
};

export type StockQuote = {
  ticker: string;
  price: number;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** 30-day IV index from provider, decimal. Null if unavailable. */
  iv30: number | null;
};

export type OptionChain = {
  ticker: string;
  /** Quote timestamp from the provider (ISO). */
  timestamp: string;
  /** How old the data is when served (ms). */
  ageMs: number;
  quote: StockQuote;
  /** All contracts flattened across all expirations. */
  contracts: OptionContract[];
  /** Unique, sorted expiration dates (ISO). */
  expirations: string[];
  /** Data provider name for transparency. */
  source: "cboe" | "marketdata" | "static";
};

export type HistoricalBar = {
  /** ISO date. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type HistoricalSeries = {
  ticker: string;
  bars: HistoricalBar[];
  /** Annualized realized volatility computed from log returns (decimal). */
  realizedVol: number | null;
  source: "polygon" | "static";
};

/** Standard error envelope for API routes. */
export type ApiError = {
  error: {
    code:
      | "not_found"
      | "upstream_failed"
      | "bad_request"
      | "rate_limited"
      | "internal";
    message: string;
    details?: unknown;
  };
};
