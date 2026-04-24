/**
 * Thin typed client for our own API routes. Centralized here so every
 * component makes the same shape of request and handles errors uniformly.
 */

import type {
  ApiError,
  HistoricalSeries,
  OptionChain,
  StockQuote,
} from "./types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiError["error"]["code"],
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const err = (body as ApiError)?.error;
    throw new ApiClientError(
      err?.message ?? `Request failed: ${res.status}`,
      err?.code ?? "internal",
      res.status,
    );
  }
  return (await res.json()) as T;
}

export function fetchChain(ticker: string, signal?: AbortSignal): Promise<OptionChain> {
  return getJson<OptionChain>(
    `/api/chain?ticker=${encodeURIComponent(ticker)}`,
    { signal, cache: "no-store" },
  );
}

export function fetchQuote(
  ticker: string,
  signal?: AbortSignal,
): Promise<{ quote: StockQuote; timestamp: string; ageMs: number }> {
  return getJson(`/api/quote?ticker=${encodeURIComponent(ticker)}`, {
    signal,
    cache: "no-store",
  });
}

export function fetchHistory(
  ticker: string,
  days = 365,
  signal?: AbortSignal,
): Promise<HistoricalSeries> {
  return getJson<HistoricalSeries>(
    `/api/hist?ticker=${encodeURIComponent(ticker)}&days=${days}`,
    { signal, cache: "no-store" },
  );
}
